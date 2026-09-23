import test from 'node:test';
import assert from 'node:assert/strict';
import {createSolarDynamicClock, transitionSolarClock, solarClockTime} from '../../apps/web/js/solarDynamicClock.js';

test('absolute scenario time is independent of tick partition and rate changes are continuous', () => {
  const start=transitionSolarClock(createSolarDynamicClock(),{type:'play'},10);
  let stepped=start;
  for(const now of [10.01,10.3,11,11.2,12])stepped=transitionSolarClock(stepped,{type:'tick'},now);
  assert.equal(solarClockTime(start,12),120);
  assert.equal(stepped.seconds,120);
  const faster=transitionSolarClock(stepped,{type:'rate',rate:600},12);
  assert.equal(solarClockTime(faster,12.5),420);
  assert.equal(start.seconds,0,'inputs stay immutable');
});

test('backgrounding and reduced motion pause without charging hidden wall time', () => {
  const start=transitionSolarClock(createSolarDynamicClock(),{type:'play'},2);
  const hidden=transitionSolarClock(start,{type:'background'},3);
  assert.equal(hidden.seconds,60);assert.equal(hidden.playing,false);
  assert.equal(solarClockTime(hidden,600),60);
  const resumed=transitionSolarClock(hidden,{type:'play'},600);
  assert.equal(solarClockTime(resumed,601),120);
  const reduced=transitionSolarClock(resumed,{type:'reduced-motion'},601);
  assert.equal(reduced.seconds,120);assert.equal(reduced.reason,'reduced-motion');
});

test('seek is explicit and pauses, endpoint stops, replay is bounded', () => {
  let state=transitionSolarClock(createSolarDynamicClock({duration:300}),{type:'seek',seconds:280},1);
  assert.equal(state.seconds,280);assert.equal(state.playing,false);
  state=transitionSolarClock(state,{type:'play'},2);
  state=transitionSolarClock(state,{type:'tick'},3);
  assert.equal(state.seconds,300);assert.equal(state.playing,false);assert.equal(state.reason,'ended');
  state=transitionSolarClock(state,{type:'replay'},5);
  assert.equal(state.seconds,0);assert.equal(solarClockTime(state,6),60);
});

test('invalid clocks, backwards monotonic samples and unsupported rates are rejected', () => {
  for(const duration of [0,-1,NaN,Infinity,1e9])assert.throws(()=>createSolarDynamicClock({duration}));
  const state=transitionSolarClock(createSolarDynamicClock(),{type:'play'},10);
  for(const now of [NaN,Infinity,9])assert.throws(()=>solarClockTime(state,now));
  for(const seconds of [-1,NaN,Infinity,21601])assert.throws(()=>transitionSolarClock(state,{type:'seek',seconds},11));
  for(const rate of [0,NaN,10,Infinity])assert.throws(()=>transitionSolarClock(state,{type:'rate',rate},11));
  assert.throws(()=>transitionSolarClock(state,{type:'unrecognized'},11));
});
