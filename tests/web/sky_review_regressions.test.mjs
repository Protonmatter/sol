import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";
import { fetchServerSky, BODY_INDEX, SERVER_BASE } from "../../apps/web/js/skyEngine.js";
import { createSkyWorkerClient } from "../../apps/web/js/skyWorkerClient.js";
import { validateSkyWork } from "../../apps/web/js/skyLimits.js";
import { SkyConsent, makeSkyPreview, parseSkyLink } from "../../apps/web/js/skyPrivacy.js";
import { skyRows, parseSkyTime, formatSkyTimeInput } from "../../apps/web/js/skyPresentation.js";
import { syncObjectRows } from "../../apps/web/js/objectBrowser.js";
import { constellationFrame, altAz } from "../../apps/web/js/skyFrame.js";
import { layoutLabels } from "../../apps/web/js/labelLayout.js";
import { CONSTELLATIONS } from "../../apps/web/js/celestial.js";
import { epochAccuracyAtUnix, renderedEpochLabel } from "../../apps/web/js/accuracy.js";
import { resolveSkyPresentation } from "../../apps/web/js/presentationState.js";
import { assertEphemerisSnapshotV3, mergeLocalEvents } from "../../apps/web/js/ephemerisContract.js";

const moduleURL = new URL("../../apps/web/js/sky.js", import.meta.url);
const source = fs.readFileSync(moduleURL, "utf8");
const snapshot = JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json", import.meta.url), "utf8")).snapshot;
const nativeStarFrame = JSON.parse(fs.readFileSync(new URL("../fixtures/sky-star-frame.json", import.meta.url), "utf8")).star_frame;
const unix = (snapshot.time.jd_utc - 2440587.5) * 86400;
const capturedHash = "#sky=0,0,1782872026.9999936,0";

// Record the real renderer's output at the Canvas boundary, including invalid
// coordinates browsers silently ignore. No projection or overlay logic is replaced.
function canvasRecorder() {
  const strokes = [], coordinates = [], texts = [], stack = [];
  let path = [], dash = [];
  const ctx = {
    strokes, coordinates, texts, strokeStyle: "#000", fillStyle: "#000", globalAlpha: 1,
    font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic",
    clearRect() { strokes.length = 0; coordinates.length = 0; texts.length = 0; },
    beginPath() { path = []; },
    moveTo(x, y) { path.push(["moveTo", x, y]); coordinates.push([x, y]); },
    lineTo(x, y) { path.push(["lineTo", x, y]); coordinates.push([x, y]); },
    arc(x, y, r, start, end) { coordinates.push([x, y, r, start, end]); },
    ellipse(x, y, rx, ry, rotation, start, end) { coordinates.push([x, y, rx, ry, rotation, start, end]); },
    // Deterministic host metrics, not a browser font/photometric qualification.
    // Recording alignment and full bounds catches labels whose anchor is inside
    // the canvas but whose trailing glyphs would be clipped.
    measureText(text) { return { width: String(text).length * Number.parseFloat(this.font) * 0.6 }; },
    fillText(text, x, y) {
      const width = this.measureText(text).width, height = Number.parseFloat(this.font);
      const left = x - (this.textAlign === "center" ? width / 2 : this.textAlign === "right" || this.textAlign === "end" ? width : 0);
      const top = y - (this.textBaseline === "middle" ? height / 2 : this.textBaseline === "top" ? 0 : height * 0.8);
      texts.push({ text, x, y, left, right: left + width, top, bottom: top + height });
      coordinates.push([x, y]);
    },
    fillRect(x, y, w, h) { coordinates.push([x, y, w, h]); },
    translate(x, y) { coordinates.push([x, y]); },
    rotate(angle) { coordinates.push([angle]); },
    setLineDash(value) { dash = Array.from(value); },
    stroke() { strokes.push({ path: structuredClone(path), dash: [...dash], alpha: this.globalAlpha, strokeStyle: this.strokeStyle }); },
    save() { stack.push({ strokeStyle: this.strokeStyle, fillStyle: this.fillStyle, globalAlpha: this.globalAlpha,
      font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, dash: [...dash] }); },
    restore() { const saved = stack.pop(); dash = saved.dash; Object.assign(this, saved); },
    clip() {}, fill() {}, closePath() {},
  };
  return ctx;
}

