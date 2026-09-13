import assert from 'node:assert/strict';
import test from 'node:test';
import {orreryHarness} from './helpers/orreryHarness.mjs';

test('restoring a paused graphics context reuses retained physical metadata without starting engine work',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);
  const bodies=h.state.bodies,identity=JSON.stringify([h.state.renderUnix,h.state.metadataUnix,bodies]);
  const requests=h.requests.length,positionComputations=h.positionEpochs.length,contexts=h.contexts,draws=h.draws;
  // Model a tab which has remained paused far longer than the ordinary metadata
  // refresh cadence. Restoring its graphics is not a new scientific time intent.
  h.advanceMonotonicTime(20000);h.holdSnapshots();
  h.event('orreryCanvas','webglcontextlost');
  h.event('orreryCanvas','webglcontextrestored');await h.settleCatalogues();
  assert.equal(h.requests.length,requests,'graphics restoration must not queue a deadline-bound metadata request');
  assert.equal(h.positionEpochs.length,positionComputations,'physical coordinates need no recomputation for a GPU reset');
  assert.equal(h.state.bodies,bodies,'the valid physical snapshot is retained');
  assert.equal(JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies]),identity);
  assert.equal(h.state.engineError,'');assert.equal(h.contexts,contexts+1);assert.ok(h.draws>draws);
  h.frame(20000);await h.settle();
  assert.equal(h.requests.length,requests,'the paused restoration frame also reuses the retained metadata');
  h.holdSnapshots(false);h.setAnimate(true);h.frame(20016);await h.settle();
  assert.equal(h.requests.length,requests+1,'an explicit animation intent still refreshes orbital metadata');
  assert.notEqual(h.state.renderUnix,JSON.parse(identity)[0]);
  assert.deepEqual(h.errors,[]);
});
