// Thin DOM helpers + the layer-toggle control references. No app-state imports.

export const controls = {
  continuum: /** @type {HTMLInputElement} */ (document.getElementById("layerContinuum")),
  magnetogram: /** @type {HTMLInputElement} */ (document.getElementById("layerMagnetogram")),
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
