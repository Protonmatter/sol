import assert from 'node:assert/strict';
import test from 'node:test';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {DWARFS,COMETS,PROBES} from '../../apps/web/js/smallbodies.js';

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

test('restored context re-backs the retained small-body marker count with real storage',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true});
  await h.enterOrrery();await h.settle();
  h.check('orreryShowSmall',true);h.setAnimate(false);await h.settle();
  // One vertex record per marker: position, kind and colour, eight floats each.
  const markerFloats=(DWARFS.length+COMETS.length+PROBES.length)*8;
  const isMarkerUpload=args=>args.some(value=>ArrayBuffer.isView(value)&&value.length===markerFloats);
  assert.ok(h.bufferUploads.some(isMarkerUpload),'markers uploaded while visible');
  h.event('orreryCanvas','webglcontextlost');
  const before=h.bufferUploads.length;
  h.event('orreryCanvas','webglcontextrestored');await h.settle();
  // finishGL recreates the marker buffer empty while the pre-loss count survives, so a
  // paused or reduced-motion scene would otherwise draw that count from empty storage.
  assert.ok(h.bufferUploads.slice(before).some(isMarkerUpload),
    'small-body markers must be re-uploaded before the first restored draw');
  h.leaveOrrery();
});

test('a time change during parallel context restoration still completes graphics setup',async t=>{
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true});
  const entering=h.enterOrrery();await h.settle();h.completePrograms();h.frame(100);await entering;await h.settle();
  h.setAnimate(false);await h.settle();
  h.event('orreryCanvas','webglcontextlost');
  h.event('orreryCanvas','webglcontextrestored');await h.settle();
  assert.equal(h.state.programStatus.base,'loading');
  const drawsBefore=h.draws;
  // Now advances the metadata generation while the replacement programs still compile.
  h.now();await h.settle();
  h.completePrograms();for(let i=0;i<4&&h.frames.size;i++)h.frame(100);await h.settle();
  assert.equal(h.state.programStatus.base,'ready');
  assert.ok(h.draws>drawsBefore,'the restored context must draw again');
  assert.equal(h.state.engineError,'');
  h.leaveOrrery();
});
