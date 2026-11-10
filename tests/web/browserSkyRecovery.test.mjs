import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import test from 'node:test';
import {startWorkerCoverage} from '../../tools/worker_coverage.mjs';
import {waitForWorkerActivityIdle} from '../../tools/worker_activity.mjs';

test('actual Sky exercise awaits fresh local recovery and trajectory idle before coverage',async()=>{
  const source=fs.readFileSync(new URL('../../tools/browser_validation.mjs',import.meta.url),'utf8');
  const begin=source.indexOf('async function exerciseSky(page) {'),end=source.indexOf('\nasync function focusBody(page, name) {',begin);
  assert.ok(begin>=0&&end>begin);
  const state={provenance:'Source: computed on device',inputError:'',activeRequests:0,automaticRefresh:false,localPending:false};
  const waiters=[],calls=[],overlaps=[];
  const context=vm.createContext({
    document:{querySelectorAll:()=>[{}],getElementById:id=>({textContent:id==='skyProvenance'?state.provenance:id==='skyInputError'?state.inputError:''})},
    __solWorkerActivity:()=>({activeRequests:state.activeRequests,errors:[]}),
    clickMode:async()=>{},setChecked:async()=>{},
    setValue:async(page,selector,value,event)=>{if(selector==='#skyTime'&&value&&event==='change')state.automaticRefresh=false;},
  });
  const check=predicate=>vm.runInContext(`(${predicate.toString()})()`,context);
  const notify=()=>{for(const waiter of [...waiters])if(check(waiter.predicate)){waiters.splice(waiters.indexOf(waiter),1);waiter.resolve();}};
  const child=new EventEmitter();
  child.send=async method=>{
    calls.push(method);
    if(method==='Profiler.takePreciseCoverage')return{result:[{scriptId:'1',url:'http://127.0.0.1/skyWorker.js',functions:[]}]};
    if(method==='Debugger.enable'){overlaps.push(state.activeRequests);child.emit('Debugger.scriptParsed',{scriptId:'1',url:'http://127.0.0.1/skyWorker.js'});}
    if(method==='Debugger.getScriptSource')return{scriptSource:'export const synthetic = true;'};
    return{};
  };
  const parent=new EventEmitter();parent.connection=()=>({session:()=>child});parent.send=async()=>{};parent.detach=async()=>{};
  const page={
    createCDPSession:async()=>parent,
    click:async selector=>{
      if(selector==='#skyNow')state.automaticRefresh=true;
      if(selector==='#skyConsentAllow')state.provenance='Requested Sky unavailable';
      if(selector==='#skyProviderLocal'){state.localPending=true;state.activeRequests=1;state.provenance='Computing Sky on this device…';parent.emit('Target.attachedToTarget',{sessionId:'worker'});}
    },
    waitForFunction:async predicate=>{if(check(predicate))return;await new Promise(resolve=>waiters.push({predicate,resolve}));},
    waitForSelector:async()=>{},$:async()=>null,$eval:async()=> '2026-07-08T12:00',evaluate:async()=>({x:0,y:0}),
    mouse:{move:async()=>{},click:async()=>{}},keyboard:{press:async()=>{}},
  };
  const exerciseSky=vm.runInContext(`(${source.slice(begin,end)})`,context);
  const capture=await startWorkerCoverage(page,{beforeCollect:()=>waitForWorkerActivityIdle(page)});
  let exerciseDone=false;
  try{
    const exercise=exerciseSky(page).then(()=>{exerciseDone=true;});
    await new Promise(setImmediate);
    assert.equal(state.localPending,true);
    assert.equal(exerciseDone,false,'last-valid rows must not finish recovery readiness');
    assert.equal(state.automaticRefresh,false,'freeze the same displayed epoch after exercising Now');
    state.localPending=false;state.provenance='Source: computed on device, VSOP2013 + ELP-MPP02';notify();
    await exercise;
    const collection=capture.collect();await new Promise(setImmediate);
    assert.ok(!calls.includes('Debugger.enable'),'follow-on trajectory remains pending');
    state.activeRequests=0;notify();await collection;
    assert.deepEqual(overlaps,[0]);assert.equal(capture.entries.length,1);assert.deepEqual(capture.errors,[]);
  }finally{state.activeRequests=0;state.provenance='Source: computed on device';notify();await capture.dispose();}
});
