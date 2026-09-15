import test from 'node:test';import assert from 'node:assert/strict';
import {requestTerrainMesh} from '../../apps/web/js/terrainWorkerClient.js';
const fake=()=>({onmessage:null,onerror:null,terminated:false,postMessage(v){this.sent=v;},terminate(){this.terminated=true;}});
test('aborting terrain work terminates its worker and prevents publication',async()=>{
  const w=fake(),c=new AbortController();
  const p=requestTerrainMesh('Moon',2,{equatorialRadiusKm:1737.4,polarRadiusKm:1737.4},{signal:c.signal,workerFactory:()=>w});
  assert.equal(w.sent.body,'Moon');c.abort();await assert.rejects(p,/aborted/i);assert.equal(w.terminated,true);
});
test('terrain worker rejects mismatched identity and preserves caller data',async()=>{
  const w=fake(),input={equatorialRadiusKm:1737.4,polarRadiusKm:1737.4};
  const p=requestTerrainMesh('Moon',2,input,{workerFactory:()=>w});
  w.onmessage({data:{body:'Mars',level:2,mesh:{}}});
  await assert.rejects(p,/identity/);assert.equal(w.terminated,true);assert.deepEqual(input,{equatorialRadiusKm:1737.4,polarRadiusKm:1737.4});
});
test('terrain worker has a finite deadline and rejects invalid body before launch',async()=>{
  const w=fake();await assert.rejects(requestTerrainMesh('Moon',1,{equatorialRadiusKm:1,polarRadiusKm:1},{workerFactory:()=>w,timeoutMs:5}),/timed out/);
  assert.equal(w.terminated,true);
  assert.throws(()=>requestTerrainMesh('Sun',1,{equatorialRadiusKm:1,polarRadiusKm:1},{workerFactory:()=>{throw Error('launched');}}),/request/);
});
test('failed terrain postMessage terminates the worker and cancels its lifetime',async()=>{
  const w=fake();w.postMessage=()=>{throw new Error('clone failure');};
  await assert.rejects(requestTerrainMesh('Moon',1,{equatorialRadiusKm:1737.4,polarRadiusKm:1737.4},{workerFactory:()=>w}),/submitted/);
  assert.equal(w.terminated,true);
});
