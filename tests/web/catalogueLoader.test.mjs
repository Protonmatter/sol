import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogueLoader,createDocumentRecovery} from '../../apps/web/js/catalogueLoader.js';

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

// A browser keeps a failed module fetch for the life of the document, so these loaders reject
// every time, exactly as a repeated import() of the same URL does.
test('an explicit retry that fails again reloads the document once the module is reachable',async()=>{
  const time=clock(),error=Error('transfer failed'),recoveries=[];let calls=0;
  const loader=createCatalogueLoader({load:()=>{calls++;return Promise.reject(error);},recover:async()=>{recoveries.push(calls);return true;},...time});
  await assert.rejects(loader.request({recover:true}),error);
  assert.deepEqual(recoveries,[],'a first failure is reported, never answered with a reload');
  const retry=loader.request({recover:true});let settled=false;retry.then(()=>{settled=true;},()=>{settled=true;});
  await flush();await flush();
  assert.deepEqual(recoveries,[2]);assert.equal(settled,false);assert.equal(loader.status,'loading','the page is being replaced');
  // If the reload never happens, the ordinary deadline still ends the attempt.
  time.advance(30000);await assert.rejects(retry,/deadline/);assert.equal(loader.status,'failed');assert.equal(time.pending,0);
});

test('an unreachable module leaves the page in place and reports the import failure',async()=>{
  for(const recover of [async()=>false,async()=>{throw Error('probe failed');},async()=>'yes']){
    const time=clock(),error=Error('transfer failed');
    const loader=createCatalogueLoader({load:()=>Promise.reject(error),recover,...time});
    await assert.rejects(loader.request({recover:true}),error);
    await assert.rejects(loader.request({recover:true}),error);
    assert.equal(loader.status,'failed');assert.equal(loader.error,error);assert.equal(time.pending,0);
  }
});

test('only an explicit retry may reload: automatic requests and loaders without recovery never do',async()=>{
  const time=clock(),error=Error('transfer failed');let recoveries=0;
  const loader=createCatalogueLoader({load:()=>Promise.reject(error),recover:async()=>{recoveries++;return true;},...time});
  for(let i=0;i<3;i++)await assert.rejects(loader.request(),error);
  assert.equal(recoveries,0);
  const plain=createCatalogueLoader({load:()=>Promise.reject(error),...time});
  for(let i=0;i<2;i++)await assert.rejects(plain.request({recover:true}),error);
  assert.throws(()=>createCatalogueLoader({load(){},recover:'reload'}),TypeError);
});

test('a retry that succeeds, or a deadline with the import still in flight, never reloads',async()=>{
  const time=clock();let calls=0,recoveries=0;
  const loader=createCatalogueLoader({load:()=>++calls===1?Promise.reject(Error('transfer failed')):{recovered:true},recover:async()=>{recoveries++;return true;},...time});
  await assert.rejects(loader.request({recover:true}),/transfer failed/);
  assert.deepEqual(await loader.request({recover:true}),{recovered:true});assert.equal(recoveries,0);
  const slow=deferred(),late=createCatalogueLoader({load:()=>slow.promise,recover:async()=>{recoveries++;return true;},...time});
  const first=late.request({recover:true});await flush();time.advance(30000);await assert.rejects(first,/deadline/);
  const second=late.request({recover:true});await flush();slow.resolve({arrived:true});assert.deepEqual(await second,{arrived:true});
  assert.equal(recoveries,0,'a timeout is not a rejected import');
});

test('a rejection that arrives after cancellation still counts toward the next explicit retry',async()=>{
  const time=clock(),first=deferred(),error=Error('transfer failed');let calls=0,recoveries=0;
  const loader=createCatalogueLoader({load:()=>++calls===1?first.promise:Promise.reject(error),recover:async()=>{recoveries++;return true;},...time});
  const cancelled=assert.rejects(loader.request(),{name:'AbortError'});await flush();loader.cancel();await cancelled;
  first.reject(error);await flush();
  void loader.request({recover:true}).catch(()=>{});await flush();await flush();
  assert.equal(recoveries,1);
});

test('document recovery probes every module without the HTTP cache and reloads only when all respond',async()=>{
  const seen=[];let reloads=0;
  const recovery=responses=>createDocumentRecovery({urls:()=>['https://example.test/sol/js/a.js','https://example.test/sol/js/b.js'],
    fetchModule:async(url,init)=>{seen.push([url,init.cache]);const next=responses.shift();if(next instanceof Error)throw next;return next;},reload:()=>{reloads++;}});
  assert.equal(await recovery([{ok:true},{ok:true}])(),true);assert.equal(reloads,1);
  assert.deepEqual(seen,[['https://example.test/sol/js/a.js','no-store'],['https://example.test/sol/js/b.js','no-store']]);
  // HTTP 409 is what the service worker answers offline; 404 is a release that has been replaced.
  for(const responses of [[{ok:false,status:409}],[{ok:true},{ok:false,status:404}],[null],[{ok:'true'}]]){
    assert.equal(await recovery(responses)(),false);assert.equal(reloads,1);
  }
  await assert.rejects(recovery([new TypeError('Failed to fetch')])(),/Failed to fetch/);assert.equal(reloads,1);
  assert.throws(()=>createDocumentRecovery({urls:['a.js']}),TypeError);
});
