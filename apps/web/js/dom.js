// Thin DOM helpers + the layer-toggle control references. No app-state imports.

// Overlay toggles. The base solar image is now chosen by the wavelength selector (store.wavelength),
// not by checkboxes, so only the confidence + active-region overlays remain here.
export const controls = {
  confidence: /** @type {HTMLInputElement} */ (document.getElementById("layerConfidence")),
  regions: /** @type {HTMLInputElement} */ (document.getElementById("layerRegions"))
};

import {writeText} from './domWrites.js';

export function text(id, value) {
  const node = document.getElementById(id);
  if (node) writeText(node, value);
}

export function textWithTitle(id, value, title) {
  const node = document.getElementById(id);
  if (!node) return;
  writeText(node, value);
  // An explicit empty title suppresses an inherited tooltip; absence is different.
  if (typeof title !== "string" || typeof node.getAttribute !== "function" || node.getAttribute("title") !== title) node.title = title;
}

export function setPill(id, value, stateClass) {
  const node = document.getElementById(id);
  if (!node) return;
  writeText(node, value);
  const className = `state-pill ${stateClass}`;
  if (typeof node.getAttribute !== "function" || node.getAttribute("class") !== className) node.className = className;
}
