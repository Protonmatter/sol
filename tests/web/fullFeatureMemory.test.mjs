import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import * as url from 'node:url';
import {memoryRequested,createMemoryCheckpointRecorder,assertMemoryFeatureState,assertMemoryDrawProof} from '../../tools/full_feature_memory.mjs';

test('memory follow-up is explicit and rejects ambiguous flags',()=>{
  assert.equal(memoryRequested([]),false);assert.equal(memoryRequested(['--memory']),true);
  for(const args of [['--memory=true'],['--memory','--memory'],['--memory=false']])assert.throws(()=>memoryRequested(args));
});

test('checkpoint and preparation exclusion holds until every original gate completed',async()=>{
  const calls=[],browser={owned:true};let clock=0;
  const recorder=createMemoryCheckpointRecorder({browser,now:()=>++clock,capture:async(actual,options)=>{
    assert.equal(actual,browser);calls.push(options);return {status:'unavailable',reason:'No WDDM counter'};
  }});
  await assert.rejects(recorder.checkpoint('too-early'),/Original gates/);
  await assert.rejects(recorder.protectedWork('too-early',async()=>{}),/Original gates/);
  assert.throws(()=>recorder.originalGatesCompleted({passed:false}));
  recorder.originalGatesCompleted({passed:true,deadline_ms:240000});
  assert.throws(()=>recorder.originalGatesCompleted({passed:true}),/already/);
  await recorder.protectedWork('actual five-second draw collection',async()=>{
    await assert.rejects(recorder.checkpoint('inside-draw-window'),/overlaps/);
  });
  await recorder.checkpoint('outside');
  assert.equal(calls.length,1);assert.equal(calls[0].includeDevices,true);
  const {windows,checkpoints}=recorder.evidence;
  assert.ok(checkpoints[0].started_monotonic_ms>windows[0].ended_monotonic_ms);
  assert.equal(checkpoints[0].observation.status,'unavailable');assert.equal(checkpoints[0].observation.summary,undefined);
});

test('sampling blocks parallel protected windows and releases its lock after failure',async()=>{
  let release;const hold=new Promise(resolve=>{release=resolve;});
  const recorder=createMemoryCheckpointRecorder({browser:{},capture:()=>hold});recorder.originalGatesCompleted({passed:true});
  const sampling=recorder.checkpoint('held');
  await assert.rejects(recorder.protectedWork('overlap',async()=>{}),/overlaps/);
  await assert.rejects(recorder.checkpoint('duplicate'),/overlaps/);
  release({status:'unavailable'});await sampling;
  await assert.rejects(recorder.protectedWork('failed',async()=>{throw new Error('source unavailable');}),/source unavailable/);
  await recorder.checkpoint('released');
  assert.equal(recorder.evidence.windows[0].passed,false);
});

test('cancellation while snapshotting cannot begin a later OS capture',async()=>{
  let release,captures=0;const hold=new Promise(resolve=>{release=resolve;});
  const recorder=createMemoryCheckpointRecorder({browser:{},capture:async()=>{captures++;}});
  recorder.originalGatesCompleted({passed:true});
  const pending=recorder.checkpoint('pending',{before:()=>hold});recorder.cancel();release({});
  await assert.rejects(pending,/cancelled/);assert.equal(captures,0);
  await assert.rejects(recorder.protectedWork('late',async()=>{}),/cancelled/);
});

function features(){return {active:true,animate:true,textures:true,terrain:true,optics:true,hdr:true,anchor:'Earth',
  context_lost:false,hidden:false,engine_error:'',optics_status:{Earth:'ready'},hdr_status:{state:'ready',presented:true},
  scattering_status:{Earth:{state:'submitted'}},scattering_frame:{contextGeneration:2}};}
test('feature-state brackets reject fallback, stale generation and disabled features',()=>{
  assertMemoryFeatureState(features(),'Earth',2);
  for(const change of [s=>s.animate=false,s=>s.terrain=false,s=>s.textures=false,s=>s.hdr=false,s=>s.context_lost=true,
    s=>s.optics_status.Earth='loading',s=>s.scattering_status.Earth.state='cancelled',s=>s.hdr_status.presented=false,
    s=>s.scattering_frame.contextGeneration=1]){
    const state=features();change(state);assert.throws(()=>assertMemoryFeatureState(state,'Earth',2));
  }
});

function proof(){return {subjectBody:'Earth',sampleError:'',initialState:{animate:true,hdrEnabled:true},
  drawCounts:{physicalRejected:0,presentationMismatch:0,gpuMismatch:0,lateReadbacks:0},
  samples:[1,2,3].map(i=>({elapsedMs:i*100,epoch:i,model:[i],physical:{passed:true,body:'Earth',
    scattering:{passed:true,frame:{contextGeneration:2}}},presentation:{epoch:i,generation:2}}))};}
