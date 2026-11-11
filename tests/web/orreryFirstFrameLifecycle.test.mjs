import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

async function enter(h,parallel){
  const pending=h.enterOrrery();
  if(parallel){await h.settle();for(let i=0;i<16&&h.state.programStatus.base!=='ready';i++){h.completePrograms();h.frame(100);await h.settle();}}
  await pending;
}
const physics=h=>JSON.stringify([h.state.renderUnix,h.state.metadataUnix,h.state.bodies]);

for(const parallel of [false,true])for(const origin of ['entry','restoration'])
test(`persistent ${origin} draw failure stays owned through failed Retry and recovers (${parallel?'parallel':'sync'})`,async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true,manualFrames:true,parallelPrograms:parallel});
  h.setAnimate(false);await enter(h,parallel);const draw=h.gl.drawElements;
  if(origin==='restoration'){
    h.frame(100);h.event('orreryCanvas','webglcontextlost');
    h.event('orreryCanvas','webglcontextrestored');
    if(parallel){await h.settle();for(let i=0;i<16&&h.state.programStatus.base!=='ready';i++){h.completePrograms();h.frame(100);await h.settle();}}
  }
  const accepted=physics(h);h.gl.drawElements=()=>{throw Error('persistent first-frame failure');};
  for(let attempt=0;attempt<2;attempt++){
    if(attempt)await h.retry();
    assert.doesNotThrow(()=>h.frame(116+attempt*16));
    assert.match(h.state.engineError,/failed.*persistent first-frame failure/i);
    assert.equal(h.nodes.orreryCanvas.style.display,'none');
    // Optional parallel shader polling is independent of scene presentation.
    // Let those already-owned compilations settle; they cannot restart the failed scene.
    if(parallel){for(let i=0;i<8&&h.frames.size;i++){h.completePrograms();assert.doesNotThrow(()=>h.frame(116+attempt*16));await h.settle();}}
    assert.equal(h.frames.size,0);
    assert.equal(physics(h),accepted,'failed presentation cannot change the accepted scientific snapshot');
  }
  h.gl.drawElements=draw;await h.retry();h.frame(148);
  assert.equal(h.state.engineError,'');assert.equal(h.nodes.orreryCanvas.style.display,'');
  assert.equal(physics(h),accepted);assert.deepEqual(h.errors,[]);
});

test('an initial zero-size frame retains first-draw ownership until it becomes drawable',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true,manualFrames:true});h.setAnimate(false);await enter(h,false);
  h.nodes.orreryCanvas.clientWidth=0;h.frame(100);
  h.gl.drawElements=()=>{throw Error('first visible frame failed');};h.resize(800,600);
  assert.doesNotThrow(()=>h.frame(116));assert.match(h.state.engineError,/failed.*first visible frame failed/i);
  assert.equal(h.frames.size,0);
});

test('ordinary later draw errors still propagate after a successful first presentation',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true,manualFrames:true});h.setAnimate(false);await enter(h,false);h.frame(100);
  h.gl.drawElements=()=>{throw Error('ordinary later draw');};h.resize(800,600);
  assert.throws(()=>h.frame(116),/ordinary later draw/);assert.equal(h.frames.size,0);
});

// Animation must not advance coordinates before its first presentation succeeds.
test('failed running first presentation retains its accepted epoch until Retry succeeds',async t=>{
  const h=await orreryHarness(t,{controls:true,manualFrames:true});await enter(h,false);
  const accepted=physics(h),draw=h.gl.drawElements;
  h.gl.drawElements=()=>{throw Error('running first frame');};
  assert.doesNotThrow(()=>h.frame(100));assert.equal(physics(h),accepted);
  assert.equal(h.frames.size,0);assert.match(h.state.engineError,/running first frame/);
  h.gl.drawElements=draw;await h.retry();h.frame(116);
  assert.equal(physics(h),accepted);assert.equal(h.state.engineError,'');
  h.frame(132);assert.equal(h.state.renderUnix,JSON.parse(accepted)[0]+57.6);
});

test('input cannot render retained graphics while Retry awaits its admitted snapshot',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true,manualFrames:true});
  await enter(h,false);h.setAnimate(false);h.frame(100);
  h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');
  const draw=h.gl.drawElements;h.gl.drawElements=()=>{throw Error('persistent awaited Retry');};
  h.frame(116);assert.match(h.state.engineError,/persistent awaited Retry/);
  const accepted=physics(h);h.holdSnapshots();await h.retry();
  assert.equal(h.state.entering,true);
  h.check('orreryShowLabels',true);
  assert.doesNotThrow(()=>h.frame(132));assert.equal(physics(h),accepted);
  assert.equal(h.frames.size,0,'pending entry cannot schedule an unowned scene');
  h.holdSnapshots(false);h.completeSnapshot();await h.settle();
  assert.equal(h.state.entering,false);
  assert.doesNotThrow(()=>h.frame(148));assert.match(h.state.engineError,/persistent awaited Retry/);
  assert.equal(h.nodes.orreryCanvas.style.display,'none');assert.equal(h.frames.size,0);
  h.gl.drawElements=draw;await h.retry();h.frame(164);
  assert.equal(h.state.engineError,'');assert.equal(physics(h),accepted);
});
