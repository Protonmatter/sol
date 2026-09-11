// Entry module: wires DOM events to the feature modules and kicks off loading.
// The app is split into ES modules under ./js/ — see docs/HANDOFF.md.

import { store } from "./js/store.js?v=dcca6290db";
import { TOUR_STEPS } from "./js/config.js?v=dcca6290db";
import { controls } from "./js/dom.js?v=dcca6290db";
import { clamp } from "./js/format.js?v=dcca6290db";
import { renderAll, updateTaskHeader } from "./js/view.js?v=dcca6290db";
import { updateModeButtons } from "./js/panels.js?v=dcca6290db";
import { loadState } from "./js/data.js?v=dcca6290db";
import { setTimelineFrame, goLive, togglePlay, runLiveEngine, stopPlay, cancelLiveEngine, stepTimeline } from "./js/timeline.js?v=dcca6290db";
import { startTour, endTour, showTourStep } from "./js/tour.js?v=dcca6290db";
import { showTip, hideTip, isTipHidden } from "./js/tooltip.js?v=dcca6290db";
import { enterSky, leaveSky, resizeSky } from "./js/sky.js?v=dcca6290db";
import { enterOrrery, leaveOrrery } from "./js/orrery.js?v=dcca6290db";
import { buildWavelengthBar } from "./js/wavelength.js?v=dcca6290db";
import { buildSunCutaway } from "./js/sunlayers.js?v=dcca6290db";
import { nearestSeriesFrame } from "./js/seriesModel.js?v=dcca6290db";
import { registerOfflineRelease } from "./js/releaseClient.js?v=dcca6290db";
import { createViewEvidence } from "./js/viewEvidence.js?v=dcca6290db";
window.addEventListener("sol:presentation", updateTaskHeader);
let previewEvidence=null;
document.getElementById("viewEvidencePreview")?.addEventListener("click",()=>{
  const presentation=store.activeMode==="today"?store.presentation:store.activeMode==="sky"?store.sky?.presentation:store.orrery?.presentation;
  const output=document.getElementById("viewEvidenceJson"),panel=document.getElementById("viewEvidencePanel"),download=document.getElementById("viewEvidenceDownload");
  try {
    previewEvidence=createViewEvidence({surface:store.activeMode,presentation,releaseId:"__SOL_RELEASE_ID__",exportedAt:new Date().toISOString(),bundleIdentity:store.dataBundleIdentity});
    if(output)output.textContent=JSON.stringify(previewEvidence,null,2);download?.removeAttribute("disabled");
  } catch(error) {previewEvidence=null;if(output)output.textContent=error.message;download?.setAttribute("disabled","");}
  if(panel)panel.hidden=false;output?.focus();
});
document.getElementById("viewEvidenceCancel")?.addEventListener("click",()=>{previewEvidence=null;const panel=document.getElementById("viewEvidencePanel");if(panel)panel.hidden=true;document.getElementById("viewEvidencePreview")?.focus();});
document.getElementById("viewEvidenceDownload")?.addEventListener("click",()=>{
  if(!previewEvidence)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(previewEvidence,null,2)+"\n"],{type:"application/json"})),link=document.createElement("a");
  link.href=url;link.download="sol-view-evidence.v1.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

// --- Layer toggles ---
for (const input of Object.values(controls)) {
  input.addEventListener("change", renderAll);
}

// --- Surface tabs ---
document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    store.activeMode = /** @type {HTMLElement} */ (button).dataset.mode;
    if(store.activeMode!=="today") { cancelLiveEngine(); stopPlay(); }
    // The onboarding tour is about the Sun; don't let it linger over the sky / solar-system
    // surfaces. Guard on an OPEN tour (like the Escape handler below): calling endTour()
    // unconditionally wrote sol-tour-seen and stole focus to the (about-to-hide) tour CTA
    // on every tab click — first-time visitors who clicked a tab never saw the tour at all.
    if ((store.activeMode === "sky" || store.activeMode === "orrery") && store.tourIndex >= 0) endTour();
    updateModeButtons();
    renderAll();
    leaveSky();
    leaveOrrery();
    if (store.activeMode === "sky") enterSky();
    else if (store.activeMode === "orrery") enterOrrery();
    try { localStorage.setItem("sol-surface", store.activeMode); } catch (_) { /* session-only */ }
  });
});

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
    const exp = /** @type {HTMLDetailsElement|null} */ (document.getElementById("sunExplore"));
    if (exp) exp.open = true; // reveal the selection in the Explore drawer
    updateModeButtons();
    renderAll();
  }
});

