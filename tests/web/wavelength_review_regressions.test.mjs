import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";
import { assertSolarSnapshot } from "../../apps/web/js/solarContract.js";

const moduleURL = name => new URL(`../../apps/web/js/${name}.js`, import.meta.url);
const snapshot = assertSolarSnapshot(JSON.parse(fs.readFileSync(
  new URL("../../apps/web/data/latest-state.json", import.meta.url), "utf8")));

async function harness() {
  function element() {
    let value = "";
    const children = [];
    return { children, style: { setProperty() {} }, dataset: {},
      classList: { toggle() {} }, setAttribute() {}, toggleAttribute() {}, addEventListener() {},
      get textContent() { return value + children.map(child => child.textContent).join(""); },
      set textContent(text) { value = String(text); children.length = 0; },
      appendChild(child) { children.push(child); } };
  }
  const images = [], draws = [];
  class ImageBoundary {
    complete = false;
    naturalWidth = 0;
    constructor() { images.push(this); }
  }
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }),
    drawImage: img => draws.push(img) };
  for (const name of ["clearRect", "fillRect", "beginPath", "arc", "stroke", "save", "clip", "restore",
    "fill", "ellipse", "moveTo", "bezierCurveTo", "lineTo", "fillText", "setLineDash"]) ctx[name] = () => {};
  const canvas = () => ({ ...element(), width: 400, height: 300, getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 400, height: 300 }) });
  const nodes = { wavelengthCaption: element(), baseLabel: element(), solarCanvas: canvas(),
    butterflyCanvas: canvas(), timeFrameLabel: element(), liveStatus: element() };
  const events = new EventTarget();
  const store = { state: snapshot, liveState: snapshot, wavelength: "continuum", activeMode: "today",
    timelineIndex: -1, liveEngineRun: false, playTimer: 0, selectedRegionId: null,
    seriesFrames: [snapshot], seriesRecords: [{ months: 0 }], seriesManifest: { frames: [{ months: 0 }] } };
  const context = vm.createContext({ store, Event, URL, Image: ImageBoundary,
    document: { getElementById: id => nodes[id] ?? null, querySelector: () => null,
      querySelectorAll: () => [], createElement: element,
      createTextNode: text => ({ textContent: text }), body: { setAttribute() {} } },
    window: { devicePixelRatio: 1, addEventListener: events.addEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events) },
    performance: { now: () => 0 },
    controls: { confidence: { checked: false }, regions: { checked: false } },
    text(id, value) { if (nodes[id]) nodes[id].textContent = value; },
    // The worker is an I/O boundary. Unrelated research panels/tour are not under test.
    requestSolarSimulation: async () => snapshot, cancelSolarSimulation() {}, updateText() {}, maybeAutoStartTour() {},
  });
  // Keep real timeline transitions, image-cache decisions/events, complete canvas
  // renderer, caption builder and render orchestrator. No source-selection stubs.
  const boundaries = {
    "store.js": { store },
    "dom.js": { controls: context.controls, text: context.text },
    "panels.js": { updateText: context.updateText },
    "tour.js": { maybeAutoStartTour: context.maybeAutoStartTour },
    "solarWorkerClient.js": { requestSolarSimulation: context.requestSolarSimulation, cancelSolarSimulation: context.cancelSolarSimulation },
  };
  Object.assign(context, ...await loadSourceModules(context, ["timeline", "data", "view", "render", "wavelength", "explorer"].map(moduleURL), {
    resolveImport: (_specifier, url) => boundaries[url.pathname.split("/").at(-1)],
    initializeImportMeta: meta => { meta.url = "https://example.invalid/js/data.js"; },
  }));
  context.explorer.choose("research"); // These scenarios explicitly exercise Research image/model transitions.
  context.setWavelength("continuum");
  return { context, store, nodes, images, draws,
    ready() { images[0].complete = true; images[0].naturalWidth = 1024; images[0].onload(); },
    fail() { images[0].onerror(); },
  };
}

for (const mode of ["cycle", "local simulation"]) {
  for (const timing of ["image ready during model", "channel reselected during model"]) {
    test(`Latest restores observed caption after ${mode}: ${timing}`, async () => {
      const h = await harness();
      if (timing === "channel reselected during model") h.ready();
      if (mode === "cycle") h.context.setTimelineFrame(0);
      else await h.context.runLiveEngine();
      if (timing === "image ready during model") h.ready();
      else h.context.setWavelength("continuum");
      assert.equal(h.store.activeBaseKind, "synthetic");
      assert.match(h.nodes.wavelengthCaption.textContent, /Synthetic engine view/);
      const drawn = h.draws.length;
      h.context.goLive();
      assert.equal(h.store.activeBaseKind, "observed");
      assert.equal(h.draws.length, drawn + 1, "Latest actually draws the cached observed disk");
      assert.equal(h.draws.at(-1), h.images[0]);
      assert.equal(h.images.length, 1, "no image reload event is needed to restore the caption");
      assert.match(h.nodes.wavelengthCaption.textContent, /observed NASA SDO browse image/);
      assert.match(h.nodes.wavelengthCaption.textContent, /capture time unavailable; no registered model overlay/);
      assert.doesNotMatch(h.nodes.wavelengthCaption.textContent, /Synthetic engine view/);
    });
  }
}

test("entering cycle and local simulation immediately replaces an observed caption with synthetic", async () => {
  const h = await harness();
  h.ready();
  assert.match(h.nodes.wavelengthCaption.textContent, /observed NASA SDO/);
  h.context.setTimelineFrame(0);
  assert.equal(h.store.activeBaseKind, "synthetic");
  assert.match(h.nodes.wavelengthCaption.textContent, /Synthetic engine view/);
  h.context.goLive();
  await h.context.runLiveEngine();
  assert.equal(h.store.activeBaseKind, "synthetic");
  assert.match(h.nodes.wavelengthCaption.textContent, /Synthetic engine view/);
});

for (const outcome of ["pending", "failed", "model selected"]) {
  test(`Latest does not claim observed imagery when ${outcome}`, async () => {
    const h = await harness();
    h.context.setTimelineFrame(0);
    if (outcome === "failed") h.fail();
    if (outcome === "model selected") { h.ready(); h.context.setWavelength("model"); }
    h.context.goLive();
    assert.equal(h.store.activeBaseKind, "synthetic");
    assert.equal(h.draws.length, 0);
    const expected = outcome === "pending" ? /loading observed image; synthetic model shown/
      : outcome === "failed" ? /observed image unavailable — showing the synthetic model/ : /Synthetic engine view/;
    assert.match(h.nodes.wavelengthCaption.textContent, expected);
    assert.doesNotMatch(h.nodes.wavelengthCaption.textContent, /observed NASA SDO browse image/);
  });
}
