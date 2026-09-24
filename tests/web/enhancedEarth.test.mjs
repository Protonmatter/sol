import assert from 'node:assert/strict';
import test from 'node:test';
import * as shaders from '../../apps/web/js/orreryShaders.js';
import {geometryInterpreter} from './fixtures/glslFloat32Geometry.mjs';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {appearanceReference} from '../../apps/web/js/planetAppearance.js';
import {advanceEarthCloudPhase,oceanMaskPixels} from '../../apps/web/js/enhancedEarth.js';
import {OCEAN_MASK_WIDTH,OCEAN_MASK_HEIGHT,OCEAN_MASK_SHA256} from '../../apps/web/js/earthOceanMask.js';
import {createHash} from 'node:crypto';

const cloudDraws=h=>h.gpuSubmissions.filter(d=>d.kind==='elements'&&d.uniforms.u_mode===3);
async function boot(t,options={}){
  const h=await orreryHarness(t,{controls:true,...options});
  await h.enterOrrery();h.setAnimate(false);h.input('orreryAnchor','Earth','change');await h.settle();
  t.after(()=>h.leaveOrrery());return h;
}
function load(h,role){
  const asset=appearanceReference('Earth',role),img=h.images.find(i=>i.src?.includes(asset.path));
  assert.ok(img,`${role} requested`);[img.width,img.height]=asset.dimensions;img.onload();
}

test('enhancement is opt-in and never advances the scientific clock or changes other bodies',async t=>{
  const h=await boot(t);assert.equal(cloudDraws(h).length,0);
  const identity=JSON.stringify([h.state.renderUnix,h.state.bodies]);
  h.check('orreryEarthEnhanced',true);
  assert.equal(h.state.earthEnhanced,true);
  assert.equal(JSON.stringify([h.state.renderUnix,h.state.bodies]),identity);
  assert.match(h.nodes.orreryEarthLayerStatus.textContent,/illustrative/i);
  h.check('orreryEarthEnhanced',false);assert.equal(h.state.earthEnhanced,false);
});

test('raised cloud draw shares shadow phase, omits ground clouds and keeps transparent depth state',async t=>{
  const h=await boot(t);load(h,'surface');await h.settle();load(h,'cloud-composite');
  h.gpuSubmissions.length=0;h.check('orreryEarthEnhanced',true);
  const cloud=cloudDraws(h).at(-1);assert.ok(cloud,'ready cloud map gets its own draw');
  const ground=h.gpuSubmissions.find(d=>d.kind==='elements'&&d.uniforms.u_earthEnhanced===1&&d.uniforms.u_mode===0);
  assert.ok(ground);assert.equal(ground.uniforms.u_earthWeather,0,'no double cloud layer');
  assert.equal(ground.uniforms.u_earthCloudShadow,1);
  assert.equal(cloud.uniforms.u_cloudPhase,ground.uniforms.u_cloudPhase);
  assert.equal(cloud.uniforms.u_cloudScale,ground.uniforms.u_cloudScale);
  const a=ground.uniforms.u_model,b=cloud.uniforms.u_model;
  const length=m=>Math.hypot(m[0],m[1],m[2]);
  assert.ok(length(b)>length(a));assert.ok(length(b)/length(a)<1.002,'height is small, not a balloon');
  assert.equal(cloud.depthWrites,false);assert.ok(cloud.enabled.has(h.gl.DEPTH_TEST));
  assert.ok(cloud.enabled.has(h.gl.CULL_FACE));assert.deepEqual(cloud.blend,[h.gl.SRC_ALPHA,h.gl.ONE_MINUS_SRC_ALPHA]);
  assert.equal(cloud.uniforms.u_earthNight,0);assert.equal(cloud.uniforms.u_earthIce,0);
  assert.equal(cloud.textures.get(3),ground.textures.get(3));
  assert.ok(cloud.uniforms.u_hazeRayleighTau.some(value=>value!==0),'distant clouds keep illustrative haze');
});

test('cloud off, missing maps and daily ground-containing swaths cannot lift or cast cloud shadows',async t=>{
  const h=await boot(t);h.check('orreryEarthEnhanced',true);
  assert.equal(cloudDraws(h).length,0);
  load(h,'surface');await h.settle();load(h,'cloud-composite');
  h.gpuSubmissions.length=0;h.check('orreryEarthWeather',false);
  assert.equal(cloudDraws(h).length,0);
  assert.ok(h.gpuSubmissions.filter(d=>d.kind==='elements'&&d.uniforms.u_mode===0).every(d=>d.uniforms.u_earthCloudShadow===0));
  h.check('orreryEarthWeather',true);h.gpuSubmissions.length=0;
  h.input('orreryEarthCloudSource','daily','change');
  assert.equal(cloudDraws(h).length,0);assert.match(h.nodes.orreryEarthLayerStatus.textContent,/suspended/i);
  assert.ok(h.gpuSubmissions.filter(d=>d.kind==='elements'&&d.uniforms.u_mode===0).every(d=>d.uniforms.u_earthEnhanced===0));
});

