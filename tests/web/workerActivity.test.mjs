import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import test from 'node:test';
import {installWorkerActivity,waitForWorkerActivityIdle} from '../../tools/worker_activity.mjs';

function fixture(){
  class NativeWorker extends EventEmitter {
    constructor(...args){super();this.args=args;this.sent=[];this.terminated=false;}
    addEventListener(type,listener){this.on(type,listener);}
    postMessage(...args){if(this.failure)throw this.failure;this.sent.push(args);return 'native-result';}
    terminate(){this.terminated=true;return 'native-terminated';}
  }
  const context=vm.createContext({Worker:NativeWorker});
  vm.runInContext(`(${installWorkerActivity.toString()})()`,context);
  return {context,worker:new context.Worker('worker.js',{type:'module'}),state:()=>context.__solWorkerActivity()};
}
const message=(generation=1,extra={})=>({type:'compute',protocol:'sol-worker.v1',engine:'ephemeris',schema:'ephemeris-snapshot.v3',abi:1,release:'fixture',generation,...extra});

test('observes a real protocol request without changing native arguments or return',()=>{
  const f=fixture(),request=message(),transfer=[];
  assert.equal(f.worker.postMessage(request,transfer),'native-result');
  assert.equal(f.worker.sent[0][0],request);assert.equal(f.worker.sent[0][1],transfer);
  assert.equal(f.state().activeRequests,1);
  f.worker.emit('message',{data:{...request,type:'result'}});
  assert.equal(f.state().activeRequests,0);
});

test('only the same Worker, complete identity and generation can finish a request',()=>{
  const f=fixture(),request=message();f.worker.postMessage(request);
  const other=new f.context.Worker('other.js');
  other.emit('message',{data:{...request,type:'result'}});
  for(const change of [{generation:2},{engine:'solar'},{schema:'other'},{abi:2},{release:'other'},{protocol:'other'},{type:'phase'}]){
    f.worker.emit('message',{data:{...request,type:'result',...change}});assert.equal(f.state().activeRequests,1);
  }
  f.worker.emit('message',{data:{...request,type:'error'}});assert.equal(f.state().activeRequests,0);
});

test('follow-on trajectory started by a result handler remains active until its own reply',()=>{
  const f=fixture(),snapshot=message(),track=message(2);f.worker.postMessage(snapshot);
  f.worker.addEventListener('message',event=>{if(event.data.generation===1)queueMicrotask(()=>f.worker.postMessage(track));});
  f.worker.emit('message',{data:{...snapshot,type:'result'}});
  return new Promise(resolve=>queueMicrotask(()=>{
    assert.equal(f.state().activeRequests,1);f.worker.emit('message',{data:{...track,type:'result'}});
    assert.equal(f.state().activeRequests,0);resolve();
  }));
});

test('native postMessage failure undoes only the attempted request and rethrows the same error',()=>{
  const f=fixture();f.worker.postMessage(message(1));const failure=new Error('clone failed');f.worker.failure=failure;
  assert.throws(()=>f.worker.postMessage(message(2)),error=>error===failure);assert.equal(f.state().activeRequests,1);
  f.worker.emit('message',{data:{...message(1),type:'result'}});assert.equal(f.state().activeRequests,0);
});

test('worker error or precise termination clears its requests without replacing application listeners',()=>{
  const f=fixture();let app=0;f.worker.addEventListener('error',()=>app++);f.worker.postMessage(message());
  f.worker.emit('error',{});assert.equal(app,1);assert.equal(f.state().activeRequests,0);
  f.worker.postMessage(message(2));assert.equal(f.worker.terminate(),'native-terminated');assert.equal(f.state().workers,0);
});

test('duplicate active identities, undecodable messages and missing observation fail visibly',async()=>{
  const f=fixture();f.worker.postMessage(message());f.worker.postMessage(message());
  assert.match(f.state().errors.join(' '),/duplicate/);f.worker.emit('messageerror',{});
  assert.match(f.state().errors.join(' '),/decoded/);
  const page={waitForFunction:async predicate=>predicate()};
  await assert.rejects(waitForWorkerActivityIdle(page),/missing/);
});

test('idle barrier never treats a pending recovery or trajectory as complete',async()=>{
  const f=fixture();f.worker.postMessage(message());let checks=0;
  const page={waitForFunction:async(predicate,options)=>{
    assert.equal(options.timeout,123);const source=`(${predicate.toString()})()`;
    assert.equal(vm.runInContext(source,f.context),false);checks++;
    f.worker.emit('message',{data:{...message(),type:'result'}});f.worker.postMessage(message(2));
    assert.equal(vm.runInContext(source,f.context),false);checks++;
    f.worker.emit('message',{data:{...message(2),type:'result'}});assert.equal(vm.runInContext(source,f.context),true);checks++;
  }};
  await waitForWorkerActivityIdle(page,{timeoutMs:123});assert.equal(checks,3);
});

test('preparation and its synchronous follow-on calculation both prevent false idle',()=>{
  const f=fixture(),prepare=message(1,{type:'initialize'}),compute=message(1);
  f.worker.postMessage(prepare);assert.equal(f.state().activeRequests,1);
  f.worker.addEventListener('message',event=>{if(event.data.type==='ready')f.worker.postMessage(compute);});
  f.worker.emit('message',{data:{...prepare,type:'ready'}});assert.equal(f.state().activeRequests,1);assert.equal(f.state().errors.length,0);
  f.worker.emit('message',{data:{...compute,type:'result'}});assert.equal(f.state().activeRequests,0);
});

test('a response for the wrong phase cannot clear active work',()=>{
  const f=fixture();f.worker.postMessage(message());f.worker.emit('message',{data:message(1,{type:'ready'})});
  assert.equal(f.state().activeRequests,1);assert.match(f.state().errors.join(' '),/phase/);f.worker.terminate();assert.equal(f.state().activeRequests,0);
});
test('an unexpected Worker error after accepted work is retained even if the application suppresses default reporting',()=>{
  const f=fixture(),request=message();f.worker.postMessage(request);f.worker.emit('message',{data:{...request,type:'result'}});
  f.worker.addEventListener('error',event=>event.preventDefault());let prevented=false;
  f.worker.emit('error',{message:'late unexpected exception',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(f.state().activeRequests,0);assert.match(f.state().errors.join(' '),/late unexpected exception/);
});
test('ordinary Worker termination cannot manufacture a runtime exception',()=>{
  const f=fixture();f.worker.postMessage(message());f.worker.terminate();assert.equal(f.state().activeRequests,0);assert.equal(f.state().errors.length,0);
});
