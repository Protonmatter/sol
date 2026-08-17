// Moon transit shadows and moon eclipses — the pure geometry in apps/web/js/moonshadows.js.
//
// The claim this module makes is a strong one: that the dark spot crossing Jupiter is where a
// real telescope would show it, even though the planet is drawn ~26x oversized and Io's orbit is
// inflated to clear that disc. Everything below is a test of that claim rather than of the
// drawing. Two properties carry it:
//   • the outputs are pure RATIOS to the planet's equatorial radius, so they are invariant under
//     the display exaggeration (and identical in true-scale mode), and
//   • the inputs are PHYSICAL planetocentric offsets, never the inflated display ones.
// No GL and no DOM here, same as moonorbits.js — this runs in plain node.
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MOON_SHADOWS, moonShadowOnPlanet, moonShadowsOnPlanet, packMoonShadows, sunlightOnMoon,
} from "../../apps/web/js/moonshadows.js";
import { MOONS } from "../../apps/web/js/moons.js";
import { MOON_ELEMENTS } from "../../apps/web/js/moonelements.js";
import { moonOffsetAU } from "../../apps/web/js/moonorbits.js";
import { BODY } from "../../apps/web/js/bodyData.js";
import { iauRotation } from "../../apps/web/js/orreryMath.js";
import { SPHERE_FS } from "../../apps/web/js/orreryShaders.js";

// The knots arrive lazily in the app; merge them here exactly as loadMoonCatalogue() does.
for (const m of MOONS) Object.assign(m, MOON_ELEMENTS[m.n]);

const AU_KM = 149597870.7;
const D2R = Math.PI / 180;
const JUP = BODY.Jupiter;
const SUN_KM = BODY.Sun.radiusKm;
const GEOM = { eqRadius: JUP.radiusKm, polarRadius: JUP.polarKm, sunRadius: SUN_KM };
const io = () => MOONS.find((m) => m.n === "Io");

const len = (v) => Math.hypot(v[0], v[1], v[2]);

// ---------------------------------------------------------------------------------------------
// Synthetic geometry: exact answers available by hand.
// ---------------------------------------------------------------------------------------------

// A perfectly sphere-shaped planet with the Sun on +x and the moon on the Sun-planet line.
// The star is sized so the umbral cone is still open when it reaches the planet, as every
// Sun/moon/planet triple in this catalogue is.
const TOY = { eqRadius: 1000, polarRadius: 1000, sunRadius: 20000, moonRadius: 20 };
const TOY_SUN = [1e7, 0, 0];

test("a moon on the Sun-planet line drops its shadow on the sub-solar point", () => {
  const s = moonShadowOnPlanet([6000, 0, 0], TOY_SUN, TOY);
  assert.ok(s, "the axis passes straight through the planet centre — there must be a shadow");
  // Sub-solar point: the +x pole of the disc, and the ray reaches it 5000 units after the moon.
  assert.ok(Math.abs(s.center[0] - 1) < 1e-9, `centre x ${s.center[0]}`);
  assert.ok(Math.abs(s.center[1]) < 1e-9 && Math.abs(s.center[2]) < 1e-9);
  assert.ok(Math.abs(s.distance - 5) < 1e-9, `distance ${s.distance} eq-radii`);
  // r = R_moon -/+ t*alpha with alpha = R_sun / |Sun->moon|.
  const alpha = TOY.sunRadius / (1e7 - 6000);
  assert.ok(Math.abs(s.umbra - (20 - 5000 * alpha) / 1000) < 1e-12);
  assert.ok(Math.abs(s.penumbra - (20 + 5000 * alpha) / 1000) < 1e-12);
});

