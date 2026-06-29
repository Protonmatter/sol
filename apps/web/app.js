// Entry module: wires DOM events to the feature modules and kicks off loading.
// The app is split into ES modules under ./js/ — see docs/HANDOFF.md.

import { store } from "./js/store.js?v=22";
import { TOUR_STEPS } from "./js/config.js?v=22";
import { controls } from "./js/dom.js?v=22";
import { clamp } from "./js/format.js?v=22";
import { selectedRegion } from "./js/selectors.js?v=22";
import { renderAll } from "./js/view.js?v=22";
import { updateModeButtons } from "./js/panels.js?v=22";
import { loadState } from "./js/data.js?v=22";
import { setTimelineFrame, goLive, togglePlay, runLiveEngine, stopPlay } from "./js/timeline.js?v=22";
import { startTour, endTour, showTourStep } from "./js/tour.js?v=22";
import { showTip, hideTip, isTipHidden } from "./js/tooltip.js?v=22";
import { enterSky, leaveSky } from "./js/sky.js?v=22";
import { enterSystem, leaveSystem } from "./js/system.js?v=22";
import { enterOrrery, leaveOrrery } from "./js/orrery.js?v=25";

// --- Layer toggles ---
for (const input of Object.values(controls)) {
  input.addEventListener("change", renderAll);
}

// --- Surface tabs ---
document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    store.activeMode = /** @type {HTMLElement} */ (button).dataset.mode;
    if (store.activeMode === "explore" && store.selectedRegionId == null) {
      const region = selectedRegion();
      store.selectedRegionId = region ? region.id : null;
    }
    updateModeButtons();
    renderAll();
    leaveSky();
    leaveSystem();
    leaveOrrery();
    if (store.activeMode === "sky") enterSky();
    else if (store.activeMode === "system") enterSystem();
    else if (store.activeMode === "orrery") enterOrrery();
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
    store.activeMode = "explore";
    updateModeButtons();
    renderAll();
  }
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
    setTimelineFrame(Math.round(frac * (store.seriesFrames.length - 1)));
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
    store.activeMode = "explore";
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
  }
});

// --- Onboarding tour controls ---
document.getElementById("tourStart")?.addEventListener("click", startTour);
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
document.getElementById("nowBtn")?.addEventListener("click", goLive);
document.getElementById("liveRun")?.addEventListener("click", runLiveEngine);
document.getElementById("liveActivity")?.addEventListener("change", runLiveEngine);

// --- Boot ---
loadState();
