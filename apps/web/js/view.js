// The render orchestrator + per-surface progressive disclosure.

import { store } from "./store.js?v=6322cab170";
import { MANAGED_PANELS, SURFACE_PANELS } from "./config.js?v=6322cab170";
import { updateText } from "./panels.js?v=6322cab170";
import { drawSolarDisk, drawButterfly } from "./render.js?v=6322cab170";

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
