// The 21 major moons. tools/validate_moons.py already gates raw positional accuracy against
// committed JPL Horizons vectors; these tests cover what that cannot — that the shipped data
// obeys physics we can check without any external source, and that the renderer's scaling
// helpers behave.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOONS, MOON_EPOCH_JD, MOON_VALID_MIN_JD, MOON_VALID_MAX_JD,
  MOON_PARENTS, moonsOf } from "../../apps/web/js/moons.js";
import { moonElementsAt, moonOffsetAU, moonOrbitPath, systemScale, jdFromUnix, isRetrograde,
  withinMoonValidity, aliasedByClock } from "../../apps/web/js/moonorbits.js";
import { BODY, poleVector } from "../../apps/web/js/bodyData.js";

const AU_KM = 149597870.7;

test("every planet with moons is one the renderer actually draws", () => {
  // A moon whose parent is not a rendered sphere would orbit nothing — the reason Charon is
  // excluded despite JPL listing it.
  for (const p of MOON_PARENTS) {
    assert.ok(BODY[p], `${p} has moons here but no entry in bodyData`);
  }
  assert.equal(MOONS.length, 21);
});

test("Kepler's third law holds within each satellite system", () => {
  // The strongest check available with no external data: for moons of the same planet,
  // a³/P² is proportional to that planet's mass and must be the same for all of them. It
  // ties the representative periods to the semi-major axes — if longitude unwrapping had
  // locked onto the wrong number of revolutions, that moon's ratio would stand out immediately.
  for (const planet of MOON_PARENTS) {
    const ms = moonsOf(planet);
    if (ms.length < 2) continue;
    const k = ms.map((m) => Math.pow(m.a, 3) / Math.pow(m.P, 2));
    const mean = k.reduce((a, b) => a + b, 0) / k.length;
    for (let i = 0; i < ms.length; i++) {
      const dev = Math.abs(k[i] - mean) / mean;
      assert.ok(dev < 0.05,
        `${ms[i].n}: a³/P² deviates ${(dev * 100).toFixed(1)}% from the ${planet} system mean`);
    }
  }
});

test("the Galilean moons satisfy the Laplace resonance relation", () => {
  const n = Object.fromEntries(moonsOf("Jupiter").map((m) => [m.n, m.nd]));
  // The resonance is usually quoted as "1:2:4", but the periods are not exact multiples —
  // Ganymede/Io is 4.044, not 4. What IS exact is the Laplace relation between the mean
  // motions, which librates about zero:  n_Io − 3·n_Europa + 2·n_Ganymede = 0.
  // Testing the real relation rather than the rounded slogan makes this a much tighter check:
  // it holds to ~0.002 °/day out of Io's 203, i.e. one part in 10⁵.
  const laplace = n.Io - 3 * n.Europa + 2 * n.Ganymede;
  assert.ok(Math.abs(laplace) < 0.02,
    `n_Io − 3n_Europa + 2n_Ganymede = ${laplace.toFixed(5)} °/day, should be ~0`);
  // And the near-doubling that gives the resonance its popular name.
  const p = Object.fromEntries(moonsOf("Jupiter").map((m) => [m.n, m.P]));
  assert.ok(Math.abs(p.Europa / p.Io - 2) < 0.02, `Europa/Io = ${(p.Europa / p.Io).toFixed(4)}`);
  assert.ok(Math.abs(p.Ganymede / p.Europa - 2) < 0.03, `Ganymede/Europa = ${(p.Ganymede / p.Europa).toFixed(4)}`);
});

test("orbit orientations match the planets they belong to", () => {
  // Regular satellites orbit near their planet's equator, so in the ECLIPTIC frame these
  // elements are in, each moon's inclination should echo its planet's obliquity. This is the
  // check that would have caught the mis-framed mean-element sets.
  const near = (v, target, tol) => Math.abs(v - target) < tol;
  for (const m of moonsOf("Uranus")) {
    assert.ok(near(m.i, 98, 12), `${m.n}: i = ${m.i}°, but Uranus is tipped ~98°`);
  }
  for (const m of moonsOf("Jupiter")) {
    assert.ok(m.i < 10, `${m.n}: i = ${m.i}°, but Jupiter's axis is nearly upright`);
  }
  for (const m of moonsOf("Saturn")) {
    if (m.n === "Iapetus") continue; // far enough out that its Laplace plane tilts toward the ecliptic
    assert.ok(near(m.i, 27, 10), `${m.n}: i = ${m.i}°, but Saturn is tilted ~27°`);
  }
});

