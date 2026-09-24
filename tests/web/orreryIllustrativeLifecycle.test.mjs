import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {BODY} from '../../apps/web/js/bodyData.js';
import {appearanceReference} from '../../apps/web/js/planetAppearance.js';
import {terrainReference} from '../../apps/web/js/terrainAssets.js';
import * as shaders from '../../apps/web/js/orreryShaders.js';

const bitmap=()=>({width:2048,height:1024,closed:false,close(){this.closed=true;}});
const incidentField=async()=>({values:new Float32Array(4*257*195),width:257,height:195,
  domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}});
const marsMesh=()=>{
  const reference=terrainReference('Mars'),radius=BODY.Mars.radiusKm;
  return {pos:new Float32Array([1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1]),idx:new Uint16Array([0,1,2]),
    width:4,height:2,heightsKm:new Float32Array(8),minRadiusKm:radius,maxRadiusKm:radius,
    sourceId:reference.id,sourceSha256:reference.sha256,shadow:{shape:[radius,radius,radius,0.5],poles:[0,0]}};
};
const paired=h=>{
  const elements=h.drawCalls.filter(call=>call[0]==='elements');
  assert.equal(elements.length,h.gpuDraws.length);
  return h.gpuDraws.map((draw,index)=>({draw,count:elements[index][2]}));
};
const marsSphere=draw=>draw.uniforms.u_bodyRadiusKm===BODY.Mars.radiusKm&&draw.uniforms.u_mode===0;
const terrainDraws=rows=>rows.filter(({draw,count})=>marsSphere(draw)&&draw.uniforms.u_terrainShadowEnabled===1&&count===3);

test('illustrative samples are decoded once before lighting and stay off the reference texMode',()=>{
  assert.match(shaders.SPHERE_FS,/uniform int u_illustrativeLinear;/);
  assert.match(shaders.SPHERE_FS,/u_texMode==0\)\{ col=texture\(u_tex,vec2\(uu,vv\)\)\.rgb; if\(u_illustrativeLinear==1\) col=decodeSRGB\(col\); \}/);
  assert.match(shaders.SPHERE_FS,/bool displayLinear=reference\|\|u_illustrativeLinear==1;/);
  assert.match(shaders.SPHERE_FS,/if\(u_atmosphereEnabled==1&&!displayLinear\) col=decodeSRGB\(col\);/);
  assert.match(shaders.SPHERE_FS,/vec3 surface=displayLinear \? col : decodeSRGB\(col\);/);
  assert.match(shaders.SPHERE_FS,/col=displayLinear \? surface\+path : encodeSRGB\(surface\+path\);/);
  assert.match(shaders.SPHERE_FS,/if\(!displayLinear&&u_atmosphereEnabled==0\)col=displayToLinear\(col\+displayLimb\);/);
  assert.match(shaders.SPHERE_FS,/if\(displayLinear\|\|u_atmosphereEnabled==1\) col=encodeSRGB\(col\);/);
  assert.match(shaders.SPHERE_FS,/float shade=reference \? 0\.001\+0\.999\*lambert\*sunVis : 0\.05\+0\.95\*lambert\*sunVis;/);
  assert.match(shaders.SCATTERING_SPHERE_FS,/if\(!displayLinear\) col=decodeSRGB\(col\);/);
  assert.doesNotMatch(shaders.SCATTERING_SPHERE_FS,/u_atmosphereEnabled==1&&!displayLinear/);
  assert.doesNotMatch(shaders.SCATTERING_SPHERE_FS,/u_texMode==3&&u_illustrativeLinear/);
  assert.equal(shaders.BASE_SPHERE_FS.includes('uniform int u_illustrativeLinear;'),true);
});

