import assert from 'node:assert/strict';
import test from 'node:test';
import { appearanceReference, appearanceReferences, appearanceUniforms, appearanceDescription, earthLayerDescription } from '../../apps/web/js/planetAppearance.js';

test('every major planet and the Moon has a dated source reference without upgrading held legacy maps', () => {
  for (const body of ['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Moon']) {
    const a = appearanceReference(body);
    assert.equal(a.body, body); assert.equal(a.role, 'surface');
    assert.match(a.observation_label, /[12]\d{3}/); assert.ok(a.metadata_urls.length > 0);
  }
  assert.equal(appearanceReference('Sun'), null);
  assert.equal(appearanceReference('Earth','invented-clouds'), null);
  assert.equal(appearanceReferences().length, 12);
});

test('map uniforms preserve source longitude, latitude conventions, affine grids and alpha coverage', () => {
  for (const body of ['Earth','Jupiter','Uranus']) {
    const a = appearanceReference(body), u = appearanceUniforms(a);
    assert.equal(u.map[1], body === 'Uranus' ? -1 : 1);
    assert.equal(u.map[2], 2);
    assert.deepEqual(u.lat.slice(0,2), [-Math.PI/2, Math.PI/2]);
  }
  assert.equal(appearanceUniforms(appearanceReference('Mercury')).map[2], 1);
  assert.equal(appearanceUniforms(appearanceReference('Earth','weather')).nodata, 2);
  const a = structuredClone(appearanceReference('Earth'));
  delete a.mapping.uvScale; delete a.mapping.uvOffset;
  assert.deepEqual(appearanceUniforms(a).window, [1,1,0,0]);
  a.mapping.latitudeType = 'parametric'; a.nodata = 'black';
  assert.equal(appearanceUniforms(a).map[2], 0); assert.equal(appearanceUniforms(a).nodata, 1);
});

test('appearance copy distinguishes loading, failure, disabled and source date from model time', () => {
  const a = appearanceReference('Earth');
  assert.match(appearanceDescription('Sun'), /unavailable/i);
  assert.match(appearanceDescription('Earth'), /Loading/);
  assert.match(appearanceDescription('Earth',{useTextures:false}), /switched off/);
  assert.match(appearanceDescription('Earth',{appearanceStatus:{[a.id]:'unavailable'}}), /Image unavailable/);
  const state = {appearanceStatus:{[a.id]:'ready'},renderUnix:0};
  assert.doesNotMatch(appearanceDescription('Earth',state), /Loading|unavailable/);
  assert.match(appearanceDescription('Earth',state,true), /not calibrated/);
  assert.equal(appearanceDescription('Earth',state), appearanceDescription('Earth',{...state,renderUnix:999999}));
  assert.doesNotMatch(appearanceDescription('Earth', state), /Unmapped/);
  assert.match(appearanceDescription('Neptune'), /Unmapped areas are simplified/);
});

test('Earth layer summaries include only enabled dated layers and report readiness independently', () => {
  const state = {earthNight:true,earthWeather:true,earthIce:true,appearanceStatus:{}};
  for (const role of ['night-lights','weather','sea-ice']) state.appearanceStatus[appearanceReference('Earth',role).id] = 'ready';
  const text = earthLayerDescription(state);
  assert.match(text,/2016/); assert.match(text,/2026/); assert.doesNotMatch(text,/loading|unavailable/);
  assert.match(earthLayerDescription(state, true), /Clouds and surface/);
  assert.doesNotMatch(earthLayerDescription(state, true), /NASA/);
  assert.equal(earthLayerDescription({earthNight:false,earthWeather:false,earthIce:false}), '');
  assert.match(earthLayerDescription(), /loading/);
  state.appearanceStatus[appearanceReference('Earth','weather').id] = 'unavailable';
  assert.match(earthLayerDescription(state),/unavailable/);
});
