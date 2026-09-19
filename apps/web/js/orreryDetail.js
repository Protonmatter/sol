// The 3-D view's click-to-inspect physical-facts panel. Pure DOM building from the
// bodyData constants plus the live snapshot row passed in — no GL, no renderer state —
// extracted from orrery.js so the renderer file holds plumbing, not panel markup.

import { BODY, poleVector } from "./bodyData.js?v=dcca6290db";
import { isRetrograde } from "./moonorbits.js?v=dcca6290db";
import { MOON_ALBEDO } from "./moonAppearance.js?v=dcca6290db";
import { visualProvenanceText, visualBrowsePreview } from "./visualAssets.js";
import { appearanceReference, appearanceReferences, appearanceDescription, earthCloudRole, surfaceReferenceShown } from "./planetAppearance.js";
import { formatApparentV, formatIrradiance } from "./sunPhotometry.js?v=dcca6290db";

// Keep mutable appearance text separate from the native disclosure and source links.
// Presentation updates must not replace a focused link, glossary button or open card.
const sourceDisclosures = new WeakMap();

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
export function renderMoonDetail(m, unixSeconds, appearanceState = {}) {
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
  //
  // That decision needs the orbit plane, which lives in the lazily imported moonelements.js.
  // Every other fact here is identity and is available the moment the view opens — the whole
  // point of that split — so while the knots are in flight the clause is omitted rather than
  // the card being lost to a TypeError on `m.el`.
  const retro = Array.isArray(m.el) ? isRetrograde(m, BODY[m.p], poleVector, unixSeconds) : null;
  add("Inclination", `${m.i.toFixed(2)}° to the ecliptic`
    + (retro === true ? ` · retrograde — it orbits against ${m.p}'s spin` : "")
    + (retro === false && m.i > 90
      ? ` · prograde around ${m.p}, which is itself tipped past 90°` : ""));
  if (m.rho != null) add("Mean density", `${m.rho.toFixed(3)} g/cm³`);
  if (m.gm != null) add("GM", `${m.gm.toPrecision(5)} km³/s²`);
  // Geometric albedo earns a row because it is what now decides how bright this moon is drawn
  // (moonAppearance.js). A number the renderer acts on should be visible to the reader.
  const albedo = MOON_ALBEDO[m.n];
  if (albedo != null) {
    add("Geometric albedo", `${albedo}${albedo > 1 ? " — the most reflective surface known" : ""}`
      + (m.n === "Iapetus" ? " (bright hemisphere; the leading one is ~0.05)" : ""));
  }
  card.appendChild(dl);
  // The caveat belongs on the card, not only in a source file nobody reading this will open.
  const note = document.createElement("p");
  note.className = "time-frame-label";
  note.textContent = "Orbit from JPL Horizons; the position along it is Kepler-propagated and "
    + "good to a few degrees — enough to show which side of its planet it is on, not enough for "
    + "an occultation. Distances from the planet are scaled up with the planet's own exaggerated "
    + "size, so the spacing between moons stays true. "
    + "Displayed surface detail follows the qualification stated below.";
  card.appendChild(note);
  appendVisualSources(card, m.n, appearanceState);
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
  appendVisualSources(card, s.name);
  host.appendChild(card);
}

