import test from 'node:test';
import assert from 'node:assert/strict';
import { getAtmosphereProfile, atmosphericTransmission, rayleighPhase, henyeyGreensteinPhase,
  dielectricFresnel, solarIrradianceScale, refractDirection, atmosphereUniformValues, ozoneDensity } from '../../apps/web/js/atmosphereOptics.js';

test('only admitted thin reference profiles can enable optical rendering', () => {
  for (const name of ['Earth', 'Mars']) {
    const p = getAtmosphereProfile(name);
    assert.equal(p.classification, 'reference-single-scattering');
    assert.ok(p.topKm > 0 && p.topKm < p.radiusKm * 0.04);
    assert.ok(p.betaRayleighKm[2] > p.betaRayleighKm[0]);
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.betaRayleighKm));
    assert.ok(p.sourceRefs.every(url => url.startsWith('https://')));
    assert.ok(p.surfaceRefractivity > 0 && p.surfaceRefractivity < .001);
  }
  for (const name of ['Venus', 'Titan', 'Jupiter', 'Triton', '__proto__', '']) assert.equal(getAtmosphereProfile(name), null);
});

test('Beer Lambert vacuum, positivity and independent channel attenuation', () => {
  assert.deepEqual(atmosphericTransmission([0, 0, 0], 800), [1, 1, 1]);
  assert.deepEqual(atmosphericTransmission([1, 2, 3], 0), [1, 1, 1]);
  const t = atmosphericTransmission([0.01, 0.02, 0.04], 12);
  assert.ok(Math.abs(t[0] - Math.exp(-0.12)) < 1e-14);
  assert.ok(t[0] > t[1] && t[1] > t[2] && t[2] > 0);
  for (const bad of [-1, NaN, Infinity]) assert.throws(() => atmosphericTransmission([0, bad, 0], 10), RangeError);
});

test('phase functions normalize over solid angle and have correct angular dependence', () => {
  const count = 20000;
  for (const phase of [rayleighPhase, mu => henyeyGreensteinPhase(mu, 0), mu => henyeyGreensteinPhase(mu, 0.8)]) {
    let integral = 0;
    for (let i = 0; i < count; i++) integral += phase(-1 + (i + .5) * 2 / count) * 4 * Math.PI / count;
    assert.ok(Math.abs(integral - 1) < 1e-5, String(integral));
  }
  assert.equal(rayleighPhase(-1), rayleighPhase(1));
  assert.ok(henyeyGreensteinPhase(1, .8) > henyeyGreensteinPhase(-1, .8));
  assert.throws(() => henyeyGreensteinPhase(0, 1), RangeError);
});

test('physical solar irradiance follows inverse square independently of display geometry', () => {
  assert.equal(solarIrradianceScale(1), 1);
  assert.equal(solarIrradianceScale(2), .25);
  assert.equal(solarIrradianceScale(.5), 4);
  for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => solarIrradianceScale(bad), RangeError);
});

test('dielectric Fresnel and Snell reference preserve energy and vacuum direction', () => {
  assert.equal(dielectricFresnel(.4, 1, 1), 0);
  const expected = ((1 - 1.333) / (1 + 1.333)) ** 2;
  assert.ok(Math.abs(dielectricFresnel(1, 1, 1.333) - expected) < 1e-14);
  assert.equal(dielectricFresnel(.1, 1.5, 1), 1);
  const incident = [0.6, -0.8, 0];
  assert.deepEqual(refractDirection(incident, [0, 1, 0], 1, 1), incident);
  const bent = refractDirection(incident, [0, 1, 0], 1, 1.333);
  assert.ok(Math.abs(bent[0] - .6 / 1.333) < 1e-14);
  assert.equal(refractDirection([Math.sqrt(.99), -.1, 0], [0, 1, 0], 1.5, 1), null);
});

test('Earth Chappuis ozone absorbs green more than blue and Mars carries none', () => {
  const earth = getAtmosphereProfile('Earth'), mars = getAtmosphereProfile('Mars');
  assert.equal(earth.version, 'earth-clear-reference.v2');
  assert.match(earth.limitations, /Chappuis ozone/);
  assert.doesNotMatch(earth.limitations, /no ozone/);
  assert.ok(earth.betaOzoneKm[1] > earth.betaOzoneKm[0] && earth.betaOzoneKm[0] > earth.betaOzoneKm[2]);
  assert.equal(ozoneDensity(25, earth.ozonePeakKm, earth.ozoneWidthKm), 1);
  assert.ok(ozoneDensity(10, earth.ozonePeakKm, earth.ozoneWidthKm) < 0.4);
  assert.deepEqual(mars.betaOzoneKm, [0, 0, 0]);
  assert.equal(ozoneDensity(25, mars.ozonePeakKm, mars.ozoneWidthKm), 0);
  assert.throws(() => ozoneDensity(10, 25, -1), RangeError);
});

test('renderer parameters disable unsupported profiles and isolate physical radius from display size', () => {
  const opts = {cameraBodyKm: [0, 0, 20000], sunDirectionBody: [1, 0, 0], polarRatio: .9966, solarDistanceAu: 2, exposure: 1};
  const result = atmosphereUniformValues(getAtmosphereProfile('Earth'), opts);
  assert.equal(result.u_atmosphereEnabled, 1);
  assert.equal(result.u_atmosphereSolarScale, .25);
  assert.equal(result.u_atmosphereRadiusKm, 6378.137);
  assert.deepEqual(result.u_atmosphereOzoneKm, [...getAtmosphereProfile('Earth').betaOzoneKm]);
  assert.deepEqual(result.u_atmosphereOzoneLayerKm, [25, 15]);
  assert.equal(result.u_atmosphereRefractionEnabled, 1);
  assert.ok(result.u_atmosphereRefractivity > 0);
  assert.equal(atmosphereUniformValues(null, opts).u_atmosphereEnabled, 0);
  assert.throws(() => atmosphereUniformValues(getAtmosphereProfile('Earth'), {...opts, polarRatio: 0}), RangeError);
});
