import assert from 'node:assert/strict';
import test from 'node:test';
import { orreryHarness } from './helpers/orreryHarness.mjs';
import { MOON_ALBEDO, MOON_ALBEDO_REFERENCE } from '../../apps/web/js/moonAppearance.js';
import { moonOffsetAU } from '../../apps/web/js/moonorbits.js';
import { sunlightOnMoon } from '../../apps/web/js/moonshadows.js';
import { iauRotation } from '../../apps/web/js/orreryMath.js';
import { BODY, AU_KM } from '../../apps/web/js/bodyData.js';
import { systemCard } from '../../apps/web/js/destinationCards.js';

test('Titan keeps an orange haze disk and a blue high-altitude rim without changing albedo or eclipse attenuation', async t => {
  const h = await orreryHarness(t, { controls: true, catalogues: 'ready', reducedMotion: true });
  await h.enterOrrery(); await h.settleCatalogues();
  h.input('orreryAnchor', 'Saturn', 'change');
  h.state.radius = 0.1;
  h.check('orreryTrueScale', true);
  const epoch = h.state.renderUnix, bodies = JSON.stringify(h.state.bodies);
  const moon = h.moons.find(item => item.n === 'Titan');
  const parent = h.state.bodies.find(body => body.name === 'Saturn');
  const parentPos = [parent.x_au, parent.y_au, parent.z_au];
  const offset = moonOffsetAU(moon, epoch);
  const position = offset.map((value, i) => value + parentPos[i]);
  const rotation = iauRotation(BODY.Saturn, epoch);
  const toBody = vector => [0, 1, 2].map(i => rotation[i * 4] * vector[0]
    + rotation[i * 4 + 1] * vector[1] + rotation[i * 4 + 2] * vector[2]);
  const sunlit = sunlightOnMoon(toBody(offset.map(value => value * AU_KM)),
    toBody(parentPos.map(value => -value * AU_KM)),
    { eqRadius: BODY.Saturn.radiusKm, polarRadius: BODY.Saturn.polarKm, sunRadius: BODY.Sun.radiusKm });
  const expectedGain = (MOON_ALBEDO.Titan / MOON_ALBEDO_REFERENCE * (0.06 + 0.94 * sunlit)) ** (1 / 2.2);
  for (const textures of [false, true]) {
    const first = h.uniformDraws.length;
    h.check('orreryTextures', textures);
    const draws = h.uniformDraws.slice(first).filter(draw => draw.u_mode === 0
      && draw.u_model?.slice(12, 15).every((value, i) => Math.abs(value - position[i]) < 1e-6));
    assert.equal(draws.length, 1, 'the actual Titan sphere is drawn at its physical catalogue position');
    const draw = draws[0], [red, green, blue] = draw.u_base;
    assert.ok(red > green * 1.3 && green > blue * 1.5, 'gray or blue base material cannot replace the visible orange haze');
    assert.ok(Math.abs(0.299 * red + 0.587 * green + 0.114 * blue - expectedGain) < 1e-6,
      'the existing published-albedo and physical-eclipse display gain is preserved');
    assert.equal(draw.u_style, -1, 'no invented storm or surface pattern');
    assert.equal(draw.u_useTex, 0, 'no infrared map or camera disk wraps onto Titan');
    assert.equal(draw.u_texMode, 0);
    assert.ok(draw.u_atmo[2] > draw.u_atmo[1] && draw.u_atmo[1] > draw.u_atmo[0],
      'the tenuous high-altitude rim is illustratively blue, separate from the orange main haze');
    assert.equal(draw.u_moonShadowCount, 0, 'parent shadow casters cannot leak onto Titan');
    assert.deepEqual(draw.u_ringRad, [0, 0]);
    assert.equal(draw.u_earthNight, 0); assert.equal(draw.u_earthWeather, 0); assert.equal(draw.u_earthIce, 0);
  }
  assert.equal(h.state.renderUnix, epoch);
  assert.equal(JSON.stringify(h.state.bodies), bodies);
  h.leaveOrrery();
});

test('Titan primary card explains the visible haze and illustrative color with textures on or off', () => {
  for (const useTextures of [true, false]) {
    const card = systemCard({ selected: 'Titan', useTextures });
    assert.match(card.note, /orange haze/i);
    assert.match(card.note, /illustrative/i);
    assert.match(card.note, /surface.*(?:hidden|unavailable)|hides the surface/i);
    assert.equal(card.preview, null);
    assert.equal(card.focusBody, 'Titan');
    assert.doesNotMatch(card.note, /live imagery|current clouds|calibrated color/i);
  }
});
