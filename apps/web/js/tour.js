// Onboarding tour: a short, skippable spotlight walkthrough for first-time visitors.

import { store } from "./store.js?v=11ffac3b2b";
import { TOUR_STEPS } from "./config.js?v=11ffac3b2b";
import { text } from "./dom.js?v=11ffac3b2b";
import { renderAll } from "./view.js?v=11ffac3b2b";
import { updateModeButtons } from "./panels.js?v=11ffac3b2b";

const tourLayer = document.getElementById("tourLayer");
const tourSpot = document.getElementById("tourSpot");
const tourCard = document.getElementById("tourCard");

// Focus that was active before the tour opened, restored when it closes.
let lastFocus = null;

// Make the page behind the tour truly modal. #tourLayer is a sibling of <main>,
// so marking <main> inert disables all background mouse/keyboard/AT interaction
// in one move, while the tour card (outside main) stays live.
function setBackgroundInert(on) {
  const main = document.querySelector("main.app-shell");
  if (!main) return;
  if (on) main.setAttribute("inert", "");
  else main.removeAttribute("inert");
}

export function startTour() {
  if (!tourLayer) return;
  store.activeMode = "today";
  updateModeButtons();
  renderAll();
  window.scrollTo(0, 0);
  const panel = document.querySelector(".control-panel");
  if (panel) panel.scrollTop = 0;
  lastFocus = /** @type {HTMLElement|null} */ (document.activeElement);
  store.tourIndex = 0;
  tourLayer.hidden = false;
  setBackgroundInert(true);
  showTourStep();
  // Move focus into the dialog so keyboard/SR users start inside it; the card is
  // aria-labelledby its title, so focusing it announces the current step.
  if (tourCard && typeof tourCard.focus === "function") tourCard.focus();
}

export function endTour() {
  if (tourLayer) tourLayer.hidden = true;
  setBackgroundInert(false);
  store.tourIndex = -1;
  try { localStorage.setItem("sol-tour-seen", "1"); } catch (error) { /* storage may be blocked */ }
  // Restore focus so it never strands on the now-hidden card. The tour's only opener
  // is the CTA, so prefer it; fall back to the prior focus only if it's still visible
  // and outside the tour layer (the region list rebuilds on open, detaching nodes).
  const cta = document.getElementById("tourStart");
  const layer = document.getElementById("tourLayer");
  const priorOk = lastFocus && document.contains(lastFocus)
    && /** @type {HTMLElement} */ (lastFocus).offsetParent !== null
    && !layer?.contains(lastFocus);
  const restore = (cta && cta.offsetParent !== null) ? cta : (priorOk ? lastFocus : null);
  if (restore && typeof restore.focus === "function") restore.focus();
  lastFocus = null;
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
  // Never hijack a deep-linked or restored non-Sun surface: startTour() forces the mode
  // back to "today", which would strand a "#sky=…" share-link recipient. The tour stays
  // one click away on the CTA.
  if (store.activeMode !== "today") return;
  let seen = null;
  try { seen = localStorage.getItem("sol-tour-seen"); } catch (error) { seen = "1"; }
  if (!seen) startTour();
}

// Trap Tab within the card's buttons (belt-and-suspenders on top of the inert
// background) so keyboard focus can't escape the dialog while it's open.
tourCard?.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const focusables = Array.from(tourCard.querySelectorAll("button:not([disabled])"));
  if (!focusables.length) return;
  const first = /** @type {HTMLElement} */ (focusables[0]);
  const last = /** @type {HTMLElement} */ (focusables[focusables.length - 1]);
  const activeEl = document.activeElement;
  if (event.shiftKey && (activeEl === first || activeEl === tourCard)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && activeEl === last) {
    event.preventDefault(); first.focus();
  }
});