test("no shadow when the moon is behind the planet, beside it, or its axis misses the globe", () => {
  assert.equal(moonShadowOnPlanet([-6000, 0, 0], TOY_SUN, TOY), null, "moon behind the planet");
  assert.equal(moonShadowOnPlanet([0, 6000, 0], TOY_SUN, TOY), null, "moon on the terminator plane");
  // Sunward hemisphere but far enough off-axis that the shadow sails past the limb.
  assert.equal(moonShadowOnPlanet([3000, 5000, 0], TOY_SUN, TOY), null, "axis misses the globe");
  // ...and the boundary case just inside it does produce one, near the limb.
  const grazing = moonShadowOnPlanet([3000, 900, 0], TOY_SUN, TOY);
  assert.ok(grazing, "a moon 0.9 radii off-axis still casts onto the disc");
  assert.ok(grazing.center[1] > 0.85, `near the +y limb, got ${grazing.center[1]}`);
});

test("the umbra is always inside the penumbra, so the shader's smoothstep edges never invert", () => {
  // GLSL smoothstep(edge0, edge1, x) is undefined for edge0 >= edge1 (the class of bug
  // tools/validate_body_constants.py exists to catch, for literal edges). The shader's edges are
  // computed, so the guarantee has to come from here: rp - ru = 2*t*alpha > 0, or rp > 0 = ru
  // when the umbral cone has already closed.
  for (let k = 0; k < 400; k++) {
    const ang = (k / 400) * 2 * Math.PI;
    const s = moonShadowOnPlanet([3000 * Math.cos(ang * 0.5) + 1200, 900 * Math.sin(ang), 700 * Math.cos(ang)], TOY_SUN, TOY);
    if (!s) continue;
    assert.ok(s.umbra < s.penumbra, `umbra ${s.umbra} !< penumbra ${s.penumbra}`);
    assert.ok(s.umbra >= 0 && s.penumbra > 0);
  }
});

test("the shadow axis is the Sun->moon line, offset from the planet->Sun line by the parallax", () => {
  // While a transit is in progress the moon is at most ~1 planet radius off the planet->Sun
  // line, so the two directions differ by up to Rj/D = 9.2e-5 rad. Over the ~5 Rj the cone has
  // to fall that is ~30 km — small next to the 1509 km umbra, but a SYSTEMATIC offset always
  // directed away from the sub-solar point, and removing it costs one vec4 in the uniform block.
  const offset = [400000, 60000, 0];               // km, near the limb of a transit
  const sun = [5.2 * AU_KM, 0, 0];
  const s = moonShadowOnPlanet(offset, sun, { ...GEOM, moonRadius: io().r });
  assert.ok(s);
  const cos = -(s.axis[0] * 1 + s.axis[1] * 0 + s.axis[2] * 0);   // planet->Sun is +x here
  const parallax = Math.acos(Math.min(1, cos));
  assert.ok(parallax > 5e-5 && parallax < 1.2e-4, `parallax ${parallax} rad`);
  const slip = parallax * s.distance * JUP.radiusKm;
  assert.ok(slip > 20 && slip < 60, `axis substitution would move the shadow ${slip.toFixed(0)} km`);
  // The offset pushes the shadow AWAY from the sub-solar point, never toward it: the moon sits
  // on the +y side, so the axis has a +y component and the struck point is further +y than the
  // planet->Sun line alone would put it.
  assert.ok(s.axis[1] > 0, "the shadow travels outward as well as away from the Sun");
  assert.ok(s.center[1] > offset[1] / JUP.radiusKm, "and lands beyond the moon's own y offset");
});

// ---------------------------------------------------------------------------------------------
// The honesty properties.
// ---------------------------------------------------------------------------------------------

test("results are pure ratios: changing the length unit changes nothing", () => {
  // This is what lets the shadow be painted on a disc drawn 26x too large and still land where
  // it physically lands. Same geometry in km and in AU must give bit-comparable output.
  const offKm = [402000, 91000, 24000];
  const sunKm = [4.9 * AU_KM, 1.6 * AU_KM, 0.1 * AU_KM];
  const a = moonShadowOnPlanet(offKm, sunKm, { ...GEOM, moonRadius: io().r });
  const s = 1 / AU_KM;
  const b = moonShadowOnPlanet(offKm.map((v) => v * s), sunKm.map((v) => v * s), {
    eqRadius: JUP.radiusKm * s, polarRadius: JUP.polarKm * s,
    sunRadius: SUN_KM * s, moonRadius: io().r * s,
  });
  assert.ok(a && b);
  for (const k of ["umbra", "penumbra", "distance", "moonRadius", "sunAngularRadius"]) {
    assert.ok(Math.abs(a[k] - b[k]) < 1e-9 * Math.max(1, Math.abs(a[k])), `${k}: ${a[k]} vs ${b[k]}`);
  }
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a.center[i] - b.center[i]) < 1e-9);
});

