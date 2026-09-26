import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {BODY,AU_KM} from '../../apps/web/js/bodyData.js';
import {DISPLAY_CLEARANCE} from '../../apps/web/js/displayGeometry.js';
import {SUN_LOOK_EXTENT,sunLookDescription} from '../../apps/web/js/sunLook.js';
import {systemCard} from '../../apps/web/js/destinationCards.js';

function submittedRadii(h,distance){
  const start=h.gpuSubmissions.length;h.resize(800,600);
  const draws=h.gpuSubmissions.slice(start).map(d=>d.uniforms);
  const mercury=draws.find(u=>u.u_mode===0&&u.u_model&&Math.abs(u.u_model[12]-distance)<1e-6);
  assert(mercury,'the actual Mercury sphere must be submitted');
  const look=draws.find(u=>u.u_scene!==undefined&&u.u_pass===1);
  const sun=draws.find(u=>u.u_mode===1&&u.u_model);
  assert(look||sun,'the actual Sun must be submitted');
  return {Sun:look?h.state.radius/Math.hypot(...look.u_camera):Math.hypot(...sun.u_model.slice(0,3)),
    Mercury:Math.hypot(...mercury.u_model.slice(0,3))};
}

test('the selected Sun envelope clears Mercury and mode/texture toggles refresh paused display sizing',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);h.setWindowReducedMotion(true);h.state.radius=2;
  for(const distance of [.307,.387,.467])for(const exaggeration of [1,10]){
    // Isolate this pair: the harness's synthetic outer planets otherwise have
    // overlapping moon envelopes that shrink every body before this constraint.
    h.state.bodies=h.state.bodies.filter(b=>b.name==='Mercury').map(b=>({...b,x_au:distance,y_au:0,z_au:0}));
    h.input('orrerySize',String(exaggeration));
    const physical=JSON.stringify([h.state.renderUnix,h.state.bodies]);
    h.input('orrerySolarMode','visible','change');await h.settle();const reference=submittedRadii(h,distance);
    h.input('orrerySolarMode','illustrative','change');await h.settle();const approved=submittedRadii(h,distance);
    assert(SUN_LOOK_EXTENT*approved.Sun+approved.Mercury<=DISPLAY_CLEARANCE*distance+1e-7,
      `corona and Mercury overlap at ${distance} AU: ${JSON.stringify(approved)}`);
    assert(approved.Sun<reference.Sun-1e-5,'the new envelope must change an already-cached reference fit');
    h.check('orreryTextures',false);await h.settle();const disabled=submittedRadii(h,distance);
    assert(Math.abs(disabled.Sun-reference.Sun)<1e-7,'disabled detail restores reference clearance');
    h.check('orreryTextures',true);await h.settle();const restored=submittedRadii(h,distance);
    assert(Math.abs(restored.Sun-approved.Sun)<1e-7,'re-enabling detail restores corona clearance');
    h.input('orrerySolarMode','visible','change');await h.settle();
    assert(Math.abs(submittedRadii(h,distance).Sun-reference.Sun)<1e-7,'switching back restores the original envelope');
    assert.equal(JSON.stringify([h.state.renderUnix,h.state.bodies]),physical,'display sizing cannot alter physical state');
  }
  h.check('orreryTrueScale',true);
  for(const mode of ['illustrative','visible'])for(const enabled of [true,false]){
    h.input('orrerySolarMode',mode,'change');h.check('orreryTextures',enabled);await h.settle();
    const radii=submittedRadii(h,.467);
    for(const name of ['Sun','Mercury'])assert(Math.abs(radii[name]-BODY[name].radiusKm/AU_KM)<1e-9,'physical scale retains the catalogue radius');
  }
  h.leaveOrrery();
});

test('disabled texture layers are distinguished from offscreen deferral in every Sun disclosure',async t=>{
  const h=await orreryHarness(t,{controls:true,reducedMotion:true});await h.enterOrrery();h.setAnimate(false);
  h.event('orreryInspectSun','click');await h.settle();assert.equal(h.state.sunLookStatus,'ready');
  h.check('orreryTextures',false);await h.settle();
  for(const text of [sunLookDescription(h.state),systemCard(h.state).note,h.nodes.orreryPhysicalStatus.textContent,h.nodes.orrerySunLookStatus.textContent]){
    assert.match(text,/Texture layers.*off|disabled.*Texture layers/i);assert.doesNotMatch(text,/at this distance/);
  }
  for(const status of ['ready','deferred','unavailable'])assert.match(sunLookDescription({...h.state,sunLookStatus:status}),/disabled/i);
  h.check('orreryTextures',true);await h.settle();assert.equal(h.state.sunLookStatus,'ready');
  assert.doesNotMatch(sunLookDescription(h.state),/disabled|at this distance/i);
  h.state.radius=1e6;h.resize(800,600);await h.settle();
  assert.match(sunLookDescription(h.state),/deferred at this distance/i);h.leaveOrrery();
});
