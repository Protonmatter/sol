import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';
const definitions=[['systemWorker.js','system','system-snapshot.v1'],['skyWorker.js','ephemeris','ephemeris-snapshot.v3']];
async function fixture(file,engine,schema){
  const messages=[],self={postMessage:message=>messages.push(message)};let resolve,reject,loads=0,calculations=0;
  const loading=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const bindings={loadSkyEngine:()=>{loads++;return loading;},systemSnapshot:()=>{calculations++;return {bodies:[]};},
    skySnapshot:()=>{calculations++;return {bodies:[]};},bodyTrack:()=>{calculations++;return [];},
    validateSystemRequest:value=>value,assertSystemSnapshot:value=>value,validateSkyWork:value=>value};
  await loadSourceModules(vm.createContext({self}),[new URL('../../apps/web/js/'+file,import.meta.url)],{resolveImport:()=>bindings});
  const identity={protocol:'sol-worker.v1',engine,schema,abi:1,release:'__SOL_RELEASE_ID__',generation:1};
  return {messages,self,identity,resolve,reject,get loads(){return loads;},get calculations(){return calculations;}};
}
for(const [file,engine,schema]of definitions){
  test(`${file} prepares the engine without computing a snapshot`,async()=>{
    const f=await fixture(file,engine,schema),pending=f.self.onmessage({data:{...f.identity,type:'initialize'}});
    assert.equal(f.loads,1);assert.equal(f.messages.length,0);assert.equal(f.calculations,0);f.resolve();await pending;
    assert.equal(f.messages[0].type,'ready');assert.equal('value'in f.messages[0],false);assert.equal(f.messages[0].generation,1);
    await f.self.onmessage({data:{...f.identity,type:'compute',payload:{unix:0,operation:'snapshot'}}});
    assert.equal(f.calculations,1);assert.equal(f.messages.at(-1).type,'result');
  });
  test(`${file} rejects mismatched or overlapping preparation before more engine I/O`,async()=>{
    const f=await fixture(file,engine,schema);await f.self.onmessage({data:{...f.identity,type:'initialize',release:'wrong'}});assert.equal(f.loads,0);assert.equal(f.messages[0].error.code,'protocol');
    const pending=f.self.onmessage({data:{...f.identity,type:'initialize'}});
    await f.self.onmessage({data:{...f.identity,type:'initialize',generation:2}});assert.equal(f.loads,1);assert.equal(f.messages.at(-1).error.code,'protocol');f.resolve();await pending;
  });
  test(`${file} reports preparation failure without publishing readiness or data`,async()=>{
    const f=await fixture(file,engine,schema),pending=f.self.onmessage({data:{...f.identity,type:'initialize'}});f.reject(new Error('engine asset unavailable'));await pending;
    assert.equal(f.messages.length,1);assert.equal(f.messages[0].type,'error');assert.match(f.messages[0].error.message,/unavailable/);assert.equal(f.calculations,0);
  });
}