// Execute the complete Sky controller and real privacy/contract/worker-client modules.
// Only browser host I/O is controlled: DOM, clock, permission callbacks, clipboard,
// and worker messages. Stamping uses the same token substitution as build_web.py.
async function skyHarness(t, { basePath = "/sol/", stamped = false, href = "https://example.invalid/sol/releases/A/index.html", clipboard,
  savedProvider = null, storedObserver = JSON.stringify({ lat: 0, lon: 0, elev: 0 }), recipientBase = "", canvas = false, controls = false,
  canvasWidth = 600, canvasHeight = 600, devicePixelRatio = 1 } = {}) {
  const nodes = new Map(), intervals = new Map(), positions = [], workers = [], saved = new Map();
  const drawing = canvas ? canvasRecorder() : null;
  let focused = null;
  const node = (id = "") => ({
    id, textContent: "", value: "", hidden: false, children: [], attributes: {}, dataset: {}, style: {}, listeners: new Map(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 180, height: 100 }),
    classList: { toggle() {} },
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    click() { return this.onclick ? this.onclick() : this.listeners.get("click")?.({ target: this }); },
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild(child) { this.children.push(child); child.parentNode = this; if (child.id) nodes.set(child.id, child); },
    insertBefore(child, before) {
      const old = this.children.indexOf(child); if (old >= 0) this.children.splice(old, 1);
      const index = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(index, 0, child); child.parentNode = this;
    },
    remove() { nodes.delete(this.id); if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); },
    focus() { focused = this; },
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; },
  });
  for (const id of ["skyGeo", "skySet", "skyLat", "skyLon", "skyElev", "skyLocLabel", "skyInputError",
    "skyProvenance", "skyShare", "skyShareConfirm", "skyShareCancel", "skySharePreview", "skySharePreviewText",
    "skyProviderLocal", "skyProviderServer", "skyConsent", "skyConsentText", "skyConsentAllow", "skyConsentDeny", "skyConsentRevoke"]) {
    nodes.set(id, node(id));
  }
  nodes.get("skySharePreview").hidden = true;
  nodes.get("skyConsent").hidden = true;
  if (controls) for (const id of ["skyTimeMode", "skyTime", "skyNow", "skyTimeLabel", "skyAccuracy", "skySearch", "skyFilter", "skyExport", "skySelectedFacts", "skyResultCount"])
    nodes.set(id, node(id));
  if (canvas) {
    for (const id of ["skyCanvas", "skyList", "skyConst", "skyTraj"]) nodes.set(id, node(id));
    Object.assign(nodes.get("skyCanvas"), {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: canvasWidth, height: canvasHeight }),
      getContext: () => drawing,
    });
    nodes.get("skyList").ownerDocument = { createElement: () => node() };
  }
  const location = new URL(href), store = {};
  const context = vm.createContext({
    store, URL, Event, Blob, AbortController, structuredClone, navigator: {
      clipboard, geolocation: { getCurrentPosition(success, failure) { positions.push({ success, failure }); } },
    },
    location, history: { replaceState(_state, _title, value) { location.href = new URL(value, location).href; } },
    Date: class extends Date { static now() { return unix * 1000; } },
    localStorage: {
      getItem(key) { return key === "sol-sky-observer" ? storedObserver : key === "sol-sky-provider" ? savedProvider : null; },
      setItem(key, value) { saved.set(key, value); },
    },
    document: { getElementById: id => nodes.get(id) || null, createElement: () => node(), body: node("body") },
    window: { SOL_EPHEMERIS_SERVER: recipientBase, innerWidth: 640, innerHeight: 640, devicePixelRatio,
      dispatchEvent() {}, setInterval(callback) { intervals.set(1, callback); return 1; }, clearInterval(id) { intervals.delete(id); } },
    fetchServerSky, BODY_INDEX, SERVER_BASE, deploymentBasePath:stamped?basePath:"__SOL_BASE_PATH__",
    createSkyWorkerClient: () => createSkyWorkerClient({
      prepareWorker: null, // This harness controls worker replies; broker behavior has a separate integration test.
      createWorker: () => {
        const worker = { postMessage(message) { this.sent = message;if(message.type==='initialize')this.onmessage({data:{...message,type:'ready'}}); }, terminate() {} };
        workers.push(worker); return worker;
      },
      setTimer: () => 1, clearTimer() {},
    }),
    validateSkyWork, SkyConsent, makeSkyPreview, parseSkyLink, skyRows, parseSkyTime, formatSkyTimeInput,
    syncObjectRows, layoutLabels, constellationFrame, altAz, CONSTELLATIONS, epochAccuracyAtUnix, renderedEpochLabel, resolveSkyPresentation,
    assertEphemerisSnapshotV3, mergeLocalEvents,
  });
  if (stamped && basePath !== "__SOL_BASE_PATH__") {
    // These release-substitution assertions retain their transformed fixture.
    // Its offsets differ from original source, so it must not claim that file's
    // coverage. Original-source scenarios below execute the complete ES module.
    vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "")
      .replaceAll("__SOL_BASE_PATH__", basePath), context, { filename: "sky-release-fixture.js" });
  } else {
    Object.assign(context, ...await loadSourceModules(context, [moduleURL], {
      resolveImport: () => context,
    }));
  }
  t.after(() => context.leaveSky());
  context.enterSky();
  return {
    context, nodes, positions, saved, location, store, drawing, workers, focused: () => focused,
    click: id => nodes.get(id).click(),
    tick: () => intervals.get(1)(),
    async publishSnapshot(value = snapshot) {
      const worker = workers.at(-1);
      worker.onmessage({ data: { ...worker.sent, type: "result", value: { operation: "snapshot", snapshot: structuredClone(value) } } });
      // Drain the worker-client and async render continuations before interacting.
      for (let index = 0; index < 6; index++) await Promise.resolve();
      assert.equal(store.sky.presentation.availability, "ready", nodes.get("skyInputError").textContent);
    },
  };
}

function setOverlay(h, id, checked) {
  const node = h.nodes.get(id);
  node.checked = checked;
  node.listeners.get("change")({ target: node });
}

function assertFiniteDrawing(drawing) {
  assert.ok(drawing.coordinates.length > 0, "dome must emit drawing coordinates");
  assert.ok(drawing.coordinates.every(values => values.every(Number.isFinite)), "every Canvas coordinate must be finite");
}

