// Recovered from SOL Planet Look Lab v7, source 12f633b27e435479f4b2322b613f8dd204847d2e.
// Display recipe only; not measured weather or optical transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EARTH_CLOUD_RADIUS,cloudShellPoint,cloudShadowPoint,advanceEarthCloudPhase,gradeOcean} from '../../apps/web/js/earthLookClouds.js';

test('cloud shell lies above the ground, including just beyond its limb',()=>{
 const p=cloudShellPoint(.6,.2);assert.ok(p);
 assert.ok(p[2]*EARTH_CLOUD_RADIUS>Math.sqrt(1-.36-.04));
 assert.ok(cloudShellPoint(1.0005,0));
 assert.equal(cloudShellPoint(EARTH_CLOUD_RADIUS+.001,0),null);
 assert.ok(Math.abs(Math.hypot(...p)-1)<1e-12);
});
test('cloud shadows intersect the same shell and follow opposite Sun directions',()=>{
 const a=cloudShadowPoint([0,0,1],[.8,0,.6]);
 const b=cloudShadowPoint([0,0,1],[-.8,0,.6]);
 assert.ok(a[0]>0&&b[0]<0);assert.ok(Math.abs(a[0]+b[0])<1e-12);
 assert.ok(Math.abs(Math.hypot(...a)-1)<1e-12);
 assert.deepEqual(cloudShadowPoint([0,0,1],[0,0,1]),[0,0,1]);
 assert.ok(cloudShadowPoint([1,0,0],[0,0,1]).every(Number.isFinite));
});
test('independent drift advances only with rotation and stays bounded after suspension',()=>{
 assert.equal(advanceEarthCloudPhase(.3,1,1,false),.3);
 assert.equal(advanceEarthCloudPhase(.3,1,1,true,true),.3);
 assert.equal(advanceEarthCloudPhase(.3,0,1,true),.3);
 const normal=advanceEarthCloudPhase(.3,.05,1,true);
 assert.ok(normal>.3&&normal<.301);
 assert.ok(advanceEarthCloudPhase(.3,100000,1,true)-.3<.001);
 assert.ok(advanceEarthCloudPhase(.999999,.1,20,true)<1);
});
test('cloud drift is visible relative to the ground over ten seconds of playback',()=>{
 let phase=0;for(let i=0;i<200;i++)phase=advanceEarthCloudPhase(phase,.05,1,true);
 // At least 8 degrees in ten seconds; still slower than the globe's 31.5 degrees.
 assert.ok(phase*360>=8&&phase*360<20,`relative drift: ${phase*360} degrees`);
 let reverse=0;for(let i=0;i<200;i++)reverse=advanceEarthCloudPhase(reverse,.05,-1,true);
 assert.ok(Math.abs(phase+reverse-1)<1e-10);
});
test('ocean grading leaves land and neutral ice unchanged and deepens blue water',()=>{
 assert.deepEqual(gradeOcean([.02,.04,.13],0),[.02,.04,.13]);
 assert.deepEqual(gradeOcean([.8,.8,.8],1),[.8,.8,.8]);
 assert.deepEqual(gradeOcean([.16,.11,.03],1),[.16,.11,.03]);
 const water=gradeOcean([.02,.04,.13],1);
 assert.ok(water[2]<.13&&water[2]/water[0]<.13/.02);
});
