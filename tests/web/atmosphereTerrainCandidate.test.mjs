import test from 'node:test';
import assert from 'node:assert/strict';
import {ATMOSPHERE_RENDER_GLSL} from '../../apps/web/js/atmosphereColumnField.js';
import {withTerrainGroundCuts,withIntegrationNodeCounter,ORIGINAL_SEGMENT,SEGMENTED} from '../../tools/atmosphere_terrain_candidate.mjs';

// Retain the historical candidate adapter as a reproducible baseline tool. Current
// production uses the same qualified segment; the old fixture is explicit.
assert.ok(ATMOSPHERE_RENDER_GLSL.includes(SEGMENTED));
const legacy=ATMOSPHERE_RENDER_GLSL.replace(SEGMENTED,ORIGINAL_SEGMENT);

test('qualification adapters reject missing, duplicated or already replaced source boundaries',()=>{
  for(const source of ['',legacy+legacy]){
    assert.throws(()=>withTerrainGroundCuts(source),/source boundary changed/);
    assert.throws(()=>withIntegrationNodeCounter(source),/source boundary changed/);
  }
  assert.throws(()=>withTerrainGroundCuts(withTerrainGroundCuts(legacy)),/source boundary changed/);
  assert.throws(()=>withIntegrationNodeCounter(withIntegrationNodeCounter(legacy)),/already instrumented/);
  assert.throws(()=>withTerrainGroundCuts(null));
});

test('ground candidate preserves every source byte outside the intended segment function',()=>{
  const candidate=withTerrainGroundCuts(legacy);
  assert.equal(candidate,ATMOSPHERE_RENDER_GLSL,'promoted segment is byte-identical to the qualified candidate');
  const first=legacy.indexOf('vec3 atmosphereScatteredSegment(');
  const last=legacy.indexOf('// maxDistance',first);
  assert.ok(first>0&&last>first);
  assert.equal(candidate.slice(0,first),legacy.slice(0,first));
  assert.equal(candidate.slice(candidate.indexOf('// maxDistance',first)),legacy.slice(last));
});