// A Sun 26.6 deg above the planet's equator, with the moon on that same line — the geometry that
// throws a shadow onto middle latitudes, where oblateness is at its most visible. (Jupiter's own
// tilt is only 3.1 deg; the exaggerated elevation is what makes the test discriminating.)
const TILTED_SUN = [5.203 * AU_KM * 0.894, 0, 5.203 * AU_KM * 0.447];
const TILTED_MOON = [420000 * 0.894, 0, 420000 * 0.447];

test("the centre is the renderer's own unit-sphere coordinate, on the OBLATE surface", () => {
  // `center` is handed to the shader's object frame, where the drawn body is the unit sphere
  // scaled by (rEq, rEq, rPol). So it must be a unit vector, and the physical point it names
  // must satisfy the spheroid equation — not the sphere's.
  const s = moonShadowOnPlanet(TILTED_MOON, TILTED_SUN, { ...GEOM, moonRadius: io().r });
  assert.ok(s);
  assert.ok(Math.abs(len(s.center) - 1) < 1e-12, `|centre| = ${len(s.center)}`);
  // No second spheroid identity here: scaling components by (rEq, rEq, rPol) and dividing
  // by the same radii reduces algebraically to |centre| = 1 for ANY polar radius - review
  // proved the old assertion was a tautology. The oblateness of the struck point is guarded
  // by the displacement test below, which fails when zScale is forced to 1.
});

test("oblateness moves an off-equator shadow measurably — a sphere would be wrong", () => {
  // Jupiter is flattened 6.5%. Away from the equator that is not a rounding error: it is a
  // shadow drawn at a latitude the planet does not have there.
  const oblate = moonShadowOnPlanet(TILTED_MOON, TILTED_SUN, { ...GEOM, moonRadius: io().r });
  const asSphere = moonShadowOnPlanet(TILTED_MOON, TILTED_SUN,
    { ...GEOM, polarRadius: JUP.radiusKm, moonRadius: io().r });
  assert.ok(oblate && asSphere);
  const dz = Math.abs(oblate.center[2] - asSphere.center[2]);
  // 0.024 of the disc radius here — over a full umbral radius (0.021) out of place, i.e. the
  // spherical answer would not overlap the correct shadow at all.
  assert.ok(dz > 0.015, `oblateness must matter here; it moved the centre by only ${dz}`);
  assert.ok(dz > oblate.umbra, "and the error is larger than the shadow it would misplace");
});

// ---------------------------------------------------------------------------------------------
// Selection, the uniform budget, and the packed layout.
// ---------------------------------------------------------------------------------------------

test("at most MAX_MOON_SHADOWS casters survive, strongest umbra first", () => {
  assert.equal(MAX_MOON_SHADOWS, 4, "Jupiter's four Galileans are the worst case in this catalogue");
  const casters = [];
  for (let i = 0; i < 6; i++) {
    casters.push({ name: `m${i}`, offset: [300000 + i * 1000, i * 900, 0], radius: 200 + i * 300 });
  }
  const all = moonShadowsOnPlanet(casters, [5.2 * AU_KM, 0, 0], GEOM, 99);
  assert.ok(all.length > MAX_MOON_SHADOWS, "the fixture must actually overflow the budget");
  const capped = moonShadowsOnPlanet(casters, [5.2 * AU_KM, 0, 0], GEOM);
  assert.equal(capped.length, MAX_MOON_SHADOWS);
  for (let i = 1; i < capped.length; i++) assert.ok(capped[i - 1].umbra >= capped[i].umbra);
  // The ones dropped are the faintest, never an arbitrary four.
  assert.deepEqual(capped.map((s) => s.name), all.slice(0, MAX_MOON_SHADOWS).map((s) => s.name));
});