test("Triton is the only genuinely retrograde moon", () => {
  // "Retrograde" means moving against the planet's own spin, and ecliptic inclination alone
  // does NOT tell you that. Uranus's five moons all sit near 98° in this frame — not because
  // they orbit backwards, but because URANUS is tipped 98° and they faithfully follow its
  // equator. Judging by ecliptic inclination would call all five retrograde, which is wrong.
  // The real test is the angle between the orbit's angular momentum and the planet's SPIN.
  //
  // Not its IAU pole — those differ. The IAU fixes a body's north pole as the one north of the
  // invariable plane, so a body that turns backwards about it has a negative rotation rate.
  // Uranus is exactly that case (wDotDegPerDay = −501.16), which means its moons' angular
  // momentum is ANTI-parallel to its IAU pole while still going the way Uranus turns. Comparing
  // against the pole would report all five as retrograde; comparing against the spin does not.
  const t0 = 1767225600;
  const retro = MOONS.filter((m) => isRetrograde(m, BODY[m.p], poleVector, t0))
    .map((m) => m.n);
  assert.deepEqual(retro, ["Triton"],
    `only Triton orbits against its planet's spin; got ${JSON.stringify(retro)}`);
  // And Uranus's moons must NOT be mistaken for retrograde despite their ecliptic inclination.
  for (const m of moonsOf("Uranus")) {
    assert.ok(m.i > 90, `${m.n} should read >90° in the ecliptic frame (Uranus is tipped)`);
  }
});

test("no moon orbits inside its planet, and none is absurdly sized", () => {
  for (const m of MOONS) {
    const parent = BODY[m.p];
    assert.ok(m.a > parent.radiusKm,
      `${m.n} orbits at ${m.a} km, inside ${m.p}'s ${parent.radiusKm} km radius`);
    assert.ok(m.r > 1 && m.r < 3000, `${m.n}: mean radius ${m.r} km`);
    assert.ok(m.r < parent.radiusKm, `${m.n} is larger than ${m.p}`);
    assert.ok(m.e >= 0 && m.e < 1, `${m.n}: eccentricity ${m.e}`);
    assert.ok(m.P > 0 && m.nd > 0, `${m.n}: period/mean motion must be positive`);
  }
});

test("propagated positions stay on the stated ellipse", () => {
  // Independent of any ephemeris: whatever the phase, the distance must stay between
  // periapsis and apoapsis for the committed a and e.
  for (const m of MOONS) {
    const path = moonOrbitPath(m, 1767225600, 40);
    let lo = Infinity, hi = 0;
    for (const p of path) {
      const r = Math.hypot(p[0], p[1], p[2]) * AU_KM;
      lo = Math.min(lo, r); hi = Math.max(hi, r);
    }
    const peri = m.a * (1 - m.e), apo = m.a * (1 + m.e);
    assert.ok(lo > peri * 0.999 - 1, `${m.n}: got ${lo.toFixed(0)} km inside periapsis ${peri.toFixed(0)}`);
    assert.ok(hi < apo * 1.001 + 1, `${m.n}: got ${hi.toFixed(0)} km beyond apoapsis ${apo.toFixed(0)}`);
    // And the instantaneous osculating path must actually close the loop.
    const a0 = path[0], a1 = path[path.length - 1];
    const drift = Math.hypot(a0[0] - a1[0], a0[1] - a1[1], a0[2] - a1[2]) * AU_KM;
    assert.ok(drift < m.a * 0.01, `${m.n}: one period leaves a ${drift.toFixed(0)} km gap`);
  }
});

