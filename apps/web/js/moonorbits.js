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

import { eccentricAnomaly } from "./smallbodies.js?v=2313f632ec";

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
export function systemScale(moons, planetDisplayRadiusAU, trueScale) {
  if (trueScale || !moons.length) return 1;
  let innermost = Infinity;
  for (const m of moons) innermost = Math.min(innermost, (m.a * (1 - m.e)) / AU_KM);
  if (!isFinite(innermost) || innermost <= 0) return 1;
  return Math.max(1, (planetDisplayRadiusAU * 1.7) / innermost);
}
