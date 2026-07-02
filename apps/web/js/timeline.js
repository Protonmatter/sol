// Timeline scrubber / cycle playback + the in-browser (WASM) live engine run.

import { store } from "./store.js?v=1e53a8939f";
import { renderAll } from "./view.js?v=1e53a8939f";
import { loadEngine, simulateSnapshot } from "../engine.js?v=1e53a8939f";

// Monotonic counter bumped whenever the displayed state changes (scrub, Now, or a
// new live run). runLiveEngine() captures it before awaiting the WASM load and
// bails if it changed, so a slow-resolving simulate can't overwrite state the user
// has since navigated away from.
let navGeneration = 0;

export function setTimelineFrame(index) {
  if (!store.seriesFrames.length) return;
  navGeneration++;
  store.liveEngineRun = false;
  store.timelineIndex = Math.max(0, Math.min(store.seriesFrames.length - 1, index));
  store.state = store.seriesFrames[store.timelineIndex];
  store.selectedRegionId = null;
  const scrubber = /** @type {HTMLInputElement|null} */ (document.getElementById("timeScrubber"));
  if (scrubber) scrubber.value = String(store.timelineIndex);
  renderAll();
  updateTimeFrameLabel();
}

export function goLive() {
  stopPlay();
  navGeneration++;
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
    await loadEngine();
    const start = performance.now();
    const snapshot = simulateSnapshot({ seed: 42, steps: 24, dtHours: 1, activity, lon: 72, lat: 36 });
    const ms = (performance.now() - start).toFixed(1);
    if (gen !== navGeneration) return; // user navigated away while the engine loaded — don't clobber
    stopPlay();
    store.timelineIndex = -1;
    store.liveEngineRun = true;
    store.state = snapshot;
    store.selectedRegionId = null;
    renderAll();
    if (status) {
      const count = (snapshot.active_regions || []).length;
      status.textContent = `Computed in your browser by solar-core (WebAssembly): activity ${activity.toFixed(2)} → ${snapshot.learning?.cycle_stage || "?"}, ${count} active regions, in ${ms} ms. Press Now for today's real Sun.`;
    }
  } catch (error) {
    if (status) status.textContent = "Live engine unavailable (the WebAssembly module failed to load).";
  }
}

function playStep() {
  if (!store.seriesFrames.length) return;
  const next = store.timelineIndex + 1 >= store.seriesFrames.length ? 0 : store.timelineIndex + 1;
  setTimelineFrame(next);
}

export function startPlay() {
  if (!store.seriesFrames.length) {
    // Say why nothing happens instead of a silently dead Play button (series missing/unfetchable).
    const label = document.getElementById("timeFrameLabel");
    if (label) label.textContent = "Cycle playback unavailable — the frame series (data/series/) did not load.";
    return;
  }
  if (store.timelineIndex < 0) setTimelineFrame(0);
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
    label.textContent = "Live: today's Sun (NASA SDO)";
    return;
  }
  const meta = (store.seriesManifest && store.seriesManifest.frames && store.seriesManifest.frames[store.timelineIndex]) || {};
  const stage = store.state.learning?.cycle_stage || meta.stage || "cycle";
  const months = meta.months != null ? meta.months : "?";
  label.textContent = `Cycle model — ${stage}, ~${months} months in (synthetic)`;
}
