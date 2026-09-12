import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";

const snapshot = JSON.parse(fs.readFileSync(new URL("../../apps/web/data/latest-state.json", import.meta.url)));
async function fixture({ absent = false, frames = [snapshot, null, snapshot] } = {}) {
  const nodes = new Map(["timeScrubber", "timeFrameLabel", "playToggle", "liveStatus", "liveActivity",
    ".status-strip", "#baseLabel", ".selection-panel"].map(id => [id, { value: "0.4", textContent: "", attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; } }]));
  const store = { state: snapshot, liveState: snapshot, seriesFrames: frames,
    seriesRecords: frames.map((frame, index) => ({ index, months: index * 12, status: frame ? "ready" : "unavailable" })),
    seriesManifest: { frames: frames.map((_, i) => ({ months: i * 12, stage: "test cycle" })) },
    timelineIndex: -1, selectedRegionId: 7, playTimer: 0, liveEngineRun: true };
  const intervals = new Map(), requests = [];
  let rendered = 0, cancelled = 0;
  const boundaries = {
    "store.js": { store }, "view.js": { renderAll: () => { rendered++; } },
    "solarWorkerClient.js": { cancelSolarSimulation: () => { cancelled++; },
      requestSolarSimulation: value => new Promise((resolve, reject) => requests.push({ value, resolve, reject })) },
  };
  const [api] = await loadSourceModules(vm.createContext({ performance: { now: () => 0 },
    document: { getElementById: id => absent ? null : nodes.get(id), querySelector: id => absent ? null : nodes.get(id) },
    window: { setInterval(callback, delay) { assert.equal(delay, 1100); intervals.set(1, callback); return 1; },
      clearInterval(id) { intervals.delete(id); } },
  }), [new URL("../../apps/web/js/timeline.js", import.meta.url)], {
    resolveImport: (_specifier, url) => boundaries[url.pathname.split("/").at(-1)],
  });
  return { api, store, nodes, intervals, requests, counts: () => ({ rendered, cancelled }) };
}

test("cycle playback skips declared gaps, changes live announcements, and pauses idempotently", async () => {
  const h = await fixture();
  h.api.startPlay();
  assert.equal(h.store.timelineIndex, 0); assert.equal(h.store.liveEngineRun, false);
  assert.equal(h.store.selectedRegionId, null); assert.equal(h.intervals.size, 1);
  assert.equal(h.nodes.get("playToggle").textContent, "❚❚ Pause");
  for (const id of [".status-strip", "#baseLabel", ".selection-panel"]) assert.equal(h.nodes.get(id).attributes["aria-live"], "off");
  h.intervals.get(1)();
  assert.equal(h.store.timelineIndex, 2); assert.equal(h.nodes.get("timeScrubber").value, "2");
  assert.match(h.nodes.get("timeFrameLabel").textContent, /24 months.*skipped 1 unavailable/);
  h.api.togglePlay(); h.api.stopPlay();
  assert.equal(h.store.playTimer, 0); assert.equal(h.intervals.size, 0);
  assert.equal(h.nodes.get("playToggle").textContent, "▶ Play cycle");
  for (const id of [".status-strip", "#baseLabel", ".selection-panel"]) assert.equal(h.nodes.get(id).attributes["aria-live"], "polite");
  h.api.stepTimeline(-1); assert.equal(h.store.timelineIndex, 0);
  h.api.setTimelineFrame(1); assert.equal(h.store.state, snapshot);
  assert.match(h.nodes.get("timeFrameLabel").textContent, /month 12 unavailable.*retaining/);
  h.api.setTimelineFrame(999); assert.equal(h.store.timelineIndex, 2);
  h.api.setTimelineFrame(-999); assert.equal(h.store.timelineIndex, 0);
  h.api.togglePlay(); h.api.goLive();
  assert.equal(h.store.timelineIndex, -1); assert.equal(h.store.state, h.store.liveState);
  assert.equal(h.store.playTimer, 0); assert.equal(h.nodes.get("timeFrameLabel").textContent, "Latest loaded feed context");
  assert.ok(h.counts().cancelled > 0); assert.ok(h.counts().rendered > 0);
});

test("absent or entirely missing series explains unavailable playback without creating a timer", async () => {
  for (const frames of [[], [null, null]]) {
    const h = await fixture({ frames });
    h.api.startPlay(); assert.equal(h.intervals.size, 0);
    assert.match(h.nodes.get("timeFrameLabel").textContent, /playback unavailable/);
    h.api.stepTimeline(); assert.equal(h.intervals.size, 0);
    if (!frames.length) { h.api.setTimelineFrame(0); assert.deepEqual(h.counts(), { rendered: 0, cancelled: 0 }); }
  }
  const h = await fixture({ absent: true });
  h.api.startPlay(); h.api.stepTimeline(); h.api.goLive(); h.api.cancelLiveEngine();
  assert.equal(h.store.timelineIndex, -1); assert.equal(h.intervals.size, 0);
});