test("narrow Sky keeps admitted labels inside the canvas without moving body positions", async t => {
  // Synthetic display-boundary fixture, never astronomical reference evidence:
  // at latitude zero an object due east at altitude 0.1 degrees has declination
  // zero and hour angle -89.9 degrees. Update every coordinate alias together so
  // the unchanged v3 admission guard validates the renderer's input normally.
  const nearHorizon = structuredClone(snapshot);
  const ra = (nearHorizon.time.lst_deg + 89.9) % 360;
  for (const name of ["Sirius", "Saturn"]) {
    const body = nearHorizon.bodies.find(item => item.name === name);
    Object.assign(body, { alt_deg: 0.1, alt_refracted_deg: 0.2, above_horizon: true,
      az_deg: 90, compass: "E", ra_deg: ra, dec_deg: 0,
      topocentric_apparent_ra_deg: ra, topocentric_apparent_dec_deg: 0 });
    if (name === "Sirius") Object.assign(body, { geocentric_apparent_ra_deg: ra, geocentric_apparent_dec_deg: 0 });
  }
  assertEphemerisSnapshotV3(nearHorizon);
  for (const [canvasWidth, canvasHeight, devicePixelRatio] of [[320, 400, 1], [288, 360, 2]]) {
    const h = await skyHarness(t, { canvas: true, canvasWidth, canvasHeight, devicePixelRatio });
    await h.publishSnapshot(nearHorizon);
    setOverlay(h,"skyTraj",false);
    h.nodes.get("skyList").children.find(row=>row.dataset.objectId==="Saturn").click();
    assertFiniteDrawing(h.drawing);
    const canvas = h.nodes.get("skyCanvas"), padding = 4 * devicePixelRatio;
    for (const label of h.drawing.texts) assert.ok((label.bottom-label.top)/devicePixelRatio>=12,
      `${label.text}: canvas text must retain at least 12 CSS pixels at DPR ${devicePixelRatio}`);
    const labels = new Map(h.drawing.texts.map(label => [label.text, label]));
    for (const name of ["N", "S", "E", "W", "Saturn"]) {
      const label = labels.get(name);
      assert.ok(label, `${canvasWidth}px at DPR ${devicePixelRatio}: ${name} is rendered`);
      assert.ok(label.left >= padding - 1e-6 && label.right <= canvas.width - padding + 1e-6,
        `${name} glyph bounds ${label.left}..${label.right} must fit the ${canvas.width}px backing store`);
      assert.ok(label.top >= 0 && label.bottom <= canvas.height,
        `${name} vertical glyph bounds must remain visible`);
    }
    const { plotted, geom } = h.context.window.__skyDebug();
    for (const name of ["Sirius", "Saturn"]) {
      const point = plotted.find(item => item.name === name);
      assert.ok(Math.abs(point.x - (geom.cx + geom.r * (1 - 0.1 / 90))) < 1e-6);
      assert.ok(Math.abs(point.y - geom.cy) < 1e-6);
      if(labels.has(name))assert.ok(labels.get(name).left < point.x,
        "the long east-limb label must move left while its astronomical marker stays in place");
    }
  }
});

test("v3 snapshots draw finite constellation paths and preserve overlay toggling", async t => {
  const h = await skyHarness(t, { canvas: true });
  const framed = structuredClone(snapshot);
  framed.star_frame = structuredClone(nativeStarFrame);
  await h.publishSnapshot(framed);
  assertFiniteDrawing(h.drawing);
  const initial = structuredClone(h.drawing.strokes);
  setOverlay(h, "skyConst", true);
  const visible = structuredClone(h.drawing.strokes);
  setOverlay(h, "skyConst", false);
  assertFiniteDrawing(h.drawing);
  const hidden = structuredClone(h.drawing.strokes);
  assert.deepEqual(hidden, initial, 'constellation scaffolding starts off without changing plotted positions');
  const lineCount = strokes => strokes.filter(stroke => stroke.path.some(command => command[0] === "lineTo")).length;
  assert.ok(lineCount(visible) > lineCount(hidden), "enabled constellation figures must add visible line segments");
  setOverlay(h, "skyConst", true);
  assert.deepEqual(h.drawing.strokes, visible, "reenabling the overlay must restore the same constellation geometry");
  // A changed input observer cannot move the retained snapshot's overlays.
  h.store.sky.observer.lat = 70;
  h.context.resizeSky();
  assert.deepEqual(h.drawing.strokes, visible, "constellations must stay bound to the displayed v3 observer");
});

test("legacy provider snapshot hides unavailable constellation geometry and explains why", async t => {
  const h = await skyHarness(t, { canvas: true, controls: true });
  await h.publishSnapshot();
  const hidden = structuredClone(h.drawing.strokes);
  setOverlay(h, "skyConst", true);
  assert.deepEqual(h.drawing.strokes, hidden);
  assert.match(h.nodes.get("skyAccuracy").textContent, /Constellations unavailable/);
  setOverlay(h, "skyConst", false);
  assert.doesNotMatch(h.nodes.get("skyAccuracy").textContent, /Constellations unavailable/);
});

test("selecting a v3 catalogue star draws finite past and future paths and preserves trajectory toggling", async t => {
  const h = await skyHarness(t, { canvas: true });
  await h.publishSnapshot();
  setOverlay(h, "skyConst", false);
  const baseline = structuredClone(h.drawing.strokes);
  h.nodes.get("skyList").children.find(row => row.dataset.objectId === "Sirius").click();
  assertFiniteDrawing(h.drawing);
  const visible = structuredClone(h.drawing.strokes);
  const trajectories = visible.filter(stroke => stroke.path.length > 2);
  assert.equal(trajectories.length, 2, "selected star must draw both halves of its above-horizon diurnal arc");
  assert.ok(trajectories[0].dash.length > 0, "past trajectory must be dashed");
  assert.equal(trajectories[1].dash.length, 0, "future trajectory must be solid");
  assert.ok(trajectories[0].alpha < trajectories[1].alpha, "past trajectory must remain dimmer than future");
  setOverlay(h, "skyTraj", false);
  assert.deepEqual(h.drawing.strokes, baseline, "disabling trajectory must remove its paths and horizon markers");
  setOverlay(h, "skyTraj", true);
  assert.deepEqual(h.drawing.strokes, visible, "reenabling trajectory must restore the selected star's geometry");
  h.store.sky.observer.lat = 70;
  h.context.resizeSky();
  assert.deepEqual(h.drawing.strokes, visible, "trajectory must stay bound to the displayed v3 observer");
});

