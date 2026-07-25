// Where a planet's surface is POINTING is as much a claim as where the planet is, and until now
// nothing tested it. These tests pin the two halves of that claim:
//
//   W  — the rotation phase. Checked against a ground truth that needs no model at all: the Sun
//        stands over the meridian whose apparent sidereal time equals the Sun's apparent right
//        ascension, so sub-solar east longitude = RA(Sun) − GAST. Both numbers come straight
//        from this repo's own engine, in the same frame, so the comparison is exact.
//   α0/δ0 — the pole. Checked against the pole star of the era, which is about as independent a
//        fact as astronomy offers.
//
// Fixtures: `target/release/sky <unix> 0 0 0` (lst_deg, Sun apparent RA) and the heliocentric
// ecliptic-J2000 system snapshot (Earth's position). The Earth->Sun direction is taken from the
// snapshot rather than from RA/Dec on purpose: the renderer's world frame IS ecliptic J2000, so
// feeding it of-date RA/Dec would fold ~0.36° of precession into the test and mask real error.
import test from "node:test";
import assert from "node:assert/strict";
import { BODY, poleAt } from "../../apps/web/js/bodyData.js";
import { iauRotation } from "../../apps/web/js/orreryMath.js";

const D2R = Math.PI / 180;
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const J2000_UNIX = 946728000;
const JULIAN_YEAR = 31557600;

// unix, Greenwich apparent sidereal time (deg), Sun apparent RA (deg), Earth helio ecliptic-J2000 AU
const FIX = [
  { unix: 1784000000, lst: 345.358034917, ra: 113.491189056, earth: [0.370452, -0.94659459, 5.305e-05] },
  { unix: 1790000000, lst: 213.805931822, ra: 178.733826695, earth: [1.00350752, -0.03066209, -2.09e-06] },
  { unix: 1800000000, lst: 234.552552863, ra: 296.868568238, earth: [-0.40877828, 0.89467327, -5.566e-05] },
  { unix: 1815000000, lst: 265.672476972, ra: 106.923413805, earth: [0.26683424, -0.98106601, 6.138e-05] },
  { unix: 2500000000, lst: 246.789598139, ra: 1.820560705, earth: [-0.99606287, -0.02256074, 1.482e-05] },
];

/** Sub-solar east longitude on Earth, per the renderer's own orientation matrix. */
function subSolarLon(unix, earthXyz) {
  const n = Math.hypot(...earthXyz);
  const toSun = earthXyz.map((v) => -v / n);
  const M = iauRotation(BODY.Earth, unix); // column-major: x = prime meridian, y = +90°E, z = pole
  const x = M[0] * toSun[0] + M[1] * toSun[1] + M[2] * toSun[2];
  const y = M[4] * toSun[0] + M[5] * toSun[1] + M[6] * toSun[2];
  return wrap(Math.atan2(y, x) / D2R);
}

/** Angular separation between two equatorial directions, degrees. */
function sep(a, b) {
  const [r1, d1] = a.map((v) => v * D2R), [r2, d2] = b.map((v) => v * D2R);
  const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(r1 - r2);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
}

test("Earth's rotation phase puts the Sun over the right meridian", () => {
  for (const f of FIX) {
    const got = subSolarLon(f.unix, f.earth);
    const want = wrap(f.ra - f.lst);
    const err = Math.abs(wrap(got - want));
    const when = new Date(f.unix * 1000).toISOString().slice(0, 16);
    // 0.25° ≈ 1 minute of Earth rotation. The residual is nutation plus the difference between
    // the ICRF-referenced IAU elements and the of-date frame the truth is quoted in; it is NOT
    // slack for a real phase error, which would show up as whole degrees.
    assert.ok(err < 0.25, `${when}: sub-solar longitude ${got.toFixed(3)}° vs ${want.toFixed(3)}° (err ${err.toFixed(3)}°)`);
  }
});

