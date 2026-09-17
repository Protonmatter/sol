import assert from 'node:assert/strict';
import test from 'node:test';
import { getAtmosphereProfile } from '../../apps/web/js/atmosphereOptics.js';
import { hazeUniformValues } from '../../apps/web/js/illustrativeHaze.js';
import * as shaders from '../../apps/web/js/orreryShaders.js';
import { interpolationProgram } from './fixtures/glslFloat32Interpolation.mjs';
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

// The two closed forms below are executed as the shader declares them, sliced out of the
// real fragment source rather than restated here, so a change to either is a change to what
// this test runs. Both are scalar and read no uniform or texture, so the scattering adapter
// compiles them with its texture inputs left unused.
function declaration(source, name) {
  const start = source.indexOf(`float ${name}(`);
  assert.ok(start >= 0, name);
  const begin = source.indexOf('{', start);
  let end = begin + 1;
  for (let depth = 1; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  return source.slice(start, end);
}
const hazeMath = interpolationProgram(['hazeAirMass', 'hazeAerosol']
  .map(name => declaration(shaders.SPHERE_FS, name)).join(' '))([1, 1, 1], () => [0, 0, 0, 0]);

// Reachable sphere geometry: cos(theta) = -(mus*muv + sin*sin*cos(phi)) ties the scattering
// angle to the two cosines, so the forward peak is only available where both are small.
function* geometry(steps = 96) {
  for (let i = 1; i <= steps; i++) for (let j = 1; j <= steps; j++) for (let k = 0; k <= 24; k++) {
    const muv = i / steps * 0.999 + 0.0005, mus = j / steps * 0.999 + 0.0005, phi = k / 24 * Math.PI;
    const cosScatter = Math.max(-1, Math.min(1,
      -(mus * muv + Math.sqrt(1 - muv * muv) * Math.sqrt(1 - mus * mus) * Math.cos(phi))));
    yield { mus, muv, cosScatter };
  }
}
const henyeyGreenstein = (g, cosScatter) => (1 - g * g) / Math.max(1 + g * g - 2 * g * cosScatter, 1e-4) ** 1.5;

test('aerosol path radiance never exceeds its own single-scattering ceiling', () => {
  // A single-scattering layer reflects at most omega*P(theta)/4 however deep it is: the
  // (1-exp(-tau*(m_s+m_v)))/(4*(mus+muv)) factor is bounded by 1/(4*mus). The small-tau
  // reflectance omega*tau*P/(4*mus*muv) breaks that ceiling for every muv below tau, which
  // is why it grew without bound toward the limb.
  for (const body of ['Earth', 'Mars']) {
    const [tau, albedo, g] = hazeUniformValues(getAtmosphereProfile(body)).u_hazeAerosol;
    let worst = 0;
    for (const { mus, muv, cosScatter } of geometry()) {
      // The shader multiplies the summed reflectance by mus before it leaves hazeOverSurface.
      const radiance = hazeMath.hazeAerosol(tau, albedo, g, mus, muv, cosScatter) * mus;
      const ceiling = albedo * henyeyGreenstein(g, cosScatter) / 4;
      assert.ok(Number.isFinite(radiance) && radiance >= 0,
        `${body}: mus=${mus} muv=${muv} gave ${radiance}`);
      assert.ok(radiance <= ceiling * (1 + 1e-5),
        `${body}: ${radiance.toFixed(4)} exceeds the ${ceiling.toFixed(4)} ceiling at mus=${mus.toFixed(4)} muv=${muv.toFixed(4)}`);
      worst = Math.max(worst, radiance / Math.max(ceiling, 1e-30));
    }
    assert.ok(worst > 0.1, `${body}: the scan must actually approach the ceiling, reached ${worst.toFixed(3)}`);
  }
});

test('aerosol path radiance converges toward the limb instead of diverging', () => {
  // muv is cos of the angle from the normal, so it goes to zero at the silhouette. The old
  // 1/muv term multiplied by ten for every tenfold step; a bounded form must settle.
  for (const body of ['Earth', 'Mars']) {
    const [tau, albedo, g] = hazeUniformValues(getAtmosphereProfile(body)).u_hazeAerosol;
    const mus = 0.5, at = muv => {
      const cosScatter = Math.min(1, -(mus * muv - Math.sqrt(1 - muv * muv) * Math.sqrt(1 - mus * mus)));
      return hazeMath.hazeAerosol(tau, albedo, g, mus, muv, cosScatter) * mus;
    };
    const steps = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5].map(at);
    for (const value of steps) assert.ok(Number.isFinite(value), `${body}: non-finite toward the limb`);
    // 1/muv keeps its ratio pinned at ten however far in the limb is sampled. A bounded
    // form must shrink its ratio on every step and end within a few percent of settled.
    const ratios = steps.slice(1).map((value, i) => value / steps[i]);
    for (let i = 1; i < ratios.length; i++) {
      assert.ok(ratios[i] < ratios[i - 1],
        `${body}: step ratios ${ratios.map(r => r.toFixed(2)).join(', ')} are not converging`);
    }
    assert.ok(ratios.at(-1) < 1.1,
      `${body}: the last tenfold step still multiplied radiance by ${ratios.at(-1).toFixed(2)}`);
    assert.ok(steps.at(-1) <= albedo * henyeyGreenstein(g, 1) / 4, `${body}: limb radiance is unbounded`);
  }
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
