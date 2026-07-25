// Tidal locking is an emergent property here, not a stored flag: it holds only because the
// Moon's IAU rotation rate (W0 + Ẇ·d in bodyData) happens to match its orbital motion. Nothing
// in the renderer enforces that, so a bad edit to Ẇ, W0, the pole, or rotationPhase would
// silently unlock the Moon — it would keep rendering, just slowly turning away from Earth.
//
// This test pins the invariant. It projects the Moon->Earth direction into the Moon's body
// frame (the same iauRotation matrix the renderer uses) and checks the sub-Earth point stays
// near the prime meridian across two synodic months, wobbling but never winding.
//
// The RA/Dec fixtures are geocentric apparent positions produced by this repo's own
// solar-ephemeris engine (`target/release/sky <unix> 0 0 0`, ephemeris-snapshot.v2), so the
// test needs no network and no WASM.
import test from "node:test";
import assert from "node:assert/strict";
import { BODY } from "../../apps/web/js/bodyData.js";
import { iauRotation } from "../../apps/web/js/orreryMath.js";

const D2R = Math.PI / 180;
const OBLIQUITY = 23.43928 * D2R;

// Every 4 days from 2026-07-14, covering >2 synodic months.
const MOON = [
  { unix: 1784000000, ra: 110.1444, dec: 25.6553 },
  { unix: 1784345600, ra: 166.4317, dec: 4.2837 },
  { unix: 1784691200, ra: 213.1528, dec: -18.4220 },
  { unix: 1785036800, ra: 264.3046, dec: -28.0686 },
  { unix: 1785382400, ra: 316.0325, dec: -18.3270 },
  { unix: 1785728000, ra: 2.3006, dec: 4.2021 },
  { unix: 1786073600, ra: 54.9489, dec: 24.9450 },
  { unix: 1786419200, ra: 119.5288, dec: 23.5933 },
  { unix: 1786764800, ra: 173.5751, dec: 0.4217 },
];

// Equatorial-J2000 -> ecliptic-J2000, matching orreryMath's internal transform.
const eclFromEqu = (v) => [
  v[0],
  v[1] * Math.cos(OBLIQUITY) + v[2] * Math.sin(OBLIQUITY),
  -v[1] * Math.sin(OBLIQUITY) + v[2] * Math.cos(OBLIQUITY),
];

/** Sub-Earth point on the Moon, in Moon body coordinates (degrees). */
function subEarth(unix, raDeg, decDeg) {
  const a = raDeg * D2R, d = decDeg * D2R;
  const toMoon = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const toEarth = eclFromEqu(toMoon).map((v) => -v); // Earth as seen FROM the Moon
  const M = iauRotation(BODY.Moon, unix); // column-major: x = prime meridian, y = +90°E, z = pole
  const x = M[0] * toEarth[0] + M[1] * toEarth[1] + M[2] * toEarth[2];
  const y = M[4] * toEarth[0] + M[5] * toEarth[1] + M[6] * toEarth[2];
  const z = M[8] * toEarth[0] + M[9] * toEarth[1] + M[10] * toEarth[2];
  let lon = Math.atan2(y, x) / D2R;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lon, lat: Math.asin(Math.max(-1, Math.min(1, z))) / D2R };
}

test("the Moon stays tidally locked: the sub-Earth point never winds", () => {
  // Physical libration maxima are ±7.9° longitude and ±6.7° latitude; allow headroom for
  // the fixture sampling without allowing anything that could be called "unlocked".
  for (const m of MOON) {
    const { lon, lat } = subEarth(m.unix, m.ra, m.dec);
    const when = new Date(m.unix * 1000).toISOString().slice(0, 10);
    assert.ok(Math.abs(lon) < 12, `${when}: sub-Earth longitude ${lon.toFixed(2)}° — Moon is not locked`);
    assert.ok(Math.abs(lat) < 12, `${when}: sub-Earth latitude ${lat.toFixed(2)}° — pole orientation is wrong`);
  }
});

test("libration is present, not suppressed", () => {
  // The wobble is real physics. If someone "fixed" the Moon by nailing it to face Earth
  // exactly, the spread would collapse and we would be showing a lie.
  const lons = MOON.map((m) => subEarth(m.unix, m.ra, m.dec).lon);
  const lats = MOON.map((m) => subEarth(m.unix, m.ra, m.dec).lat);
  const spread = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(spread(lons) > 4, `longitude libration collapsed (spread ${spread(lons).toFixed(2)}°)`);
  assert.ok(spread(lats) > 4, `latitude libration collapsed (spread ${spread(lats).toFixed(2)}°)`);
});

test("the stored rotation period equals the orbital period", () => {
  // What "synchronous" means, and what the detail card now tells the user.
  const lock = BODY.Moon.tidalLock;
  assert.ok(lock, "Moon should carry tidalLock metadata");
  const rotationDays = BODY.Moon.rotationHours / 24;
  assert.ok(
    Math.abs(rotationDays - lock.orbitalPeriodDays) < 0.01,
    `rotation ${rotationDays.toFixed(3)} d vs orbit ${lock.orbitalPeriodDays} d — not synchronous`,
  );
  // The IAU rotation rate must agree with that period too: 360° / 27.322 d ≈ 13.176 °/day.
  assert.ok(
    Math.abs(BODY.Moon.wDotDegPerDay - 360 / lock.orbitalPeriodDays) < 0.01,
    "IAU Ẇ disagrees with the orbital period",
  );
});