test("the sub-solar point tracks the clock, not just one lucky epoch", () => {
  // Independently of any fixture: the sub-solar point must sweep west at 15°/hour (one solar
  // day = 360°). A wrong Ẇ would still pass a single-epoch check if W0 absorbed the offset.
  const base = FIX[0];
  const sixHours = 6 * 3600;
  const a = subSolarLon(base.unix, base.earth);
  const b = subSolarLon(base.unix + sixHours, base.earth); // same Sun direction, 6 h later
  const moved = wrap(b - a);
  assert.ok(Math.abs(moved - -90) < 0.5, `6 h should move the sub-solar point −90°, got ${moved.toFixed(3)}°`);
});

test("Earth's pole stays a real declination across the whole date slider", () => {
  // The regression this exists for: the IAU's linear δ0 rate (−0.557°/century) is a tangent
  // valid near J2000. Extrapolated backwards over the slider's ±5000-year range it returns
  // δ0 = 95.6° at −1000 yr and 117.9° at −5000 yr, which are not declinations at all.
  for (let y = -5000; y <= 5000; y += 100) {
    const [ra, dec] = poleAt(BODY.Earth, J2000_UNIX + y * JULIAN_YEAR);
    assert.ok(Math.abs(dec) <= 90.0001, `${y} yr: δ0 = ${dec.toFixed(3)}° is not a declination`);
    assert.ok(isFinite(ra), `${y} yr: α0 is not finite`);
  }
});

test("Earth's pole lands on the pole star of each era", () => {
  // Two independent checkpoints on precession, one at each end of recorded history.
  const polaris = [37.954, 89.264];   // α UMi, J2000
  const thuban = [211.097, 64.376];   // α Dra, J2000 — the pole star of the 3rd millennium BCE
  const now = poleAt(BODY.Earth, J2000_UNIX);
  assert.ok(sep(now, polaris) < 1.5, `J2000 pole is ${sep(now, polaris).toFixed(2)}° from Polaris`);
  const then = poleAt(BODY.Earth, J2000_UNIX - 4800 * JULIAN_YEAR);
  assert.ok(sep(then, thuban) < 1.5, `−4800 yr pole is ${sep(then, thuban).toFixed(2)}° from Thuban`);
});

test("the precession model is the IAU elements, not a reinvention", () => {
  // Near J2000 the cone and the IAU's tangent to it must agree, or the model has been calibrated
  // to some other convention and W (measured from the equator's ICRF node) would be referenced
  // to the wrong meridian.
  for (const years of [10, 50, 100, 200]) {
    const T = years / 100;
    const [ra, dec] = poleAt(BODY.Earth, J2000_UNIX + years * JULIAN_YEAR);
    const linear = [wrap(BODY.Earth.poleRaDeg + BODY.Earth.poleRaDotDegPerCty * T),
      BODY.Earth.poleDecDeg + BODY.Earth.poleDecDotDegPerCty * T];
    const d = sep([wrap(ra), dec], linear);
    assert.ok(d < 0.01, `at +${years} yr the cone and the IAU rates differ by ${d.toFixed(4)}°`);
  }
});

test("every other body carries its IAU secular pole rate and stays in range", () => {
  // Not a physics claim — a wiring check. These rates are small, but they were absent entirely
  // before, and a silently-dropped field is exactly the kind of thing that never gets noticed.
  const drifting = ["Mercury", "Mars", "Jupiter", "Saturn", "Moon"];
  for (const name of drifting) {
    const b = BODY[name];
    assert.notEqual(b.poleRaDotDegPerCty, undefined, `${name} has no α0 rate`);
    const moved = Math.abs(b.poleRaDotDegPerCty) + Math.abs(b.poleDecDotDegPerCty);
    assert.ok(moved > 0, `${name} should have a nonzero IAU secular rate`);
    for (const y of [-5000, 0, 5000]) {
      const [, dec] = poleAt(b, J2000_UNIX + y * JULIAN_YEAR);
      assert.ok(Math.abs(dec) <= 90.0001, `${name} at ${y} yr: δ0 = ${dec.toFixed(3)}°`);
    }
    // And the rate must actually be applied, not merely stored.
    const [ra0] = poleAt(b, J2000_UNIX);
    const [ra1] = poleAt(b, J2000_UNIX + 1000 * JULIAN_YEAR);
    assert.notEqual(ra0.toFixed(6), ra1.toFixed(6), `${name}: poleAt ignores its secular rate`);
  }
});
