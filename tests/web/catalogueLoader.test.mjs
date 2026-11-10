import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogueLoader} from '../../apps/web/js/catalogueLoader.js';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function clock(){let time=0,id=0;const timers=new Map();return{now:()=>time,setTimer:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimer:key=>timers.delete(key),get pending(){return timers.size;},advance(ms,run=true){time+=ms;if(run)for(const[key,item]of [...timers])if(item.at<=time){timers.delete(key);item.fn();}}};}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test('one owned request is shared and a ready catalogue is reused',async()=>{
  const time=clock(),source=deferred();let calls=0;
  const loader=createCatalogueLoader({load:()=>{calls++;return source.promise;},...time});
  assert.equal(loader.status,'idle');const a=loader.request();assert.equal(loader.request(),a);assert.equal(loader.status,'loading');
  await flush();assert.equal(calls,1);source.resolve({catalogue:true});const value=await a;
  assert.equal(loader.status,'ready');assert.equal(loader.value,value);assert.equal(await loader.request(),value);assert.equal(calls,1);assert.equal(time.pending,0);
  loader.cancel();assert.equal(loader.status,'ready');
});

test('rejection is visible and a later attempt can recover',async()=>{
  const time=clock();let calls=0;const error=Error('transfer failed');
  const loader=createCatalogueLoader({load:()=>++calls===1?Promise.reject(error):{recovered:true},...time});
  await assert.rejects(loader.request(),error);assert.equal(loader.status,'failed');assert.equal(loader.error,error);assert.equal(time.pending,0);
  loader.cancel();assert.equal(loader.status,'failed');assert.deepEqual(await loader.request(),{recovered:true});assert.equal(loader.status,'ready');assert.equal(loader.error,null);
});

for(const late of ['resolve','reject'])test(`cancellation settles promptly and late ${late} cannot replace the next attempt`,async()=>{
  const time=clock(),a=deferred(),b=deferred();let calls=0;
  const loader=createCatalogueLoader({load:()=>++calls===1?a.promise:b.promise,...time});
  const cancelled=assert.rejects(loader.request(),{name:'AbortError'});await flush();loader.cancel();await cancelled;assert.equal(loader.status,'idle');assert.equal(time.pending,0);
  const next=loader.request();await flush();a[late](late==='reject'?Error('late failure'):{obsolete:true});await flush();assert.equal(loader.status,'loading');
  b.resolve({current:true});assert.deepEqual(await next,{current:true});assert.equal(loader.status,'ready');assert.equal(time.pending,0);
});

test('cancellation before the import starts does not launch a transfer',async()=>{
  const time=clock();let calls=0;const loader=createCatalogueLoader({load:()=>{calls++;},...time});
  const cancelled=assert.rejects(loader.request(),{name:'AbortError'});loader.cancel();await cancelled;await flush();assert.equal(calls,0);assert.equal(time.pending,0);
});

for(const elapsed of [30000,31000])test(`settlement at ${elapsed} ms fails even before the timer callback`,async()=>{
  const time=clock(),source=deferred(),loader=createCatalogueLoader({load:()=>source.promise,...time});
  const failed=assert.rejects(loader.request(),/deadline/);await flush();time.advance(elapsed,false);source.resolve({tooLate:true});await failed;
  assert.equal(loader.status,'failed');assert.equal(loader.value,null);assert.equal(time.pending,0);
});

for(const late of ['resolve','reject'])test(`deadline failure owns its outcome despite late ${late} during retry`,async()=>{
  const time=clock(),a=deferred(),b=deferred();let calls=0;
  const loader=createCatalogueLoader({load:()=>++calls===1?a.promise:b.promise,...time});
  const failed=assert.rejects(loader.request(),/deadline/);await flush();time.advance(30000);await failed;assert.equal(loader.status,'failed');
  const next=loader.request();await flush();a[late](late==='reject'?Error('late'):{obsolete:true});await flush();assert.equal(loader.status,'loading');
  b.resolve({current:true});assert.deepEqual(await next,{current:true});assert.equal(time.pending,0);
});

test('synchronous import errors settle the owned request',async()=>{
  const time=clock(),loader=createCatalogueLoader({load(){throw Error('synchronous import failure');},...time});
  await assert.rejects(loader.request(),/synchronous import failure/);assert.equal(loader.status,'failed');assert.equal(time.pending,0);
});

test('invalid loader configuration fails explicitly',()=>{
  assert.throws(()=>createCatalogueLoader({load:null}),TypeError);
  for(const timeoutMs of [0,-1,Infinity,NaN,0.5])assert.throws(()=>createCatalogueLoader({load:()=>{},timeoutMs}),RangeError);
});
