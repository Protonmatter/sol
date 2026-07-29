// The 3-D view's click-to-inspect physical-facts panel. Pure DOM building from the
// bodyData constants plus the live snapshot row passed in — no GL, no renderer state —
// extracted from orrery.js so the renderer file holds plumbing, not panel markup.

import { BODY, poleVector } from "./bodyData.js?v=061ea4f22a";
import { isRetrograde } from "./moonorbits.js?v=061ea4f22a";
import { store } from "./store.js?v=061ea4f22a";

function fmt(n, d = 0) { return n == null || !isFinite(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }); }

// 5.972e24 → "5.972 × 10²⁴" — scientific notation with a real superscript exponent, for masses.
const SUPERSCRIPTS = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
function sci(n) {
  if (n == null || !isFinite(n) || n <= 0) return null;
  const e = Math.floor(Math.log10(n));
  const sup = String(e).split("").map((ch) => SUPERSCRIPTS[ch] || ch).join("");
  return `${(n / 10 ** e).toFixed(3)} × 10${sup}`;
}

/**
 * Facts card for a moon. Separate from the planet card because the honest content differs: a
 * moon's card leads with what it orbits, and its position carries an accuracy caveat the
 * planets' VSOP2013/TOP2013 positions do not need.
 */
export function renderMoonDetail(m, unixSeconds) {
  const host = document.getElementById("orreryDetail"); if (!host) return;
  host.textContent = "";
  const card = document.createElement("div"); card.className = "sky-row system-detail";
  const h = document.createElement("strong"); h.textContent = m.n; card.appendChild(h);
  const blurb = document.createElement("p"); blurb.className = "time-frame-label";
  blurb.textContent = m.note; card.appendChild(blurb);
  const dl = document.createElement("dl"); dl.className = "detail-grid";
  const add = (k, v) => {
    if (v == null) return;
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd);
  };
  add("Orbits", m.p);
  add("Mean radius", `${fmt(m.r, 1)} km${m.r * 2 > 3000 ? " — larger than Pluto" : ""}`);
  add("Orbital radius", `${fmt(m.a)} km from ${m.p}'s centre`);
  add("Orbital period", m.P < 1
    ? `${fmt(m.P * 24, 2)} h`
    : `${fmt(m.P, 3)} d${m.P > 60 ? ` (${fmt(m.P / 365.25, 2)} yr)` : ""}`);
  add("Eccentricity", m.e < 0.001 ? "≈ 0 — very nearly circular" : m.e.toFixed(4));
  // Inclination is quoted against the ecliptic because that is the frame the elements are in,
  // but retrograde is decided against the PLANET'S SPIN — see isRetrograde. Reading it off the
  // ecliptic inclination instead would label all five Uranian moons "retrograde", which is
  // false: they are prograde around a planet that is tipped over.
  const retro = isRetrograde(m, BODY[m.p], poleVector, unixSeconds);
  add("Inclination", `${m.i.toFixed(2)}° to the ecliptic`
    + (retro ? ` · retrograde — it orbits against ${m.p}'s spin` : "")
    + (!retro && m.i > 90 ? ` · prograde around ${m.p}, which is itself tipped past 90°` : ""));
  if (m.rho != null) add("Mean density", `${m.rho.toFixed(3)} g/cm³`);
  if (m.gm != null) add("GM", `${m.gm.toPrecision(5)} km³/s²`);
  card.appendChild(dl);
  // The caveat belongs on the card, not only in a source file nobody reading this will open.
  const note = document.createElement("p");
  note.className = "time-frame-label";
  note.textContent = "Orbit from JPL Horizons; the position along it is Kepler-propagated and "
    + "good to a few degrees — enough to show which side of its planet it is on, not enough for "
    + "an occultation. Distances from the planet are scaled up with the planet's own exaggerated "
    + "size, so the spacing between moons stays true. Colour is illustrative.";
  card.appendChild(note);
  host.appendChild(card);
}

/**
 * Facts card for a small-body marker (dwarf planet, comet, or spacecraft) — the layer that used
 * to be drawn and labelled but had no card at all, so its `note` strings were unreachable.
 * `s` is the marker from orrery.js: {name, pos, kind, note, el} with `el` the source record
 * (osculating elements for dwarfs/comets, distance+heading for probes).
 */
