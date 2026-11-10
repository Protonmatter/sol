import test from 'node:test';
import assert from 'node:assert/strict';
import {afterObservationPaint} from '../../apps/web/js/offlineBoot.js';
function fixture(initial='loading'){
  let listener,status=initial,installs=0,errors=0,id=0;const frames=new Map();
  const media={get media(){return status;},subscribe(fn){listener=fn;fn(status);return()=>{listener=null;};}};
  const options={media,install:()=>{installs++;},onError:()=>{errors++;},requestFrame:fn=>{frames.set(++id,fn);return id;},cancelFrame:id=>frames.delete(id)};
  return {options,frames,get installs(){return installs;},get errors(){return errors;},get subscribed(){return !!listener;},
    publish(next){status=next;listener?.(next);},paint(){const batch=[...frames];frames.clear();for(const [,fn]of batch)fn();}};
}
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test('offline installation waits for two animation frames after ready observation',async()=>{
  const f=fixture();afterObservationPaint(f.options);f.paint();await tick();assert.equal(f.installs,0);
  f.publish('ready');f.paint();await tick();assert.equal(f.installs,0);f.paint();await tick();assert.equal(f.installs,1);assert.equal(f.subscribed,false);
  f.publish('ready');f.paint();f.paint();await tick();assert.equal(f.installs,1);
});
test('already-ready media still receives a paint opportunity',async()=>{
  const f=fixture('ready');afterObservationPaint(f.options);assert.equal(f.installs,0);f.paint();assert.equal(f.installs,0);f.paint();await tick();assert.equal(f.installs,1);
});
test('failure cancels queued installation; successful image Retry starts a new paint wait',async()=>{
  const f=fixture('ready');afterObservationPaint(f.options);f.paint();f.publish('failed');assert.equal(f.frames.size,0);f.paint();await tick();assert.equal(f.installs,0);
  f.publish('ready');f.paint();f.paint();await tick();assert.equal(f.installs,1);
});
test('explicit cancellation releases subscription and queued frames',async()=>{
  const f=fixture('ready'),cancel=afterObservationPaint(f.options);cancel();cancel();f.paint();f.paint();await tick();assert.equal(f.installs,0);assert.equal(f.subscribed,false);assert.equal(f.frames.size,0);
});
for(const asynchronous of [false,true])test(`installation ${asynchronous?'rejection':'throw'} is observed`,async()=>{
  const f=fixture('ready');f.options.install=()=>{if(asynchronous)return Promise.reject(new Error('unavailable'));throw new Error('unavailable');};
  afterObservationPaint(f.options);f.paint();f.paint();await tick();assert.equal(f.errors,1);assert.equal(f.subscribed,false);
});
