import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {BODY} from '../../apps/web/js/bodyData.js';

test('only a ready illustrative Saturn map receives the recovered display material',async t=>{
  let complete;
  const h=await orreryHarness(t,{controls:true,useProductAppearanceDefault:true,
    illustrativeMap:asset=>asset.body==='Saturn'?new Promise(resolve=>{complete=resolve;})
      :Promise.resolve({width:2048,height:1024,close(){}})});
  await h.enterOrrery();t.after(()=>h.leaveOrrery());h.setAnimate(false);
  h.input('orreryAnchor','Saturn','change');await h.settle();
  const saturn=draw=>draw.uniforms.u_bodyRadiusKm===BODY.Saturn.radiusKm&&draw.uniforms.u_mode===0;
  const paint=()=>{const start=h.gpuDraws.length;h.check('orreryTextures',h.state.useTextures);return h.gpuDraws.slice(start);};
  assert.ok(paint().filter(saturn).every(draw=>draw.uniforms.u_saturnLook===0),'pending maps keep the existing fallback');
  complete({width:2048,height:1024,close(){}});await h.settle();await h.settle();
  const epoch=h.state.renderUnix,positions=JSON.stringify(h.state.bodies),frame=paint();
  assert.ok(frame.some(draw=>saturn(draw)&&draw.uniforms.u_saturnLook===1&&draw.uniforms.u_useTex===1));
  assert.ok(frame.every(draw=>draw.uniforms.u_saturnLook!==1||saturn(draw)),
    'Saturn moons and other bodies cannot inherit the parent material');
  const inspection=frame.find(saturn).uniforms;
  assert.equal(inspection.u_moonShadowCount,0,'inspection light cannot reuse real-Sun moon transits');
  assert.equal(h.nodes.orrerySaturnControls.hidden,false);
  h.input('orrerySaturnLighting','sun-directed','change');
  const solar=paint().find(saturn).uniforms.u_light;
  assert.notDeepEqual(solar,inspection.u_light,'Sun-directed choice must reach the actual draw');
  const body=h.state.bodies.find(b=>b.name==='Saturn'),distance=Math.hypot(body.x_au,body.y_au,body.z_au);
  for(const [i,key] of ['x_au','y_au','z_au'].entries())assert.ok(Math.abs(solar[i]+body[key]/distance)<1e-6);
  for(const change of [()=>h.input('orreryPlanetLook','source-qualified','change'),()=>h.check('orreryTextures',false)]){
    change();await h.settle();assert.ok(paint().every(draw=>draw.uniforms.u_saturnLook!==1));
  }
  assert.equal(h.state.renderUnix,epoch);assert.equal(JSON.stringify(h.state.bodies),positions);
});
