// Entry module: wires DOM events to the feature modules and kicks off loading.
// The app is split into ES modules under ./js/ — see docs/HANDOFF.md.

import { store } from "./js/store.js?v=1e53a8939f";
import { TOUR_STEPS } from "./js/config.js?v=1e53a8939f";
import { controls } from "./js/dom.js?v=1e53a8939f";
import { clamp } from "./js/format.js?v=1e53a8939f";
import { renderAll } from "./js/view.js?v=1e53a8939f";
import { updateModeButtons } from "./js/panels.js?v=1e53a8939f";
import { loadState } from "./js/data.js?v=1e53a8939f";
import { setTimelineFrame, goLive, togglePlay, runLiveEngine, stopPlay } from "./js/timeline.js?v=1e53a8939f";
import { startTour, endTour, showTourStep } from "./js/tour.js?v=1e53a8939f";
import { showTip, hideTip, isTipHidden } from "./js/tooltip.js?v=1e53a8939f";
import { enterSky, leaveSky, resizeSky } from "./js/sky.js?v=1e53a8939f";
import { enterOrrery, leaveOrrery } from "./js/orrery.js?v=1e53a8939f";
import { buildWavelengthBar } from "./js/wavelength.js?v=1e53a8939f";
import { buildSunCutaway } from "./js/sunlayers.js?v=1e53a8939f";

// --- Layer toggles ---
for (const input of Object.values(controls)) {
  input.addEventListener("change", renderAll);
}

// --- Surface tabs ---
document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    store.activeMode = /** @type {HTMLElement} */ (button).dataset.mode;
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
document.getElementById("regionList")?.addEventListener("click", (event) => {
  const btn = /** @type {Element} */ (event.target)?.closest?.("button[data-region-id]");
  if (!btn) return;
  const idStr = /** @type {HTMLElement} */ (btn).dataset.regionId;
  const region = (store.state.active_regions || []).find((r) => String(r.id) === idStr);
  if (!region) return;
  store.selectedRegionId = region.id; // keep the original id type so selectors match
  store.activeMode = "today";
  updateModeButtons();
  renderAll();
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

// --- Collapsible / pinned control panel (for an unobstructed full-bleed 3-D view) ---
document.getElementById("panelToggle")?.addEventListener("click", () => {
  const collapsed = document.body.classList.toggle("panel-collapsed");
  const btn = document.getElementById("panelToggle");
  if (btn) {
    btn.textContent = collapsed ? "⟨ Controls" : "⟩ Hide";
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.setAttribute("aria-label", collapsed ? "Show the control panel" : "Collapse the control panel");
  }
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
