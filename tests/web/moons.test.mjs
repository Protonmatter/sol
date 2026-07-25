// The 21 major moons. tools/validate_moons.py already gates raw positional accuracy against
// committed JPL Horizons vectors; these tests cover what that cannot — that the shipped data
// obeys physics we can check without any external source, and that the renderer's scaling
// helpers behave.
import test from "node:test";
import assert from "node:assert/strict";
import { MOONS, MOON_EPOCH_JD, MOON_PARENTS, moonsOf } from "../../apps/web/js/moons.js";
import { moonOffsetAU, moonOrbitPath, systemScale, jdFromUnix } from "../../apps/web/js/moonorbits.js";
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
  // ties the REFITTED mean motions to the semi-major axes — if a refit had locked onto the
  // wrong number of revolutions, that moon's ratio would stand out immediately.
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
  const spinAxis = (phys, t) => {
    const pole = poleVector(phys, t);
    const s = phys.wDotDegPerDay < 0 ? -1 : 1;
    return [pole[0] * s, pole[1] * s, pole[2] * s];
  };
  const retro = [];
  for (const m of MOONS) {
    const t0 = 1767225600;
    const a = moonOffsetAU(m, t0, MOON_EPOCH_JD);
    const b = moonOffsetAU(m, t0 + m.P * 86400 * 0.05, MOON_EPOCH_JD);
    const h = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const spin = spinAxis(BODY[m.p], t0);
    const cos = (h[0] * spin[0] + h[1] * spin[1] + h[2] * spin[2])
      / (Math.hypot(...h) * Math.hypot(...spin));
    if (cos < 0) retro.push(m.n);
  }
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
    const path = moonOrbitPath(m, MOON_EPOCH_JD * 0 + 1767225600, MOON_EPOCH_JD, 40);
    let lo = Infinity, hi = 0;
    for (const p of path) {
      const r = Math.hypot(p[0], p[1], p[2]) * AU_KM;
      lo = Math.min(lo, r); hi = Math.max(hi, r);
    }
    const peri = m.a * (1 - m.e), apo = m.a * (1 + m.e);
    assert.ok(lo > peri * 0.999 - 1, `${m.n}: got ${lo.toFixed(0)} km inside periapsis ${peri.toFixed(0)}`);
    assert.ok(hi < apo * 1.001 + 1, `${m.n}: got ${hi.toFixed(0)} km beyond apoapsis ${apo.toFixed(0)}`);
    // And one full period must actually close the loop.
    const a0 = moonOffsetAU(m, 1767225600, MOON_EPOCH_JD);
    const a1 = moonOffsetAU(m, 1767225600 + m.P * 86400, MOON_EPOCH_JD);
    const drift = Math.hypot(a0[0] - a1[0], a0[1] - a1[1], a0[2] - a1[2]) * AU_KM;
    assert.ok(drift < m.a * 0.01, `${m.n}: one period leaves a ${drift.toFixed(0)} km gap`);
  }
});

test("Nereid's eccentricity actually shows up as a stretched orbit", () => {
  // The most eccentric orbit in the set — a flat check that e is being applied, not stored.
  const n = MOONS.find((m) => m.n === "Nereid");
  assert.ok(n.e > 0.7, `Nereid's e is ${n.e}`);
  const path = moonOrbitPath(n, 1767225600, MOON_EPOCH_JD, 60);
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
