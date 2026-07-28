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

import { eccentricAnomaly } from "./smallbodies.js?v=db2518988d";

const AU_KM = 149597870.7;
const D2R = Math.PI / 180;
const JD_UNIX_EPOCH = 2440587.5;
const DAY = 86400;

/** Julian date (TDB, near enough) for a Unix time. */
export function jdFromUnix(unixSeconds) {
  return unixSeconds / DAY + JD_UNIX_EPOCH;
}

/**
 * Interpolate one moon's modified-equinoctial element knots.
 *
 * Interpolating classical node/argument-of-periapsis directly is not safe: either angle can
 * jump by 180° for a nearly circular or low-inclination orbit while the physical orbit remains
 * continuous. The generated table therefore stores [a,h,k,p,q,L] knots, where h/k describe the
 * eccentricity vector, p/q describe the orbital plane, and L is unwrapped mean longitude.
 */
export function moonElementsAt(m, unixSeconds) {
  const jd = jdFromUnix(unixSeconds);
  const count = m.el.length / 6;
  let index = Math.floor((jd - m.t0) / m.step);
  index = Math.max(0, Math.min(count - 2, index));
  const fraction = (jd - (m.t0 + index * m.step)) / m.step;
  const at = (field) => {
    const left = m.el[index * 6 + field];
    return left + (m.el[(index + 1) * 6 + field] - left) * fraction;
  };
  const a = at(0), h = at(1), k = at(2), p = at(3), q = at(4), longitude = at(5);
  const node = Math.atan2(p, q);
  const varpi = Math.atan2(h, k);
  return {
    a,
    e: Math.hypot(h, k),
    i: 2 * Math.atan(Math.hypot(p, q)) / D2R,
    node: node / D2R,
    argp: (varpi - node) / D2R,
    M: longitude - varpi / D2R,
  };
}

/**
 * Planetocentric position of a moon in AU, in the ecliptic-J2000 world frame. Add the parent
 * planet's heliocentric position to place it in the scene.
 */
export function moonOffsetAU(m, unixSeconds) {
  const el = moonElementsAt(m, unixSeconds);
  return offsetFromElements(el, el.M);
}

function offsetFromElements(el, meanAnomalyDeg) {
  const M = meanAnomalyDeg * D2R;
  const E = eccentricAnomaly(M, el.e);
  const a = el.a / AU_KM;
  const xp = a * (Math.cos(E) - el.e);
  const yp = a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const inc = el.i * D2R, node = el.node * D2R, argp = el.argp * D2R;
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
 * Is `unixSeconds` inside the exact interval independently validated for every moon?
 */
export function withinMoonValidity(unixSeconds, minJd, maxJd) {
  const jd = jdFromUnix(unixSeconds);
  return jd >= minJd && jd <= maxJd;
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
export function isRetrograde(m, parentPhys, poleFn, unixSeconds) {
  const el = moonElementsAt(m, unixSeconds);
  const inc = el.i * D2R, node = el.node * D2R;
  // Unit orbital-angular-momentum vector for the same Rz(node)·Rx(i) frame used above.
  // Deriving it from the interpolated plane avoids sampling beyond the validated interval.
  const h = [
    Math.sin(inc) * Math.sin(node),
    -Math.sin(inc) * Math.cos(node),
    Math.cos(inc),
  ];
  const pole = poleFn(parentPhys, unixSeconds);
  const s = parentPhys.wDotDegPerDay < 0 ? -1 : 1;
  const dot = h[0] * pole[0] * s + h[1] * pole[1] * s + h[2] * pole[2] * s;
  return dot < 0;
}

/** One full orbit as world-frame planetocentric points (AU), for drawing the path. */
export function moonOrbitPath(m, unixSeconds, steps = 72) {
  const el = moonElementsAt(m, unixSeconds);
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    // Draw the instantaneous osculating ellipse. Advancing clock time here would also evolve
    // the interpolated elements and could sample beyond their validated interval for slow moons.
    pts.push(offsetFromElements(el, el.M + (k / steps) * 360));
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
