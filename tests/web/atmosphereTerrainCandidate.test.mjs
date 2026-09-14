import test from 'node:test';
import assert from 'node:assert/strict';
import {ATMOSPHERE_RENDER_GLSL} from '../../apps/web/js/atmosphereColumnField.js';
import {withTerrainGroundCuts,withIntegrationNodeCounter} from '../../tools/atmosphere_terrain_candidate.mjs';

test('qualification adapters reject missing, duplicated or already replaced source boundaries',()=>{
  for(const source of ['',ATMOSPHERE_RENDER_GLSL+ATMOSPHERE_RENDER_GLSL]){
    assert.throws(()=>withTerrainGroundCuts(source),/source boundary changed/);
    assert.throws(()=>withIntegrationNodeCounter(source),/source boundary changed/);
  }
  assert.throws(()=>withTerrainGroundCuts(withTerrainGroundCuts(ATMOSPHERE_RENDER_GLSL)),/source boundary changed/);
  assert.throws(()=>withTerrainGroundCuts(null));
});

test('ground candidate preserves every source byte outside the intended segment function',()=>{
  const candidate=withTerrainGroundCuts(ATMOSPHERE_RENDER_GLSL);
  const first=ATMOSPHERE_RENDER_GLSL.indexOf('vec3 atmosphereScatteredSegment(');
  const last=ATMOSPHERE_RENDER_GLSL.indexOf('// maxDistance',first);
  assert.ok(first>0&&last>first);
  assert.equal(candidate.slice(0,first),ATMOSPHERE_RENDER_GLSL.slice(0,first));
  assert.equal(candidate.slice(candidate.indexOf('// maxDistance',first)),ATMOSPHERE_RENDER_GLSL.slice(last));
});
