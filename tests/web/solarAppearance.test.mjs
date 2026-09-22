import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {PNG} from 'pngjs';
import {
  SOLAR_APPEARANCE, SOLAR_QUIET_BINS, solarFrameUniforms, projectSolarSurface, solarReferenceRotation,
  solarPlayback, raySphereInterval, solarVisibleInterval,
  solarLoopDensity, integrateSolarEmission, solarDisplayColor,
  solarQuietProfile, solarAtlasQuietProfiles, solarQuietBytes,
  solarGlobalLoops, solarFlowPhase, solarRenderUniforms, SOLAR_ARCADE_COUNT,
  solarSiderealDegPerDay, solarActiveRegions, solarCme, SOLAR_ACTIVITY_SECONDS_PER_DAY,
} from '../../apps/web/js/solarAppearance.js';

const norm = a => Math.hypot(...a);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const add = (a,b) => a.map((v,i)=>v+b[i]);
const scale = (a,b) => a.map(v=>v*b);

test('solar reference retains immutable source epochs and explicitly modeled geometry', async () => {
  const manifest=JSON.parse(await readFile(new URL('../../apps/web/solar-appearance.v1.json',import.meta.url),'utf8'));
  assert.deepEqual(SOLAR_APPEARANCE, manifest);
  assert.equal(SOLAR_APPEARANCE.schema_version,'solar-appearance.v1');
  assert.equal(SOLAR_APPEARANCE.frames.length,2);
  assert.equal(SOLAR_APPEARANCE.frames[0].observed_at,'2024-05-10T12:00:09.349Z');
  assert.equal(SOLAR_APPEARANCE.geometry.status,'modeled-reference');
  assert.equal(SOLAR_APPEARANCE.far_side,'unavailable');
  assert.equal(SOLAR_APPEARANCE.far_side_display,'observed-disk radial median');
  assert.ok(Object.isFrozen(SOLAR_APPEARANCE.frames[0]));
  assert.throws(()=>{SOLAR_APPEARANCE.frames[0].observed_at='now';},TypeError);
  const bytes=await readFile(new URL('../../apps/web/'+SOLAR_APPEARANCE.atlas.path,import.meta.url));
  assert.equal(bytes.length,SOLAR_APPEARANCE.atlas.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),SOLAR_APPEARANCE.atlas.sha256);
});

test('FITS projection is centered, finite-distance and source-fixed, with north upwards', () => {
  const frame=SOLAR_APPEARANCE.frames[0], basis=solarFrameUniforms(frame);
  for(const a of [basis.axis,basis.right,basis.up]) assert.ok(Math.abs(norm(a)-1)<1e-12);
  assert.ok(Math.abs(dot(basis.axis,basis.up))<1e-12);
  const center=projectSolarSurface(basis.axis,frame);
  assert.ok(Math.abs(center.uv[0]-.5)<1e-12 && Math.abs(center.uv[1]-.5)<1e-12);
  assert.equal(center.coverage,1);
  const theta=.4;
  const west=projectSolarSurface(add(scale(basis.axis,Math.cos(theta)),scale(basis.right,Math.sin(theta))),frame);
  const north=projectSolarSurface(add(scale(basis.axis,Math.cos(theta)),scale(basis.up,Math.sin(theta))),frame);
  const expected=.5+Math.sin(theta)/(basis.observerRadius-Math.cos(theta))*basis.projection[2];
  assert.ok(Math.abs(west.uv[0]-expected)<1e-12);
  assert.ok(north.uv[1]<.5, 'north is the top of an unflipped browser texture');
  assert.equal(projectSolarSurface(scale(basis.axis,-1),frame).coverage,0);
  assert.equal(projectSolarSurface(basis.right,frame).coverage,0,'off-limb emission cannot become surface texture');
});