test('drift advances only with visible animated Earth and survives paused camera redraws',async t=>{
  const h=await boot(t);load(h,'surface');await h.settle();load(h,'cloud-composite');h.check('orreryEarthEnhanced',true);
  const initial=cloudDraws(h).at(-1)?.uniforms.u_cloudPhase;
  assert.equal(initial,0);h.setAnimate(true);h.frame(100);h.frame(116);
  const moved=cloudDraws(h).at(-1).uniforms.u_cloudPhase;assert.ok(moved>0&&moved<0.001);
  h.setAnimate(false);h.resize(810,605);h.event('orreryCanvas','keydown',{key:'ArrowLeft'});
  assert.equal(cloudDraws(h).at(-1).uniforms.u_cloudPhase,moved);
  h.setWindowReducedMotion(true);h.setAnimate(true);h.frame(132);
  assert.equal(cloudDraws(h).at(-1).uniforms.u_cloudPhase,moved);
});

test('night cloud cover stays clear until the shell is actually lit',()=>{
  const g=geometryInterpreter(shaders.EARTH_CLOUD_COVER_GLSL||'');
  const cover=sun=>g.run('earthCloudCover',[sun]).value;
  assert.equal(cover(-0.2),0);
  assert.equal(cover(0),0);
  assert.equal(cover(1),1);
  assert.equal(cover(0.05),0);
});

