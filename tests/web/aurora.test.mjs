// Unit tests for the aurora outlook — the one feature joining space weather (Kp) to the
// observer's location. Expected geomagnetic latitudes were computed independently with
// the same published dipole pole (IGRF 2025: 80.7°N, 72.7°W).
import test from "node:test";
import assert from "node:assert/strict";
import {
  geomagneticLatitude, auroraBoundaryLat, auroraAssessment, sunAltitudeDeg,
} from "../../apps/web/js/aurora.js";

const near = (a, b, eps) => Math.abs(a - b) < eps;

test("geomagnetic latitude: dipole identities and known cities", () => {
  // 1e-6°, not 1e-9: at the pole the dipole formula reduces to asin(sin²x + cos²x),
  // and the argument's 1-ulp shortfall from 1.0 costs ~1e-8° after the asin.
  assert.ok(near(geomagneticLatitude(80.7, -72.7), 90, 1e-6), "the pole itself");
  assert.ok(near(geomagneticLatitude(-80.7, 107.3), -90, 1e-6), "its antipode");
  assert.ok(near(geomagneticLatitude(40.71, -74.01), 50.01, 0.05), "New York");
  assert.ok(near(geomagneticLatitude(69.65, 18.96), 67.46, 0.05), "Tromsø");
  assert.ok(near(geomagneticLatitude(64.84, -147.72), 65.64, 0.05), "Fairbanks");
  assert.ok(near(geomagneticLatitude(-42.88, 147.33), -49.66, 0.05), "Hobart (southern)");
});

test("oval boundary: the standard Kp fit, clamped to the 0–9 index", () => {
  assert.ok(near(auroraBoundaryLat(0), 66.5, 1e-9));
  assert.ok(near(auroraBoundaryLat(5), 56.3, 1e-9));
  assert.ok(near(auroraBoundaryLat(9), 48.14, 1e-9));
  assert.ok(near(auroraBoundaryLat(99), 48.14, 1e-9), "clamped above 9");
  assert.ok(Number.isNaN(auroraBoundaryLat(NaN)));
});

test("verdict tiers: Tromsø overhead at quiet Kp, Fairbanks horizon, New York needs a storm", () => {
  const tromso = auroraAssessment({ latDeg: 69.65, lonEastDeg: 18.96, kp: 1 });
  assert.equal(tromso.status, "overhead"); // 67.46 ≥ 64.46

  const fairbanks = auroraAssessment({ latDeg: 64.84, lonEastDeg: -147.72, kp: 0 });
  assert.equal(fairbanks.status, "horizon"); // 65.64 within 5° of 66.5
  assert.match(fairbanks.headline, /northern horizon/);

  const nyc = auroraAssessment({ latDeg: 40.71, lonEastDeg: -74.01, kp: 3 });
  assert.equal(nyc.status, "unlikely"); // 50.01 well below 60.38 − 5
  assert.match(nyc.detail, /Kp 6/); // ceil((66.5 − 55.01) / 2.04) = 6

  const storm = auroraAssessment({ latDeg: 40.71, lonEastDeg: -74.01, kp: 9 });
  // 50.01 ≥ 48.14: a Kp 9 superstorm puts the oval OVER New York — matching the
  // May 2024 and 1859 events, when aurora stood overhead at these latitudes.
  assert.equal(storm.status, "overhead");
});

test("southern hemisphere: the poleward horizon is the southern one", () => {
  const deepSouth = auroraAssessment({ latDeg: -70, lonEastDeg: 110, kp: 2 });
  assert.equal(deepSouth.status, "overhead"); // |−79.28| far inside the oval
  const hobart = auroraAssessment({ latDeg: -42.88, lonEastDeg: 147.33, kp: 7 });
  assert.equal(hobart.status, "horizon"); // 49.66 ≥ 52.22 − 5
  assert.match(hobart.headline, /southern horizon/);
});

test("no Kp reading declines to judge instead of guessing", () => {
  const unknown = auroraAssessment({ latDeg: 60, lonEastDeg: 0, kp: NaN });
  assert.equal(unknown.status, "unknown");
  assert.match(unknown.detail, /No current Kp/);
});

test("equatorial honesty: even Kp 9 does not promise aurora at the equator", () => {
  const quito = auroraAssessment({ latDeg: -0.18, lonEastDeg: -78.47, kp: 9 });
  assert.equal(quito.status, "unlikely");
  assert.match(quito.detail, /superstorm would not reach/);
});

test("sun altitude: noon high, midnight low (loose bounds — this is a darkness check)", () => {
  // 2026-03-20 ~12:00 UTC at (0°, 0°): near-equinox noon Sun close to the zenith.
  const noon = sunAltitudeDeg(Date.UTC(2026, 2, 20, 12, 8) / 1000, 0, 0);
  assert.ok(noon > 80, `noon alt ${noon}`);
  // Same longitude twelve hours later: deep below the horizon.
  const midnight = sunAltitudeDeg(Date.UTC(2026, 2, 21, 0, 8) / 1000, 0, 0);
  assert.ok(midnight < -80, `midnight alt ${midnight}`);
});

test("darkness caveat appears only when the sky is bright at the observer", () => {
  // Tromsø, mid-July: the midnight Sun era — sky never dark. Any positive verdict must warn.
  const midsummer = auroraAssessment({
    latDeg: 69.65, lonEastDeg: 18.96, kp: 3,
    unixSeconds: Date.UTC(2026, 6, 18, 12, 0) / 1000,
  });
  assert.match(midsummer.detail, /wait for full darkness/);
  // Tromsø in deep winter darkness at local midnight: no such caveat.
  const midwinter = auroraAssessment({
    latDeg: 69.65, lonEastDeg: 18.96, kp: 3,
    unixSeconds: Date.UTC(2026, 0, 15, 23, 0) / 1000,
  });
  assert.ok(!/wait for full darkness/.test(midwinter.detail));
});
