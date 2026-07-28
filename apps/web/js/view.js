// The render orchestrator + per-surface progressive disclosure.

import { store } from "./store.js?v=4a5f52993c";
import { updateText } from "./panels.js?v=4a5f52993c";
import { drawSolarDisk, drawButterfly } from "./render.js?v=4a5f52993c";

export function renderAll() {
  applySurfaceVisibility();
  updateText();
  drawSolarDisk();
  drawButterfly();
}

export function applySurfaceVisibility() {
  // Surface visibility is entirely CSS-driven off body[data-surface]; the Sun's depth lives in the
  // collapsible `.sun-section` drawers (hidden on My Sky / Solar System). Just set the attribute.
  const panel = document.querySelector(".control-panel");
  if (panel) panel.setAttribute("data-surface", store.activeMode);
  document.body.setAttribute("data-surface", store.activeMode);
}