test('executed shadow geometry follows the Sun and hits the elevated ellipsoid at grazing angles',()=>{
  const g=geometryInterpreter(shaders.EARTH_CLOUD_GEOMETRY_GLSL||'');
  const hit=(p,l,oblate=1)=>g.run('earthCloudHit',[p,l,oblate,1.01]).value;
  const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`);
  const overhead=hit([1,0,0],[1,0,0]);near(overhead[0],1.01);near(overhead[1],0);
  const east=hit([1,0,0],[0,1,0]),west=hit([1,0,0],[0,-1,0]);
  near(east[1],Math.sqrt(.0201));near(east[1],-west[1]);near(Math.hypot(...east),1.01);
  const polar=hit([0,0,1],[1,0,0],.997);near(Math.hypot(...polar),1.01);
});

test('executed ocean grading preserves masked land, bright ice and neutral colors',()=>{
  const g=geometryInterpreter(shaders.EARTH_OCEAN_GLSL||'');
  const grade=(c,m)=>g.run('enhancedOceanColor',[c,m]).value;
  for(const [c,m] of [[[.01,.04,.12],0],[[.8,.9,1],1],[[.1,.1,.1],1],[[.3,.2,.1],1]])
    assert.deepEqual(grade(c,m),c.map(Math.fround));
  const c=grade([.01,.04,.12],1),want=[.00873378,.02193378,.05713378];
  c.forEach((v,i)=>assert.ok(Math.abs(v-want[i])<1e-7));
});

test('phase is continuous through wrapping, frame subdivision, rate limiting and invalid steps',()=>{
  const step=(phase,dt,sim,enabled=true)=>advanceEarthCloudPhase(phase,dt,sim,24,enabled);
  assert.ok(Math.abs(step(.999,1,86400)-.001)<1e-12,'capped drift wraps smoothly');
  assert.ok(Math.abs(step(0,1,3600)-.00125)<1e-12,'drift is relative to displayed rotation');
  assert.ok(Math.abs(step(step(0,.5,1800),.5,1800)-step(0,1,3600))<1e-12);
  for(const [dt,sim,enabled] of [[1,3600,false],[0,3600,true],[-1,3600,true],[NaN,3600,true],[1,NaN,true]])
    assert.equal(step(.3,dt,sim,enabled),.3);
  assert.ok(Math.abs(step(.001,1,-86400)-.999)<1e-12);
});

test('mask bytes match their generated hash and preserve land/polar ice while admitting open oceans',()=>{
  const pixels=oceanMaskPixels();assert.equal(pixels.length,OCEAN_MASK_WIDTH*OCEAN_MASK_HEIGHT);
  assert.equal(createHash('sha256').update(pixels).digest('hex'),OCEAN_MASK_SHA256);
  const at=(lon,lat)=>pixels[Math.min(OCEAN_MASK_HEIGHT-1,Math.floor((90-lat)/180*OCEAN_MASK_HEIGHT))*OCEAN_MASK_WIDTH
    +Math.floor((((lon+180)%360+360)%360)/360*OCEAN_MASK_WIDTH)];
  for(const [lon,lat] of [[20,10],[-100,40],[100,40],[-45,75],[0,-89],[140,-25]])assert.equal(at(lon,lat),0);
  for(const [lon,lat] of [[-140,0],[-30,0],[80,-30],[179,0],[-179,0]])assert.equal(at(lon,lat),255);
});

test('physical ground program gets enhancement uniforms while cloud rendering stays in its own disclosed pass',async t=>{
  const h=await boot(t,{incidentField:async()=>({values:new Float32Array(4*257*195),width:257,height:195,
    domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}})});
  load(h,'surface');await h.settle();load(h,'cloud-composite');
  h.gpuSubmissions.length=0;h.check('orreryEarthEnhanced',true);
  const ground=h.gpuSubmissions.find(d=>d.uniforms.u_scatteringReady===1&&d.uniforms.u_earthEnhanced===1);
  assert.ok(ground,'physical atmosphere and enhanced ground coexist');
  assert.equal(ground.uniforms.u_earthCloudShadow,1);assert.equal(ground.uniforms.u_earthWeather,0);
  const cloud=cloudDraws(h).at(-1);assert.ok(cloud);assert.equal(cloud.uniforms.u_atmosphereEnabled,0);
  assert.deepEqual(cloud.uniforms.u_hazeRayleighTau,[0,0,0]);
  assert.equal(cloud.uniforms.u_cloudPhase,ground.uniforms.u_cloudPhase);
  assert.deepEqual(h.errors,[]);
});

test('turning off, hiding, leaving and restoring cannot advance clouds or retain dead mask textures',async t=>{
  const h=await boot(t);load(h,'surface');await h.settle();load(h,'cloud-composite');h.check('orreryEarthEnhanced',true);
  h.setAnimate(true);h.frame(100);h.setAnimate(false);
  const phase=h.state.earthCloudPhase;
  const mask=h.gpuSubmissions.find(d=>d.uniforms.u_earthEnhanced===1).textures.get(11);
  h.setHidden(true);h.setHidden(false);assert.equal(h.state.earthCloudPhase,phase);
  h.leaveOrrery();await h.enterOrrery();assert.equal(h.state.earthCloudPhase,phase);
  h.event('orreryCanvas','webglcontextlost');assert.ok(h.deletedTextures.includes(mask));
  h.event('orreryCanvas','webglcontextrestored');await h.settle();
  assert.equal(h.state.earthCloudPhase,phase);assert.equal(h.state.earthEnhanced,true);
  h.gpuSubmissions.length=0;h.check('orreryEarthEnhanced',false);
  assert.equal(cloudDraws(h).length,0);
  assert.ok(h.gpuSubmissions.filter(d=>d.kind==='elements'&&d.uniforms.u_mode===0).every(d=>d.uniforms.u_earthEnhanced===0));
});

test('animated suspension cancels frames and resumes without catching up hidden elapsed time',async t=>{
  const h=await boot(t);load(h,'surface');await h.settle();load(h,'cloud-composite');h.check('orreryEarthEnhanced',true);
  h.setAnimate(true);h.frame(100);const phase=h.state.earthCloudPhase;
  h.setHidden(true);assert.equal(h.frames.size,0,'hidden animated view cancels its queued tick');
  h.resize(805,602);assert.equal(h.state.earthCloudPhase,phase);
  h.setHidden(false);h.frame(100000);
  assert.ok(h.state.earthCloudPhase>phase&&h.state.earthCloudPhase-phase<.0001,'resume takes a single small step');
  const resumed=h.state.earthCloudPhase;h.leaveOrrery();assert.equal(h.frames.size,0);
  h.resize(807,604);assert.equal(h.state.earthCloudPhase,resumed,'inactive redraw cannot move clouds');
});

test('mask upload failure leaves a usable cloud layer and can be retried explicitly',async t=>{
  const h=await boot(t);load(h,'surface');await h.settle();load(h,'cloud-composite');
  h.setTextureUploadError(pixels=>ArrayBuffer.isView(pixels)&&pixels.byteLength===512*256?h.gl.OUT_OF_MEMORY:0);
  h.check('orreryEarthEnhanced',true);
  assert.equal(h.state.earthMaskStatus,'unavailable');assert.ok(cloudDraws(h).length);
  assert.match(h.nodes.orreryEarthLayerStatus.textContent,/Ocean grading unavailable/);
  const uploads=h.textureUploads.length;h.resize(810,605);assert.equal(h.textureUploads.length,uploads,'no automatic failure retry loop');
  h.setTextureUploadError(0);h.check('orreryEarthEnhanced',false);h.check('orreryEarthEnhanced',true);
  assert.equal(h.state.earthMaskStatus,'ready');
});

test('scientific sea-ice colors suspend enhancement instead of being dimmed by raised clouds',async t=>{
  const h=await boot(t);load(h,'surface');await h.settle();load(h,'cloud-composite');h.check('orreryEarthEnhanced',true);
  h.gpuSubmissions.length=0;h.check('orreryEarthIce',true);
  assert.equal(cloudDraws(h).length,0);assert.match(h.nodes.orreryEarthLayerStatus.textContent,/suspended.*sea.ice/i);
});