test('fixed reconstruction orientation avoids mixing Carrington and IAU W',()=>{
  const rotation=solarReferenceRotation([0,0,1],[0,1,0]);
  assert.deepEqual(rotation,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const frame0=solarFrameUniforms();
  frame0.axis.forEach((v,i)=>assert.ok(Math.abs(v-[0,0,1][i])<1e-12));
  frame0.right.forEach((v,i)=>assert.ok(Math.abs(v-[1,0,0][i])<1e-12));
  const frame1=solarFrameUniforms(SOLAR_APPEARANCE.frames[1]);
  assert.ok(frame1.axis[0]<0,'source observer rotates towards decreasing Carrington longitude');
  assert.throws(()=>solarReferenceRotation([0,0,1],[0,0,1]),/zero/);
});

test('reference playback is deterministic, clamped and independent of wall clock', () => {
  const at=solarPlayback(7.5);
  assert.deepEqual(at,solarPlayback(7.5));
  assert.ok(at.mix>0 && at.mix<1);
  assert.equal(solarPlayback(-100).mix,0);
  assert.equal(solarPlayback(100).mix,1);
  assert.equal(solarPlayback(7.5,{reducedMotion:true}).phase,0);
  assert.equal(solarPlayback(7.5,{reducedMotion:true}).mix,at.mix,'explicit source scrubbing still works');
  assert.equal(solarPlayback(0).sourceTime,SOLAR_APPEARANCE.frames[0].observed_at);
  assert.equal(solarPlayback(30).sourceTime,SOLAR_APPEARANCE.frames[1].observed_at);
  for(const value of [NaN,Infinity,-Infinity]) assert.throws(()=>solarPlayback(value),/finite/);
});

test('analytic rays retain photosphere occlusion and tangential limits', () => {
  assert.deepEqual(raySphereInterval([0,0,3],[0,0,-1],1),[2,4]);
  assert.equal(raySphereInterval([0,0,3],[1,0,0],1),null);
  assert.deepEqual(raySphereInterval([1,0,3],[0,0,-1],1),[3,3]);
  const front=solarVisibleInterval([0,0,3],[0,0,-1],1.35);
  assert.ok(Math.abs(front[0]-1.65)<1e-12);
  assert.equal(front[1],2,'integral ends at photosphere, never samples far-side loops');
  assert.equal(solarVisibleInterval([0,0,.5],[0,0,1],1.35),null,'camera inside opaque Sun cannot see through it');
  assert.throws(()=>raySphereInterval([0,0,3],[0,0,-2],1),/unit/);
});

test('loop field has finite extent, zero subsurface density and actual elevated emission', () => {
  const loop={normal:[0,0,1],tangent:[1,0,0],radius:.2,width:.008,gain:1};
  const apex=[0,0,Math.sqrt(1-.2*.2)+.2];
  assert.ok(solarLoopDensity(apex,[loop],0)>.5);
  assert.equal(solarLoopDensity([0,0,.99],[loop],0),0);
  assert.equal(solarLoopDensity([0,0,1.36],[loop],0),0);
  const v=integrateSolarEmission([0,0,3],[0,0,-1],[loop],0,128);
  assert.ok(v>0 && Number.isFinite(v));
  const hidden={...loop,normal:[0,0,-1]};
  assert.equal(integrateSolarEmission([0,0,3],[0,0,-1],[hidden],0,128),0);
  assert.ok(Math.abs(v-integrateSolarEmission([0,0,3],[0,0,-1],[loop],0,256))<.005);
});

test('per-arc intervals resolve thin off-limb emission within the bounded 32-step budget',()=>{
  const loop={normal:[1,0,0],tangent:[0,1,0],radius:.205,width:.008,gain:1};
  for(let theta=.2;theta<3;theta+=.07){
    const target=[Math.sqrt(1-loop.radius**2)+loop.radius*Math.sin(theta),loop.radius*Math.cos(theta),0];
    const ray=target.map((v,i)=>v-[0,0,3][i]),direction=scale(ray,1/norm(ray));
    const reference=integrateSolarEmission([0,0,3],direction,[loop],0,512);
    const bounded=integrateSolarEmission([0,0,3],direction,[loop],0,32);
    assert.ok(Math.abs(bounded-reference)<.00001,'full-volume stepping would stipple the thin limb arch');
  }
});

test('admitted modeled loops have orthonormal frames and remain inside declared extent',()=>{
  assert.equal(SOLAR_APPEARANCE.geometry.loops.length,12);
  for(const loop of SOLAR_APPEARANCE.geometry.loops){
    assert.ok(Math.abs(norm(loop.normal)-1)<1e-12);
    assert.ok(Math.abs(norm(loop.tangent)-1)<1e-12);
    assert.ok(Math.abs(dot(loop.normal,loop.tangent))<1e-12);
    assert.ok(Math.sqrt(1-loop.radius**2)+loop.radius+4*loop.width<1.35);
    assert.ok(loop.width>0&&loop.gain>0&&loop.gain<=1);
  }
});

test('whole-sphere arches stay in the volume, stay hidden through the disk, and move with the flow clock', () => {
  const loops=solarGlobalLoops();
  assert.equal(loops.length,12);
  assert.equal(SOLAR_ARCADE_COUNT,24);
  assert.ok(loops.some(loop=>loop.normal[2]<0),'arches continue onto the far hemisphere');
  assert.ok(loops.every(loop=>loop.role==='whole-sphere-model'&&loop.gain>0&&loop.gain<1));
  for(const loop of loops){
    assert.ok(Math.abs(norm(loop.normal)-1)<1e-12);
    assert.ok(Math.abs(norm(loop.tangent)-1)<1e-12);
    assert.ok(Math.abs(dot(loop.normal,loop.tangent))<1e-12);
    assert.ok(Math.sqrt(1-loop.radius**2)+loop.radius+4*loop.width<1.35);
  }
  const far=loops.find(loop=>loop.normal[2]<-0.5);
  const height=Math.sqrt(1-far.radius**2)+far.radius;
  const apex=far.normal.map(v=>v*height);
  const phases=[0,Math.PI/2,Math.PI,3*Math.PI/2];
  const samples=phases.map(phase=>solarLoopDensity(apex,[far],phase));
  const peak=phases[samples.indexOf(Math.max(...samples))];
  assert.ok(samples[phases.indexOf(peak)]>.2,'the arch is bright at some flow phase');
  assert.ok(Math.min(...samples)<Math.max(...samples)*.5,'the flow drops the same point well below its peak');
  assert.equal(integrateSolarEmission([0,0,3],[0,0,-1],[far],peak,128),0,'a far arch cannot shine through the photosphere');
  const origin=[0,0,-4];
  const ray=apex.map((v,i)=>v-origin[i]);
  const seen=integrateSolarEmission(origin,scale(ray,1/norm(ray)),[far],peak,128);
  assert.ok(seen>0,'the same arch is visible from the far side');
  assert.equal(solarFlowPhase(4,{reducedMotion:true}),0);
  assert.ok(solarFlowPhase(4)>0);
  assert.throws(()=>solarFlowPhase(NaN),/finite/);
  const flowing=solarRenderUniforms(7.5,{flowSeconds:4});
  assert.equal(flowing.loopGain.length,SOLAR_ARCADE_COUNT);
  assert.equal(flowing.frameMix,solarPlayback(7.5).mix);
  assert.equal(flowing.phase,solarFlowPhase(4));
  assert.equal(solarRenderUniforms(7.5,{reducedMotion:true,flowSeconds:4}).phase,0);
  assert.equal(solarRenderUniforms(7.5).phase,solarPlayback(7.5).phase,'omitted flow time keeps the source-scrub phase');
  assert.ok(flowing.loopGain.slice(12).every(gain=>gain===loops[0].gain));
  assert.ok(flowing.loopGain.slice(0,12).every((gain,i)=>gain===SOLAR_APPEARANCE.geometry.loops[i].gain));
  assert.equal(flowing.cme.progress,0.5);
  assert.equal(solarRenderUniforms(7.5).cme.progress,0);
});

test('tilted bipoles shear under the NSSDC differential-rotation law', () => {
  assert.ok(Math.abs(solarSiderealDegPerDay(0)-14.37)<1e-12);
  assert.ok(solarSiderealDegPerDay(0)>solarSiderealDegPerDay(Math.PI/3));
  const lon=v=>Math.atan2(v[2],v[0]);
  const gap=region=>{
    let d=lon(region.lead)-lon(region.trail);
    if(d<0)d+=Math.PI*2;
    if(d>Math.PI)d-=Math.PI*2;
    return d;
  };
  const start=solarActiveRegions(0)[0];
  const later=solarActiveRegions(SOLAR_ACTIVITY_SECONDS_PER_DAY*30)[0];
  assert.ok(gap(later)>gap(start)+0.05,'the higher-latitude footpoint lags');
  const moved=solarGlobalLoops(SOLAR_ACTIVITY_SECONDS_PER_DAY);
  const frozen=solarGlobalLoops(0);
  assert.ok(moved.some((loop,i)=>Math.abs(loop.normal[0]-frozen[i].normal[0])>1e-3),'a displayed day moves the arches');
  assert.equal(solarCme(10).progress,0);
  assert.ok(solarCme(4).progress>0.4&&solarCme(4).progress<0.6);
  assert.equal(solarCme(Number.NaN).progress,0);
});

test('EUV display mapping is finite and monotonic without calibrated color claims', () => {
  let prior=-1;
  for(let i=0;i<=255;i++){
    const rgb=solarDisplayColor(i/255), lum=dot(rgb,[.2126,.7152,.0722]);
    assert.ok(rgb.every(c=>Number.isFinite(c)&&c>=0&&c<=1));
    assert.ok(lum>=prior); prior=lum;
  }
  assert.deepEqual(solarDisplayColor(0),[0,0,0]);
  assert.match(SOLAR_APPEARANCE.color_interpretation,/false.color/i);
});

test('unobserved hemisphere uses the observed radial median, not a night side or a copied bright loop', async () => {
  const quiet=solarQuietProfile(()=>0.42);
  assert.equal(quiet.length,SOLAR_QUIET_BINS);
  assert.ok(quiet.every(value=>Math.abs(value-0.42)<1e-12));
  let spikes=0;
  const spiked=solarQuietProfile(uv=>{
    const angle=Math.atan2(uv[1]-.5,uv[0]-.5);
    if(angle>0&&angle<0.4){spikes++;return 1;}
    return 0.2;
  });
  assert.ok(spikes>0,'the bright sample is actually on the disk');
  assert.ok(spiked.every(value=>Math.abs(value-0.2)<1e-9),'one active-region spike does not set the far-side fill');
  const shader=await readFile(new URL('../../apps/web/js/solarVolumeShaders.js',import.meta.url),'utf8');
  assert.doesNotMatch(shader,/vec3\(\.065,\.039,\.015\)/);
  assert.match(shader,/quietIntensity/);
  assert.match(shader,/u_loopNormal\[24\]/);
  assert.match(shader,/arc<24/);
  const png=PNG.sync.read(await readFile(new URL('../../apps/web/'+SOLAR_APPEARANCE.atlas.path,import.meta.url)));
  const profiles=solarAtlasQuietProfiles(png.data,png.width,png.height);
  const bytes=solarQuietBytes(profiles);
  assert.equal(bytes.length,SOLAR_QUIET_BINS*2);
  for(const profile of profiles){
    assert.ok(profile.every(value=>value>0.05&&value<1),'the radial fill stays luminous across the disk');
    const center=profile[profile.length-1],limb=profile[4];
    assert.ok(limb>center,'AIA 171 quiet corona is brighter toward the limb than at disk center');
  }
  assert.ok(bytes[SOLAR_QUIET_BINS-1]>20,'far-side disk center is not the old dark material');
});
