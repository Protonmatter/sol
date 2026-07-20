// The 3-D view's click-to-inspect physical-facts panel. Pure DOM building from the
// bodyData constants plus the live snapshot row passed in — no GL, no renderer state —
// extracted from orrery.js so the renderer file holds plumbing, not panel markup.

import { BODY } from "./bodyData.js?v=11ffac3b2b";

function fmt(n, d = 0) { return n == null || !isFinite(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }); }

// Render the facts card for `name` into #orreryDetail. `live` is the body's row from the
// current system snapshot (distances/speed/phase/magnitude/equilibrium temp), or undefined.
export function renderDetail(name, live) {
  const host = document.getElementById("orreryDetail"); if (!host) return;
  const phys = BODY[name];
  host.textContent = "";
  if (!phys) {
    const row = document.createElement("div");
    row.className = "sky-row";
    row.textContent = "Click the Sun or a planet to inspect its facts.";
    host.appendChild(row);
    return;
  }
  const card = document.createElement("div"); card.className = "sky-row system-detail";
  const h = document.createElement("strong"); h.textContent = name; card.appendChild(h);
  const blurb = document.createElement("p"); blurb.className = "time-frame-label"; blurb.textContent = phys.blurb; card.appendChild(blurb);
  const dl = document.createElement("dl"); dl.className = "detail-grid";
  const add = (k, v, term) => {
    if (v == null) return;
    const dt = document.createElement("dt"); dt.textContent = k;
    if (term) {
      // Reuse the Sun panel's glossary affordance: the global [data-term] tooltip
      // handlers (app.js) service this '?' on hover, keyboard focus, and tap.
      const btn = document.createElement("button");
      btn.className = "term"; btn.type = "button"; btn.dataset.term = term;
      btn.setAttribute("aria-label", `What is ${k}?`); btn.textContent = "?";
      dt.append(" ", btn);
    }
    const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd);
  };
  add("Equatorial radius", `${fmt(phys.radiusKm)} km${phys.polarKm !== phys.radiusKm ? ` · oblate (polar ${fmt(phys.polarKm)} km)` : ""}`, phys.polarKm !== phys.radiusKm ? "oblateness" : null);
  add("Surface gravity", `${phys.gravity.toFixed(2)} m/s² · escape ${phys.escapeKms.toFixed(1)} km/s`, "escape-velocity");
  add("Mean density", `${phys.densityGcm3.toFixed(3)} g/cm³`);
  const rh = phys.rotationHours, retro = rh < 0;
  add("Rotation (sidereal)", `${fmt(Math.abs(rh), 2)} h${Math.abs(rh) > 48 ? ` (${(Math.abs(rh) / 24).toFixed(2)} d)` : ""}${retro ? " · retrograde" : ""}`, "sidereal");
  add("Axial tilt", `${phys.tiltDeg.toFixed(2)}°`, "axial-tilt");
  add("Magnetic field", phys.magnetosphere ? (phys.magDipoleEarth >= 1 ? `global dipole ~${fmt(phys.magDipoleEarth)}× Earth` : phys.magDipoleEarth > 0 ? `weak dipole (~${(phys.magDipoleEarth).toExponential(1)}× Earth)` : "intrinsic field") : "no global field", "magnetic-dipole");
  add("Atmosphere", isFinite(phys.atmosphere.pressureBar) && phys.atmosphere.pressureBar > 0 ? `${phys.atmosphere.pressureBar < 0.001 ? phys.atmosphere.pressureBar.toExponential(1) : fmt(phys.atmosphere.pressureBar, 3)} bar — ${phys.atmosphere.composition}` : phys.atmosphere.composition);
  add("Mean temperature", `${fmt(phys.meanTempK)} K (${fmt(phys.meanTempK - 273)} °C)`);
  if (live && live.equilibrium_temp_k != null) add("Equilibrium temp", `${fmt(live.equilibrium_temp_k)} K — black-body from sunlight alone (excludes greenhouse & internal heat)`, "equilibrium-temperature");
  if (phys.rings) add("Rings", `${fmt(phys.rings.innerKm)}–${fmt(phys.rings.outerKm)} km from centre${phys.rings.gaps ? " · Cassini Division" : ""}`);
  if (live) {
    add("Distance from Sun", `${live.dist_au.toFixed(3)} AU`);
    add("Distance from Earth", `${live.geo_dist_au.toFixed(3)} AU · light ${(live.geo_dist_au * 8.317).toFixed(1)} min`);
    add("Orbital speed", `${live.speed_kms.toFixed(2)} km/s`, "orbital-speed");
    if (live.illuminated_fraction != null) add("Illuminated", `${(live.illuminated_fraction * 100).toFixed(1)}% · phase ${live.phase_angle_deg.toFixed(1)}°`, "phase-angle");
    if (live.magnitude != null) add("Apparent magnitude", live.magnitude.toFixed(1), "apparent-magnitude");
  } else if (name === "Sun") {
    add("Luminosity", "3.828×10²⁶ W");
    add("Composition", "73% H, 25% He (by mass)");
  }
  card.appendChild(dl); host.appendChild(card);
}
