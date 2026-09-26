// Recovered from SOL Planet Look Lab v7, source 12f633b27e435479f4b2322b613f8dd204847d2e.
// Display recipe only; not measured weather or optical transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as earth from '../../apps/web/js/earthLookClouds.js';

test('display density removes weak haze while preserving structured cloud cores',()=>{
 assert.equal(typeof earth.volumeCloudOpacity,'function');
 assert.equal(earth.volumeCloudOpacity(.06),0);
 assert.ok(earth.volumeCloudOpacity(.3)<.15);
 assert.ok(earth.volumeCloudOpacity(.6)<.4);
 assert.ok(earth.volumeCloudOpacity(.95)>.75);
 assert.ok(earth.volumeCloudOpacity(1)<1);
 for(let i=1;i<=100;i++)assert.ok(earth.volumeCloudOpacity(i/100)>=earth.volumeCloudOpacity((i-1)/100));
});

test('cloud texture relief responds to the Sun without changing uniform cloud brightness',()=>{
 assert.equal(typeof earth.cloudTextureLighting,'function');
 const p=[0,0,1],east=[.8,0,.6],west=[-.8,0,.6];
 assert.equal(earth.cloudTextureLighting(p,east,()=>.7),1);
 const ridge=q=>Math.max(0,Math.min(1,.65+q[0]*45));
 assert.ok(earth.cloudTextureLighting(p,east,ridge)<1);
 assert.ok(earth.cloudTextureLighting(p,west,ridge)>1);
 assert.equal(earth.cloudTextureLighting(p,[0,0,-1],ridge),1);
});
test('cloud texture shading stays bounded at poles, limb and face-on illumination',()=>{
 const patch=p=>Math.max(0,Math.min(1,.6+.4*Math.sin(p[0]*250)));
 for(const p of [[0,1,0],[0,-1,0],[1,0,0],[0,0,1]]){
  for(const light of [[0,0,1],[0,1,0],[0,-1,0],[.8,0,.6]]){
   const value=earth.cloudTextureLighting(p,light,patch);
   assert.ok(Number.isFinite(value)&&value>=.42-1e-12&&value<=1.18+1e-12);
  }
 }
});
test('texture relief has no directional pinch at the subsolar point',()=>{
 const ridge=q=>Math.max(0,Math.min(1,.65+q[0]*45));
 for(const x of [0,.00002,-.00002,.02])for(const y of [0,.00002,-.00002,.02]){
  const n=[x,y,Math.sqrt(1-x*x-y*y)];
  assert.ok(Math.abs(earth.cloudTextureLighting(n,[0,0,1],ridge,.00857)-1)<1e-10);
 }
});

test('cloud volume remains transparent with no coverage, including limb and poles',()=>{
 assert.equal(typeof earth.sampleCloudVolume,'function');
 for(const [x,y] of [[0,0],[.3,.8],[0,1],[1.0005,0],[1.1,0]]){
  const result=earth.sampleCloudVolume(x,y,[0,0,1],()=>0);
  assert.equal(result.opacity,0);assert.equal(result.radiance,0);
 }
});
test('density stays above ground and denser clouds grow taller',()=>{
 assert.equal(typeof earth.cloudDensity,'function');
 assert.equal(earth.cloudDensity(1,.9),0);
 assert.equal(earth.cloudDensity(1.01,.9),0);
 assert.equal(earth.cloudDensity(1+8/6378.137,.05),0);
 assert.ok(earth.cloudDensity(1+8/6378.137,.95)>0);
});
test('volume is finite at grazing angles and opacity converges with sample count',()=>{
 assert.equal(typeof earth.sampleCloudVolume,'function');
 for(const [x,y] of [[0,0],[.98,0],[0,1],[1.0005,0],[0,-1]]){
  const a=earth.sampleCloudVolume(x,y,[.8,0,.6],()=>.65,12);
  const b=earth.sampleCloudVolume(x,y,[.8,0,.6],()=>.65,24);
  assert.ok(a.opacity>=0&&a.opacity<=1);assert.ok(Number.isFinite(a.radiance));
  assert.ok(Math.abs(a.opacity-b.opacity)<.08);
 }
});
test('ground shadows use the current density field and stay bounded',()=>{
 assert.equal(typeof earth.cloudTransmission,'function');
 assert.equal(earth.cloudTransmission([0,0,1],[0,0,1],()=>0),1);
 const dense=earth.cloudTransmission([0,0,1],[0,0,1],()=>.95);
 const thin=earth.cloudTransmission([0,0,1],[0,0,1],()=>.2);
 assert.ok(dense>=0&&dense<thin&&thin<1);
 const patch=p=>p[0]>0?.9:0;
 assert.ok(earth.cloudTransmission([0,0,1],[.8,0,.6],patch)<.5);
 assert.equal(earth.cloudTransmission([0,0,1],[-.8,0,.6],patch),1);
});
test('dense clouds do not acquire an artificial brightness step at the ground silhouette',()=>{
 const a=earth.sampleCloudVolume(1-1e-8,0,[0,0,1],()=>.95,12,4);
 const b=earth.sampleCloudVolume(1+1e-8,0,[0,0,1],()=>.95,12,4);
 assert.ok(Math.abs(a.radiance-b.radiance)<.015,`${a.radiance} → ${b.radiance}`);
});