test("the shipped JavaScript model meets the held-out Horizons error budget", () => {
  // The Python validator checks the source model; this independently exercises the generated,
  // rounded table and the exact interpolation/Kepler implementation the browser imports.
  const csv = readFileSync(new URL(
    "../../tools/ephemeris-data/moons/horizons_satellite_vectors.csv", import.meta.url,
  ), "utf8").trim().split("\n");
  const moons = new Map(MOONS.map((m) => [m.n, m]));
  let worstAngle = 0, worstRadial = 0;
  for (const line of csv.slice(1)) {
    const [name, , jdText, xText, yText, zText] = line.split(",");
    const truth = [Number(xText), Number(yText), Number(zText)];
    const unix = (Number(jdText) - 2440587.5) * 86400;
    const got = moonOffsetAU(moons.get(name), unix).map((value) => value * AU_KM);
    const truthR = Math.hypot(...truth), gotR = Math.hypot(...got);
    const cosine = got.reduce((sum, value, index) => sum + value * truth[index], 0)
      / (gotR * truthR);
    const angular = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
    const radial = Math.abs(gotR - truthR) / truthR;
    worstAngle = Math.max(worstAngle, angular);
    worstRadial = Math.max(worstRadial, radial);
  }
  assert.equal(csv.length - 1, 2392);
  assert.ok(worstAngle <= 0.15, `worst browser-model angular error ${worstAngle.toFixed(4)}°`);
  assert.ok(worstRadial <= 0.0025,
    `worst browser-model radial error ${(worstRadial * 100).toFixed(4)}%`);
});

test("Nereid's eccentricity actually shows up as a stretched orbit", () => {
  // The most eccentric orbit in the set — a flat check that e is being applied, not stored.
  const n = MOONS.find((m) => m.n === "Nereid");
  assert.ok(n.e > 0.7, `Nereid's e is ${n.e}`);
  const path = moonOrbitPath(n, 1767225600, 60);
  const rs = path.map((p) => Math.hypot(p[0], p[1], p[2]) * AU_KM);
  assert.ok(Math.max(...rs) / Math.min(...rs) > 5,
    "Nereid's distance should vary by more than 5× over an orbit");
});

test("system scaling lifts moons clear of the planet without distorting spacing", () => {
  // Planets are drawn oversized, which would bury every inner moon. One factor per system is
  // applied so the moons clear the disc AND keep their true relative spacing.
  const jup = moonsOf("Jupiter");
  const displayR = 0.17; // Jupiter's VIS_RADIUS_AU
  const k = systemScale(jup, displayR, false);
  assert.ok(k > 1, "Jupiter's moons need inflating at display scale");
  const innermost = (jup[0].a * (1 - jup[0].e)) / AU_KM;
  assert.ok(innermost * k > displayR, "Io must end up outside Jupiter's drawn disc");
  // Ratios preserved: Callisto really is 4.46× Io's distance, before and after.
  const before = jup[3].a / jup[0].a;
  const after = (jup[3].a * k) / (jup[0].a * k);
  assert.ok(Math.abs(before - after) < 1e-12, "scaling must not change the spacing ratio");
  // True scale opts out entirely.
  assert.equal(systemScale(jup, displayR, true), 1);
});

test("the epoch is a real Julian date and jdFromUnix agrees with it", () => {
  assert.ok(MOON_EPOCH_JD > 2451545 && MOON_EPOCH_JD < 2500000, `epoch ${MOON_EPOCH_JD}`);
  // 2000-01-01 12:00 UTC is JD 2451545.0 by definition.
  assert.ok(Math.abs(jdFromUnix(946728000) - 2451545.0) < 1e-6);
});

test("orbits are drawn only inside the exact held-out validation interval", () => {
  const unix = (jd) => (jd - 2440587.5) * 86400;
  assert.ok(MOON_VALID_MAX_JD > MOON_VALID_MIN_JD, "validation interval must be non-empty");
  assert.ok(withinMoonValidity(unix(MOON_VALID_MIN_JD), MOON_VALID_MIN_JD, MOON_VALID_MAX_JD));
  assert.ok(withinMoonValidity(unix(MOON_VALID_MAX_JD), MOON_VALID_MIN_JD, MOON_VALID_MAX_JD));
  assert.ok(!withinMoonValidity(
    unix(MOON_VALID_MIN_JD - 0.001), MOON_VALID_MIN_JD, MOON_VALID_MAX_JD,
  ), "a time before the first checked instant must be rejected");
  assert.ok(!withinMoonValidity(
    unix(MOON_VALID_MAX_JD + 0.001), MOON_VALID_MIN_JD, MOON_VALID_MAX_JD,
  ), "a time after the last checked instant must be rejected");
});

