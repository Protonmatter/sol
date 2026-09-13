import test from 'node:test';
import assert from 'node:assert/strict';
import { physicalCameraPosition, terrainDetailLevel, advanceReferencePlayback, createDetailCache } from '../../apps/web/js/physicalRendering.js';

test('physical camera ignores display enlargement and translates into orthonormal body frame',()=>{
  const r=[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1];
  assert.deepEqual(physicalCameraPosition([12,24,36],[10,20,30],r,2,1000),[2000,-1000,3000]);
  assert.deepEqual(physicalCameraPosition([14,28,42],[10,20,30],r,4,1000),[2000,-1000,3000]);
  assert.throws(()=>physicalCameraPosition([1,2,3],[0,0,0],r,0,1000));
});
test('terrain detail is finite and capped independently of arbitrary zoom',()=>{
  assert.equal(terrainDetailLevel(4),0); assert.equal(terrainDetailLevel(100),1);
  assert.equal(terrainDetailLevel(600),2); assert.equal(terrainDetailLevel(2000),3);
  assert.equal(terrainDetailLevel(Infinity),0); assert.equal(terrainDetailLevel(-1),0);
});
test('reference playback is bounded and separate from orbit time and frame partitions',()=>{
  const s={seconds:0,playing:true,duration:20};
  assert.deepEqual(advanceReferencePlayback(s,30),{seconds:20,playing:false,duration:20});
  assert.deepEqual(advanceReferencePlayback(s,1,{reducedMotion:true}),{seconds:0,playing:false,duration:20});
  assert.deepEqual(advanceReferencePlayback(s,1,{active:false}),s);
  assert.equal(advanceReferencePlayback(advanceReferencePlayback(s,0.25),0.75).seconds,advanceReferencePlayback(s,1).seconds);
  assert.throws(()=>advanceReferencePlayback(s,NaN));
});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('bounded cache aborts evicted work and rejects late completions across disposal',async()=>{
  const releases=[],pending=new Map();
  const cache=createDetailCache({capacity:2,load:(key,signal)=>new Promise(resolve=>pending.set(key,{signal,resolve})),release:v=>releases.push(v)});
  cache.request('a'); cache.request('b'); cache.request('c');
  assert.equal(pending.get('a').signal.aborted,true); assert.equal(cache.size,2);
  pending.get('a').resolve('late-a'); pending.get('b').resolve('ready-b'); await settle();
  assert.equal(cache.get('a'),null); assert.equal(cache.get('b'),'ready-b');
  cache.dispose(); pending.get('c').resolve('late-c'); await settle();
  assert.equal(cache.size,0); assert.deepEqual(releases.sort(),['late-a','late-c','ready-b']);
});
test('failed detail stays explicit and does not retry continuously each paint',async()=>{
  let calls=0;const cache=createDetailCache({capacity:1,load:async()=>{calls++;throw new Error('bad hash');}});
  cache.request('Moon'); await settle(); cache.request('Moon'); await settle();
  assert.equal(cache.status('Moon'),'unavailable'); assert.equal(calls,1);
  cache.retry('Moon'); await settle(); assert.equal(calls,2);
  cache.dispose();
});
test('evicting the final resident detail publishes deferred instead of stale readiness',async()=>{
  const status=new Map(),released=[];
  const cache=createDetailCache({capacity:2,load:async key=>key,release:value=>released.push(value),onChange:(key,value)=>status.set(key,value)});
  await cache.request('Moon:1');await cache.request('Mars:1');await cache.request('Mars:2');
  assert.equal(cache.get('Moon:1'),null);assert.equal(status.get('Moon:1'),'deferred');
  assert.deepEqual(released,['Moon:1']);cache.dispose();
  assert.equal(status.get('Mars:1'),'deferred');assert.equal(status.get('Mars:2'),'deferred');
});
test('suspending detail work aborts loading entries but retains completed resources',async()=>{
  const pending=new Map(),released=[];
  const cache=createDetailCache({capacity:2,load:(key,signal)=>new Promise(resolve=>pending.set(key,{signal,resolve})),release:value=>released.push(value)});
  const ready=cache.request('ready');pending.get('ready').resolve('resident');await ready;
  const old=cache.request('pending'),oldRequest=pending.get('pending');cache.abortPending();
  assert.equal(pending.get('pending').signal.aborted,true);
  assert.equal(cache.status('pending'),'deferred');assert.equal(cache.get('ready'),'resident');
  const fresh=cache.request('pending'),freshRequest=pending.get('pending');
  // The old task is allowed to ignore cancellation: its result must still be released.
  assert.equal(freshRequest.signal.aborted,false);
  oldRequest.resolve('late-old');await old;assert.equal(cache.status('pending'),'loading');
  cache.abortPending();freshRequest.resolve('late-fresh');await fresh;
  assert.deepEqual(released,['late-old','late-fresh']);assert.equal(cache.get('ready'),'resident');
  cache.dispose();
});
