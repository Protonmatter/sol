import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
const bitmap=()=>({width:2048,height:1024,closed:false,close(){this.closed=true;}});

test('mode selection uploads artistic maps while preserving physical snapshots and restoring registered demand',async t=>{
 const loads=[];const h=await orreryHarness(t,{controls:true,illustrativeMap:async a=>{loads.push(a);return bitmap();}});
 await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Mars','change');
 const coordinates=JSON.stringify(h.state.bodies),epoch=h.state.renderUnix;
 assert.equal(loads.length,0);assert.equal(h.state.planetLook,'source-qualified');
 h.input('orreryPlanetLook','illustrative','change');await h.settle();
 assert.ok(loads.some(a=>a.body==='Mars'));assert.equal(h.state.illustrativeStatus.Mars,'ready');
 assert.equal(h.state.terrainRendered.Mars,false);
 assert.ok(h.gpuDraws.some(d=>d.uniforms.u_texMode===0 && d.uniforms.u_useTex===1));
 assert.equal(JSON.stringify(h.state.bodies),coordinates);assert.equal(h.state.renderUnix,epoch);
 h.input('orreryPlanetLook','source-qualified','change');await h.settle();
 assert.ok(h.images.some(i=>i.src?.includes('mars')&&i.src?.includes('reference')));
 h.leaveOrrery();
});

test('switching off, leaving and losing context reject stale decodes and close their bitmap',async t=>{
 const loads=[];const h=await orreryHarness(t,{controls:true,illustrativeMap:(a,signal)=>new Promise(resolve=>loads.push({a,signal,resolve}))});
 await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Mars','change');h.input('orreryPlanetLook','illustrative','change');
 assert.ok(loads.length);h.check('orreryTextures',false);assert.ok(loads.every(l=>l.signal.aborted));
 let image=bitmap();loads.at(-1).resolve(image);await h.settle();assert.equal(image.closed,true);
 h.check('orreryTextures',true);await h.settle();const current=loads.at(-1);assert.equal(current.signal.aborted,false);
 h.leaveOrrery();assert.equal(current.signal.aborted,true);image=bitmap();current.resolve(image);await h.settle();assert.equal(image.closed,true);
 await h.enterOrrery();await h.settle();const restore=loads.at(-1);
 h.event('orreryCanvas','webglcontextlost',{preventDefault(){}});assert.equal(restore.signal.aborted,true);
 image=bitmap();restore.resolve(image);await h.settle();assert.equal(image.closed,true);
 assert.equal(h.state.illustrativeStatus.Mars,undefined);h.leaveOrrery();
});

test('failures are bounded until explicit mode retry; ready textures are released on context loss',async t=>{
 let calls=0;const h=await orreryHarness(t,{controls:true,illustrativeMap:async()=>{calls++;if(calls===1)throw Error('bad map');return bitmap();}});
 await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Mars','change');h.input('orreryPlanetLook','illustrative','change');await h.settle();
 assert.equal(h.state.illustrativeStatus.Mars,'unavailable');const failures=calls;
 h.resize(800,600);h.resize(800,600);await h.settle();assert.equal(calls,failures);
 h.input('orreryPlanetLook','source-qualified','change');h.input('orreryPlanetLook','illustrative','change');await h.settle();assert.equal(h.state.illustrativeStatus.Mars,'ready');
 const released=h.deletedTextures.length;h.event('orreryCanvas','webglcontextlost',{preventDefault(){}});
 assert.ok(h.deletedTextures.length>released);h.leaveOrrery();
});
