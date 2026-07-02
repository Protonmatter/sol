// The solar wavelength selector. Each chip is a real NASA SDO channel that swaps the Sun's base image;
// because every wavelength is emitted by a different layer/temperature of the solar atmosphere, the
// selector doubles as a tour up through the Sun — surface → chromosphere → corona → flares. "Model"
// shows the synthetic engine view instead.

import { store } from "./store.js?v=c829bbcd8c";
import { WAVELENGTHS, BASE_IMAGES } from "./config.js?v=c829bbcd8c";
import { renderAll } from "./view.js?v=c829bbcd8c";
import { baseImageState, retryBaseImage } from "./data.js?v=c829bbcd8c";

function updateWavelengthCaption() {
  const node = document.getElementById("wavelengthCaption");
  if (!node) return;
  if (store.wavelength === "model") {
    node.textContent = "Synthetic engine view — the solar-cycle model's own photosphere, sunspots, and magnetic dipoles. Toggle the overlays below.";
    return;
  }
  const cfg = BASE_IMAGES[store.wavelength];
  if (!cfg) { node.textContent = ""; return; }
  // Provenance-honest caption: only claim "live NASA SDO" while the live image is actually
  // showing. When the fetch failed, the disk silently falls back to the synthetic render —
  // two adjacent labels used to disagree about whether you were looking at the real Sun.
  const status = baseImageState(store.wavelength);
  const provenance = status === "live"
    ? "(live NASA SDO)"
    : status === "failed"
      ? "(live image unavailable — showing the synthetic model)"
      : "(loading the live image…)";
  node.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = cfg.label;
  node.appendChild(strong);
  node.appendChild(document.createTextNode(` — ${cfg.layer} · ${cfg.temp}. ${cfg.blurb} `));
  const muted = document.createElement("span");
  muted.className = "muted";
  muted.textContent = provenance;
  node.appendChild(muted);
}

export function setWavelength(id) {
  store.wavelength = id;
  retryBaseImage(id); // re-selecting a channel retries a previously failed live image
  document.querySelectorAll("#wavelengthBar .wl-chip").forEach((c) => {
    const isActive = c.dataset.id === id;
    c.classList.toggle("active", isActive);
    c.setAttribute("aria-pressed", String(isActive)); // class-only state was invisible to AT
  });
  updateWavelengthCaption();
  renderAll();
}

export function buildWavelengthBar() {
  const bar = document.getElementById("wavelengthBar");
  if (!bar) return;
  bar.textContent = "";
  for (const w of WAVELENGTHS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "wl-chip" + (w.id === store.wavelength ? " active" : "");
    chip.dataset.id = w.id;
    chip.style.setProperty("--wl", w.color);
    chip.textContent = w.short;
    chip.setAttribute("aria-pressed", String(w.id === store.wavelength));
    const cfg = BASE_IMAGES[w.id];
    const info = cfg ? `${cfg.label} — ${cfg.layer} · ${cfg.temp}` : "Synthetic solar-cycle model view";
    chip.title = info;
    chip.setAttribute("aria-label", info); // title alone is hover-only
    chip.addEventListener("click", () => setWavelength(w.id));
    bar.appendChild(chip);
  }
  updateWavelengthCaption();
}

// Keep the caption's provenance suffix truthful as the live image resolves or fails after
// the initial render (data.js announces load/error outcomes with this event).
window.addEventListener("sol:baseimage", updateWavelengthCaption);
