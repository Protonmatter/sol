// Thin DOM helpers + the layer-toggle control references. No app-state imports.

// Overlay toggles. The base solar image is now chosen by the wavelength selector (store.wavelength),
// not by checkboxes, so only the confidence + active-region overlays remain here.
export const controls = {
  confidence: /** @type {HTMLInputElement} */ (document.getElementById("layerConfidence")),
  regions: /** @type {HTMLInputElement} */ (document.getElementById("layerRegions"))
};

export function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

export function textWithTitle(id, value, title) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = value;
  node.title = title;
}

export function setPill(id, value, stateClass) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = value;
  node.className = `state-pill ${stateClass}`;
}
