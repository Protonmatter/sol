import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewLoader} from '../../apps/web/js/viewLoader.js';

const held=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness(options={}){
  const requests=[],entered=[],states=[],timers=new Map();let time=0,id=0;
  const loader=createViewLoader({loaders:{sky:()=>{const task=held();requests.push(task);return task.promise;},orrery:async()=>({name:'orrery'})},
    onReady:async(name,module,owner)=>{assert.equal(owner.isCurrent(),true);entered.push(name);},onState:value=>states.push(value),
    timeoutMs:30,now:()=>time,setTimer:(fn)=>{timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id),...options});
  return {loader,requests,entered,states,timers,advance(ms){time+=ms;for(const fn of [...timers.values()])fn();}};
}
test('only the latest selected module enters; cancelled activation resolves null',async()=>{
  const h=harness(),first=h.loader.activate('sky');await tick();
  const second=h.loader.activate('orrery');h.requests[0].resolve({name:'sky'});
  assert.equal(await first,null);assert.deepEqual(await second,{name:'orrery'});assert.deepEqual(h.entered,['orrery']);
  assert.equal(h.loader.state.status,'ready');assert.equal(h.timers.size,0);
});
test('Observe permanently cancels pending intent, including a later hide/show',async()=>{
  const h=harness(),task=h.loader.activate('sky');await tick();
  await h.loader.activate('observe');h.loader.pauseLoading();await h.loader.resumeLoading();h.requests[0].resolve({});
  assert.equal(await task,null);await tick();assert.deepEqual(h.entered,[]);assert.equal(h.loader.state.name,'observe');assert.equal(h.loader.state.status,'idle');
});
test('same pending selection shares ownership and cached reentry avoids another import',async()=>{
  const h=harness(),a=h.loader.activate('sky'),b=h.loader.activate('sky');assert.equal(a,b);await tick();
  h.requests[0].resolve({name:'sky'});await a;await h.loader.activate('observe');await h.loader.activate('sky');
  assert.equal(h.requests.length,1);assert.deepEqual(h.entered,['sky','sky']);
});
test('failure is visible and retry starts a fresh owned attempt',async()=>{
  const h=harness(),a=h.loader.activate('sky');await tick();h.requests[0].reject(new Error('unavailable'));await assert.rejects(a,/unavailable/);
  assert.equal(h.loader.state.status,'failed');const b=h.loader.retry();await tick();h.requests[1].resolve({name:'sky'});await b;
  assert.equal(h.loader.state.status,'ready');assert.equal(h.loader.state.error,null);
});
test('logical deadline rejects and a late physical success cannot enter',async()=>{
  const h=harness(),a=h.loader.activate('sky');await tick();h.advance(30);await assert.rejects(a,/deadline/);
  h.requests[0].resolve({});await tick();assert.deepEqual(h.entered,[]);assert.equal(h.loader.state.status,'failed');assert.equal(h.timers.size,0);
});
test('hide pauses pending activation; return resumes only the still-selected view',async()=>{
  const h=harness(),a=h.loader.activate('sky');await tick();h.loader.pauseLoading();h.requests[0].reject(new Error('late'));
  assert.equal(await a,null);assert.equal(h.loader.state.status,'paused');
  const b=h.loader.resumeLoading();await tick();h.requests[1].resolve({});await b;assert.deepEqual(h.entered,['sky']);
});
test('a selection while hidden does not import or enter until visible',async()=>{
  const h=harness();h.loader.pauseLoading();assert.equal(await h.loader.activate('sky'),null);await tick();assert.equal(h.requests.length,0);
  const a=h.loader.resumeLoading();await tick();h.requests[0].resolve({});await a;assert.deepEqual(h.entered,['sky']);
});
test('hiding a ready view leaves its own lifecycle in control',async()=>{
  const h=harness();await h.loader.activate('orrery');h.loader.pauseLoading();await h.loader.resumeLoading();assert.deepEqual(h.entered,['orrery']);
});
test('async entry loses its signal and publication authority when superseded',async()=>{
  const entry=held(),owners=[],h=harness({onReady:async(name,module,owner)=>{owners.push(owner);if(name==='sky')await entry.promise;}});
  const a=h.loader.activate('sky');await tick();h.requests[0].resolve({});await tick();assert.equal(h.loader.state.status,'activating');
  await h.loader.activate('orrery');assert.equal(owners[0].signal.aborted,true);assert.equal(owners[0].isCurrent(),false);
  entry.resolve();assert.equal(await a,null);assert.equal(h.loader.state.name,'orrery');assert.equal(h.loader.state.status,'ready');
});
test('late async entry rejection is observed and cannot replace the current state',async()=>{
  const entry=held(),h=harness({onReady:async name=>{if(name==='sky')await entry.promise;}});
  const a=h.loader.activate('sky');await tick();h.requests[0].resolve({});await tick();await h.loader.activate('orrery');entry.reject(new Error('old entry'));
  assert.equal(await a,null);assert.equal(h.loader.state.status,'ready');assert.equal(h.loader.state.name,'orrery');
});
test('current entry failures retain the cached module and can retry entry',async()=>{
  let failures=1,imports=0;const h=harness({loaders:{sky:async()=>{imports++;return {}; }},onReady:()=>{if(failures--)throw new Error('entry failed');}});
  await assert.rejects(h.loader.activate('sky'),/entry failed/);assert.equal(h.loader.state.status,'failed');await h.loader.retry();assert.equal(imports,1);assert.equal(h.loader.state.status,'ready');
});
test('state callback failure is surfaced without leaving an unowned physical load',async()=>{
  let calls=0;const h=harness({onState:state=>{if(state.status==='loading'&&!calls++)throw new Error('status callback');}});
  await assert.rejects(h.loader.activate('sky'),/status callback/);assert.equal(h.loader.state.status,'failed');assert.equal(h.timers.size,0);
});
test('synchronous invalid selections fail before changing active state',()=>{
  const h=harness();assert.throws(()=>h.loader.activate('missing'),/Unknown view/);assert.equal(h.loader.state.name,'observe');
  assert.throws(()=>createViewLoader({loaders:{sky:null}}),/function/);
});