test('mode selection uploads artistic maps while preserving physical snapshots and restoring registered demand',async t=>{
 const loads=[];const h=await orreryHarness(t,{controls:true,incidentField,terrainMesh:async()=>marsMesh(),illustrativeMap:(asset,signal)=>new Promise(resolve=>loads.push({asset,signal,resolve}))});
 await h.enterOrrery();h.setAnimate(false);
 h.input('orreryAnchor','Moon','change');await h.settle();
 const moon=appearanceReference('Moon');
 const moonImage=h.images.findLast(image=>image.src===moon.path);
 assert.ok(moonImage,'Moon reference is requested while Moon is the anchor');
 moonImage.width=moon.dimensions[0];moonImage.height=moon.dimensions[1];moonImage.onload();await h.settle();
 h.input('orreryAnchor','Mars','change');await h.settle();
 const coordinates=JSON.stringify(h.state.bodies),epoch=h.state.renderUnix;
 assert.equal(loads.length,0);assert.equal(h.state.planetLook,'source-qualified');
 assert.ok(terrainDraws(paired(h)).length,'source-qualified Mars draws the ready terrain mesh');
 const beforeIllustrative=h.gpuDraws.length;
 h.input('orreryPlanetLook','illustrative','change');await h.settle();
 assert.ok(loads.some(entry=>entry.asset.body==='Mars'));
 assert.equal(h.state.illustrativeStatus.Mars,'loading');
 assert.equal(h.state.terrainRendered.Mars,false);
 const pending=paired(h).slice(beforeIllustrative).filter(({draw})=>marsSphere(draw));
 assert.ok(pending.length,'illustrative Mars still draws before its map is ready');
 assert.ok(pending.every(({draw,count})=>draw.uniforms.u_terrainShadowEnabled===0&&count!==3),
   'terrain stays off while the artistic map is still loading');
 assert.ok(pending.every(({draw})=>draw.uniforms.u_illustrativeLinear!==1));
 const art=bitmap();const frameStart=h.gpuDraws.length;
 const marsLoad=loads.findLast(entry=>entry.asset.body==='Mars');
 assert.equal(marsLoad.signal.aborted,false);
 marsLoad.resolve(art);await h.settle();
 assert.equal(h.state.illustrativeStatus.Mars,'ready');
 assert.equal(h.state.terrainRendered.Mars,false);
 const uploaded=h.textureRecords.find(record=>record.pixels===art);
 assert.ok(uploaded,'the illustrative upload has a texture handle');
 const frame=h.gpuDraws.slice(frameStart);
 const illustrative=frame.filter(draw=>marsSphere(draw)&&draw.uniforms.u_illustrativeLinear===1);
 assert.ok(illustrative.length,'the ready artistic map is drawn');
 assert.ok(illustrative.every(draw=>draw.uniforms.u_texMode===0&&draw.uniforms.u_useTex===1&&draw.textures.get(0)===uploaded.texture&&draw.uniforms.u_atmosphereEnabled===1));
 assert.ok(paired(h).slice(frameStart).filter(({draw})=>marsSphere(draw)).every(({draw,count})=>draw.uniforms.u_terrainShadowEnabled===0&&count!==3));
 const marsIndex=frame.indexOf(illustrative[0]);
 const moonDraw=frame.slice(marsIndex+1).find(draw=>draw.uniforms.u_bodyRadiusKm===BODY.Moon.radiusKm&&draw.uniforms.u_mode===0);
 assert.ok(moonDraw,'a moon draw follows illustrative Mars in the same frame');
 assert.equal(moonDraw.uniforms.u_illustrativeLinear,0);
 assert.equal(moonDraw.uniforms.u_texMode,3);
 assert.notEqual(moonDraw.textures.get(0),uploaded.texture);
 for(const [name,radius,mode] of [['Earth',BODY.Earth.radiusKm,0],['Sun',BODY.Sun.radiusKm,1]]){
   const body=frame.find(draw=>draw.uniforms.u_bodyRadiusKm===radius&&draw.uniforms.u_mode===mode);
   assert.ok(body,`${name} is drawn in the same frame`);
   assert.equal(body.uniforms.u_illustrativeLinear,0,name);
   assert.notEqual(body.textures.get(0),uploaded.texture,name);
 }
 assert.ok(frame.every(draw=>draw.uniforms.u_illustrativeLinear!==1||(marsSphere(draw)&&draw.textures.get(0)===uploaded.texture)));
 assert.equal(JSON.stringify(h.state.bodies),coordinates);assert.equal(h.state.renderUnix,epoch);
 const imagesBeforeReturn=h.images.length;const returnStart=h.gpuDraws.length;
 h.input('orreryPlanetLook','source-qualified','change');await h.settle();
 assert.ok(terrainDraws(paired(h).slice(returnStart)).length,'source-qualified Mars uses the ready terrain mesh again');
 const marsAsset=appearanceReference('Mars');
 const requested=h.images.slice(imagesBeforeReturn).find(image=>image.src===marsAsset.path);
 assert.ok(requested,'the registered Mars map is requested again after the mode switch');
 assert.ok(!h.gpuDraws.slice(returnStart).some(draw=>draw.uniforms.u_texMode===3&&marsSphere(draw)),
   'an image URL alone is not a bound reference');
 requested.width=marsAsset.dimensions[0];requested.height=marsAsset.dimensions[1];
 const readyStart=h.gpuDraws.length;requested.onload();await h.settle();
 const restored=h.gpuDraws.slice(readyStart).find(draw=>marsSphere(draw)&&draw.uniforms.u_texMode===3&&draw.uniforms.u_useTex===1);
 assert.ok(restored,'the ready registered Mars map is drawn at texMode 3');
 assert.notEqual(restored.textures.get(0),uploaded.texture);
 assert.equal(restored.uniforms.u_illustrativeLinear,0);
 assert.ok(!h.gpuDraws.slice(readyStart).some(draw=>draw.textures.get(0)===uploaded.texture));
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
 let calls=0,art;const h=await orreryHarness(t,{controls:true,illustrativeMap:async()=>{calls++;if(calls===1)throw Error('bad map');art=bitmap();return art;}});
 await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Mars','change');h.input('orreryPlanetLook','illustrative','change');await h.settle();
 assert.equal(h.state.illustrativeStatus.Mars,'unavailable');const failures=calls;
 h.resize(800,600);h.resize(800,600);await h.settle();assert.equal(calls,failures);
 h.input('orreryPlanetLook','source-qualified','change');h.input('orreryPlanetLook','illustrative','change');await h.settle();assert.equal(h.state.illustrativeStatus.Mars,'ready');
 const uploaded=h.textureRecords.filter(record=>record.pixels===art);
 assert.equal(uploaded.length,1,'one illustrative texture was uploaded');
 const id=uploaded[0].texture;
 const released=h.deletedTextures.length;h.event('orreryCanvas','webglcontextlost',{preventDefault(){}});
 assert.ok(h.deletedTextures.includes(id),'context loss deletes the illustrative texture id');
 assert.ok(h.deletedTextures.length>released);h.leaveOrrery();
});