export function renderSmallDetail(s) {
  const host = document.getElementById("orreryDetail"); if (!host) return;
  host.textContent = "";
  const card = document.createElement("div"); card.className = "sky-row system-detail";
  const h = document.createElement("strong"); h.textContent = s.name; card.appendChild(h);
  const kindLabel = { dwarf: "Dwarf planet / asteroid", comet: "Comet", probe: "Spacecraft" }[s.kind] || s.kind;
  const blurb = document.createElement("p"); blurb.className = "time-frame-label";
  blurb.textContent = `${kindLabel} — ${s.note}`; card.appendChild(blurb);
  const dl = document.createElement("dl"); dl.className = "detail-grid";
  const add = (k, v) => {
    if (v == null) return;
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd);
  };
  const distAU = Math.hypot(s.pos[0], s.pos[1], s.pos[2]);
  add("Distance from Sun", `${distAU.toFixed(2)} AU · light ${(distAU * 8.317 / 60).toFixed(1)} h`);
  const el = s.el || {};
  if (s.kind !== "probe" && el.a != null) {
    add("Semi-major axis", `${el.a.toFixed(2)} AU`);
    add("Perihelion → aphelion", `${(el.a * (1 - el.e)).toFixed(2)} → ${(el.a * (1 + el.e)).toFixed(1)} AU`);
    add("Eccentricity", el.e.toFixed(4));
    add("Inclination", `${el.i.toFixed(2)}° to the ecliptic${el.i > 90 ? " · retrograde orbit" : ""}`);
    add("Orbital period", `${Math.pow(el.a, 1.5).toFixed(el.a > 20 ? 0 : 2)} yr`);
  }
  card.appendChild(dl);
  const note = document.createElement("p");
  note.className = "time-frame-label";
  note.textContent = s.kind === "probe"
    ? "Placed from its approximate current distance and heading — spacecraft recede ~3 AU per "
      + "year, so the marker only means anything near the present."
    : "Orbit geometry from published J2000 osculating elements (accurate); the position along "
      + "it is a two-body Kepler propagation with no planetary perturbations — good to about a "
      + "degree, for orientation rather than navigation.";
  card.appendChild(note);
  host.appendChild(card);
}

// Render the facts card for `name` into #orreryDetail. `live` is the body's row from the
// current system snapshot (distances/speed/phase/magnitude/equilibrium temp), or undefined.
export function renderDetail(name, live) {
  const host = document.getElementById("orreryDetail"); if (!host) return;
  const phys = BODY[name];
  host.textContent = "";
  if (!phys) {
    const row = document.createElement("div");
    row.className = "sky-row";
    row.textContent = "Click the Sun, a planet, a moon, a dwarf planet, a comet, or a named star to inspect its facts.";
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
  // massKg has been in the table since day one but was never rendered anywhere.
  if (phys.massKg) add("Mass", `${sci(phys.massKg)} kg${name !== "Earth" && BODY.Earth ? ` (${(phys.massKg / BODY.Earth.massKg).toPrecision(3)} × Earth)` : ""}`);
  add("Surface gravity", `${phys.gravity.toFixed(2)} m/s² · escape ${phys.escapeKms.toFixed(1)} km/s`, "escape-velocity");
  add("Mean density", `${phys.densityGcm3.toFixed(3)} g/cm³`);
  const rh = phys.rotationHours, retro = rh < 0;
  const lock = phys.tidalLock;
  add(
    "Rotation (sidereal)",
    `${fmt(Math.abs(rh), 2)} h${Math.abs(rh) > 48 ? ` (${(Math.abs(rh) / 24).toFixed(2)} d)` : ""}`
    + `${retro ? " · retrograde" : ""}`
    + (lock ? ` · synchronous — equal to its ${lock.orbitalPeriodDays} d orbit, so the same face stays toward Earth` : ""),
    lock ? "tidal-locking" : "sidereal",
  );
  if (lock) {
    add(
      "Libration",
      `±${lock.librationLonDeg}° longitude, ±${lock.librationLatDeg}° latitude — the monthly wobble that reveals `
      + `${Math.round(lock.visibleFraction * 100)}% of the surface from Earth, not just half`,
      "libration",
    );
  }
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
  }
  if (name === "Sun") {
    add("Luminosity", "3.828×10²⁶ W");
    add("Composition", "73% H, 25% He (by mass)");
    // Say what the 3-D surface actually is — a dated SDO observation or the procedural model —
    // rather than letting an aging baseline frame pass silently as "today's Sun".
    const t = store.orrery ? store.orrery.sunImageUnix : null;
    add("Surface imagery", t
      ? `NASA SDO/HMI continuum, fetched ${new Date(t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
      : "procedural model (no dated SDO frame available)");
  }
  card.appendChild(dl); host.appendChild(card);
}
