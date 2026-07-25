// Planetocentric positions for the major moons. Pure math — no GL, no DOM, no module state, and
// no import of the moon table itself, so the data stays behind orrery.js's dynamic import() and
// these functions are testable against JPL Horizons in isolation.
//
// The elements this consumes are OSCULATING elements from Horizons, requested in the ecliptic
// J2000 plane — the renderer's own frame — so there is no reference-plane rotation here at all.
// That is a deliberate simplification bought by choosing the right source: JPL's satellite
// mean-elements table refers its angles to three different planes depending on the satellite, and
// even with all three implemented it missed Saturn's and Uranus's moons by tens to 165° at their
// own epoch. tools/ephemeris-data/moons/README.md records that in full.

import { eccentricAnomaly } from "./smallbodies.js?v=e1f941f1c0";

const AU_KM = 149597870.7;
const D2R = Math.PI / 180;
const JD_UNIX_EPOCH = 2440587.5;
const DAY = 86400;

/** Julian date (TDB, near enough) for a Unix time. */
export function jdFromUnix(unixSeconds) {
  return unixSeconds / DAY + JD_UNIX_EPOCH;
}

/**
 * Planetocentric position of a moon in AU, in the ecliptic-J2000 world frame. Add the parent
 * planet's heliocentric position to place it in the scene.
 */
export function moonOffsetAU(m, unixSeconds, epochJd) {
  const days = jdFromUnix(unixSeconds) - epochJd;
  const M = (m.M0 + m.nd * days) * D2R;
  const E = eccentricAnomaly(M, m.e);
  const a = m.a / AU_KM;
  const xp = a * (Math.cos(E) - m.e);
  const yp = a * Math.sqrt(1 - m.e * m.e) * Math.sin(E);
  const inc = m.i * D2R, node = m.node * D2R, argp = m.argp * D2R;
  const co = Math.cos(argp), so = Math.sin(argp);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc);
  return [
    (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
    (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
    (so * si) * xp + (co * si) * yp,
  ];
}

/**
 * How far either side of the element epoch these orbits are worth drawing, in Julian years.
 *
 * The committed elements are validated against Horizons from 2025-04 to 2027-02 (see
 * tools/validate_moons.py). Beyond that nothing re-anchors them: the plane is fixed, the mean
 * motion is a constant fit, and neither nodal nor apsidal precession is modelled, so the phase
 * degrades without limit. The date slider spans ±5000 years, so this is not a hypothetical —
 * the moon layer must stop claiming to know where a moon is long before then.
 */
export const MOON_VALID_YEARS = 1.25;

/** Is `unixSeconds` close enough to the element epoch for the positions to mean anything? */
export function withinMoonValidity(unixSeconds, epochJd) {
  return Math.abs(jdFromUnix(unixSeconds) - epochJd) <= MOON_VALID_YEARS * 365.25;
}

/**
 * Is one animation frame too coarse to sample this moon's orbit?
 *
 * The solar-system clock runs at up to 5 simulated years per real second so the outer planets
 * visibly move. At the default 0.5 yr/s a frame covers ~3 days — more than a full orbit for Io,
 * Mimas and Phobos.
 *
 * Note what is and is not wrong in that regime. Every individual position stays correct; it is
 * the apparent MOTION that breaks. Below the Nyquist rate of two samples per revolution the
 * direction of travel is not merely jerky but unrecoverable — the moon can appear to crawl
 * backwards, which is a claim about its orbit that happens to be false. The threshold is set
 * just above that, at three samples per revolution, so moons are dropped only once the view
 * would actively mislead rather than merely stutter.
 */
export function aliasedByClock(m, simStepSeconds) {
  if (!(simStepSeconds > 0)) return false; // paused — every position is exact
  return simStepSeconds > (m.P * 86400) / 3;
}

/**
 * Is this moon orbiting AGAINST its planet's spin?
 *
 * Ecliptic inclination alone does not answer this, and using it produces a confident falsehood.
 * All five Uranian moons sit near 98° here — not because they orbit backwards, but because
 * URANUS is tipped 98° and they faithfully follow its equator. Nor is the planet's IAU pole the
 * right reference: the IAU fixes north as the side of the invariable plane, so a body that turns
 * backwards about its own north pole (Uranus, Venus) has a negative rotation rate. Retrograde
 * means the orbit's angular momentum opposes the planet's SPIN, which is the IAU pole times the
 * sign of its rotation rate. Of the 21 moons here, exactly one qualifies: Triton.
 *
 * `poleFn` is bodyData's poleVector, passed in so this module keeps no imports of its own.
 */
export function isRetrograde(m, parentPhys, poleFn, unixSeconds, epochJd) {
  const a = moonOffsetAU(m, unixSeconds, epochJd);
  const b = moonOffsetAU(m, unixSeconds + m.P * DAY * 0.05, epochJd);
  const h = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const pole = poleFn(parentPhys, unixSeconds);
  const s = parentPhys.wDotDegPerDay < 0 ? -1 : 1;
  const dot = h[0] * pole[0] * s + h[1] * pole[1] * s + h[2] * pole[2] * s;
  return dot < 0;
}

/** One full orbit as world-frame planetocentric points (AU), for drawing the path. */
export function moonOrbitPath(m, unixSeconds, epochJd, steps = 72) {
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    pts.push(moonOffsetAU(m, unixSeconds + (k / steps) * m.P * DAY, epochJd));
  }
  return pts;
}

/**
 * How far a satellite system must be inflated so its innermost moon clears its planet's
 * EXAGGERATED disc.
 *
 * Planets here are drawn far larger than life so the small ones stay visible, which buries every
 * inner moon inside its parent — Io really orbits at 5.9 Jupiter radii, but Jupiter is drawn
 * ~26× oversized. ONE factor is computed per system and applied to all of its moons, so the
 * spacing BETWEEN them stays true: Callisto still sits 4.46× farther out than Io, and the
 * Galilean rhythm is preserved. Returns 1 in true-scale mode, where nothing needs help.
 */
export function systemScale(moons, planetDisplayRadiusAU, trueScale, ringOuterAU = 0) {
  if (trueScale || !moons.length) return 1;
  let innermost = Infinity;
  for (const m of moons) innermost = Math.min(innermost, (m.a * (1 - m.e)) / AU_KM);
  if (!isFinite(innermost) || innermost <= 0) return 1;
  // Clear the RINGS too, not just the planet. Saturn's rings are drawn from their own km radii
  // against the same exaggerated disc, so they reach ~2.3 planet radii; scaling Mimas to 1.7
  // put it inside them, and Miranda and Proteus likewise sat within Uranus's and Neptune's.
  // Every one of those moons orbits comfortably beyond its planet's outer ring in reality, so
  // the drawing was inverting a real relationship.
  const clearance = Math.max(planetDisplayRadiusAU * 1.7, ringOuterAU * 1.12);
  return Math.max(1, clearance / innermost);
}
