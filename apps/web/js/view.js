// The render orchestrator + per-surface progressive disclosure.

import { store } from "./store.js?v=b43147786c";
import { MANAGED_PANELS, SURFACE_PANELS } from "./config.js?v=b43147786c";
import { updateText } from "./panels.js?v=b43147786c";
import { drawSolarDisk, drawButterfly } from "./render.js?v=b43147786c";

export function renderAll() {
  applySurfaceVisibility();
  updateText();
  drawSolarDisk();
  drawButterfly();
}

export function applySurfaceVisibility() {
  const panel = document.querySelector(".control-panel");
  if (panel) panel.setAttribute("data-surface", store.activeMode);
  document.body.setAttribute("data-surface", store.activeMode);
  const show = new Set(SURFACE_PANELS[store.activeMode] || []);
  for (const selector of MANAGED_PANELS) {
    const node = document.querySelector(selector);
    if (node) node.classList.toggle("surface-hide", !show.has(selector));
  }
  const research = /** @type {HTMLDetailsElement|null} */ (document.querySelector(".research-panel"));
  if (research) research.open = store.activeMode === "research";
}
