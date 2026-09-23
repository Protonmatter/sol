import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

test('Sun inspection defaults to an explicitly illustrative model and preserves orbital time', async t => {
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);
  const time=h.state.renderUnix;
  h.event('orreryInspectSun','click');await h.settleCatalogues();
  assert.equal(h.state.solarMode,'dynamic-euv');
  assert.equal(h.state.solarInspection,true);
  assert.equal(h.state.solarDynamicClock.seconds,0);
  assert.equal(h.state.renderUnix,time);
  assert.equal(h.state.solarPlayback.playing,false);
  h.leaveOrrery();
});

test('invalid dynamic source mode cannot enter the solar renderer', async t => {
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);
  const mode=h.state.solarMode;
  h.input('orrerySolarMode','unexpected','change');
  assert.equal(h.state.solarMode,mode);
  h.leaveOrrery();
});

test('leaving isolated Sun inspection pauses its independent clock', async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);
  h.event('orreryInspectSun','click');
  h.state.solarDynamicClock={...h.state.solarDynamicClock,playing:true,reason:'playing'};
  h.input('orreryAnchor','Earth','change');
  assert.equal(h.state.solarInspection,false);
  assert.equal(h.state.solarDynamicClock.playing,false);
  h.leaveOrrery();
});
