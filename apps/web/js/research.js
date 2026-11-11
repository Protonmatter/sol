// Research bindings load only after deliberate Research intent.
import { store } from "./store.js";
import { TOUR_STEPS } from "./config.js";
import { controls } from "./dom.js";
import { clamp } from "./format.js";
import { renderAll } from "./view.js";
import { updateModeButtons } from "./surfaceNavigation.js";
import { loadState } from "./data.js";
import { setTimelineFrame, goLive, togglePlay, runLiveEngine, stopPlay, cancelLiveEngine, stepTimeline } from "./timeline.js";
import { startTour, endTour, showTourStep } from "./tour.js";
import { buildWavelengthBar, setWavelength } from "./wavelength.js";
import { buildSunCutaway } from "./sunlayers.js";
import { nearestSeriesFrame } from "./seriesModel.js";
import { openInspector } from "./workspace.js";
import './researchView.js';

// --- Layer toggles ---
for (const input of Object.values(controls)) {
  input.addEventListener("change", renderAll);
}

// --- Click a region on the solar disk ---
document.getElementById("solarCanvas")?.addEventListener("click", (event) => {
  const canvas = /** @type {HTMLCanvasElement} */ (event.currentTarget);
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  let best = null;
  for (const item of store.projectedRegions) {
    const distance = Math.hypot(item.x - x, item.y - y);
    if (distance < 34 && (!best || distance < best.distance)) best = { distance, item };
  }
  if (best) {
    openInspector("today");
    store.selectedRegionId = best.item.region.id;
    store.activeMode = "today";
    const exp = /** @type {HTMLDetailsElement|null} */ (document.getElementById("sunExplore"));
    if (exp) exp.open = true; // reveal the selection in the Explore drawer
    updateModeButtons();
    renderAll();
  }
});

// --- Keyboard/AT path to select a region (mirrors clicking a marker on the disk) ---
window.addEventListener("sol:region-selected", (event) => {
  const id = /** @type {CustomEvent} */ (event).detail;
  const region = (store.state.active_regions || []).find((r) => r.id === id);
  if (!region) return;
  openInspector("today");
  store.selectedRegionId = region.id; // keep the original id type so selectors match
  store.activeMode = "today";
  updateModeButtons();
  renderAll();
});
document.getElementById("regionSearch")?.addEventListener("input", renderAll);
document.getElementById("retrySnapshot")?.addEventListener("click", async event=>{
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  if(button.disabled) return;
  button.disabled = true;
  try { await loadState(); } finally { button.disabled = false; }
});

// --- Click the butterfly: scrub time when a series is loaded, else select a region ---
document.getElementById("butterflyCanvas")?.addEventListener("click", (event) => {
  const canvas = /** @type {HTMLCanvasElement} */ (event.currentTarget);
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  if (store.seriesFrames.length) {
    const usable = canvas.width - 38 - 14;
    const frac = clamp((x - 38) / usable, 0, 1);
    stopPlay();
    const index = nearestSeriesFrame(store.seriesRecords, frac);
    if (index !== null) setTimelineFrame(index);
    return;
  }
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  let best = null;
  for (const item of store.projectedButterflyRegions) {
    const distance = Math.hypot(item.x - x, item.y - y);
    if (distance < 28 && (!best || distance < best.distance)) best = { distance, item };
  }
  if (best) {
    store.selectedRegionId = best.item.region.id;
    store.activeMode = "today";
    openInspector("today");
    const exp = /** @type {HTMLDetailsElement|null} */ (document.getElementById("sunExplore"));
    if (exp) exp.open = true; // reveal the selection in the Explore drawer
    updateModeButtons();
    renderAll();
  }
});

document.getElementById("tourSkip")?.addEventListener("click", endTour);
document.getElementById("tourBack")?.addEventListener("click", () => {
  if (store.tourIndex > 0) { store.tourIndex -= 1; showTourStep(); }
});
document.getElementById("tourNext")?.addEventListener("click", () => {
  if (store.tourIndex >= TOUR_STEPS.length - 1) { endTour(); return; }
  store.tourIndex += 1;
  showTourStep();
});

// --- Timeline scrubber / playback / live engine ---
document.getElementById("timeScrubber")?.addEventListener("input", (event) => {
  stopPlay();
  setTimelineFrame(Number(/** @type {HTMLInputElement} */ (event.target).value));
});
document.getElementById("playToggle")?.addEventListener("click", togglePlay);
document.getElementById("previousFrame")?.addEventListener("click",()=>{ stopPlay();stepTimeline(-1); });
document.getElementById("nextFrame")?.addEventListener("click",()=>{ stopPlay();stepTimeline(1); });
window.addEventListener("sol:frame-selected",event=>{stopPlay();setTimelineFrame(/** @type {CustomEvent} */ (event).detail);});
document.getElementById("solarExport")?.addEventListener("click",()=>{
  if (store.state.schema_version !== "solar-state-snapshot.v3") return;
  const blob=new Blob([JSON.stringify(store.state,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="solar-state-snapshot.v3.json";link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.getElementById("nowBtn")?.addEventListener("click", goLive);
document.getElementById("liveRun")?.addEventListener("click", runLiveEngine);
document.getElementById("liveCancel")?.addEventListener("click", cancelLiveEngine);
document.addEventListener("visibilitychange",()=>{if(document.hidden) {cancelLiveEngine();stopPlay();}});
window.addEventListener("pagehide",cancelLiveEngine);
document.getElementById("liveActivity")?.addEventListener("change", runLiveEngine);


let initialLoad=null;
export function enterResearch() {
  // Selecting the model renders first entry; cached re-entry needs its own refresh.
  if(!initialLoad){setWavelength('model');initialLoad=loadState();}
  else renderAll();
}
export function selectResearchModel(){setWavelength('model');}
export function leaveResearch(){cancelLiveEngine();stopPlay();}
export function startResearchTour(){startTour();}
export function showResearchTourStep(){showTourStep();}
export function endResearchTour(){endTour();}
buildWavelengthBar();
buildSunCutaway();
