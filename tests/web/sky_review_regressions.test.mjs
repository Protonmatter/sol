import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { fetchServerSky, BODY_INDEX, SERVER_BASE } from "../../apps/web/js/skyEngine.js";
import { createSkyWorkerClient } from "../../apps/web/js/skyWorkerClient.js";
import { validateSkyWork } from "../../apps/web/js/skyLimits.js";
import { SkyConsent, makeSkyPreview, parseSkyLink } from "../../apps/web/js/skyPrivacy.js";
import { skyRows, parseSkyTime, formatSkyTimeInput } from "../../apps/web/js/skyPresentation.js";
import { syncObjectRows } from "../../apps/web/js/objectBrowser.js";
import { CONSTELLATIONS } from "../../apps/web/js/celestial.js";
import { epochAccuracy, epochLabel } from "../../apps/web/js/accuracy.js";
import { resolveSkyPresentation } from "../../apps/web/js/presentationState.js";
import { assertEphemerisSnapshotV3, mergeLocalEvents } from "../../apps/web/js/ephemerisContract.js";

const source = fs.readFileSync(new URL("../../apps/web/js/sky.js", import.meta.url), "utf8");
const snapshot = JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json", import.meta.url), "utf8")).snapshot;
const unix = (snapshot.time.jd_utc - 2440587.5) * 86400;
const capturedHash = "#sky=0,0,1782872026.9999936,0";

// Execute the complete Sky controller and real privacy/contract/worker-client modules.
// Only browser host I/O is controlled: DOM, clock, permission callbacks, clipboard,
// and worker messages. Stamping uses the same token substitution as build_web.py.
function skyHarness(t, { basePath = "/sol/", href = "https://example.invalid/sol/releases/A/index.html", clipboard,
  savedProvider = null, storedObserver = JSON.stringify({ lat: 0, lon: 0, elev: 0 }), recipientBase = "" } = {}) {
  const nodes = new Map(), intervals = new Map(), positions = [], workers = [], saved = new Map();
  let focused = null;
  const node = (id = "") => ({
    id, textContent: "", value: "", hidden: false, children: [], attributes: {}, listeners: new Map(),
    classList: { toggle() {} },
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    click() { return this.listeners.get("click")?.({ target: this }); },
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); },
    remove() { nodes.delete(this.id); },
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
    document: { getElementById: id => nodes.get(id) || null, createElement: () => node() },
    window: { SOL_EPHEMERIS_SERVER: recipientBase, dispatchEvent() {}, setInterval(callback) { intervals.set(1, callback); return 1; }, clearInterval(id) { intervals.delete(id); } },
    fetchServerSky, BODY_INDEX, SERVER_BASE,
    createSkyWorkerClient: () => createSkyWorkerClient({
      createWorker: () => {
        const worker = { postMessage(message) { this.sent = message; }, terminate() {} };
        workers.push(worker); return worker;
      },
      setTimer: () => 1, clearTimer() {},
    }),
    validateSkyWork, SkyConsent, makeSkyPreview, parseSkyLink, skyRows, parseSkyTime, formatSkyTimeInput,
    syncObjectRows, CONSTELLATIONS, epochAccuracy, epochLabel, resolveSkyPresentation,
    assertEphemerisSnapshotV3, mergeLocalEvents,
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "")
    .replaceAll("__SOL_BASE_PATH__", basePath), context, { filename: "sky.js" });
  t.after(() => context.leaveSky());
  context.enterSky();
  return {
    context, nodes, positions, saved, location, store, focused: () => focused,
    click: id => nodes.get(id).click(),
    tick: () => intervals.get(1)(),
    async publishSnapshot() {
      const worker = workers.at(-1);
      worker.onmessage({ data: { ...worker.sent, type: "result", value: { operation: "snapshot", snapshot: structuredClone(snapshot) } } });
      // Drain the worker-client and async render continuations before interacting.
      for (let index = 0; index < 6; index++) await Promise.resolve();
      assert.equal(store.sky.presentation.availability, "ready", nodes.get("skyInputError").textContent);
    },
  };
}