test("saved remote preference is restored but each session requires fresh recipient consent", async t => {
  const requests=[];
  t.mock.method(globalThis,"fetch",async url=>{requests.push(new URL(url).pathname);return new Response("offline fixture",{status:502});});
  const options={savedProvider:"server",recipientBase:"https://recipient.invalid"};
  const h=await skyHarness(t,options);
  assert.equal(h.store.sky.provider,"server");
  assert.equal(h.nodes.get("skyProviderServer").attributes["aria-pressed"],"true");
  assert.equal(h.nodes.get("skyProviderLocal").attributes["aria-pressed"],"false");
  assert.equal(h.nodes.get("skyConsent").hidden,false);
  assert.match(h.nodes.get("skyConsentText").textContent,/https:\/\/recipient\.invalid/);
  h.tick();await h.context.renderSky();
  assert.deepEqual(requests,[],"restoration and refresh cannot send health or snapshot requests before consent");
  assert.equal(h.saved.size,0,"restoration cannot rewrite stored preferences");
  h.click("skyConsentAllow");
  assert.deepEqual(requests,["/v3/sky"]);
  assert.equal(h.saved.get("sol-sky-provider"),"server");
  const reloaded=await skyHarness(t,{...options,savedProvider:h.saved.get("sol-sky-provider")});
  await reloaded.context.renderSky();
  assert.equal(reloaded.store.sky.provider,"server");
  assert.equal(reloaded.nodes.get("skyConsent").hidden,false);
  assert.deepEqual(requests,["/v3/sky"],"saved provider cannot carry consent into another page session");
  reloaded.click("skyConsentDeny");
  assert.equal(reloaded.store.sky.provider,"local");
  assert.equal(reloaded.saved.get("sol-sky-provider"),"local");
  assert.deepEqual(requests,["/v3/sky"]);
});

test("malformed saved observer does not discard a separately valid saved remote preference", async t => {
  const h=await skyHarness(t,{savedProvider:"server",storedObserver:"{invalid",recipientBase:"https://recipient.invalid"});
  assert.equal(h.store.sky.provider,"server");
  assert.equal(h.store.sky.observer.lat,40.71);
  assert.equal(h.nodes.get("skyConsent").hidden,false);
});

test("unknown saved provider values retain the on-device default", async t => {
  for(const savedProvider of [null,"local","SERVER","unknown",'"server"',"https://recipient.invalid"]) {
    const h=await skyHarness(t,{savedProvider,recipientBase:"https://recipient.invalid"});
    assert.equal(h.store.sky.provider,"local");
    assert.equal(h.nodes.get("skyProviderLocal").attributes["aria-pressed"],"true");
    assert.equal(h.nodes.get("skyConsent").hidden,true);
  }
});

const locationResult = { coords: { latitude: 12.345678, longitude: -76.54321, altitude: 123.5 } };

test("a geolocation success after the live minute refresh updates the observer and clears pending feedback", async t => {
  const h = await skyHarness(t);
  h.click("skyGeo");
  h.tick();
  h.positions[0].success(locationResult);
  assert.equal(h.store.sky.observer.lat, 12.345678);
  assert.equal(h.store.sky.observer.lon, -76.54321);
  assert.equal(h.store.sky.observer.elev, 123.5);
  assert.doesNotMatch(h.nodes.get("skyLocLabel").textContent, /Locating/);
  assert.equal(JSON.parse(h.saved.get("sol-sky-observer")).lat, 12.345678);
});

test("a newer geolocation request owns both success and failure callbacks", async t => {
  for (const result of ["success", "failure"]) {
    const h = await skyHarness(t);
    h.click("skyGeo");
    h.click("skyGeo");
    h.positions[0][result](locationResult);
    assert.equal(h.store.sky.observer.lat, 0);
    assert.equal(h.saved.size, 0);
    assert.match(h.nodes.get("skyLocLabel").textContent, /Locating/);
    h.positions[1].success(locationResult);
    assert.equal(h.store.sky.observer.lat, 12.345678);
  }
});

test("manual coordinates supersede a pending geolocation callback without stale error feedback", async t => {
  for (const result of ["success", "failure"]) {
    const h = await skyHarness(t);
    h.click("skyGeo");
    for (const [id, value] of [["skyLat", "23"], ["skyLon", "45"], ["skyElev", "6"]]) h.nodes.get(id).value = value;
    h.click("skySet");
    const label = h.nodes.get("skyLocLabel").textContent;
    h.positions[0][result](locationResult);
    assert.equal(h.store.sky.observer.lat, 23);
    assert.equal(h.nodes.get("skyLocLabel").textContent, label);
  }
});

test("leaving and reentering Sky ignores permission results from the previous visit", async t => {
  for (const result of ["success", "failure"]) {
    const h = await skyHarness(t);
    h.click("skyGeo");
    h.context.leaveSky(); h.context.enterSky();
    const label = h.nodes.get("skyLocLabel").textContent;
    h.positions[0][result](locationResult);
    assert.equal(h.store.sky.observer.lat, 0);
    assert.equal(h.saved.size, 0);
    assert.equal(h.nodes.get("skyLocLabel").textContent, label);
  }
});

for (const [label, clipboard] of [
  ["missing Clipboard API", undefined],
  ["denied clipboard permission", { writeText: async () => { throw new Error("Permission denied"); } }],
]) {
  test(`confirmed sharing offers a selected manual copy field with ${label}`, async t => {
    const h = await skyHarness(t, { clipboard, stamped: true });
    await h.publishSnapshot();
    h.click("skyShare");
    assert.equal(h.nodes.has("skyShareManualCopy"), false);
    assert.equal(h.location.hash, "");
    await h.click("skyShareConfirm");
    const field = h.nodes.get("skyShareManualCopy");
    assert.ok(field, "confirmed sharing must expose a usable copy field when automatic copying is unavailable");
    assert.equal(field.readOnly, true);
    assert.match(field.attributes["aria-label"], /share link/i);
    assert.equal(h.focused(), field);
    assert.equal(field.selectionEnd, field.value.length);
    assert.equal(field.selectionStart, 0);
    assert.equal(field.value, `https://example.invalid/sol/${capturedHash}`);
    assert.match(h.nodes.get("skyInputError").textContent, /copy.*manually/i);
    assert.equal(h.nodes.get("skySharePreview").hidden, false);
    assert.equal(h.location.hash, "");
    h.click("skyShareCancel");
    assert.equal(h.nodes.get("skySharePreview").hidden, true);
    assert.equal(h.nodes.has("skyShareManualCopy"), false);
  });
}