// Render the facts card for `name` into #orreryDetail. `live` is the body's row from the
// current system snapshot (distances/speed/phase/magnitude/equilibrium temp), or undefined.
export function renderDetail(name, live, appearanceState = {}) {
  const host = document.getElementById("orreryDetail"); if (!host) return;
  const phys = BODY[name];
  if(phys && host.querySelector(".system-detail > strong")?.textContent === name){updateLiveDetailFacts(live);updateDetailAppearance(appearanceState);return;}
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
    const dd = document.createElement("dd"); dd.textContent = v; dd.dataset.metric=k; dl.append(dt, dd);
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
    add("Luminosity", "3.828×10²⁶ W", "solar-luminosity");
    const sunDistance = live && Number.isFinite(live.geo_dist_au) && live.geo_dist_au > 0 ? live.geo_dist_au : null;
    add("Irradiance S(r)", sunDistance != null
      ? `${formatIrradiance(sunDistance)} at ${fmt(sunDistance, 3)} AU` : "1,361 W/m² at 1 AU", "solar-irradiance");
    add("Apparent V☉", sunDistance != null ? formatApparentV(sunDistance) : "−26.74 at 1 AU", "solar-magnitude");
    add("Display", "Globe brightness is a display recipe. It does not use L☉ or S(r).");
    add("Composition", "73% H, 25% He (by mass)");
    add("Surface imagery", "3D imagery mapping held; retained solar disk has no verified observation time. Fetch time is not capture time.");
  }
  card.appendChild(dl); appendVisualSources(card, name, appearanceState); host.appendChild(card);
}

// Keep glossary buttons and the selected card stable while mutable display facts
// change. Positions are current; speed/phase/temperature retain their disclosed
// asynchronous metadata epoch. This is formatting, not a second physics engine.
export function updateLiveDetailFacts(live) {
  if(!live)return;
  const host=document.getElementById("orreryDetail");
  if(host?.querySelector(".system-detail > strong")?.textContent!==live.name)return;
  const values={
    "Distance from Sun":`${fmt(live.dist_au,3)} AU`,
    "Distance from Earth":`${fmt(live.geo_dist_au,3)} AU · light ${fmt(live.geo_dist_au*8.317,1)} min`,
    "Orbital speed":`${fmt(live.speed_kms,2)} km/s`,
    "Illuminated":live.illuminated_fraction==null ? "Unavailable" : `${fmt(live.illuminated_fraction*100,1)}% · phase ${fmt(live.phase_angle_deg,1)}°`,
    "Apparent magnitude":fmt(live.magnitude,1),
    "Equilibrium temp":`${fmt(live.equilibrium_temp_k)} K — black-body from sunlight alone (excludes greenhouse & internal heat)`,
    "Irradiance S(r)":Number.isFinite(live.geo_dist_au)&&live.geo_dist_au>0
      ? `${formatIrradiance(live.geo_dist_au)} at ${fmt(live.geo_dist_au,3)} AU` : "1,361 W/m² at 1 AU",
    "Apparent V☉":Number.isFinite(live.geo_dist_au)&&live.geo_dist_au>0 ? formatApparentV(live.geo_dist_au) : "−26.74 at 1 AU",
  };
  for(const node of host.querySelectorAll("[data-metric]")) {
    const value=values[node.getAttribute("data-metric")];
    if(value!==undefined&&node.textContent!==value)node.textContent=value;
  }
}

