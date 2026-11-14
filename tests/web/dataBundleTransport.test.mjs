import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {readDataBundle,BUNDLE_TIMEOUT_MS} from '../../apps/web/js/dataBundle.js';

const pointerUrl='https://bundle.invalid/data/current.json';
const never=()=>new Promise(()=>{});
const response=url=>new Response(fs.readFileSync(new URL('../../apps/web/'+new URL(url).pathname.slice(1),import.meta.url)));
async function outcome(job){
  let timer;
  try{return await Promise.race([job.then(value=>({state:'fulfilled',value}),error=>({state:'rejected',error})),
    new Promise(resolve=>{timer=setTimeout(()=>resolve({state:'pending'}),2000);})]);}
  finally{clearTimeout(timer);}
}
const rejected=result=>{assert.equal(result.state,'rejected','Bundle operation must settle without an external watchdog');return result.error;};

test('bundle deadline aborts a fetch that ignores its signal',async()=>{
  let signal;
  const result=await outcome(readDataBundle({pointerUrl,timeoutMs:20,crypto:webcrypto,fetcher:(_url,options)=>{signal=options.signal;return never();}}));
  assert.match(rejected(result).message,/deadline|timed out/i);
  assert.equal(signal.aborted,true);
});

test('bundle deadline settles a stalled stream without awaiting nonsettling cancellation',async()=>{
  let cancelled=0,released=0,signal;
  const reader={read:never,cancel(){cancelled++;return never();},releaseLock(){released++;}};
  const result=await outcome(readDataBundle({pointerUrl,timeoutMs:20,crypto:webcrypto,
    fetcher:async(_url,options)=>{signal=options.signal;return {ok:true,body:{getReader:()=>reader}};}}));
  assert.match(rejected(result).message,/deadline|timed out/i);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(signal.aborted,true);assert.equal(cancelled,1);assert.equal(released,1);
});

test('bundle byte overflow rejects promptly even when reader cancellation never settles',async()=>{
  let cancelled=0,released=0;
  const reader={read:async()=>({done:false,value:new Uint8Array(16*1024*1024+1)}),cancel(){cancelled++;return never();},releaseLock(){released++;}};
  const result=await outcome(readDataBundle({pointerUrl,crypto:webcrypto,fetcher:async()=>({ok:true,body:{getReader:()=>reader}})}));
  assert.match(rejected(result).message,/byte limit/);
  assert.equal(cancelled,1);assert.equal(released,1);
});

test('the bundle budget includes hashing that never completes',async()=>{
  let requests=0,signal,deadline,hashCalls=0;
  const nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout,handle={};
  // Deliver the actual deadline callback at the hash boundary. Fetch/stream
  // startup latency cannot make this pass before the hash has been reached.
  globalThis.setTimeout=(callback,ms,...args)=>{
    if(ms===BUNDLE_TIMEOUT_MS){deadline=()=>callback(...args);return handle;}
    return nativeSet(callback,ms,...args);
  };
  globalThis.clearTimeout=value=>{if(value!==handle)nativeClear(value);};
  try{
    const result=await outcome(readDataBundle({pointerUrl,crypto:{subtle:{digest(){
      hashCalls++;assert.equal(typeof deadline,'function');deadline();return never();
    }}},fetcher:async(url,options)=>{requests++;signal=options.signal;return response(url);}}));
    assert.match(rejected(result).message,/deadline|timed out/i);
    assert.equal(hashCalls,1);assert.equal(requests,2);assert.equal(signal.aborted,true);
  }finally{globalThis.setTimeout=nativeSet;globalThis.clearTimeout=nativeClear;}
});

test('external cancellation closes a late response and cannot start another bundle request',async()=>{
  const controller=new AbortController();let resolveFetch,requests=0,lateCancelled=0;
  const job=readDataBundle({pointerUrl,signal:controller.signal,crypto:webcrypto,
    fetcher:()=>{requests++;return new Promise(resolve=>{resolveFetch=resolve;});}});
  controller.abort();const result=await outcome(job);
  assert.equal(rejected(result).name,'AbortError');
  const late=response(pointerUrl),cancel=late.body.cancel.bind(late.body);
  late.body.cancel=(...args)=>{lateCancelled++;return cancel(...args);};
  resolveFetch(late);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1);assert.equal(lateCancelled,1);
});

test('an already cancelled bundle cannot start transport',async()=>{
  const controller=new AbortController();controller.abort();let requests=0;
  const result=await outcome(readDataBundle({pointerUrl,signal:controller.signal,crypto:webcrypto,
    fetcher:async()=>{requests++;throw Error('Transport must not start');}}));
  assert.equal(rejected(result).name,'AbortError');assert.equal(requests,0);
});

test('the deadline covers the whole transaction rather than restarting per component',async()=>{
  let requests=0;
  const result=await outcome(readDataBundle({pointerUrl,timeoutMs:25,crypto:webcrypto,fetcher:async url=>{
    requests++;await new Promise(resolve=>setTimeout(resolve,15));return response(url);
  }}));
  assert.match(rejected(result).message,/deadline|timed out/i);assert.ok(requests<=2);
});

test('invalid bundle deadlines fail before any transport',async()=>{
  for(const timeoutMs of [0,-1,1.5,30001,NaN,Infinity,null,'20']){
    let requests=0;
    await assert.rejects(readDataBundle({pointerUrl,timeoutMs,crypto:webcrypto,fetcher:async()=>{requests++;throw Error('Unexpected fetch');}}),RangeError);
    assert.equal(requests,0);
  }
});

test('a complete real bundle keeps its identities and releases the caller abort listener',async()=>{
  const controller=new AbortController();let added=0,removed=0,internal;
  const add=controller.signal.addEventListener.bind(controller.signal),remove=controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener=(...args)=>{added++;return add(...args);};
  controller.signal.removeEventListener=(...args)=>{removed++;return remove(...args);};
  const bundle=await readDataBundle({pointerUrl,signal:controller.signal,crypto:webcrypto,
    fetcher:async(url,options)=>{internal=options.signal;return response(url);}});
  assert.equal(bundle.bundleId,JSON.parse(await response(pointerUrl).text()).bundle_id);
  assert.ok(Object.isFrozen(bundle)&&Object.isFrozen(bundle.snapshot));
  assert.equal(added,1);assert.equal(removed,1);assert.equal(internal.aborted,false);
  controller.abort();assert.equal(internal.aborted,false,'Completed work no longer follows its caller');
});
