// The star click-to-inspect facts card, for both the Solar-System sky and the Solar
// neighbourhood view. Pure DOM building from a catalogue record plus the derived physics
// in starphysics.js — no GL, no renderer state (same split as orreryDetail.js).
//
// HONESTY IS THE POINT OF THIS PANEL. The catalogue carries a handful of *measured*
// quantities (position, V magnitude, B−V colour, parallax distance); everything else on
// screen is computed from them, and the card says so in its own section with the method
// named. Two guards keep it from over-claiming:
//   * no parallax distance -> every distance-dependent row reads "—" rather than a number
//     derived from a guess, and the card explains why.
//   * evolved stars (large radius) -> the main-sequence mass–luminosity relation does not
//     apply, so the mass row refuses to answer instead of printing a wrong M☉.

import {
  teffK, luminositySun, radiusSun, massEstimateSun, absoluteMagV,
} from "./starphysics.js?v=dd4ea4c0de";

// Above this radius a star is a giant/supergiant: the main-sequence mass–luminosity
// relation is not valid for it, so we decline to estimate a mass.
const MS_RADIUS_LIMIT_SUN = 10;

function sig(n, digits = 3) {
  if (n == null || !isFinite(n)) return "—";
  if (n === 0) return "0";
  const mag = Math.abs(n);
  if (mag >= 1e5 || mag < 1e-3) {
    const exp = Math.floor(Math.log10(mag));
    return `${(n / 10 ** exp).toFixed(1)}×10${supers(exp)}`;
  }
  const dp = Math.max(0, digits - 1 - Math.floor(Math.log10(mag)));
  // Group the thousands: a supergiant's luminosity runs to five figures, and "36,997"
  // is legible where "36997" is not.
  return Number(n.toFixed(Math.min(dp, 4))).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function supers(n) {
  const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return String(n).split("").map((c) => map[c] || c).join("");
}

function fmtDistance(ly) {
  if (ly == null || !isFinite(ly)) return "—";
  return ly < 100 ? `${ly.toFixed(1)} light-years` : `${Math.round(ly).toLocaleString()} light-years`;
}

// Spectral class letter -> plain-language description, so the card teaches rather than
// just printing "B8". Only the leading class letter is interpreted; the rest is shown raw.
const SPECTRAL_BLURB = {
  O: "very hot, massive, blue",
  B: "hot, blue-white",
  A: "white",
  F: "yellow-white",
  G: "yellow, Sun-like",
  K: "cool, orange",
  M: "cool, red",
};

/**
 * Render the facts card for a catalogue star into `hostId`.
 * `star` is a NAMED_STARS record: { name, bayer, con, ra, dec, mag, bv, dist, spec }.
 */
export function renderStarDetail(star, hostId = "orreryDetail") {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.textContent = "";
  if (!star) return;

  const card = document.createElement("div");
  card.className = "sky-row system-detail";

  const h = document.createElement("strong");
  h.textContent = star.bayer ? `${star.name} (${star.bayer}${star.con ? " " + star.con : ""})` : star.name;
  card.appendChild(h);

  // --- derived physics (all null-safe; distance is the gate) ---
  const teff = teffK(star.bv);
  const lum = luminositySun(star.mag, star.bv, star.dist);
  const rad = radiusSun(lum, teff);
  const absM = absoluteMagV(star.mag, star.dist);
  const evolved = rad != null && rad > MS_RADIUS_LIMIT_SUN;
  const mass = evolved ? null : massEstimateSun(lum);

  const cls = (star.spec || "").trim().charAt(0).toUpperCase();
  const blurb = document.createElement("p");
  blurb.className = "time-frame-label";
  const kind = SPECTRAL_BLURB[cls];
  blurb.textContent = star.dist != null
    ? `Light leaving this star ${fmtDistance(star.dist)} ago is arriving now.${kind ? ` Spectral type ${star.spec} — ${kind}.` : ""}`
    : `${kind ? `Spectral type ${star.spec} — ${kind}. ` : ""}Hipparcos gives no usable parallax for this star, so its distance and everything derived from it are unavailable.`;
  card.appendChild(blurb);

  const dl = document.createElement("dl");
  dl.className = "detail-grid";
  const add = (k, v, term) => {
    if (v == null) return;
    const dt = document.createElement("dt");
    dt.textContent = k;
    if (term) {
      // Same glossary affordance the body card uses; app.js services [data-term].
      const btn = document.createElement("button");
      btn.className = "term";
      btn.type = "button";
      btn.dataset.term = term;
      btn.setAttribute("aria-label", `What is ${k}?`);
      btn.textContent = "?";
      dt.append(" ", btn);
    }
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  };

  // ---- measured ----
  add("Measured", "Hipparcos (ESA 1997)");
  add("Distance", fmtDistance(star.dist), "parallax-distance");
  add("Apparent magnitude", star.mag.toFixed(2), "apparent-magnitude");
  if (star.bv != null) add("Colour index B−V", star.bv.toFixed(2), "colour-index");
  add("Position (J2000)", `RA ${star.ra.toFixed(3)}° · Dec ${star.dec >= 0 ? "+" : ""}${star.dec.toFixed(3)}°`);
  if (star.spec) add("Spectral type", star.spec, "spectral-type");

  // ---- derived ----
  add("Derived", "computed from the values above");
  add("Absolute magnitude", absM == null ? "—" : absM.toFixed(2), "absolute-magnitude");
  add("Temperature", teff == null ? "—" : `${Math.round(teff).toLocaleString()} K — from B−V (Ballesteros 2012)`, "effective-temperature");
  add("Luminosity", lum == null ? "—" : `${sig(lum)} × the Sun`, "luminosity");
  add("Radius", rad == null ? "—" : `${sig(rad)} × the Sun — Stefan–Boltzmann from luminosity and temperature`);
  add(
    "Mass",
    evolved
      ? "— evolved star; the main-sequence mass–luminosity relation does not apply"
      : mass == null ? "—" : `≈ ${sig(mass)} × the Sun — main-sequence estimate, not a measurement`,
    "stellar-mass",
  );

  card.appendChild(dl);

  const note = document.createElement("p");
  note.className = "time-frame-label";
  note.textContent =
    "Only the measured rows come from the catalogue. Temperature, luminosity, radius, and mass are computed here by the stated methods; real per-star masses are known only for binaries. Parallax distances degrade with range — beyond a few hundred light-years treat them as ±10–20%.";
  card.appendChild(note);

  host.appendChild(card);
}
