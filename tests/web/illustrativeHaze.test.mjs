import assert from 'node:assert/strict';
import test from 'node:test';
import { getAtmosphereProfile } from '../../apps/web/js/atmosphereOptics.js';
import { hazeUniformValues } from '../../apps/web/js/illustrativeHaze.js';
import * as shaders from '../../apps/web/js/orreryShaders.js';
import { orreryHarness } from './helpers/orreryHarness.mjs';
import { matchesMoonNormal } from './helpers/moonDraws.mjs';

// The distant sphere path has no numerical transfer, so an admitted profile supplies
// the haze columns instead. These are independent transcriptions of the profile
// constants, not values read back from the derivation under test.
const EARTH_RAYLEIGH = [680, 550, 440].map(nm => 0.00124062 * (nm / 1000) ** -4 * 8);

test('haze columns are the profile coefficient times its own scale height', () => {
  const earth = hazeUniformValues(getAtmosphereProfile('Earth'));
  for (const [index, expected] of EARTH_RAYLEIGH.entries()) {
    assert.ok(Math.abs(earth.u_hazeRayleighTau[index] - expected) < 1e-12, `channel ${index}`);
  }
  assert.ok(earth.u_hazeRayleighTau[2] > earth.u_hazeRayleighTau[1] && earth.u_hazeRayleighTau[1] > earth.u_hazeRayleighTau[0],
    'shorter wavelengths scatter more, so blue carries the largest column');
  const profile = getAtmosphereProfile('Earth');
  assert.ok(Math.abs(earth.u_hazeAerosol[0] - profile.betaAerosolExtinctionKm[0] * profile.aerosolScaleHeightKm) < 1e-15);
  assert.deepEqual(earth.u_hazeAerosol.slice(1), [profile.aerosolSingleScatteringAlbedo[0], profile.aerosolG]);
});

test('Mars carries its own far thinner columns, and a body without a profile carries none', () => {
  const mars = hazeUniformValues(getAtmosphereProfile('Mars'));
  for (let index = 0; index < 3; index++) {
    assert.ok(mars.u_hazeRayleighTau[index] < 0.05 * EARTH_RAYLEIGH[index],
      'the thin CO2 column scatters far less than air');
  }
  assert.deepEqual(mars.u_hazeAerosol.slice(1), [0.94, 0.65]);
  assert.deepEqual(hazeUniformValues(null), {u_hazeRayleighTau: [0, 0, 0], u_hazeAerosol: [0, 0, 0]});
  assert.equal(getAtmosphereProfile('Mercury'), null, 'an unadmitted body has no profile to draw a haze from');
});

test('only the illustrative program carries the haze, and it replaces the rim rather than stacking', () => {
  for (const source of [shaders.SPHERE_FS, shaders.BASE_SPHERE_FS]) {
    assert.match(source, /uniform vec3 u_hazeRayleighTau;/);
    assert.ok(source.includes('hazeOverSurface(surface,N,V,normalize(u_light),sunVis)'));
    assert.ok(source.includes('displayLimb=vec3(0);'), 'a haze body drops the illustrative rim');
    assert.ok(source.includes('vec3 displayLimb=u_atmo*fres*u_atmoStr'), 'other bodies keep the rim recipe');
  }
  const consumer = shaders.SCATTERING_SPHERE_FS, main = consumer.slice(consumer.indexOf('void main(){'));
  assert.equal(main.includes('hazeOverSurface('), false, 'the physical consumer never evaluates the haze');
});

test('each body uploads the haze of its own profile, and moons upload none', async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: 'ready', reducedMotion: true });
  await h.enterOrrery(); t.after(() => h.leaveOrrery()); await h.settleCatalogues(); h.setAnimate(false);
  const earth = hazeUniformValues(getAtmosphereProfile('Earth'));
  const spheres = () => h.gpuDraws.filter(draw => draw.uniforms.u_mode === 0 && draw.uniforms.u_hazeRayleighTau);
  h.input('orreryAnchor', 'Earth', 'change');
  const mars = hazeUniformValues(getAtmosphereProfile('Mars'));
  const same = (draw, columns) => columns.u_hazeRayleighTau.every((value, index) =>
    Math.abs(draw.uniforms.u_hazeRayleighTau[index] - value) < 1e-6)
    && Math.abs(draw.uniforms.u_hazeAerosol[0] - columns.u_hazeAerosol[0]) < 1e-9;
  const withHaze = spheres().filter(draw => draw.uniforms.u_hazeRayleighTau[2] > 0);
  assert.ok(withHaze.some(draw => same(draw, earth)), 'Earth submits its own haze columns');
  // Mars is drawn in the same frame and carries its own profile, so every haze-bearing
  // sphere must match one admitted profile exactly rather than sharing Earth's air.
  for (const draw of withHaze) assert.ok(same(draw, earth) || same(draw, mars), 'haze columns come from an admitted profile');
  assert.ok(withHaze.some(draw => same(draw, mars)), 'Mars carries its own thinner columns');
  h.input('orreryAnchor', 'Jupiter', 'change'); h.check('orreryTrueScale', true);
  const moons = spheres().filter(draw => h.moons.some(moon => matchesMoonNormal(h, moon, draw.uniforms.u_nmat)));
  assert.ok(moons.length >= 1, 'moon spheres are submitted for this check');
  for (const draw of moons) assert.deepEqual(Array.from(draw.uniforms.u_hazeRayleighTau), [0, 0, 0]);
  assert.equal(h.errors.length, 0);
});