test('memory scope requires actual current producers and matching fresh final draws',()=>{
  assert.equal(assertMemoryDrawProof(proof(),'Earth'),2);
  for(const change of [p=>p.samples.pop(),p=>p.samples[0].physical.scattering.passed=false,
    p=>p.samples[0].presentation.epoch=99,p=>p.samples[0].presentation.generation=1,
    p=>p.samples[1].epoch=1,p=>p.samples[2].elapsedMs=5000.1,p=>p.drawCounts.lateReadbacks=1,
    p=>p.samples.forEach(s=>s.model=[1])]){
    const value=proof();change(value);assert.throws(()=>assertMemoryDrawProof(value,'Earth'));
  }
});

test('both callers place optional sampling after complete original acceptance and stop the original 240s timer first',()=>{
  const browser=fs.readFileSync(new URL('../../tools/browser_validation.mjs',import.meta.url),'utf8');
  const physical=fs.readFileSync(new URL('../../tools/physical_rendering_validation.mjs',import.meta.url),'utf8');
  assert.ok(browser.indexOf('await runFullFeatureMemoryCheckpoints')>browser.indexOf('await writeBrowserCoverage(entries'));
  assert.ok(browser.indexOf('evidence.original_gates={passed:true')>browser.indexOf('await exerciseOrrery(page'));
  assert.match(physical,/await Promise\.race\(\[run\(\),deadline\]\);\s*clearTimeout\(timer\);timer=null;\s*evidence\.original_gates=\{passed:true,deadline_ms:240000/);
  assert.ok(physical.indexOf('await runFullFeatureMemoryCheckpoints')>physical.indexOf('evidence.original_gates={passed:true'));
  assert.match(physical,/assert\.ok\(!memory\|\|marsOpticalAnimation/);
  assert.match(physical,/browserBackendFromArgs\(process\.argv\.slice\(2\)\)/);
  assert.match(physical,/probe\.observed_backend=assertBrowserBackend\(backend,probe\.capabilities\)/);
});

test('real collector discovers only the launched browser PIDs afresh for every checkpoint',async()=>{
  const source=fs.readFileSync(new URL('../../tools/texture_device_telemetry.mjs',import.meta.url),'utf8');
  const commands=[],requests=[];let discovery=0,detached=0,unexpectedProcess=false,unexpectedCounter=false;
  const context=vm.createContext({URL,Date,process:{platform:'win32'}});
  const execute=async(command,args,options)=>{
    commands.push({command,args,options});
    const pid=Number(args[args.indexOf('-ProcessIds')+1]);
    return {stdout:JSON.stringify({status:'available',processes:[{pid:unexpectedProcess?999:pid,working_set_bytes:20,private_bytes:10}],
      gpu_counters_status:'unavailable',gpu_counters:unexpectedCounter?[{pid:999,counter:'shared usage',bytes:5,status:0}]:[]})};
  };
  const modules={
    'node:assert/strict':{default:assert},'node:child_process':{execFile:()=>{}},
    'node:util':{promisify:()=>execute},'node:url':{fileURLToPath:url.fileURLToPath},
  };
  const module=new vm.SourceTextModule(source,{context,initializeImportMeta:meta=>{meta.url=new URL('../../tools/texture_device_telemetry.mjs',import.meta.url).href;}});
  await module.link(name=>new vm.SyntheticModule(Object.keys(modules[name]),function(){for(const [key,value]of Object.entries(modules[name]))this.setExport(key,value);},{context}));
  await module.evaluate();
  const browser={target:()=>({createCDPSession:async()=>({send:async method=>{requests.push(method);return {processInfo:[{id:++discovery+100,type:'GPU'}]};},detach:async()=>{detached++;}})})};
  const capture=module.namespace.captureDeviceMemory;
  const first=await capture(browser,{label:'active'}),second=await capture(browser,{label:'page-closed'});
  assert.deepEqual(requests,['SystemInfo.getProcessInfo','SystemInfo.getProcessInfo']);
  assert.equal(first.process_identity.processes[0].pid,101);assert.equal(second.process_identity.processes[0].pid,102);
  assert.equal(commands[0].args[commands[0].args.indexOf('-ProcessIds')+1],'101');
  assert.equal(commands[1].args[commands[1].args.indexOf('-ProcessIds')+1],'102');
  assert.equal(commands[0].command,'powershell.exe');assert.equal(commands[0].options.windowsHide,true);
  assert.equal(commands[0].options.timeout,15000);assert.equal(detached,2);
  assert.equal(first.summary.gpu_process_counters['shared usage'],null);
  unexpectedProcess=true;
  const unowned=await capture(browser,{label:'reject-process'});
  assert.equal(unowned.status,'unavailable');assert.match(unowned.reason,/unowned process/);assert.equal(unowned.summary,undefined);
  unexpectedProcess=false;unexpectedCounter=true;
  const unownedCounter=await capture(browser,{label:'reject-counter'});
  assert.equal(unownedCounter.status,'unavailable');assert.match(unownedCounter.reason,/PID/);assert.equal(unownedCounter.summary,undefined);
  assert.equal(detached,4);
});