test("cancelling while clipboard permission is pending cannot reopen manual-copy disclosure", async t => {
  let rejectCopy;
  const h = await skyHarness(t, { clipboard: { writeText: () => new Promise((_resolve, reject) => { rejectCopy = reject; }) } });
  await h.publishSnapshot();
  h.click("skyShare");
  const confirmation = h.click("skyShareConfirm");
  h.click("skyShareCancel");
  rejectCopy(new Error("Permission denied"));
  await confirmation;
  assert.equal(h.nodes.has("skyShareManualCopy"), false);
  assert.equal(h.nodes.get("skySharePreview").hidden, true);
  assert.equal(h.nodes.get("skyInputError").textContent, "");
});

for (const outcome of ["success", "failure"]) {
  test(`a late clipboard ${outcome} leaves a newer unconfirmed preview intact`, async t => {
    let resolveCopy, rejectCopy;
    const h = await skyHarness(t, { clipboard: { writeText: () => new Promise((resolve, reject) => { resolveCopy = resolve; rejectCopy = reject; }) } });
    await h.publishSnapshot();
    h.click("skyShare");
    const confirmation = h.click("skyShareConfirm");
    h.click("skyShare");
    if (outcome === "success") resolveCopy(); else rejectCopy(new Error("Permission denied"));
    await confirmation;
    assert.equal(h.nodes.has("skyShareManualCopy"), false);
    assert.equal(h.nodes.get("skySharePreview").hidden, false);
    assert.equal(h.nodes.get("skyInputError").textContent, "");
  });
}

for (const [basePath, href, expectedBase] of [
  ["/sol/", "https://example.invalid/sol/releases/A/index.html?old=1", "https://example.invalid/sol/"],
  ["/", "https://example.invalid/releases/A/index.html", "https://example.invalid/"],
  ["/research/sol/", "https://example.invalid/research/sol/releases/A/index.html", "https://example.invalid/research/sol/"],
  ["__SOL_BASE_PATH__", "http://localhost:8000/index.html", "http://localhost:8000/index.html"],
]) {
  test(`confirmed share targets stable deployment ${basePath} with the captured snapshot`, async t => {
    const copied = [];
    const h = await skyHarness(t, { basePath, href, stamped: true, clipboard: { writeText: async value => { copied.push(value); } } });
    await h.publishSnapshot();
    h.click("skyShare");
    assert.equal(copied.length, 0, "preview alone cannot copy precise observer/time values");
    h.store.sky.observer.lat = 80;
    h.store.sky.chosenUnix = unix + 3600;
    await h.click("skyShareConfirm");
    assert.deepEqual(copied, [`${expectedBase}${capturedHash}`]);
    assert.equal(h.nodes.get("skySharePreview").hidden, true);
    assert.equal(h.location.hash, "");
  });
}