test("the shader's uniform arrays are exactly MAX_MOON_SHADOWS long", () => {
  // The budget lives in two places by necessity — a JS constant and a GLSL one — and a mismatch
  // would either waste uniforms or silently drop the last caster with no error anywhere.
  const declared = SPHERE_FS.match(/const int MOON_SHADOWS=(\d+);/);
  assert.ok(declared, "SPHERE_FS must declare MOON_SHADOWS");
  assert.equal(Number(declared[1]), MAX_MOON_SHADOWS);
  assert.match(SPHERE_FS, /uniform vec4 u_moonShadowPos\[MOON_SHADOWS\]/);
  assert.match(SPHERE_FS, /uniform vec4 u_moonShadowAxis\[MOON_SHADOWS\]/);
  // The loop must stop at the live count, not shade against zeroed slots.
  assert.match(SPHERE_FS, /if\(i>=u_moonShadowCount\) break;/);
  // And a fragment sunward of the moon must be skipped before the perpendicular is taken —
  // without it the cone would be mirrored onto the far side of the moon as well.
  assert.match(SPHERE_FS, /if\(t<=0\.0\) continue;/);
});

test("packMoonShadows lays the two vec4 arrays out as the shader declares them", () => {
  const s = moonShadowsOnPlanet(
    [{ name: "Io", offset: [402000, 20000, 5000], radius: io().r }], [5.2 * AU_KM, 0, 0], GEOM,
  );
  assert.equal(s.length, 1);
  const packed = packMoonShadows(s);
  assert.equal(packed.count, 1);
  assert.equal(packed.pos.length, MAX_MOON_SHADOWS * 4);
  assert.equal(packed.axis.length, MAX_MOON_SHADOWS * 4);
  assert.ok(Math.abs(packed.pos[0] - 402000 / JUP.radiusKm) < 1e-6, "pos.xyz in equatorial radii");
  assert.ok(Math.abs(packed.pos[3] - io().r / JUP.radiusKm) < 1e-9, "pos.w is the moon radius");
  assert.ok(Math.abs(Math.hypot(packed.axis[0], packed.axis[1], packed.axis[2]) - 1) < 1e-6,
    "axis.xyz is a unit vector");
  assert.ok(packed.axis[3] > 8e-4 && packed.axis[3] < 9.5e-4,
    `axis.w is the Sun's angular radius at Jupiter (~8.9e-4 rad), got ${packed.axis[3]}`);
  // Unread slots must still be clean — a NaN there is the sort of thing that only shows up on
  // one driver, a year later.
  for (let i = 4; i < packed.pos.length; i++) {
    assert.equal(packed.pos[i], 0);
    assert.equal(packed.axis[i], 0);
  }
  assert.equal(packMoonShadows([]).count, 0);
});

// ---------------------------------------------------------------------------------------------
// Eclipses: the same cone with the roles swapped.
// ---------------------------------------------------------------------------------------------

test("a moon behind its planet loses the Sun, and a moon in front keeps it", () => {
  const sun = [5.2 * AU_KM, 0, 0];
  assert.equal(sunlightOnMoon([-420000, 0, 0], sun, GEOM), 0, "dead centre of the umbra");
  assert.equal(sunlightOnMoon([420000, 0, 0], sun, GEOM), 1, "in front of the planet");
  assert.equal(sunlightOnMoon([0, 420000, 0], sun, GEOM), 1, "out to the side");
  assert.equal(sunlightOnMoon([-420000, 400000, 0], sun, GEOM), 1, "behind but well clear");
  // Crossing the shadow's edge is gradual, because the Sun is not a point: at Io's distance the
  // penumbra is ~370 km wider than the umbra on each side.
  const alpha = SUN_KM / (5.2 * AU_KM);
  const along = 420000;
  const edge = sunlightOnMoon([-along, JUP.radiusKm, 0], sun, GEOM);
  assert.ok(edge > 0 && edge < 1, `partial phase at the geometric edge, got ${edge}`);
  assert.ok(sunlightOnMoon([-along, JUP.radiusKm - along * alpha - 1, 0], sun, GEOM) === 0);
  assert.ok(sunlightOnMoon([-along, JUP.radiusKm + along * alpha + 1, 0], sun, GEOM) === 1);
});

