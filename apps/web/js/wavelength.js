// The solar wavelength selector. Each chip is a real NASA SDO channel that swaps the Sun's base image;
// because every wavelength is emitted by a different layer/temperature of the solar atmosphere, the
// selector doubles as a tour up through the Sun — surface → chromosphere → corona → flares. "Model"
// shows the synthetic engine view instead.

import { store } from "./store.js?v=a2360b7fc1";
import { WAVELENGTHS, BASE_IMAGES } from "./config.js?v=a2360b7fc1";
import { renderAll } from "./view.js?v=a2360b7fc1";

function updateWavelengthCaption() {
  const node = document.getElementById("wavelengthCaption");
  if (!node) return;
  if (store.wavelength === "model") {
    node.textContent = "Synthetic engine view — the solar-cycle model's own photosphere, sunspots, and magnetic dipoles. Toggle the overlays below.";
    return;
  }
  const cfg = BASE_IMAGES[store.wavelength];
  if (!cfg) { node.textContent = ""; return; }
  node.innerHTML = `<strong>${cfg.label}</strong> — ${cfg.layer} · ${cfg.temp}. ${cfg.blurb} <span class="muted">(live NASA SDO)</span>`;
}

export function setWavelength(id) {
  store.wavelength = id;
  document.querySelectorAll("#wavelengthBar .wl-chip").forEach((c) => c.classList.toggle("active", c.dataset.id === id));
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
    const cfg = BASE_IMAGES[w.id];
    if (cfg) chip.title = `${cfg.label} — ${cfg.layer} · ${cfg.temp}`;
    else chip.title = "Synthetic solar-cycle model view";
    chip.addEventListener("click", () => setWavelength(w.id));
    bar.appendChild(chip);
  }
  updateWavelengthCaption();
}