test('leaving the view deletes a ready illustrative texture',async t=>{
 let art;const h=await orreryHarness(t,{controls:true,illustrativeMap:async()=>art=bitmap()});
 await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Mars','change');h.input('orreryPlanetLook','illustrative','change');await h.settle();
 const uploaded=h.textureRecords.find(record=>record.pixels===art);
 assert.ok(uploaded);h.leaveOrrery();
 assert.ok(h.deletedTextures.includes(uploaded.texture));
 assert.equal(h.state.illustrativeStatus.Mars,undefined);
});

test('Venus radar wins over the illustrative selector and does not bind the artistic map',async t=>{
 const arts=new Map();const h=await orreryHarness(t,{controls:true,illustrativeMap:async asset=>{const image=bitmap();arts.set(asset.body,image);return image;}});
 await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Venus','change');h.input('orreryPlanetLook','illustrative','change');await h.settle();
 const art=arts.get('Venus');
 assert.ok(art,'Venus artistic map was requested while the selector was on');
 const uploaded=h.textureRecords.find(record=>record.pixels===art);
 assert.ok(uploaded);
 assert.ok(h.gpuDraws.some(draw=>draw.uniforms.u_bodyRadiusKm===BODY.Venus.radiusKm&&draw.textures.get(0)===uploaded.texture&&draw.uniforms.u_illustrativeLinear===1));
 const start=h.gpuDraws.length;h.check('orreryVenusRadar',true);await h.settle();
 const after=h.gpuDraws.slice(start);
 assert.ok(after.some(draw=>draw.uniforms.u_bodyRadiusKm===BODY.Venus.radiusKm&&draw.uniforms.u_mode===0));
 assert.ok(after.every(draw=>draw.textures.get(0)!==uploaded.texture));
 assert.ok(after.filter(draw=>draw.uniforms.u_bodyRadiusKm===BODY.Venus.radiusKm).every(draw=>draw.uniforms.u_illustrativeLinear===0));
 h.leaveOrrery();
});