test("the oblate shadow is narrower over the poles than a circular one would be", () => {
  // Galilean orbits sit within ~0.5 deg of Jupiter's equator, where the shadow is at its widest;
  // a circular equatorial-radius cone would hold a moon eclipsed while it rode above the plane.
  const sun = [5.2 * AU_KM, 0, 0];
  // Straight behind the planet, offset toward the pole by just under the equatorial radius.
  const overPole = [-420000, 0, JUP.radiusKm * 0.97];
  assert.equal(sunlightOnMoon(overPole, sun, GEOM), 1, "clear of the flattened shadow");
  assert.ok(sunlightOnMoon(overPole, sun, { ...GEOM, polarRadius: JUP.radiusKm }) < 1,
    "a spherical Jupiter would wrongly still be eclipsing it");
});

// ---------------------------------------------------------------------------------------------
// The real thing: the shipped element knots, a real date, a real transit.
// ---------------------------------------------------------------------------------------------

/**
 * Heliocentric ecliptic-J2000 position from JPL's "Approximate Positions of the Major Planets"
 * Keplerian set (1800-2050 AD), which is stated good to ~0.1 deg in longitude. Rows are
 * [a, e, I, L, varpi, Omega] and their per-century rates.
 *
 * The app itself uses VSOP2013 through the WASM engine; this stands in for it because node has
 * no engine, and the substitution is safe for exactly one reason, which the test below MEASURES
 * rather than asserts: the shadow's placement depends on the Sun direction only through the
 * ~5 Rj lever arm from the moon down to the cloud tops, so 0.1 deg of longitude error moves it
 * by under 0.01 Rj. The transit TIMES come from the shipped moon elements, untouched.
 */
const APPROX_ELEMENTS = {
  Jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
    -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
};

function helioAU(planet, unix) {
  const r = APPROX_ELEMENTS[planet];
  const T = (unix / 86400 + 2440587.5 - 2451545.0) / 36525;
  const a = r[0] + r[6] * T;
  const e = r[1] + r[7] * T;
  const inc = (r[2] + r[8] * T) * D2R;
  const L = (r[3] + r[9] * T) * D2R;
  const varpi = (r[4] + r[10] * T) * D2R;
  const node = (r[5] + r[11] * T) * D2R;
  const argp = varpi - node;
  const M = ((L - varpi) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 60; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(argp), sw = Math.sin(argp), cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc);
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    (sw * si) * xp + (cw * si) * yp,
  ];
}

/** Exactly the frame conversion orrery.js's moonShadowUniforms() performs, in km. */
function planetFrame(planet, unix) {
  const rot = iauRotation(BODY[planet], unix);
  const toBody = (v) => [
    rot[0] * v[0] + rot[1] * v[1] + rot[2] * v[2],
    rot[4] * v[0] + rot[5] * v[1] + rot[6] * v[2],
    rot[8] * v[0] + rot[9] * v[1] + rot[10] * v[2],
  ];
  const P = helioAU(planet, unix);
  return { toBody, sunOffset: toBody([-P[0] * AU_KM, -P[1] * AU_KM, -P[2] * AU_KM]) };
}

const jupiterFrame = (unix) => planetFrame("Jupiter", unix);

/** Body-frame planetocentric position of one moon, in km — what the renderer feeds the module. */
function moonBodyKm(planet, moon, unix, toBody) {
  const off = moonOffsetAU(moon, unix);
  return toBody([off[0] * AU_KM, off[1] * AU_KM, off[2] * AU_KM]);
}

