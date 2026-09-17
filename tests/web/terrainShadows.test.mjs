import assert from 'node:assert/strict';
import test from 'node:test';
import {terrainShadowUniforms,terrainShadowVisibility} from '../../apps/web/js/terrainGeometry.js';

const D=Math.PI/180;
const grid=(ridge=false,prime=0)=>({width:720,height:360,referenceRadiusKm:1000,primeMeridianU:prime,
  heightsKm:Float32Array.from({length:720*360},(_,i)=>{
    const longitude=(((i%720+.5)/720-prime)*360+360)%360;
    return ridge&&longitude>2&&longitude<4?20:0;
  })});
const light=altitude=>[Math.sin(altitude*D),Math.cos(altitude*D),0];

test('flat sphere is self-shadow free at zenith, shallow daylight and exact tangent',()=>{
  for(const altitude of [90,30,1,0]) {
    const result=terrainShadowVisibility(grid(),[1000,0,0],light(altitude));
    assert.equal(result.visibility,1);
    assert.ok(result.steps<=64);
    assert.equal(result.truncated,false);
  }
  assert.equal(terrainShadowVisibility(grid(),[1000,0,0],[-1,0,0]).visibility,0);
});
test('known eastward ridge blocks low sunlight but clears high sunlight and westward rays',()=>{
  const g=grid(true);
  assert.equal(terrainShadowVisibility(g,[1000,0,0],light(5)).visibility,0);
  assert.equal(terrainShadowVisibility(g,[1000,0,0],light(40)).visibility,1);
  assert.equal(terrainShadowVisibility(g,[1000,0,0],[Math.sin(5*D),-Math.cos(5*D),0]).visibility,1);
});
test('source-projected ray origin avoids acne when a coarse triangle lies below reference terrain',()=>{
  const g=grid();g.heightsKm.fill(5);
  assert.equal(terrainShadowVisibility(g,[1004,0,0],light(90)).visibility,1);
  assert.equal(terrainShadowVisibility(g,[1004,0,0],light(0)).visibility,1);
});
test('longitude registration and seam remain invariant between equivalent source grids',()=>{
  for(const altitude of [0,5,20,40,90]) {
    assert.equal(terrainShadowVisibility(grid(true,0),[1000,0,0],light(altitude)).visibility,
      terrainShadowVisibility(grid(true,.5),[1000,0,0],light(altitude)).visibility);
  }
});
test('64-step approximation agrees with denser CPU sampling for the known ridge',()=>{
  const g=grid(true);
  for(const altitude of [0,5,10,40,60,90]) {
    const bounded=terrainShadowVisibility(g,[1000,0,0],light(altitude));
    const dense=terrainShadowVisibility(g,[1000,0,0],light(altitude),{maxSteps:4096});
    assert.equal(bounded.visibility,dense.visibility);
    assert.ok(bounded.steps<=64);
    assert.ok(Number.isFinite(bounded.stepKm));
  }
});
test('invalid physical inputs fail closed and helper supplies physical units and pole means',()=>{
  const g=grid(true),u=terrainShadowUniforms(g);
  assert.deepEqual(u.shape,[1000,1000,1020,0]);
  assert.equal(u.poles.length,2);
  assert.ok(u.nativeCellKm>8&&u.nativeCellKm<9);
  assert.ok(u.biasKm>=.002&&u.biasKm<=.05);
  assert.throws(()=>terrainShadowVisibility(g,[0,0,0],light(5)),/surface|radius/i);
  assert.throws(()=>terrainShadowVisibility(g,[1000,0,0],[0,0,0]),/direction/i);
  assert.throws(()=>terrainShadowVisibility(g,[1000,0,0],light(5),{maxSteps:0}),/steps/i);
  g.heightsKm[0]=NaN;
  assert.throws(()=>terrainShadowUniforms(g),/finite|coverage/i);
});
