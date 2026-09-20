import test from 'node:test';
import assert from 'node:assert/strict';
import { L_SUN_W, SOLAR_CONSTANT_WM2, V_SUN_1AU, irradianceWm2, apparentVSun,
  formatIrradiance, formatApparentV, earthSunDistanceAu } from '../../apps/web/js/sunPhotometry.js';

test('catalogue photometry is inverse-square and refuses a non-physical distance', () => {
  assert.equal(L_SUN_W, 3.828e26);
  assert.equal(irradianceWm2(1), SOLAR_CONSTANT_WM2);
  assert.equal(irradianceWm2(2), SOLAR_CONSTANT_WM2 / 4);
  assert.equal(apparentVSun(1), V_SUN_1AU);
  assert.ok(Math.abs(apparentVSun(Math.sqrt(10)) - (V_SUN_1AU + 2.5)) < 1e-12);
  assert.equal(formatIrradiance(1), '1,361 W/m²');
  assert.equal(formatApparentV(1), '-26.74');
  for (const bad of [0, -1, NaN, Infinity]) {
    assert.equal(irradianceWm2(bad), null);
    assert.equal(apparentVSun(bad), null);
    assert.equal(formatIrradiance(bad), null);
    assert.equal(formatApparentV(bad), null);
  }
});

test('Earth-Sun distance comes from the snapshot Earth row, never an invented Sun body', () => {
  assert.equal(earthSunDistanceAu([{ name: 'Earth', dist_au: 1.0167 }]), 1.0167);
  assert.equal(earthSunDistanceAu([{ name: 'Sun', geo_dist_au: 2 }, { name: 'Earth', dist_au: 0 }]), null);
  assert.equal(earthSunDistanceAu([{ name: 'Mars', dist_au: 1.5 }]), null);
  assert.equal(earthSunDistanceAu(null), null);
});