function ioShadowAt(unix) {
  const { toBody, sunOffset } = jupiterFrame(unix);
  const body = moonBodyKm("Jupiter", io(), unix, toBody);
  return moonShadowOnPlanet(body, sunOffset, { ...GEOM, moonRadius: io().r });
}

// 2026-03-01T23:10Z: found by scanning the shipped element knots, well inside the validated
// 2021-01 to 2030-12 window. Io is between the Sun and Jupiter with its shadow near the centre
// of the sunlit face.
const TRANSIT_UNIX = Date.parse("2026-03-01T23:10:00Z") / 1000;

test("Io really is transiting Jupiter on 2026-03-01T23:10Z, with a ~3000 km black core", () => {
  const s = ioShadowAt(TRANSIT_UNIX);
  assert.ok(s, "no shadow found at the scanned transit instant");
  // Textbook numbers for a Galilean shadow: Io is 1821.5 km in radius, the Sun subtends 3.08' at
  // Jupiter, and the cone has ~4.9 Rj to converge over, so it loses ~310 km of radius on the way
  // down. Umbra ~1500 km radius inside a ~2140 km penumbra.
  const umbraKm = s.umbra * JUP.radiusKm, penumbraKm = s.penumbra * JUP.radiusKm;
  assert.ok(umbraKm > 1450 && umbraKm < 1560, `umbra ${umbraKm.toFixed(0)} km`);
  assert.ok(penumbraKm > 2080 && penumbraKm < 2200, `penumbra ${penumbraKm.toFixed(0)} km`);
  assert.ok(umbraKm < io().r && penumbraKm > io().r, "the cone must converge, and the penumbra open");
  // 1500 km on a 71,492 km globe: ~2% of the disc radius. Small, and that is the honest size.
  assert.ok(s.umbra > 0.019 && s.umbra < 0.023, `umbra ${s.umbra} equatorial radii`);
  assert.ok(s.distance > 4.5 && s.distance < 5.3, `Io to the cloud tops: ${s.distance} Rj`);
});

test("a 0.1 deg error in Jupiter's heliocentric longitude barely moves the shadow", () => {
  // This is what licenses the approximate planet ephemeris above, and it is also the reason the
  // feature is robust: the shadow's position is set by the moon's position, not the planet's.
  const { toBody, sunOffset } = jupiterFrame(TRANSIT_UNIX);
  const off = moonOffsetAU(io(), TRANSIT_UNIX);
  const body = toBody([off[0] * AU_KM, off[1] * AU_KM, off[2] * AU_KM]);
  const base = moonShadowOnPlanet(body, sunOffset, { ...GEOM, moonRadius: io().r });
  const th = 0.1 * D2R;
  const rotated = [
    sunOffset[0] * Math.cos(th) - sunOffset[1] * Math.sin(th),
    sunOffset[0] * Math.sin(th) + sunOffset[1] * Math.cos(th),
    sunOffset[2],
  ];
  const moved = moonShadowOnPlanet(body, rotated, { ...GEOM, moonRadius: io().r });
  assert.ok(base && moved);
  const shift = Math.hypot(
    base.center[0] - moved.center[0], base.center[1] - moved.center[1], base.center[2] - moved.center[2],
  );
  assert.ok(shift < 0.01, `0.1 deg of planet-longitude error moved the shadow ${shift} equatorial radii`);
});

