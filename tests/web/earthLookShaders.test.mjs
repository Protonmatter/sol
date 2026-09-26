import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';
import * as clouds from '../../apps/web/js/earthLookClouds.js';

const footprint='3.6/(min(uResolution.x,uResolution.y)*uZoom)';
const load=volume=>loadSourceModules(vm.createContext({}),[new URL('../../apps/web/js/earthLookShaders.js',import.meta.url)],{
  resolveImport:(_specifier,url)=>url.pathname.endsWith('/earthLookClouds.js')?{...clouds,EARTH_VOLUME_GLSL:volume}:undefined,
});

test('Earth shader adapts the recovered camera footprint without lab uniforms',async()=>{
  const [shader]=await load(clouds.EARTH_VOLUME_GLSL);
  assert.match(shader.EARTH_LOOK_FS,/2\.\/max\(u_pixelDiameter,1\.\)/);
  assert.doesNotMatch(shader.EARTH_LOOK_FS,/\buResolution\b|\buZoom\b/);
});

for(const [name,volume] of [
  ['missing footprint',clouds.EARTH_VOLUME_GLSL.replace(footprint,'changedFootprint')],
  ['ambiguous footprint',clouds.EARTH_VOLUME_GLSL+footprint],
  ['additional lab uniform',clouds.EARTH_VOLUME_GLSL+'\nfloat unused=uResolution.x;'],
])test(`Earth shader rejects ${name} before GPU compilation`,async()=>{
  await assert.rejects(load(volume),/Earth cloud .* changed/);
});