// Original browse previews retain their rectangular coverage. A verified file is
// not automatically a global map, calibrated color image, or current observation.
function appendVisualSources(card, name, appearanceState = {}) {
  const disclosure = document.createElement("details");
  disclosure.className = "visual-sources";
  const summary = document.createElement("summary");
  summary.textContent = "Image and rendering sources";
  const provenance = document.createElement("p");
  disclosure.append(summary, provenance);
  const layers = appearanceReferences().filter(asset => asset.body === name).map(asset => {
    const row = document.createElement("div"); row.dataset.appearanceRole = asset.role;
    const description = document.createElement("p");
    const link = document.createElement("a");
    link.href = asset.source_url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.textContent = `${asset.label} · ${asset.credits}`;
    row.append(description, link); disclosure.appendChild(row);
    return { asset, row, description };
  });
  const sources = { name, provenance, layers };
  sourceDisclosures.set(document.getElementById("orreryDetail"), sources);
  updateVisualSources(sources, appearanceState);
  if (BODY[name]?.rings) {
    const rings = document.createElement("p");
    rings.textContent = "Ring radius geometry follows the catalogued dimensions shown above. Neutral ring color is a display convention; the opacity and shadow profile is illustrative and photometrically uncalibrated.";
    disclosure.appendChild(rings);
  }
  const preview = visualBrowsePreview(name);
  if (preview) {
    const legacy = document.createElement("p");
    legacy.textContent = `Separate legacy browse preview (not used for the globe): ${visualProvenanceText(name)}`;
    disclosure.appendChild(legacy);
    const figure = document.createElement("figure");
    figure.style.margin = "0";
    const img = document.createElement("img");
    img.alt = `${name}: original browse image; coverage and color interpretation not qualified for globe mapping`;
    img.loading = "lazy";
    img.decoding = "async";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.objectFit = "contain";
    img.src = preview.path;
    const caption = document.createElement("figcaption");
    const loadedCaption = `${preview.credits}. Original browse image; not a current or globally registered view.`;
    caption.textContent = loadedCaption;
    let previewFailed = false;
    img.onerror = () => {
      previewFailed = true;
      img.hidden = true;
      img.removeAttribute("src");
      caption.textContent = `Preview unavailable. Close and reopen image sources to retry. ${preview.credits}`;
    };
    img.onload = () => { previewFailed = false; img.hidden = false; caption.textContent = loadedCaption; };
    // The selected body's card is retained. Reopening is an explicit retry;
    // ordinary presentation updates and toggles during a load do not reissue it.
    disclosure.ontoggle = () => {
      if (!disclosure.open || !previewFailed) return;
      previewFailed = false;
      img.hidden = false;
      caption.textContent = `Loading preview. ${preview.credits}`;
      img.src = preview.path;
    };
    const source = document.createElement("a");
    source.textContent = "Official source image";
    source.href = preview.sourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    figure.append(img, caption, source);
    disclosure.appendChild(figure);
  }
  card.appendChild(disclosure);
}

function updateVisualSources(sources, state) {
  const { name, provenance, layers } = sources;
  // A surface layer the view does not draw is not "ready": Venus keeps its Magellan
  // texture cached after the radar control is switched off, and reporting that cache
  // as ready contradicted the visible-light cloud fallback described in the same line.
  const enabled = state.useTextures !== false;
  const surface = surfaceReferenceShown(name, state) ? appearanceReference(name) : null;
  const ready = surface && state.appearanceStatus?.[surface.id] === "ready";
  const text = appearanceDescription(name, state, true);
  const description = `${enabled && ready ? "Surface reference ready. " : ""}${text}`;
  if (provenance.textContent !== description) provenance.textContent = description;
  for (const { asset, row, description: layerText } of layers) {
    if (asset.role === "surface") {
      // The main paragraph already carries this map's full date and limits.
      row.hidden = !enabled;
      continue;
    }
    const active = enabled && name === "Earth" && (
      asset.role === "night-lights" && state.earthNight !== false
      || asset.role === earthCloudRole(state) && state.earthWeather !== false
      || asset.role === "sea-ice" && state.earthIce === true);
    row.hidden = !active;
    if (!active) continue;
    const status = state.appearanceStatus?.[asset.id];
    const readiness = status === "unavailable" ? "Image unavailable; layer is not rendered."
      : status === "deferred" || !status ? "Reference detail loads when Earth is visible at a useful scale; layer is not rendered."
      : status === "queued" ? "Reference imagery queued; layer is not rendered."
      : status !== "ready" ? "Loading reference imagery; layer is not rendered."
      : !ready ? "Reference ready; waiting for the surface reference before rendering."
      : "Reference layer ready.";
    const layerDescription = `${asset.label} · ${asset.observation_label}. ${readiness} ${asset.color_interpretation} ${asset.limitations}`;
    if (layerText.textContent !== layerDescription) layerText.textContent = layerDescription;
  }
}

// Called by the existing presentation flow after upload completion/failure, context
// loss and user layer changes. It only updates the currently displayed body card.
export function updateDetailAppearance(state = {}) {
  const host = document.getElementById("orreryDetail"), sources = host && sourceDisclosures.get(host);
  if (!sources || state.galaxy || state.selectedStar
      || state.selected && state.selected !== sources.name
      || host.querySelector(".system-detail > strong")?.textContent !== sources.name) return;
  updateVisualSources(sources, state);
}
