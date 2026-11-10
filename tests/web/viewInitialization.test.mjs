import assert from 'node:assert/strict';
import test from 'node:test';
import {createViewLoader} from '../../apps/web/js/viewLoader.js';

const held=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(t,{onReady=()=>{},onState=()=>{}}={}){
  const states=[],imports=[],timers=new Map();let serial=0;
  const loader=createViewLoader({loaders:{sky:async()=>{imports.push('sky');return {};},research:async()=>{imports.push('research');return {};}},
    onReady,onState(state){states.push(state);return onState(state);},now:()=>0,setTimer(fn){timers.set(++serial,fn);return serial;},clearTimer(id){timers.delete(id);}});
  t.after(()=>loader.activate('observe').catch(()=>null));return {loader,states,imports,timers};
}

test('first activation remains uninitialized until current entry and ready publication succeed',async t=>{
  const entry=held(),h=fixture(t,{onReady:()=>entry.promise});
  const pending=h.loader.activate('sky');assert.equal(h.loader.state.initialized,false);await tick();
  assert.equal(h.loader.state.status,'activating');assert.equal(h.loader.state.initialized,false);
  entry.resolve();await pending;assert.equal(h.loader.state.initialized,true);assert.equal(h.loader.state.status,'ready');
  assert.ok(Object.isFrozen(h.loader.state));
});

test('initial entry failure and cached retry do not confuse namespace availability with initialization',async t=>{
  let fail=true;const h=fixture(t,{onReady(){if(fail)throw Error('entry failed');}});
  await assert.rejects(h.loader.activate('research'),/entry failed/);assert.equal(h.loader.state.initialized,false);
  fail=false;await h.loader.retry();assert.equal(h.loader.state.initialized,true);assert.equal(h.imports.length,1);
});

test('previous successful entry remains initialized through re-entry loading and failure',async t=>{
  let fail=false;const h=fixture(t,{onReady(){if(fail)throw Error('refresh failed');}});
  await h.loader.activate('sky');await h.loader.activate('observe');fail=true;
  const pending=h.loader.activate('sky');pending.catch(()=>null);assert.equal(h.loader.state.status,'loading');assert.equal(h.loader.state.initialized,true);
  await assert.rejects(pending,/refresh failed/);assert.equal(h.loader.state.initialized,true);
});

test('cancelled initial entry cannot mark its cached module initialized',async t=>{
  const entry=held(),h=fixture(t,{onReady:()=>entry.promise});
  const old=h.loader.activate('sky');await tick();await h.loader.activate('observe');assert.equal(await old,null);
  const current=h.loader.activate('sky');await tick();assert.equal(h.loader.state.initialized,false);
  entry.resolve();await current;assert.equal(h.loader.state.initialized,true);assert.equal(h.imports.length,1);
});

test('a failed ready-state publication does not commit initialization',async t=>{
  let fail=true;const h=fixture(t,{onState(state){if(state.status==='ready'&&fail)throw Error('ready publication failed');}});
  await assert.rejects(h.loader.activate('sky'),/ready publication failed/);
  assert.equal(h.loader.state.status,'failed');assert.equal(h.loader.state.initialized,false);
  fail=false;await h.loader.retry();assert.equal(h.loader.state.initialized,true);
});

test('built-in Observe is initialized without requesting any deferred view',async t=>{
  const h=fixture(t);assert.equal(h.loader.state.initialized,true);await h.loader.activate('observe');
  assert.equal(h.loader.state.initialized,true);assert.equal(h.imports.length,0);
});

test('pause publication failure rejects the activation and retains the current failure',async t=>{
  let loader;const failure=Error('pause publication failed');
  const h=fixture(t,{onReady:async()=>loader.pauseLoading(),onState(state){if(state.status==='paused')throw failure;}});loader=h.loader;
  await assert.rejects(loader.activate('sky'),error=>error===failure);
  assert.equal(loader.state.status,'failed');assert.equal(loader.state.error,failure);assert.equal(loader.state.initialized,false);
  assert.equal(h.timers.size,0);
});

test('direct pause publication failure reaches both the caller and pending activation',async t=>{
  const entry=held(),failure=Error('direct pause publication failed');
  const h=fixture(t,{onReady:()=>entry.promise,onState(state){if(state.status==='paused')throw failure;}});
  const pending=h.loader.activate('sky');pending.catch(()=>null);await tick();
  assert.throws(()=>h.loader.pauseLoading(),error=>error===failure);
  await assert.rejects(pending,error=>error===failure);assert.equal(h.loader.state.error,failure);
  entry.resolve();await tick();assert.equal(h.loader.state.status,'failed');assert.equal(h.loader.state.initialized,false);
});

test('falsy pause publication failures are normalized and remain observable',async t=>{
  let loader;const h=fixture(t,{onReady:async()=>loader.pauseLoading(),onState(state){if(state.status==='paused')throw null;}});loader=h.loader;
  await assert.rejects(loader.activate('sky'),error=>error instanceof Error&&error.message==='null');
  assert.equal(loader.state.status,'failed');assert.equal(loader.state.error.message,'null');
});

test('pause publication failure preserves an earlier successfully initialized entry',async t=>{
  let pause=false;const failure=Error('reentry pause failed');let loader;
  const h=fixture(t,{onReady:async()=>{if(pause)loader.pauseLoading();},onState(state){if(state.status==='paused')throw failure;}});loader=h.loader;
  await loader.activate('sky');await loader.activate('observe');pause=true;
  await assert.rejects(loader.activate('sky'),error=>error===failure);
  assert.equal(loader.state.status,'failed');assert.equal(loader.state.initialized,true);
});

test('a reentrant newer selection survives the old pause publication failure',async t=>{
  let loader,newer;const failure=Error('old pause publication failed');
  const h=fixture(t,{onReady:async(name)=>{if(name==='sky')loader.pauseLoading();},onState(state){
    if(state.name==='sky'&&state.status==='paused'){newer=loader.activate('research');throw failure;}
  }});loader=h.loader;
  await assert.rejects(loader.activate('sky'),error=>error===failure);assert.equal(await newer,null);
  assert.equal(loader.state.name,'research');assert.equal(loader.state.status,'paused');assert.equal(loader.state.error,null);
  await loader.resumeLoading();assert.equal(loader.state.name,'research');assert.equal(loader.state.status,'ready');assert.equal(loader.state.initialized,true);
});

test('a newer same-view resumed failure is not overwritten by an older pause publication',async t=>{
  let loader,resumed,resuming=false;
  const newerFailure=Error('newer loading publication failure'),olderFailure=Error('older pause publication failure');
  const h=fixture(t,{onReady:async()=>loader.pauseLoading(),onState(state){
    if(state.status==='paused'){
      resuming=true;resumed=loader.resumeLoading();resumed.catch(()=>null);throw olderFailure;
    }
    if(state.status==='loading'&&resuming)throw newerFailure;
  }});loader=h.loader;
  await assert.rejects(loader.activate('sky'),error=>error===olderFailure);
  await assert.rejects(resumed,error=>error===newerFailure);
  assert.equal(loader.state.status,'failed');assert.equal(loader.state.error,newerFailure);assert.equal(loader.state.initialized,false);
  assert.equal(h.timers.size,0);
});
