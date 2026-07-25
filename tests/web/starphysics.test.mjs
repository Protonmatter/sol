// Unit tests for the derived stellar physics the star card displays.
//
// tools/validate_star_catalog.py already spot-checks these quantities, but it does so
// against a PYTHON MIRROR of the formulas — so an edit to starphysics.js could change
// what users see while that gate stayed green. These tests exercise the shipped JS
// directly, with expectations taken from published values for well-measured stars.
import test from "node:test";
import assert from "node:assert/strict";
import {
  teffK, luminositySun, radiusSun, massEstimateSun, absoluteMagV,
  bolometricCorrection, bvToRGB, equToGal,
} from "../../apps/web/js/starphysics.js";

const near = (a, b, eps) => Math.abs(a - b) < eps;
const within = (v, lo, hi) => v >= lo && v <= hi;

// name: [V mag, B−V, distance ly] — the measured catalogue inputs.
const SIRIUS = [-1.46, 0.01, 8.6];
const VEGA = [0.03, 0.0, 25.0];
const SUNLIKE_BV = 0.65;

test("effective temperature from B−V matches published values", () => {
  // Ballesteros (2012). Published Teff: Sirius A ~9940 K, Vega ~9600 K, Sun 5772 K.
  assert.ok(within(teffK(0.01), 9000, 10800), `Sirius Teff ${teffK(0.01)}`);
  assert.ok(within(teffK(0.0), 9100, 10900), `Vega Teff ${teffK(0.0)}`);
  assert.ok(within(teffK(SUNLIKE_BV), 5400, 6100), `Sun-like Teff ${teffK(SUNLIKE_BV)}`);
  assert.ok(teffK(1.5) < teffK(0.5), "redder must be cooler");
  assert.equal(teffK(null), null, "no colour -> no temperature, not a guess");
});

test("absolute magnitude inverts the distance modulus", () => {
  // At exactly 10 pc (32.616 ly) apparent and absolute magnitude coincide, by definition.
  assert.ok(near(absoluteMagV(5, 32.6156), 5, 1e-3), "10 pc identity");
  // Sirius: published M_V ≈ +1.45.
  assert.ok(near(absoluteMagV(SIRIUS[0], SIRIUS[2]), 1.45, 0.1), absoluteMagV(...[SIRIUS[0], SIRIUS[2]]));
  // Vega: published M_V ≈ +0.58.
  assert.ok(near(absoluteMagV(VEGA[0], VEGA[2]), 0.58, 0.15));
  assert.equal(absoluteMagV(5, null), null, "unknown distance -> no absolute magnitude");
  assert.equal(absoluteMagV(5, 0), null, "non-positive distance is rejected");
});

test("luminosity lands in the published band for well-measured stars", () => {
  // Sirius A ≈ 25 L☉; Vega ≈ 40 L☉ (bolometric).
  assert.ok(within(luminositySun(...SIRIUS), 18, 34), `Sirius L ${luminositySun(...SIRIUS)}`);
  assert.ok(within(luminositySun(...VEGA), 28, 60), `Vega L ${luminositySun(...VEGA)}`);
  assert.equal(luminositySun(5, 0.6, null), null, "no distance -> no luminosity");
});

test("radius follows Stefan–Boltzmann and reproduces Sirius", () => {
  // Sirius A ≈ 1.71 R☉.
  const r = radiusSun(luminositySun(...SIRIUS), teffK(SIRIUS[1]));
  assert.ok(within(r, 1.3, 2.2), `Sirius R ${r}`);
  // A Sun-equivalent (1 L☉ at 5772 K) must come back as ~1 R☉.
  assert.ok(near(radiusSun(1, 5772), 1, 0.02), "solar identity");
  // L ∝ R²T⁴: quadrupling luminosity at fixed temperature doubles the radius.
  assert.ok(near(radiusSun(4, 5772) / radiusSun(1, 5772), 2, 1e-9));
  assert.equal(radiusSun(null, 5772), null);
  assert.equal(radiusSun(1, 0), null, "zero temperature is rejected, not divided by");
});

test("mass estimate is monotonic and solar-calibrated", () => {
  assert.ok(near(massEstimateSun(1), 1, 0.05), "1 L☉ -> ~1 M☉");
  assert.ok(massEstimateSun(25) > massEstimateSun(1), "more luminous -> more massive");
  assert.ok(massEstimateSun(0.01) < massEstimateSun(1), "less luminous -> less massive");
  // Sirius A ≈ 2.06 M☉ — the main-sequence relation should be in the right neighbourhood.
  assert.ok(within(massEstimateSun(luminositySun(...SIRIUS)), 1.6, 2.6));
  assert.equal(massEstimateSun(null), null);
  assert.equal(massEstimateSun(0), null, "zero luminosity yields no mass");
});

test("bolometric correction peaks near Sun-like colours and is negative", () => {
  // BC_V is <= 0 by construction and smallest in magnitude for F/G stars.
  for (const bv of [-0.3, 0, 0.65, 1.4, 2.0]) {
    assert.ok(bolometricCorrection(bv) <= 0, `BC(${bv}) must be <= 0`);
  }
  assert.ok(bolometricCorrection(0.65) > bolometricCorrection(-0.3), "hot stars lose more");
  assert.ok(bolometricCorrection(0.65) > bolometricCorrection(2.0), "cool stars lose more");
  assert.equal(bolometricCorrection(null), null);
});

test("B−V colour mapping stays in gamut and runs blue -> red", () => {
  for (const bv of [-0.4, -0.1, 0.3, 0.65, 1.2, 2.0, null]) {
    const [r, g, b] = bvToRGB(bv);
    for (const c of [r, g, b]) assert.ok(c >= 0 && c <= 1, `channel out of gamut for B−V=${bv}`);
  }
  const hot = bvToRGB(-0.3), cool = bvToRGB(1.8);
  assert.ok(hot[2] >= hot[0], "hot stars are blue-leaning");
  assert.ok(cool[0] > cool[2], "cool stars are red-leaning");
});

test("equatorial -> galactic hits the known anchors", () => {
  // The galactic centre (Sgr A*) sits at l=0, b=0 by definition of the system.
  const [lGC, bGC] = equToGal(266.417, -29.008);
  assert.ok(near(lGC, 0, 0.2) || near(lGC, 360, 0.2), `l(GC) = ${lGC}`);
  assert.ok(near(bGC, 0, 0.2), `b(GC) = ${bGC}`);
  // The north galactic pole must come back as b = +90.
  const [, bNGP] = equToGal(192.85948, 27.12825);
  assert.ok(near(bNGP, 90, 1e-6), `b(NGP) = ${bNGP}`);
  // Longitude is always reported in [0, 360).
  for (const [ra, dec] of [[0, 0], [123, -80], [359.9, 45]]) {
    const [l] = equToGal(ra, dec);
    assert.ok(l >= 0 && l < 360, `l out of range for ${ra},${dec}: ${l}`);
  }
});
