// Timeline scrubber / cycle playback + the in-browser (WASM) live engine run.

import { store } from "./store.js?v=dcca6290db";
import { renderAll } from "./view.js?v=dcca6290db";
import { requestSolarSimulation, cancelSolarSimulation } from "./solarWorkerClient.js?v=dcca6290db";
import { nextAvailableFrame } from "./seriesModel.js?v=dcca6290db";
import { assertSolarSnapshot } from "./solarContract.js?v=dcca6290db";

// Monotonic counter bumped whenever the displayed state changes (scrub, Now, or a
// new live run). runLiveEngine() captures it before awaiting the WASM load and
// bails if it changed, so a slow-resolving simulate can't overwrite state the user
// has since navigated away from.
let navGeneration = 0;

// Called only at the validated bundle publication boundary; no render or await.
export function prepareBundlePublication() {
  navGeneration++;
  cancelSolarSimulation();
  stopPlay();
}

export function setTimelineFrame(index) {
  if (!store.seriesFrames.length) return;
  navGeneration++;
  cancelSolarSimulation();
  store.liveEngineRun = false;
  store.timelineIndex = Math.max(0, Math.min(store.seriesFrames.length - 1, index));
  const frame = store.seriesFrames[store.timelineIndex];
  if (frame) store.state = frame; // keep last-valid scientific data on a gap
  store.selectedRegionId = null;
  const scrubber = /** @type {HTMLInputElement|null} */ (document.getElementById("timeScrubber"));
  if (scrubber) scrubber.value = String(store.timelineIndex);
  renderAll();
  updateTimeFrameLabel();
}

export function goLive() {
  stopPlay();
  navGeneration++;
  cancelSolarSimulation();
  store.liveEngineRun = false;
  store.timelineIndex = -1;
  store.state = store.liveState;
  store.selectedRegionId = null;
  renderAll();
  updateTimeFrameLabel();
}

// Run the real solar-core engine, compiled to WebAssembly, in the browser.
export async function runLiveEngine() {
  const status = document.getElementById("liveStatus");
  const slider = /** @type {HTMLInputElement|null} */ (document.getElementById("liveActivity"));
  const activity = Number(slider?.value || 0.9);
  const gen = ++navGeneration; // this run supersedes any earlier nav/run in flight
  if (status) status.textContent = "Running the engine…"; // pending feedback while the WASM fetch/solve runs
  try {
    const start = performance.now();
    const snapshot = assertSolarSnapshot(await requestSolarSimulation({ seed: 42, steps: 24, dtHours: 1, activity, lon: 72, lat: 36 }));
    const ms = (performance.now() - start).toFixed(1);
    if (gen !== navGeneration) return; // user navigated away while the engine loaded — don't clobber
    stopPlay();
    store.timelineIndex = -1;
    store.liveEngineRun = true;
    store.state = snapshot;
    // A local solve does not repair the separately loaded bundle. Only its
    // successful publication in loadState() clears dataError and the Retry UI.
    store.selectedRegionId = null;
    renderAll();
    if (status) {
      const count = (snapshot.active_regions || []).length;
      status.textContent = `Computed on your device by solar-core: activity ${activity.toFixed(2)} → ${snapshot.learning?.cycle_stage || "?"}, ${count} modeled regions, in ${ms} ms. Latest returns to the loaded feed context.`;
    }
  } catch (error) {
    if (gen !== navGeneration) return;
    if (status) status.textContent = `Engine result unavailable: ${error.message}. Last valid model and selection retained; retry the calculation.`;
  }
}

export function cancelLiveEngine() {
  navGeneration++;
  cancelSolarSimulation();
  const status = document.getElementById("liveStatus");
  if(status) status.textContent = "Calculation cancelled. Last valid model retained; Simulate starts a new bounded request.";
}

export function stepTimeline(direction = 1) {
  if (!store.seriesFrames.length) return;
  const next = nextAvailableFrame(store.seriesRecords, store.timelineIndex, direction);
  if (!next) { stopPlay(); return; }
  setTimelineFrame(next.index);
  if (next.skipped) {
    const label = document.getElementById("timeFrameLabel");
    if (label) label.textContent += ` · skipped ${next.skipped} unavailable frame(s)`;
  }
}

function playStep() { stepTimeline(1); }

export function startPlay() {
  if (!store.seriesFrames.some(Boolean)) {
    // Say why nothing happens instead of a silently dead Play button (series missing/unfetchable).
    const label = document.getElementById("timeFrameLabel");
    if (label) label.textContent = "Cycle playback unavailable — the frame series (data/series/) did not load.";
    return;
  }
  if (store.timelineIndex < 0) setTimelineFrame(nextAvailableFrame(store.seriesRecords, -1).index);
  stopPlay();
  store.playTimer = window.setInterval(playStep, 1100);
  updatePlayButton(true);
  setStatusLiveRegions("off"); // playback mutates three live regions every 1.1 s — mute the barrage
}

export function stopPlay() {
  if (store.playTimer) {
    window.clearInterval(store.playTimer);
    store.playTimer = 0;
  }
  updatePlayButton(false);
  setStatusLiveRegions("polite");
}

// The status strip / base label / selection panel are aria-live so async data changes
// announce — but during timeline playback they'd announce every frame, an SR barrage the
// user can only stop by finding Pause.
function setStatusLiveRegions(mode) {
  for (const sel of [".status-strip", "#baseLabel", ".selection-panel"]) {
    document.querySelector(sel)?.setAttribute("aria-live", mode);
  }
}

export function togglePlay() {
  if (store.playTimer) stopPlay();
  else startPlay();
}

function updatePlayButton(playing) {
  const button = document.getElementById("playToggle");
  if (button) button.textContent = playing ? "❚❚ Pause" : "▶ Play cycle";
}

function updateTimeFrameLabel() {
  const label = document.getElementById("timeFrameLabel");
  if (!label) return;
  if (store.timelineIndex < 0) {
    label.textContent = store.presentation?.timeLabel || "Latest loaded feed context";
    return;
  }
  const meta = (store.seriesManifest && store.seriesManifest.frames && store.seriesManifest.frames[store.timelineIndex]) || {};
  const stage = store.state.learning?.cycle_stage || meta.stage || "cycle";
  const months = meta.months != null ? meta.months : "?";
  if (!store.seriesFrames[store.timelineIndex]) {
    label.textContent = `Cycle month ${months} unavailable — retaining the last valid model, not interpolating.`;
    return;
  }
  label.textContent = `Cycle model — ${stage}, ~${months} months in (synthetic)`;
}
