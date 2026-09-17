import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainReferences,terrainSummary} from '../../apps/web/js/terrainAssets.js';
import {terrainDetailLevel} from '../../apps/web/js/physicalRendering.js';

test('close terrain has finer admitted source and derivative spacing without deleting baseline identity',()=>{
  for(const reference of terrainReferences()){
    assert.equal(reference.width,2880);
    assert.equal(reference.height,1440);
    assert.equal(reference.sourceDegreesPerTexel,1/16);
    assert.equal(reference.nativeDegreesPerTexel,1/8);
    assert.equal(reference.previousProduct.id,`${reference.body.toLowerCase()}-radial-height-v1`);
    assert.match(terrainSummary(reference.body,'ready'),/0.125/);
  }
  assert.equal(terrainDetailLevel(1600),4);
  assert.equal(terrainDetailLevel(900),3);
});
