// Onboarding tour: a short, skippable spotlight walkthrough for first-time visitors.

import { store } from "./store.js?v=22";
import { TOUR_STEPS } from "./config.js?v=22";
import { text } from "./dom.js?v=22";
import { renderAll } from "./view.js?v=22";
import { updateModeButtons } from "./panels.js?v=22";

const tourLayer = document.getElementById("tourLayer");
const tourSpot = document.getElementById("tourSpot");
const tourCard = document.getElementById("tourCard");

export function startTour() {
  if (!tourLayer) return;
  store.activeMode = "today";
  updateModeButtons();
  renderAll();
  window.scrollTo(0, 0);
  const panel = document.querySelector(".control-panel");
  if (panel) panel.scrollTop = 0;
  store.tourIndex = 0;
  tourLayer.hidden = false;
  showTourStep();
}

export function endTour() {
  if (tourLayer) tourLayer.hidden = true;
  store.tourIndex = -1;
  try { localStorage.setItem("sol-tour-seen", "1"); } catch (error) { /* storage may be blocked */ }
}

export function showTourStep() {
  const step = TOUR_STEPS[store.tourIndex];
  if (!step) { endTour(); return; }
  text("tourStepCount", `Step ${store.tourIndex + 1} of ${TOUR_STEPS.length}`);
  text("tourTitle", step.title);
  text("tourBody", step.body);
  const back = /** @type {HTMLButtonElement|null} */ (document.getElementById("tourBack"));
  const next = document.getElementById("tourNext");
  if (back) back.disabled = store.tourIndex === 0;
  if (next) next.textContent = store.tourIndex === TOUR_STEPS.length - 1 ? "Done" : "Next";

  const targetEl = step.target ? document.querySelector(step.target) : null;
  if (targetEl && tourSpot) {
    const rect = targetEl.getBoundingClientRect();
    const pad = 6;
    tourSpot.classList.remove("hidden");
    tourSpot.style.left = `${rect.left - pad}px`;
    tourSpot.style.top = `${rect.top - pad}px`;
    tourSpot.style.width = `${rect.width + pad * 2}px`;
    tourSpot.style.height = `${rect.height + pad * 2}px`;
    positionTourCard(rect);
  } else if (tourSpot) {
    tourSpot.classList.add("hidden");
    centerTourCard();
  }
}

function positionTourCard(rect) {
  if (!tourCard) return;
  const card = tourCard.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 12;
  if (top + card.height > window.innerHeight - 8) top = rect.top - card.height - 12;
  if (left + card.width > window.innerWidth - 8) left = window.innerWidth - card.width - 8;
  tourCard.style.left = `${Math.max(8, left)}px`;
  tourCard.style.top = `${Math.max(8, top)}px`;
}

function centerTourCard() {
  if (!tourCard) return;
  const card = tourCard.getBoundingClientRect();
  tourCard.style.left = `${Math.max(8, (window.innerWidth - card.width) / 2)}px`;
  tourCard.style.top = `${Math.max(8, (window.innerHeight - card.height) / 2)}px`;
}

export function maybeAutoStartTour() {
  let seen = null;
  try { seen = localStorage.getItem("sol-tour-seen"); } catch (error) { seen = "1"; }
  if (!seen) startTour();
}