test("time controls reject invalid instants, disclose timezone, and Now clears frozen intent", async t => {
  const h = await skyHarness(t, { controls: true });
  await h.publishSnapshot();
  const change = id => h.nodes.get(id).listeners.get("change")({ target: h.nodes.get(id) });
  h.nodes.get("skyTimeMode").value = "utc"; change("skyTimeMode");
  assert.equal(h.store.sky.displayMode, "utc"); assert.match(h.nodes.get("skyTimeLabel").textContent, /display in UTC/);
  h.nodes.get("skyTime").value = "invalid"; change("skyTime");
  assert.equal(h.store.sky.chosenUnix, null); assert.ok(h.nodes.get("skyInputError").textContent.length > 0);
  h.nodes.get("skyTime").value = "2030-01-02T03:04"; change("skyTime");
  assert.equal(h.store.sky.chosenUnix, Date.parse("2030-01-02T03:04:00Z") / 1000);
  assert.match(h.nodes.get("skyTimeLabel").textContent, /Frozen/);
  h.location.hash = "#sky=0,0,123,0"; h.click("skyNow");
  assert.equal(h.store.sky.chosenUnix, null); assert.equal(h.location.hash, "");
  assert.match(h.nodes.get("skyTimeLabel").textContent, /Live/);
  h.nodes.get("skyTimeMode").value = "device"; change("skyTimeMode");
  assert.match(h.nodes.get("skyTimeLabel").textContent, /device civil timezone, not observer timezone/);
  let prevented = false; h.nodes.get("skyLat").value = "0"; h.nodes.get("skyLon").value = "0"; h.nodes.get("skyElev").value = "0";
  h.nodes.get("skyElev").listeners.get("keydown")({ key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.store.sky.observer.label, "Set location");
});

test("precision readout retains the rendered snapshot epoch after a failed distant-date request", async t => {
  const h=await skyHarness(t,{controls:true});
  await h.publishSnapshot();
  const original=h.nodes.get("skyAccuracy").textContent;
  assert.match(original,/2026-07-01/);
  assert.match(original,/1900–2200.*pending/);
  h.store.sky.chosenUnix=Date.parse("9999-01-01T00:00:00Z")/1000;
  const pending=h.context.renderSky();
  const worker=h.workers.at(-1);
  worker.onmessage({data:{...worker.sent,type:"error",error:{code:"engine_failed",message:"qualification fixture unavailable"}}});
  await pending;
  assert.equal(h.nodes.get("skyAccuracy").textContent,original);
  assert.doesNotMatch(original,/Approximate exploration/);
  assert.equal(h.context.window.__skyDebug().snap.time.jd_utc,snapshot.time.jd_utc);
});

test("dome pointer inspection pins a body, preserves pin on leave, and clears it on empty click", async t => {
  const h = await skyHarness(t, { controls: true, canvas: true });
  await h.publishSnapshot();
  const canvas = h.nodes.get("skyCanvas");
  const target = h.context.window.__skyDebug().plotted.find(point => point.name === "Moon");
  assert.ok(target, "validated Moon has a plotted hit target");
  const event = { clientX: target.x, clientY: target.y };
  canvas.listeners.get("mousemove")(event);
  assert.equal(canvas.style.cursor, "pointer");
  assert.equal(h.nodes.get("skyTooltip").style.display, "block");
  assert.equal(h.nodes.get("skyTooltip").children[0].children[0].textContent, "Moon");
  canvas.listeners.get("click")(event); canvas.listeners.get("mouseleave")();
  assert.equal(h.nodes.get("skyTooltip").style.display, "block");
  canvas.listeners.get("click")({ clientX: -1000, clientY: -1000 });
  assert.equal(h.nodes.get("skyTooltip").style.display, "none");
  canvas.listeners.get("mousemove")({ clientX: -1000, clientY: -1000 });
  assert.equal(canvas.style.cursor, "default"); canvas.listeners.get("mouseleave")();
  h.context.leaveSky(); h.context.resizeSky();
  assert.equal(h.nodes.get("skyTooltip").style.display, "none");
});

test("export requires a confirmed snapshot and downloads the captured bytes without a network request", async t => {
  const h = await skyHarness(t, { controls: true });
  h.click("skyExport"); assert.match(h.nodes.get("skyInputError").textContent, /validated snapshot/);
  await h.publishSnapshot();
  const blobs = [], revoked = [], links = [];
  h.context.URL = class extends URL {
    static createObjectURL(blob) { blobs.push(blob); return "blob:fixture"; }
    static revokeObjectURL(url) { revoked.push(url); }
  };
  const create = h.context.document.createElement;
  h.context.document.createElement = tag => { const element = create(tag); if (tag === "a") element.click = () => links.push({ href: element.href, download: element.download }); return element; };
  h.click("skyExport"); assert.equal(blobs.length, 0);
  assert.match(h.nodes.get("skySharePreviewText").textContent, /Raw JSON/);
  assert.equal(h.nodes.get("skyShareConfirm").textContent, "Download precise snapshot");
  h.store.sky.observer.lat = 77;
  await h.click("skyShareConfirm");
  assert.deepEqual(JSON.parse(await blobs[0].text()), snapshot);
  assert.deepEqual(links, [{ href: "blob:fixture", download: "sky-snapshot-v3.json" }]);
  assert.deepEqual(revoked, ["blob:fixture"]);
  assert.equal(h.nodes.get("skySharePreview").hidden, true);
  assert.equal(h.nodes.get("skyInputError").textContent, "Snapshot downloaded.");
});

test("missing geolocation and invalid device coordinates leave the observer intact", async t => {
  const h = await skyHarness(t);
  const original = JSON.stringify(h.store.sky.observer);
  h.click("skyGeo"); h.positions[0].success({ coords: { latitude: 91, longitude: 0, altitude: 0 } });
  assert.equal(JSON.stringify(h.store.sky.observer), original); assert.match(h.nodes.get("skyInputError").textContent, /Observer outside supported bounds/);
  h.context.navigator.geolocation = undefined; h.click("skyGeo");
  assert.match(h.nodes.get("skyLocLabel").textContent, /no geolocation/);
  assert.equal(JSON.stringify(h.store.sky.observer), original);
});

test("Sky filters retain selected facts and verified worker trajectory paints both directions", async t => {
  const h = await skyHarness(t, { controls: true, canvas: true });
  await h.publishSnapshot();
  const rows = h.nodes.get("skyList").children;
  rows.find(row => row.dataset.objectId === "Moon").click();
  assert.match(h.nodes.get("skySelectedFacts").children.at(-1).textContent, /Geometric altitude.*Observer range/);
  const worker = h.workers.at(-1);
  assert.equal(worker.sent.payload.operation, "track");
  const samples = Array.from({ length: worker.sent.payload.samples }, (_, i) => ({ alt: i < 10 || i > 170 ? -10 : 30, az: i, up: !(i < 10 || i > 170) }));
  worker.onmessage({ data: { ...worker.sent, type: "result", value: { operation: "track", samples } } });
  await new Promise(setImmediate);
  assertFiniteDrawing(h.drawing);
  assert.ok(h.drawing.strokes.some(stroke => stroke.dash.length > 0 && stroke.path.length > 3));
  h.nodes.get("skySearch").value = "Sirius";
  h.nodes.get("skySearch").listeners.get("input")();
  assert.equal(h.context.window.__skyDebug().selectedName, "Moon");
  assert.match(h.nodes.get("skyResultCount").textContent, /1 matching objects/);
  assert.equal(rows.find(row => row.dataset.objectId === "Moon").hidden, true);
  rows.find(row => row.dataset.objectId === "Sirius").click();
  assert.match(h.nodes.get("skySelectedFacts").children.at(-1).textContent, /infinite catalogue-star approximation/);
  h.nodes.get("skySearch").value = ""; h.nodes.get("skyFilter").value = "planets";
  h.nodes.get("skyFilter").listeners.get("change")();
  assert.equal(h.context.window.__skyDebug().selectedName, "Sirius");
});

for (const augmentationFails of [false, true]) test(`remote snapshot retains honest ${augmentationFails ? "unavailable" : "validated"} local augmentation`, async t => {
  const requested = [];
  t.mock.method(globalThis, "fetch", async url => {
    requested.push(new URL(url).pathname);
    return { ok: true, text: async () => JSON.stringify(snapshot) };
  });
  const h = await skyHarness(t, { recipientBase: "https://recipient.invalid" });
  h.click("skyProviderServer"); h.click("skyConsentAllow");
  await new Promise(setImmediate);
  assert.deepEqual(requested, ["/v3/sky"]);
  const worker = h.workers.at(-1);
  if (augmentationFails) worker.onmessage({ data: { ...worker.sent, type: "error", error: { code: "engine_failed", message: "local engine unavailable" } } });
  else worker.onmessage({ data: { ...worker.sent, type: "result", value: { operation: "snapshot", snapshot: structuredClone(snapshot) } } });
  await new Promise(setImmediate);
  assert.equal(h.store.sky.presentation.availability, "ready");
  assert.equal(h.store.sky.presentation.actualProvider, "server");
  const visible = h.context.window.__skyDebug().snap;
  assert.equal(visible.time.jd_utc, snapshot.time.jd_utc);
  assert.equal(visible.warnings.some(text => text.includes("augmentation unavailable")), augmentationFails);
  h.click("skyConsentRevoke");
  assert.equal(h.store.sky.provider, "local"); assert.match(h.nodes.get("skyInputError").textContent, /consent revoked/);
});

// Synthetic lat=0 meridian positions, with every coordinate alias kept consistent.
function putOnSouthernMeridian(snap,body) {
  const ra=snap.time.lst_deg;
  Object.assign(body,{alt_deg:45,alt_refracted_deg:45.02,above_horizon:true,az_deg:180,compass:'S',
    ra_deg:ra,dec_deg:-45,topocentric_apparent_ra_deg:ra,topocentric_apparent_dec_deg:-45});
  if(body.kind==='star')Object.assign(body,{geocentric_apparent_ra_deg:ra,geocentric_apparent_dec_deg:-45});
}

test('daytime dome suppresses catalogue stars without removing accessible objects', async t => {
  const day=structuredClone(snapshot),sun=day.bodies.find(b=>b.name==='Sun');
  putOnSouthernMeridian(day,sun);
  const h=await skyHarness(t,{canvas:true});
  await h.publishSnapshot(day);
  const stars=new Set(day.bodies.filter(b=>b.kind==='star'&&b.name!=='Sun').map(b=>b.name));
  assert.ok(!h.context.window.__skyDebug().plotted.some(b=>stars.has(b.name)),'daytime stars must not be drawn or hit-testable');
  assert.ok(!h.drawing.texts.some(label=>stars.has(label.text)),'daytime star labels must be hidden');
  assert.ok(h.nodes.get('skyList').children.some(node=>stars.has(node.dataset.objectId)),'stars remain in the accessible list');
});

test('daylight suppresses native-frame constellation lines and dots while twilight fades them', async t => {
  const day=structuredClone(snapshot);day.star_frame=structuredClone(nativeStarFrame);
  assert.equal(constellationFrame(day).available,true);
  putOnSouthernMeridian(day,day.bodies.find(b=>b.name==='Sun'));
  const h=await skyHarness(t,{canvas:true,controls:true});
  await h.publishSnapshot(day);
  const hidden=structuredClone(h.drawing.strokes),coordinates=structuredClone(h.drawing.coordinates);
  setOverlay(h,'skyConst',true);
  assert.deepEqual(h.drawing.strokes,hidden,'enabled overlay cannot reveal daytime constellation lines');
  assert.deepEqual(h.drawing.coordinates,coordinates,'enabled overlay cannot reveal daytime vertex dots');
  assert.match(h.nodes.get('skyAccuracy').textContent,/matched catalogue stars include proper motion/);
  const twilight=structuredClone(day),sun=twilight.bodies.find(b=>b.name==='Sun');
  const ra=(twilight.time.lst_deg+99)%360;
  Object.assign(sun,{alt_deg:-9,alt_refracted_deg:-9,above_horizon:false,az_deg:90,compass:'E',ra_deg:ra,dec_deg:0,topocentric_apparent_ra_deg:ra,topocentric_apparent_dec_deg:0});
  // Keep the native frame epoch and observer; only change the Sun display condition.
  h.context.renderSky();await h.publishSnapshot(twilight);
  const figureLines=h.drawing.strokes.filter(s=>s.strokeStyle==='rgba(208,224,255,0.5)'&&s.path.length===2);
  assert.ok(figureLines.length>10,'enabled preference survives daylight and restores figures at twilight');
  assert.ok(figureLines.every(s=>s.alpha===0.5),'figures use the same daylight opacity as catalogue stars');
});

test('crowded dome labels avoid each other while their body markers stay fixed', async t => {
  const crowded=structuredClone(snapshot);
  for(const name of ['Moon','Saturn','Sirius']) {
    const b=crowded.bodies.find(body=>body.name===name);
    putOnSouthernMeridian(crowded,b);
  }
  const h=await skyHarness(t,{canvas:true,canvasWidth:320,canvasHeight:400});
  await h.publishSnapshot(crowded);
  const labels=h.drawing.texts.filter(label=>!['N','S','E','W'].includes(label.text));
  assert.ok(labels.some(label=>label.text==='Moon'),'selected Moon gets first claim on label space');
  for(let i=0;i<labels.length;i++)for(const b of labels.slice(i+1)) {
    const a=labels[i];
    assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`${a.text}/${b.text} overlap`);
  }
  const {plotted,geom}=h.context.window.__skyDebug();
  for(const name of ['Moon','Saturn','Sirius']) {
    const point=plotted.find(b=>b.name===name);
    assert.ok(Math.abs(point.x-geom.cx)<1e-8);
    assert.ok(Math.abs(point.y-(geom.cy+geom.r/2))<1e-8);
  }
});