test("cancel and newer navigation reject late successful or failed solver publication", async () => {
  for (const resolve of [true, false]) {
    const h = await fixture();
    const pending = h.api.runLiveEngine();
    assert.match(h.nodes.get("liveStatus").textContent, /Running/);
    assert.equal(JSON.stringify(h.requests[0].value), JSON.stringify({ seed: 42, steps: 24, dtHours: 1, activity: 0.4, lon: 72, lat: 36 }));
    h.api.cancelLiveEngine(); const text = h.nodes.get("liveStatus").textContent;
    if (resolve) h.requests[0].resolve(structuredClone(snapshot)); else h.requests[0].reject(Error("late failure"));
    await pending;
    assert.equal(h.store.state, snapshot); assert.equal(h.nodes.get("liveStatus").textContent, text);
    assert.match(text, /cancelled.*Last valid/);
  }
});

test("solver failure retains selection and recovery publishes only a validated result", async () => {
  const h = await fixture();
  const failed = h.api.runLiveEngine(); h.requests[0].reject(Error("engine unavailable")); await failed;
  assert.equal(h.store.selectedRegionId, 7); assert.equal(h.store.state, snapshot);
  assert.match(h.nodes.get("liveStatus").textContent, /engine unavailable.*retry/);
  h.api.startPlay(); const next = h.api.runLiveEngine(); const valid = structuredClone(snapshot);
  h.requests[1].resolve(valid); await next;
  assert.equal(h.store.state, valid); assert.equal(h.store.liveEngineRun, true);
  assert.equal(h.store.timelineIndex, -1); assert.equal(h.store.playTimer, 0);
  assert.match(h.nodes.get("liveStatus").textContent, /activity 0.40.*modeled regions/);
  h.api.prepareBundlePublication(); assert.equal(h.intervals.size, 0);
});

test("lifecycle cancellation preserves idle, completed and failed calculation status", async () => {
  for (const outcome of ["idle", "completed", "failed"]) {
    const h = await fixture();
    h.nodes.get("liveStatus").textContent = "Latest loaded feed context";
    if (outcome !== "idle") {
      const request = h.api.runLiveEngine();
      if (outcome === "completed") h.requests[0].resolve(structuredClone(snapshot));
      else h.requests[0].reject(Error("solver unavailable"));
      await request;
    }
    const priorStatus = h.nodes.get("liveStatus").textContent;
    const priorState = h.store.state;
    h.api.cancelLiveEngine(); // the handler used for hidden documents and surface switches
    h.api.cancelLiveEngine();
    assert.equal(h.nodes.get("liveStatus").textContent, priorStatus, outcome);
    assert.equal(h.store.state, priorState, outcome);
  }
});

test("settlement of superseded work cannot clear the replacement cancellation state", async () => {
  for (const outcome of ["success", "failure"]) {
    const h = await fixture();
    const first = h.api.runLiveEngine();
    const second = h.api.runLiveEngine();
    if (outcome === "success") h.requests[0].resolve(structuredClone(snapshot));
    else h.requests[0].reject(Error("superseded failure"));
    await first;
    assert.match(h.nodes.get("liveStatus").textContent, /Running/);
    h.api.cancelLiveEngine();
    assert.match(h.nodes.get("liveStatus").textContent, /cancelled/);
    const cancellationStatus = h.nodes.get("liveStatus").textContent;
    h.requests[1].resolve(structuredClone(snapshot));
    await second;
    assert.equal(h.nodes.get("liveStatus").textContent, cancellationStatus);
    assert.equal(h.store.state, snapshot);
  }
});

test("bundle and timeline invalidation clear pending intent before later lifecycle events", async () => {
  for (const navigate of [h => h.api.prepareBundlePublication(), h => h.api.goLive(), h => h.api.setTimelineFrame(2)]) {
    const h = await fixture();
    const request = h.api.runLiveEngine();
    navigate(h);
    h.nodes.get("liveStatus").textContent = "Newly displayed context";
    h.api.cancelLiveEngine();
    assert.equal(h.nodes.get("liveStatus").textContent, "Newly displayed context");
    h.requests[0].resolve(structuredClone(snapshot));
    await request;
    assert.equal(h.nodes.get("liveStatus").textContent, "Newly displayed context");
  }
});