test("saved remote preference is restored but each session requires fresh recipient consent", async t => {
  const requests=[];
  t.mock.method(globalThis,"fetch",async url=>{requests.push(new URL(url).pathname);return new Response("offline fixture",{status:502});});
  const options={savedProvider:"server",recipientBase:"https://recipient.invalid"};
  const h=skyHarness(t,options);
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
  const reloaded=skyHarness(t,{...options,savedProvider:h.saved.get("sol-sky-provider")});
  await reloaded.context.renderSky();
  assert.equal(reloaded.store.sky.provider,"server");
  assert.equal(reloaded.nodes.get("skyConsent").hidden,false);
  assert.deepEqual(requests,["/v3/sky"],"saved provider cannot carry consent into another page session");
  reloaded.click("skyConsentDeny");
  assert.equal(reloaded.store.sky.provider,"local");
  assert.equal(reloaded.saved.get("sol-sky-provider"),"local");
  assert.deepEqual(requests,["/v3/sky"]);
});

test("malformed saved observer does not discard a separately valid saved remote preference", t => {
  const h=skyHarness(t,{savedProvider:"server",storedObserver:"{invalid",recipientBase:"https://recipient.invalid"});
  assert.equal(h.store.sky.provider,"server");
  assert.equal(h.store.sky.observer.lat,40.71);
  assert.equal(h.nodes.get("skyConsent").hidden,false);
});

test("unknown saved provider values retain the on-device default", t => {
  for(const savedProvider of [null,"local","SERVER","unknown",'"server"',"https://recipient.invalid"]) {
    const h=skyHarness(t,{savedProvider,recipientBase:"https://recipient.invalid"});
    assert.equal(h.store.sky.provider,"local");
    assert.equal(h.nodes.get("skyProviderLocal").attributes["aria-pressed"],"true");
    assert.equal(h.nodes.get("skyConsent").hidden,true);
  }
});

const locationResult = { coords: { latitude: 12.345678, longitude: -76.54321, altitude: 123.5 } };

test("a geolocation success after the live minute refresh updates the observer and clears pending feedback", t => {
  const h = skyHarness(t);
  h.click("skyGeo");
  h.tick();
  h.positions[0].success(locationResult);
  assert.equal(h.store.sky.observer.lat, 12.345678);
  assert.equal(h.store.sky.observer.lon, -76.54321);
  assert.equal(h.store.sky.observer.elev, 123.5);
  assert.doesNotMatch(h.nodes.get("skyLocLabel").textContent, /Locating/);
  assert.equal(JSON.parse(h.saved.get("sol-sky-observer")).lat, 12.345678);
});

test("a newer geolocation request owns both success and failure callbacks", t => {
  for (const result of ["success", "failure"]) {
    const h = skyHarness(t);
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

test("manual coordinates supersede a pending geolocation callback without stale error feedback", t => {
  for (const result of ["success", "failure"]) {
    const h = skyHarness(t);
    h.click("skyGeo");
    for (const [id, value] of [["skyLat", "23"], ["skyLon", "45"], ["skyElev", "6"]]) h.nodes.get(id).value = value;
    h.click("skySet");
    const label = h.nodes.get("skyLocLabel").textContent;
    h.positions[0][result](locationResult);
    assert.equal(h.store.sky.observer.lat, 23);
    assert.equal(h.nodes.get("skyLocLabel").textContent, label);
  }
});

test("leaving and reentering Sky ignores permission results from the previous visit", t => {
  for (const result of ["success", "failure"]) {
    const h = skyHarness(t);
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
    const h = skyHarness(t, { clipboard });
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
  const h = skyHarness(t, { clipboard: { writeText: () => new Promise((_resolve, reject) => { rejectCopy = reject; }) } });
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
    const h = skyHarness(t, { clipboard: { writeText: () => new Promise((resolve, reject) => { resolveCopy = resolve; rejectCopy = reject; }) } });
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
    const h = skyHarness(t, { basePath, href, clipboard: { writeText: async value => { copied.push(value); } } });
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