test('redrawing a retained sky after provider failure cannot restart a local trajectory worker', async t => {
  t.mock.method(globalThis,'fetch',async()=>new Response('offline fixture',{status:502}));
  const h=await skyHarness(t,{canvas:true,recipientBase:'https://recipient.invalid'});
  await h.publishSnapshot();
  h.nodes.get('skyList').children.find(row=>row.dataset.objectId==='Saturn').click();
  const before=h.workers.length;
  h.click('skyProviderServer');h.click('skyConsentAllow');
  await new Promise(setImmediate);
  assert.equal(h.store.sky.presentation.availability,'last_valid');
  h.context.resizeSky();
  assert.equal(h.workers.length,before,'a failed provider request must not trigger implicit local computation');
});

test('future nominal clock assumption is visible with its retained snapshot',async t=>{
  const h=await skyHarness(t,{controls:true});
  const future=structuredClone(snapshot),clock=future.time;
  clock.input_time_semantics='future_nominal_utc';
  clock.earth_orientation.quality='modeled_future';
  clock.earth_orientation.dut1_uncertainty_seconds=null;
  future.accuracy.eop_status='modeled_future';
  await h.publishSnapshot(future);
  assert.match(h.nodes.get('skyAccuracy').textContent,/nominal UTC/);
  assert.match(h.nodes.get('skyAccuracy').textContent,/leap offset.*assum|assum.*leap offset/);
  assert.match(h.nodes.get('skyAccuracy').textContent,/UT1.*model/);
  assert.match(h.nodes.get('skyAccuracy').textContent,/uncertainty.*unknown/);
});