test("Io's shadow crosses Jupiter once per orbit, taking about 2 h 20 m", () => {
  // A pure consequence of Io's orbital speed (17.3 km/s) and Jupiter's diameter (142,984 km),
  // and therefore a test that the whole chain — element interpolation, Kepler solve, frame
  // rotation, cone intersection — produces a physically shaped event and not just a boolean.
  const period = io().P * 86400;
  const step = 60;
  const start = TRANSIT_UNIX - period / 2;
  const runs = [];
  let run = null;
  for (let t = 0; t <= period; t += step) {
    if (ioShadowAt(start + t)) {
      if (!run) { run = { from: t, to: t }; runs.push(run); } else run.to = t;
    } else run = null;
  }
  assert.equal(runs.length, 1, `expected exactly one transit per Io period, saw ${runs.length}`);
  const hours = (runs[0].to - runs[0].from) / 3600;
  assert.ok(hours > 2.0 && hours < 2.7, `transit lasted ${hours.toFixed(2)} h`);
});

test("Io is eclipsed once per orbit too, and never while it is transiting", () => {
  // Transit (moon in front, shadow on the planet) and eclipse (moon behind, in the planet's
  // shadow) are opposite halves of the orbit by construction. If both ever fired at once, a sign
  // would be wrong somewhere.
  const period = io().P * 86400;
  const start = TRANSIT_UNIX - period / 2;
  let eclipsedSamples = 0, both = 0;
  for (let t = 0; t <= period; t += 60) {
    const u = start + t;
    const { toBody, sunOffset } = jupiterFrame(u);
    const off = moonOffsetAU(io(), u);
    const body = toBody([off[0] * AU_KM, off[1] * AU_KM, off[2] * AU_KM]);
    const shadow = moonShadowOnPlanet(body, sunOffset, { ...GEOM, moonRadius: io().r });
    const sunlit = sunlightOnMoon(body, sunOffset, GEOM);
    if (sunlit < 1) eclipsedSamples++;
    if (shadow && sunlit < 1) both++;
  }
  assert.equal(both, 0, "a moon cannot cast a transit shadow and be eclipsed at the same time");
  const hours = (eclipsedSamples * 60) / 3600;
  assert.ok(hours > 2.0 && hours < 2.9, `Io spent ${hours.toFixed(2)} h in Jupiter's shadow`);
});

test("Saturn's 2025 equinox puts four shadows up at once — exactly the uniform budget", () => {
  // The busiest disc in the shipped decade is Saturn's, not Jupiter's: the 2025 ring-plane
  // crossing swung the Sun into Saturn's equatorial plane, where its inner moons orbit, and the
  // shadows come in bursts. A full sweep of the validated window at 15-minute steps peaks at
  // Mars 2, Jupiter 2, Saturn 4, Uranus 0, Neptune 0 — see MAX_MOON_SHADOWS in moonshadows.js.
  // This pins the peak instant so the budget can never be quietly outgrown.
  const unix = Date.parse("2025-05-10T05:38:00Z") / 1000;
  const phys = BODY.Saturn;
  const geom = { eqRadius: phys.radiusKm, polarRadius: phys.polarKm, sunRadius: SUN_KM };
  const { toBody, sunOffset } = planetFrame("Saturn", unix);
  const casters = MOONS.filter((m) => m.p === "Saturn").map((m) => ({
    name: m.n, offset: moonBodyKm("Saturn", m, unix, toBody), radius: m.r,
  }));
  const all = moonShadowsOnPlanet(casters, sunOffset, geom, 99);
  assert.deepEqual(all.map((s) => s.name).sort(), ["Dione", "Enceladus", "Rhea", "Tethys"]);
  assert.equal(all.length, MAX_MOON_SHADOWS, "the observed peak must equal the budget, not exceed it");
  // Nothing is truncated at the peak, so the picture at the busiest moment of the decade is
  // complete — and the ordering still runs largest umbra first (Rhea is much the biggest moon
  // of the four, Enceladus much the smallest).
  assert.equal(moonShadowsOnPlanet(casters, sunOffset, geom).length, MAX_MOON_SHADOWS);
  assert.equal(all[0].name, "Rhea");
  assert.equal(all[all.length - 1].name, "Enceladus");
  // And every one of them is a genuinely small mark: even Rhea's umbra is ~1% of Saturn's disc.
  for (const s of all) assert.ok(s.umbra > 0 && s.umbra < 0.03, `${s.name} umbra ${s.umbra}`);
});
