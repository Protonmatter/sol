import test from 'node:test';import assert from 'node:assert/strict';
import {planSunLook,sunLookResolution,sunLookRotation,SUN_LOOK_MAX_BYTES,sunLookDescription} from '../../apps/web/js/sunLook.js';
import {perspective,lookAt,mul} from '../../apps/web/js/orreryMath.js';
import {orreryHarness} from './helpers/orreryHarness.mjs';
const id=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const input=()=>({vp:mul(perspective(Math.PI/3,1,.1,100),lookAt([0,0,5],[0,0,0],[0,1,0])),rotation:id,position:[0,0,0],radius:1,eye:[0,0,5],pixels:300});
test('resolution choices, memory ceiling and invalid input are bounded',()=>{
 for(const n of [1024,2048,4096]){const p=planSunLook({...input(),resolution:n});assert.equal(p.size,n);assert(p.bytes<=SUN_LOOK_MAX_BYTES);}
 for(const n of [0,4097,8192,NaN,Infinity,'bad'])assert.equal(sunLookResolution(n),1024);
 assert.equal(planSunLook({...input(),radius:0}),null);assert.equal(planSunLook({...input(),pixels:0}),null);
 assert.equal(planSunLook({...input(),eye:[0,0,.5]}),null);assert.equal(planSunLook({...input(),eye:[NaN,0,5]}),null);
});
test('perspective rays and body rotation preserve center ray and handedness',()=>{
 const a=input(),p=planSunLook(a);assert.deepEqual(p.camera,[0,0,5]);assert(p.rayZ[2]<0);assert(p.rayX[0]>0);assert(p.rayY[1]>0);
 assert.deepEqual(p.rect,[-1,-1,1,1]);const rotated=sunLookRotation(id);assert.deepEqual(rotated.slice(4,7),[0,0,1]);
 const before=JSON.stringify(a);planSunLook(a);assert.equal(JSON.stringify(a),before);
 const invisible=planSunLook({...a,position:[1000,0,0]});assert.equal(invisible,null);
 assert.match(sunLookDescription({sunLookResolution:2048,sunLookStatus:'ready'}),/2K/);
 assert.match(sunLookDescription({sunLookStatus:'unavailable'}),/simplified visible Sun retained/);
 assert.match(sunLookDescription({}),/v2 \u00b7 1K/,'appearance label retains readable Unicode across Windows extraction');
});
const sunDraws=h=>h.gpuSubmissions.filter(d=>d.uniforms.u_scene!==undefined&&d.uniforms.u_mvp);
test('default approved Sun renders at 1K; detail controls preserve engine time and camera',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
 await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);h.setWindowReducedMotion(true);
 assert.equal(h.state.solarMode,'illustrative');assert.equal(h.state.sunLookResolution,1024);assert.equal(h.state.sunLookProminences,false);
 h.event('orreryInspectSun','click');await h.settle();assert.equal(h.state.sunLookStatus,'ready',h.state.sunLookReason);
 const snapshot=()=>JSON.stringify([h.state.renderUnix,h.state.bodies,h.state.az,h.state.el,h.state.radius]);const before=snapshot();
 for(const size of [2048,4096,1024]){
  h.input('orrerySunResolution',String(size),'change');await h.settle();assert.equal(h.state.sunLookResolution,size);assert.equal(h.state.sunLookStatus,'ready');assert.equal(snapshot(),before);
  assert(h.gpuSubmissions.some(d=>d.framebuffer&&d.viewport[2]===size&&d.uniforms.u_detail===.75));
 }
 const pair=sunDraws(h).slice(-2);assert.deepEqual(pair.map(d=>d.uniforms.u_pass),[1,2]);assert.equal(pair[0].depthWrites,true);assert.equal(pair[1].depthWrites,false);
 assert.deepEqual(pair[1].blend,[h.gl.ONE,h.gl.ONE]);assert(pair.every(d=>d.enabled.has(h.gl.DEPTH_TEST)));
 const count=h.gpuSubmissions.filter(d=>d.framebuffer&&d.uniforms.u_detail!==undefined).length;
 h.resize(800,600);h.resize(800,600);assert.equal(h.gpuSubmissions.filter(d=>d.framebuffer&&d.uniforms.u_detail!==undefined).length,count);
 h.check('orrerySunProminences',true);assert(h.gpuSubmissions.some(d=>d.uniforms.u_prom===1));
 const releases=h.deletedTextures.length;h.input('orrerySolarMode','visible','change');assert(h.deletedTextures.length>=releases+3);assert.equal(h.state.sunLookStatus,'deferred');
 h.leaveOrrery();assert.equal(h.frames.size,0);
});
test('unsupported float targets retain scene and expose explicit failure',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true,floatTargets:false});
 await h.enterOrrery();h.setAnimate(false);h.event('orreryInspectSun','click');await h.settle();
 assert.equal(h.state.sunLookStatus,'unavailable');assert.match(h.state.sunLookReason,/Float/);assert(h.draws>0);
 const before=h.textureUploads.length;h.resize(800,600);assert.equal(h.textureUploads.length,before,'failed target is not retried per frame');h.leaveOrrery();
});
test('hidden view, exit and restoration release the Sun targets and reject stale work',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
 await h.enterOrrery();h.setAnimate(false);h.event('orreryInspectSun','click');await h.settle();
 let prior=h.deletedTextures.length;h.setHidden(true);await h.settle();assert(h.deletedTextures.length>=prior+3);
 assert.equal(h.frames.size,0);h.setHidden(false);h.frame(1000);await h.settle();assert.equal(h.state.sunLookStatus,'ready');
 prior=h.deletedTextures.length;h.leaveOrrery();assert(h.deletedTextures.length>=prior+3);assert.equal(h.state.sunLookStatus,'deferred');
});
test('parallel Sun completion wakes a paused scene after the last program becomes ready',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true,parallelPrograms:true});
 const entering=h.enterOrrery();await h.settle();h.completePrograms();h.frame(100);await entering;
 h.setAnimate(false);h.setWindowReducedMotion(true);h.event('orreryInspectSun','click');await h.settle();
 assert.equal(h.state.sunLookStatus,'loading',h.state.sunLookReason);
 for(let i=0;i<12&&h.state.sunLookStatus!=='ready';i++){h.completePrograms();if(h.frames.size)h.frame(200+i*20);await h.settle();}
 assert.equal(h.state.sunLookStatus,'ready');assert(sunDraws(h).length>=2);h.leaveOrrery();
});
test('target allocation failure releases partial resources and restores the scene boundary',async t=>{
 const {createSunLookRenderer}=await import('../../apps/web/js/sunLookRenderer.js');
 const h=await orreryHarness(t,{controls:true,reducedMotion:true});h.state.solarMode='visible';await h.enterOrrery();h.setAnimate(false);
 let allocations=0;h.gl.checkFramebufferStatus=()=>++allocations===2?0:h.gl.FRAMEBUFFER_COMPLETE;
 const owner=createSunLookRenderer(h.gl),before=h.deletedTextures.length;
 assert.equal(owner.render(planSunLook(input()),{viewport:[2,3,450,300]}),false);
 assert.equal(owner.status().state,'unavailable');assert.equal(owner.status().bytes,0);assert.equal(h.deletedTextures.length-before,2);
 assert.deepEqual(h.gl.getParameter(h.gl.VIEWPORT),[2,3,450,300]);assert.equal(h.gl.getParameter(h.gl.DEPTH_WRITEMASK),true);
 const released=h.deletedTextures.length;owner.dispose();owner.dispose();assert.equal(h.deletedTextures.length,released);h.leaveOrrery();
});
test('an unsupported requested size is held until an explicit lower-resolution retry',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true,maxTextureSize:2048});await h.enterOrrery();h.setAnimate(false);
 h.event('orreryInspectSun','click');await h.settle();h.input('orrerySunResolution','4096','change');await h.settle();
 assert.equal(h.state.sunLookStatus,'unavailable');assert.match(h.state.sunLookReason,/device limits/);
 h.input('orrerySunResolution','1024','change');await h.settle();assert.equal(h.state.sunLookStatus,'ready');h.leaveOrrery();
});
test('a collapsed canvas and a galaxy view withdraw Sun target demand',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});await h.enterOrrery();h.setAnimate(false);
 h.event('orreryInspectSun','click');await h.settle();let before=h.deletedTextures.length;
 h.resize(0,0);await h.settle();assert(h.deletedTextures.length>=before+3);assert.equal(h.state.sunLookStatus,'deferred');
 h.resize(800,600);await h.settle();assert.equal(h.state.sunLookStatus,'ready');before=h.deletedTextures.length;
 h.event('orreryGalaxy','click');await h.settle();assert(h.deletedTextures.length>=before+3);assert.equal(h.state.sunLookStatus,'deferred');h.leaveOrrery();
});
test('mode and resolution changes keep one pending shader set until safe completion',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true,parallelPrograms:true});
 const entering=h.enterOrrery();await h.settle();h.completePrograms();h.frame(100);await entering;h.setAnimate(false);h.setWindowReducedMotion(true);
 h.event('orreryInspectSun','click');await h.settle();const pending=h.programs.slice(6);assert.equal(pending.length,3);
 h.input('orrerySolarMode','visible','change');h.input('orrerySunResolution','4096','change');
 assert.equal(h.programs.length,9,'quality changes do not spawn additional pending programs');
 assert(pending.every(p=>!h.deletedPrograms.includes(p)),'in-flight programs cannot be deleted on native ANGLE');
 for(let i=0;i<12&&h.frames.size;i++){h.completePrograms();h.frame(200+i*20);await h.settle();}
 assert.equal(h.state.sunLookStatus,'deferred','unselected completed shaders cannot draw or publish a frame');
 h.input('orrerySolarMode','illustrative','change');await h.settle();assert.equal(h.state.sunLookStatus,'ready');assert.equal(h.programs.length,9);
 h.leaveOrrery();
});
test('the illustrative Sun retains depth-tested wind without the legacy glow',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});await h.enterOrrery();h.setAnimate(false);h.setWindowReducedMotion(true);
 h.event('orreryInspectSun','click');await h.settle();assert.equal(h.state.sunLookStatus,'ready');
 const start=h.gpuSubmissions.length;h.resize(800,600);
 const draws=h.gpuSubmissions.slice(start),wind=draws.filter(d=>d.kind==='arrays'&&d.uniforms.u_soft===.9);
 assert.equal(wind.length,1,'the existing wind layer must still draw exactly once');
 assert.equal(wind[0].depthWrites,false);assert(wind[0].enabled.has(h.gl.DEPTH_TEST));assert.deepEqual(wind[0].blend,[h.gl.SRC_ALPHA,h.gl.ONE]);
 assert.equal(draws.filter(d=>d.uniforms.u_pow===2.8||d.uniforms.u_pow===4.2).length,0,'the approved corona replaces only the legacy glow');h.leaveOrrery();
});
test('Sun inspection fits the illustrative envelope while retaining the reference fit',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});await h.enterOrrery();await h.settleCatalogues();h.setAnimate(false);h.setWindowReducedMotion(true);
 for(const [w,height] of [[1200,800],[390,800]]){
  h.resize(w,height);h.input('orrerySolarMode','visible','change');h.event('orreryInspectSun','click');const reference=h.state.radius;
  const physical=JSON.stringify([h.state.renderUnix,h.state.bodies]);
  h.input('orrerySolarMode','illustrative','change');h.event('orreryInspectSun','click');await h.settle();
  assert(Math.abs(h.state.radius/reference-2.1/1.35)<1e-8,`camera fit must use the selected 2.1-radius envelope: ${w}x${height} reference=${reference} illustrative=${h.state.radius}`);
  assert.equal(JSON.stringify([h.state.renderUnix,h.state.bodies]),physical);
  const framing=h.state.radius;h.input('orrerySunResolution','4096','change');assert.equal(h.state.radius,framing,'resolution cannot change framing');
 }
 h.leaveOrrery();
});