test('server unsupported future time keeps the previous snapshot and explicit local recovery',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({code:'unsupported_time'}),{status:422}));
  const h=await skyHarness(t,{controls:true,recipientBase:'https://recipient.invalid'});
  await h.publishSnapshot();
  const original=h.nodes.get('skyAccuracy').textContent;
  h.store.sky.chosenUnix=Date.UTC(2200,0,1)/1000;
  h.click('skyProviderServer');h.click('skyConsentAllow');
  await new Promise(setImmediate);
  assert.equal(h.store.sky.presentation.availability,'last_valid');
  assert.equal(h.nodes.get('skyAccuracy').textContent,original);
  assert.equal(h.context.window.__skyDebug().snap.time.jd_utc,snapshot.time.jd_utc);
  assert.match(h.nodes.get('skyInputError').textContent,/Future time/);
  assert.match(h.nodes.get('skyProvenance').textContent,/Choose On your device/);
});

test('mixed event window shows a future-event caveat while retaining the UTC instant',async t=>{
  const h=await skyHarness(t,{controls:true});
  const mixed=structuredClone(snapshot);
  mixed.events_window.future_nominal_utc_after_jd=mixed.events_window.start_jd+.25;
  await h.publishSnapshot(mixed);
  const text=h.nodes.get('skyAccuracy').textContent;
  assert.match(text,/event window.*beyond.*Earth-orientation/);
  assert.match(text,/nominal UTC/);
  assert.match(text,/uncertainty is unknown/);
  assert.doesNotMatch(text.split(' — ')[0],/nominal UTC/);
  assert.equal(h.context.window.__skyDebug().snap.time.input_time_semantics,'utc');
});

// The Sun east of the meridian on the celestial equator at a chosen altitude, with RA,
// hour angle, altitude and azimuth mutually consistent for the snapshot's observer.
function putSunAtAltitude(snap,altitudeDeg){
  const d=Math.PI/180,lat=snap.observer.polar_motion_corrected_lat_deg*d,alt=altitudeDeg*d;
  const H=-Math.acos(Math.sin(alt)/Math.cos(lat));
  const az=Math.atan2(-Math.sin(H),-Math.cos(H)*Math.sin(lat));
  const azDeg=((az/d)%360+360)%360,ra=((snap.time.lst_deg-H/d)%360+360)%360;
  Object.assign(snap.bodies.find(b=>b.name==='Sun'),{alt_deg:altitudeDeg,alt_refracted_deg:altitudeDeg,above_horizon:false,
    az_deg:azDeg,compass:'E',ra_deg:ra,dec_deg:0,topocentric_apparent_ra_deg:ra,topocentric_apparent_dec_deg:0});
}

test('faint twilight stars are not hit targets and a hidden star draws no daytime path', async t => {
  const twilight=structuredClone(snapshot);putSunAtAltitude(twilight,-2);putOnSouthernMeridian(twilight,twilight.bodies.find(b=>b.name==='Sirius'));
  const h=await skyHarness(t,{canvas:true});
  await h.publishSnapshot(twilight);
  const stars=new Set(twilight.bodies.filter(b=>b.kind==='star'&&b.name!=='Sun').map(b=>b.name));
  assert.ok(twilight.bodies.some(b=>stars.has(b.name)&&b.alt_deg>0),'the fixture has a star above the horizon');
  assert.ok(!h.context.window.__skyDebug().plotted.some(b=>stars.has(b.name)),'stars at 11% opacity are not hit targets');
  const dusk=structuredClone(snapshot);putSunAtAltitude(dusk,-9);putOnSouthernMeridian(dusk,dusk.bodies.find(b=>b.name==='Sirius'));
  h.context.renderSky();await h.publishSnapshot(dusk);
  assert.ok(h.context.window.__skyDebug().plotted.some(b=>stars.has(b.name)),'stars at half opacity are hit targets again');

  const day=structuredClone(snapshot);
  for(const name of ['Sun','Sirius'])putOnSouthernMeridian(day,day.bodies.find(b=>b.name===name));
  const d=await skyHarness(t,{canvas:true});
  await d.publishSnapshot(day);
  setOverlay(d,'skyConst',false);
  const before=d.drawing.strokes.filter(s=>s.path.length>2).length;
  d.nodes.get('skyList').children.find(row=>row.dataset.objectId==='Sirius').click();
  assert.equal(d.drawing.strokes.filter(s=>s.path.length>2).length,before,'a daytime-hidden star draws no trajectory');
});
