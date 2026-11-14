import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import vm from 'node:vm';
import {closeOwnedBrowserVerified} from '../../tools/worker_coverage.mjs';
import {collectContextFailures} from '../../tools/profile_completion.mjs';

// Execute canonical launch binding and final admission, replacing only browser/
// file/network boundaries and expensive workload. Real verified cleanup runs.
async function fixture({pid=44123,alreadyExit=null,signal=null,exit=0,hang=false,versionFailure=false,missingHandle=false,changedHandle=false,lateWorker=false}={}){
  const source=fs.readFileSync(new URL('../../tools/startup_profile.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const first=source.indexOf('  browser=await puppeteer.launch('),last=source.indexOf('  workerObservation=createWorkerExceptionObserver(',first);
  const finallyStart=source.lastIndexOf('\nfinally{');
  assert.ok(first>0&&last>first&&finallyStart>last,'Real launch/finalization boundaries must exist');
  const child=Object.assign(new EventEmitter(),{pid,exitCode:alreadyExit,signalCode:signal,spawnargs:['fixture-owned-browser'],
    kill(){events.push('kill');this.signalCode='SIGKILL';this.emit('exit',null,'SIGKILL');return true;}});
  const events=[],writes=[],owners=[{name:'pair-1',errors:[]}],proc={exitCode:0};let handleReads=0;
  const browser={process(){handleReads++;return missingHandle?null:changedHandle&&handleReads>1?{...child}:child;},
    async version(){if(versionFailure)throw Error('version read failed');return 'Chrome/fixture';},
    async close(){events.push('browser-close');if(lateWorker)owners[0].errors.push('worker fault during close');
      if(!hang){setImmediate(()=>{child.exitCode=exit;child.emit('exit',exit,null);});}}};
  const context=vm.createContext({assert,path,console:{log(){},error(){}},process:proc,executablePath:'fixture-browser',graphicsArgs:[],expectedBrowser:'Chrome/fixture',
    puppeteer:{launch:async()=>browser},closeOwnedBrowserVerified:value=>closeOwnedBrowserVerified(value,{timeoutMs:hang?10:500}),
    collectContextFailures,contexts:new Map(owners.map((v,i)=>[i,v])),
    responder:{close(){events.push('responder-close');}},sourcePins:()=>({}),sourceBefore:{},
    webRoot:'/fixture-stage',root:'/fixture-root',out:'/fixture-output',validatedJSONPaths:[],artifactPins:{},
    expectedBundleIdentity:{},manifest:{base_path:'/sol/'},pairs:1,
    classifyCompleteReadCancellations:()=>({expected:[],unexpected:[]}),
    readbackProfileArtifact:()=>({unchanged:true,log:'fixture admission'}),assessStartupProfile:()=>({passed:true}),
    fs:{writeFileSync(file,bytes){events.push('write');if(path.basename(file)==='evidence.json')writes.push(JSON.parse(bytes));}},
    fixtureObserver:{async settle(){events.push('worker-settle');},dispose(){events.push('worker-dispose');}}});
  const program=`let browser,ownedBrowserProcess,activeContext,server,workerObservation,currentGroup='calibration',completed=false,origin;
    const report={errors:[],cleanupErrors:[],runs:[],network:[]};
    try {${source.slice(first,last)} workerObservation=fixtureObserver;completed=true;}
    catch(error){report.errors.push(String(error));}
    ${source.slice(finallyStart)}
    globalThis.finalReport=report;`;
  await vm.runInContext('(async()=>{'+program+'})()',context,{filename:'startup_profile.mjs'});
  return {report:JSON.parse(JSON.stringify(context.finalReport)),events,writes,exitCode:proc.exitCode,child};
}

test('canonical profile records the positive launch PID and actual zero exit after retirement',async()=>{
  const r=await fixture();assert.equal(r.report.result,'diagnostic-completed');assert.equal(r.exitCode,0);
  assert.equal(r.report.browserPid,44123);assert.deepEqual(r.report.ownedBrowserExit,{pid:44123,exitCode:0,signalCode:null});
  assert.equal(r.child.listenerCount('exit'),0);assert.equal(r.child.listenerCount('error'),0);
  assert.ok(r.events.indexOf('browser-close')<r.events.indexOf('worker-settle'));assert.ok(r.events.indexOf('worker-settle')<r.events.lastIndexOf('write'));
});

test('canonical profile rejects a nonzero exit even when verified retirement returns normally',async()=>{
  const r=await fixture({exit:7});assert.equal(r.report.result,'failed');assert.equal(r.exitCode,1);
  assert.deepEqual(r.report.ownedBrowserExit,{pid:44123,exitCode:7,signalCode:null});assert.ok(r.report.cleanupErrors.length);
});

test('canonical profile rejects an already exited nonzero browser',async()=>{
  const r=await fixture({alreadyExit:9});assert.equal(r.report.result,'failed');assert.equal(r.exitCode,1);
  assert.equal(r.report.ownedBrowserExit.exitCode,9);assert.ok(!r.events.includes('browser-close'));
});

test('canonical profile accepts an already retired zero-exit owned browser idempotently',async()=>{
  const r=await fixture({alreadyExit:0});assert.equal(r.report.result,'diagnostic-completed');assert.equal(r.report.ownedBrowserExit.exitCode,0);
  assert.ok(!r.events.includes('browser-close'));
});

test('canonical profile preserves signal termination as failed raw evidence',async()=>{
  const r=await fixture({signal:'SIGTERM'});assert.equal(r.report.result,'failed');assert.equal(r.exitCode,1);
  assert.deepEqual(r.report.ownedBrowserExit,{pid:44123,exitCode:null,signalCode:'SIGTERM'});
});

for(const pid of [0,-1,1.5])test(`canonical profile refuses invalid launch identity ${pid}`,async()=>{
  const r=await fixture({pid});assert.equal(r.report.result,'failed');assert.equal(r.exitCode,1);assert.ok(!r.events.includes('browser-close'));
});

test('canonical profile does not infer identity or successful exit for a missing owned handle',async()=>{
  const r=await fixture({missingHandle:true});assert.equal(r.report.result,'failed');assert.equal(r.exitCode,1);
  assert.deepEqual(r.report.ownedBrowserExit,{pid:null,exitCode:null,signalCode:null});assert.ok(!r.events.includes('browser-close'));
});

test('canonical profile refuses a changed process handle before closing an unbound browser',async()=>{
  const r=await fixture({changedHandle:true});assert.equal(r.report.result,'failed');assert.ok(!r.events.includes('browser-close'));
  assert.deepEqual(r.report.ownedBrowserExit,{pid:44123,exitCode:null,signalCode:null});
});

test('canonical profile waits for exit, retains forced kill and still retires other owners',async()=>{
  const r=await fixture({hang:true});assert.equal(r.report.result,'failed');assert.equal(r.exitCode,1);
  assert.equal(r.report.ownedBrowserExit.signalCode,'SIGKILL');assert.ok(r.events.includes('kill'));
  assert.ok(r.events.includes('worker-settle'));assert.ok(r.events.includes('responder-close'));assert.equal(r.writes.length,1);
});

test('canonical profile retains launch-bound exit evidence after version-read failure',async()=>{
  const r=await fixture({versionFailure:true});assert.equal(r.report.result,'failed');assert.equal(r.exitCode,1);
  assert.deepEqual(r.report.ownedBrowserExit,{pid:44123,exitCode:0,signalCode:null});assert.ok(r.report.errors.some(e=>e.includes('version read failed')));
});

test('canonical profile still rejects late worker errors delivered during verified close',async()=>{
  const r=await fixture({lateWorker:true});assert.equal(r.report.result,'failed');assert.equal(r.exitCode,1);
  assert.deepEqual(r.report.ownedBrowserExit,{pid:44123,exitCode:0,signalCode:null});assert.equal(r.report.contextErrors[0].error,'worker fault during close');
});