// --- Responsive re-render ---
let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderAll();
    resizeSky(); // the sky dome sizes its backing store on draw; frozen time never redraws otherwise
    if (store.tourIndex >= 0) showTourStep();
  }, 120);
});

// --- Glossary tooltips ---
document.addEventListener("mouseover", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target && !store.tipPinned) showTip(target);
});
document.addEventListener("mouseout", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target && !store.tipPinned) hideTip();
});
document.addEventListener("focusin", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target) showTip(target);
});
document.addEventListener("focusout", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target && !store.tipPinned) hideTip();
});
document.addEventListener("click", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target) {
    event.preventDefault();
    if (store.tipPinned && !isTipHidden()) hideTip();
    else { showTip(target); store.tipPinned = true; }
  } else if (store.tipPinned) {
    hideTip();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideTip();
    if (store.tourIndex >= 0) endTour();
    return;
  }
  // Enter/Space activates the role="button" spans (stage steps, legend/signal chips):
  // real buttons synthesize click from the keyboard, spans don't — so AT announced
  // "button" on elements that keyboard users couldn't actually press.
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = /** @type {Element} */ (event.target);
  if (target instanceof HTMLElement && target.matches('[role="button"][data-term]')) {
    event.preventDefault();
    target.click();
  }
});

// --- Onboarding tour controls ---
document.getElementById("tourStart")?.addEventListener("click", startTour);
document.getElementById("sourcesLink")?.addEventListener("click", () => {
  const details = /** @type {HTMLDetailsElement|null} */ (document.getElementById("sourcesAndLimits"));
  if (details) details.open = true;
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

// --- Collapsible / pinned control panel (for an unobstructed full-bleed 3-D view) ---
document.getElementById("panelToggle")?.addEventListener("click", () => {
  const collapsed = document.body.classList.toggle("panel-collapsed");
  const btn = document.getElementById("panelToggle");
  if (btn) {
    btn.textContent = collapsed ? "Show inspector" : "Hide inspector";
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.setAttribute("aria-label", collapsed ? "Show inspector" : "Hide inspector");
  }
  const inspector = document.getElementById("viewInspector");
  if (inspector) inspector.inert = collapsed;
  // Let the canvases re-fit to the new width (orrery ResizeObserver + 2-D canvases via renderAll).
  window.dispatchEvent(new Event("resize"));
});

// --- Boot ---
buildWavelengthBar();
buildSunCutaway();
// Route the initial surface: a #sky= share link outranks the remembered surface, which
// outranks the default. Share-link recipients used to land on the Sun surface with no
// hint their link encoded a sky view; everyone else lost their place on every reload.
(() => {
  let target = null;
  if (/#sky=/.test(location.hash)) target = "sky";
  else {
    try {
      const saved = localStorage.getItem("sol-surface");
      if (saved === "sky" || saved === "orrery") target = saved;
    } catch (_) { /* storage unavailable */ }
  }
  if (target) {
    /** @type {HTMLElement|null} */ (document.querySelector(`.mode-button[data-mode="${target}"]`))?.click();
  }
})();
loadState();

// Source preview has no release manifest, so only staged builds register an offline worker.
const releaseBasePath = "__SOL_BASE_PATH__";
if ("serviceWorker" in navigator && !releaseBasePath.startsWith("__")) {
  registerOfflineRelease({serviceWorker:navigator.serviceWorker,location,document,basePath:releaseBasePath,releaseId:"__SOL_RELEASE_ID__"});
}