test("multi-epoch knots cover the validated interval without extrapolation", () => {
  for (const m of MOONS) {
    assert.equal(m.el.length % 6, 0, `${m.n}: malformed equinoctial table`);
    assert.ok(m.el.length / 6 >= 100, `${m.n}: element table is too sparse`);
    assert.ok(m.step <= 7, `${m.n}: ${m.step} d cadence exceeds the weekly ceiling`);
    const lastJd = m.t0 + (m.el.length / 6 - 1) * m.step;
    assert.ok(m.t0 < MOON_VALID_MIN_JD, `${m.n}: no knot before validation starts`);
    assert.ok(lastJd > MOON_VALID_MAX_JD, `${m.n}: no knot after validation ends`);
    const middle = (MOON_VALID_MIN_JD + MOON_VALID_MAX_JD) / 2;
    const el = moonElementsAt(m, (middle - 2440587.5) * 86400);
    assert.ok(el.a > BODY[m.p].radiusKm, `${m.n}: interpolated orbit is inside ${m.p}`);
    assert.ok(el.e >= 0 && el.e < 1, `${m.n}: interpolated eccentricity ${el.e}`);
  }
});

test("a moon is dropped when the clock outruns its orbit", () => {
  // At the default 0.5 simulated years per second, one 60 fps frame covers ~3 days — more than a
  // full orbit for Io, Mimas and Phobos. Individual positions stay correct; what breaks is the
  // apparent motion, which below the Nyquist rate can run visibly backwards. The cut is set just
  // above Nyquist, so a moon is dropped only when the view would mislead, not merely stutter.
  const io = MOONS.find((m) => m.n === "Io");
  const callisto = MOONS.find((m) => m.n === "Callisto");
  assert.equal(aliasedByClock(io, 0), false, "paused: every position is exact");
  const threeDays = 3 * 86400;
  assert.equal(aliasedByClock(io, threeDays), true, "Io orbits in 1.77 d — 3 d/frame is aliasing");
  assert.equal(aliasedByClock(callisto, threeDays), false, "Callisto's 16.7 d orbit still samples");
  // The threshold is a fraction of the period, so it scales with the moon rather than a constant.
  assert.equal(aliasedByClock(io, (io.P * 86400) / 6), false);
  assert.equal(aliasedByClock(io, (io.P * 86400) / 2), true);
});

test("an unmeasured GM is absent, not zero", () => {
  // JPL writes 0.00000 where a satellite's GM has never been measured. Carried through as a
  // number it printed "0.0000 km³/s²" on Nereid's card — a missing measurement dressed as a
  // physical fact about a 170 km moon.
  const nereid = MOONS.find((m) => m.n === "Nereid");
  assert.equal(nereid.gm, null, "Nereid's GM is unmeasured and must be null");
  for (const m of MOONS) {
    assert.ok(m.gm === null || m.gm > 0, `${m.n}: GM must be null or positive, got ${m.gm}`);
    assert.ok(m.rho === null || m.rho > 0, `${m.n}: density must be null or positive`);
  }
  assert.ok(MOONS.find((m) => m.n === "Titan").gm > 0, "Titan's GM is well measured");
});

test("satellite systems are lifted clear of their planet's rings", () => {
  // Saturn's rings are drawn from their own km radii against the same exaggerated disc, so they
  // reach ~2.3 planet radii. Clearing only the planet put Mimas inside them — inverting a real
  // relationship, since every moon here orbits beyond its planet's outer ring.
  const cases = [["Saturn", 0.140, 60268, 136780], ["Uranus", 0.100, 25559, 51150],
    ["Neptune", 0.100, 24764, 62930]];
  for (const [planet, displayR, radiusKm, ringKm] of cases) {
    const ms = moonsOf(planet);
    const ringAU = (ringKm / radiusKm) * displayR;
    const k = systemScale(ms, displayR, false, ringAU);
    const innermost = (ms[0].a * (1 - ms[0].e)) / AU_KM * k;
    assert.ok(innermost > ringAU,
      `${ms[0].n} is drawn at ${innermost.toFixed(4)} AU, inside ${planet}'s rings at ${ringAU.toFixed(4)}`);
  }
});
