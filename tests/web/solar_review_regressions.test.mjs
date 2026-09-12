import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";
import { assertSolarSnapshot } from "../../apps/web/js/solarContract.js";

const fixture = fs.readFileSync(new URL("../../apps/web/data/latest-state.json", import.meta.url), "utf8");
const moduleURL = name => new URL(`../../apps/web/js/${name}.js`, import.meta.url);

function latitudeSnapshot() {
  const snapshot = JSON.parse(fixture);
  snapshot.active_regions = [30, -30, 0].map((latitude, index) => {
    const region = structuredClone(snapshot.active_regions[0]);
    region.id = index + 1;
    region.model_position.lat_deg = latitude;
    // The current transport model preserves birth latitude, not longitude.
    region.birth.lat_deg = latitude;
    return region;
  });
  return assertSolarSnapshot(snapshot);
}

for (const mode of ["series", "snapshot"]) {
  test(`butterfly ${mode} uses current v3 latitude and correct hemisphere colours`, async () => {
    const snapshot = latitudeSnapshot();
    const before = JSON.stringify(snapshot);
    const circles = [];
    const ctx = {
      clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {},
      setLineDash() {}, arc(x, y) { circles.push({ x, y }); },
      fill() { circles.at(-1).colour = this.fillStyle; },
    };
    const canvas = { width: 400, height: 200, getContext: () => ctx,
      getBoundingClientRect: () => ({ width: 400, height: 200 }) };
    const store = { state: snapshot, seriesFrames: mode === "series" ? [snapshot, null, snapshot] : [],
      seriesRecords: [{ months: 0 }, { months: 2 }, { months: 24 }], timelineIndex: -1, selectedRegionId: null };
    const events = new EventTarget();
    const context = vm.createContext({ store, setTimeout, clearTimeout, URL,
      document: { getElementById: id => id === "butterflyCanvas" ? canvas : null },
      window: { devicePixelRatio: 1, addEventListener: events.addEventListener.bind(events) } });
    Object.assign(context, ...await loadSourceModules(context, [moduleURL("render")], {
      resolveImport: (_specifier, url) => url.pathname.endsWith("/store.js") ? { store } : undefined,
    }));
    context.drawButterfly();
    const expectedY = mode === "series" ? [41, 149, 95] : [44, 156, 100];
    assert.deepEqual(circles.slice(0, 3).map(point => Math.round(point.y)), expectedY);
    assert.match(circles[0].colour, /247,183,51/, "northern anchor is warm coloured");
    assert.match(circles[1].colour, /64,214,200/, "southern anchor is teal");
    assert.match(circles[2].colour, /247,183,51/, "zero latitude remains a legitimate equator point");
    if (mode === "series") {
      assert.deepEqual(circles.map(point => point.x), [38, 38, 38, 386, 386, 386]);
    } else {
      assert.deepEqual(Array.from(store.projectedButterflyRegions, point => Math.round(point.y)), expectedY,
        "selection hit targets use the same current anchors as the drawing");
    }
    assert.equal(JSON.stringify(snapshot), before, "rendering does not mutate scientific data");
  });
}

for (const initialFailure of [true, false]) {
  test(`local simulation preserves ${initialFailure ? "initial" : "refresh"} bundle failure and Retry until publication`, async () => {
    const loaded = assertSolarSnapshot(JSON.parse(fixture));
    const simulated = assertSolarSnapshot(JSON.parse(fixture));
    const fallback = { schema_version: "solar-state-snapshot.v1", run: { time_seconds: 0 }, active_regions: [] };
    const store = { state: initialFailure ? null : loaded, liveState: initialFailure ? null : loaded,
      activeMode: "today", seriesFrames: [], seriesRecords: [], timelineIndex: -1, playTimer: 0 };
    const nodes = new Map(["liveStatus", "snapshotStatus", "retrySnapshot"].map(id => [id, { hidden: false, textContent: "" }]));
    let bundleAvailable = false;
    const context = vm.createContext({ store, URL, Image: class {}, FALLBACK_STATE: fallback, BASE_IMAGES: {},
      document: { getElementById: id => nodes.get(id) || null, querySelector: () => null, body: { setAttribute() {} } },
      window: {}, performance: { now: () => 0 },
      updateText() {}, drawSolarDisk() {}, drawButterfly() {}, maybeAutoStartTour() {}, cancelSolarSimulation() {},
      requestSolarSimulation: async () => simulated,
      readDataBundle: async () => {
        if (!bundleAvailable) throw Error("component hash mismatch");
        return { snapshot: loaded, identity: { bundle_id: "validated-replacement" },
          seriesFrames: [], seriesRecords: [], seriesManifest: { frames: [] } };
      } });
    // Keep the real data publication, timeline, presentation and header paths.
    // Only the worker/I/O and unrelated canvas rendering are boundary doubles.
    const boundaries = {
      "store.js": { store },
      "config.js": { FALLBACK_STATE: fallback, BASE_IMAGES: {} },
      "panels.js": { updateText: context.updateText },
      "render.js": { drawSolarDisk: context.drawSolarDisk, drawButterfly: context.drawButterfly },
      "tour.js": { maybeAutoStartTour: context.maybeAutoStartTour },
      "solarWorkerClient.js": { requestSolarSimulation: context.requestSolarSimulation, cancelSolarSimulation: context.cancelSolarSimulation },
      "dataBundle.js": { readDataBundle: context.readDataBundle },
    };
    Object.assign(context, ...await loadSourceModules(context, ["timeline", "data", "view"].map(moduleURL), {
      resolveImport: (_specifier, url) => boundaries[url.pathname.split("/").at(-1)],
      initializeImportMeta: meta => { meta.url = "https://example.invalid/js/data.js"; },
    }));
    await context.loadState();
    const failure = store.dataError;
    const retained = store.liveState;
    assert.match(failure, /component hash mismatch/);
    await context.runLiveEngine();
    assert.equal(store.state, simulated, "on-device calculation still publishes its validated result");
    assert.equal(store.dataError, failure, "a local solve has not repaired the failed bundle");
    assert.equal(nodes.get("snapshotStatus").hidden, false);
    assert.equal(nodes.get("retrySnapshot").hidden, false);
    context.goLive();
    assert.equal(store.state, retained, "Latest restores the retained bundle or initial fallback");
    assert.equal(store.dataError, failure);
    assert.equal(nodes.get("retrySnapshot").hidden, false);
    assert.match(nodes.get("snapshotStatus").textContent, /component hash mismatch/);
    bundleAvailable = true;
    await context.loadState();
    assert.equal(store.state, loaded);
    assert.equal(store.dataError, null, "only successful bundle publication clears its error");
    assert.equal(nodes.get("snapshotStatus").hidden, true);
    assert.equal(nodes.get("retrySnapshot").hidden, true);
  });
}
