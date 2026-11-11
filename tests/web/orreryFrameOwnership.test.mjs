import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

test('paused pointer and wheel bursts draw once at the next frame boundary',async t=>{
  const h=await orreryHarness(t,{controls:true,manualFrames:true});await h.enterOrrery();h.setAnimate(false);
  if(h.frames.size)h.frame(100);
  const draws=h.draws,radius=h.state.radius;
  for(let i=0;i<12;i++)h.event('orreryCanvas','wheel',{deltaY:2,preventDefault(){}});
  assert.equal(h.draws,draws,'input handlers only invalidate');assert.notEqual(h.state.radius,radius);
  assert.equal(h.frames.size,1);h.frame(116);assert.ok(h.draws>draws);assert.equal(h.frames.size,0);
});

test('hidden and lost contexts cancel pending input frames and resume on recovery',async t=>{
  const h=await orreryHarness(t,{controls:true,manualFrames:true});await h.enterOrrery();h.setAnimate(false);
  if(h.frames.size)h.frame(100);
  h.event('orreryCanvas','wheel',{deltaY:2,preventDefault(){}});h.setHidden(true);
  const draws=h.draws;assert.equal(h.frames.size,0);
  h.event('orreryCanvas','wheel',{deltaY:2,preventDefault(){}});assert.equal(h.frames.size,0);
  h.setHidden(false);h.frame(116);assert.ok(h.draws>draws);
  h.event('orreryCanvas','wheel',{deltaY:2,preventDefault(){}});
  h.event('orreryCanvas','webglcontextlost',{preventDefault(){}});assert.equal(h.frames.size,0);
  h.event('orreryCanvas','webglcontextrestored');assert.equal(h.frames.size,1);h.frame(132);
  assert.equal(h.bufferErrors.length,0);
});
