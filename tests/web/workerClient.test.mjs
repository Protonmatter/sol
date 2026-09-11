import assert from "node:assert/strict";
import test from "node:test";
import { LatestWorkerClient } from "../../apps/web/js/workerClient.js";
function setup() {
  const workers=[],timers=new Map();let clock=0;
  const client=new LatestWorkerClient({engine:"test",schema:"test.v1",release:"local",deadlineMs:10,
    createWorker:()=>{const worker={sent:[],postMessage(value){this.sent.push(value);},terminate(){this.terminated=true;}};workers.push(worker);return worker;},
    validateRequest:value=>{if(value.invalid)throw Error("invalid");return value;},validateResult:value=>{if(value.invalid)throw Error("invalidresult");return Object.freeze(value);},
    setTimer:callback=>{timers.set(++clock,callback);return clock;},clearTimer:id=>timers.delete(id)});
  const finish=(worker=workers.at(-1),value={ok:true},overrides={})=>worker.onmessage({data:{...worker.sent.at(-1),type:"result",value,...overrides}});
  return {client,workers,timers,finish};
}
test("timer adapters are invoked without a client receiver as required by browser host timers",async()=>{
  let worker,cleared=false;
  const client=new LatestWorkerClient({engine:"test",schema:"test.v1",release:"local",
    createWorker:()=>worker={postMessage(message){this.sent=message;},terminate(){}},
    setTimer:function(){assert.equal(this,undefined);return 1;},
    clearTimer:function(id){assert.equal(this,undefined);assert.equal(id,1);cleared=true;}});
  const result=client.request({});
  worker.onmessage({data:{...worker.sent,type:"result",value:{ok:true}}});
  assert.deepEqual(await result,{ok:true});assert.equal(cleared,true);
});
test("one active and one latest pending, only newest generation publishes",async()=>{
  const {client,workers,finish}=setup();
  const a=client.request({id:1}).catch(e=>e.code),b=client.request({id:2}).catch(e=>e.code),c=client.request({id:3});
  assert.equal(await b,"superseded");assert.equal(workers[0].sent.length,1);
  finish();assert.equal(await a,"superseded");assert.equal(workers[0].sent[1].payload.id,3);
  finish();assert.deepEqual(await c,{ok:true});
});
test("cancel terminates synchronous worker, ignores late message, and permits retry",async()=>{
  const {client,workers,finish}=setup();const a=client.request({}).catch(e=>e.code),old=workers[0];
  client.cancel();assert.equal(await a,"cancelled");assert.equal(old.terminated,true);
  const b=client.request({});finish(old,{old:true});finish(workers[1]);assert.deepEqual(await b,{ok:true});
  client.dispose();await assert.rejects(client.request({}),e=>e.code==="disposed");
});
test("deadline terminates uncooperative active work and starts latest pending",async()=>{
  const {client,workers,timers,finish}=setup();const a=client.request({}).catch(e=>e.code),b=client.request({});
  [...timers.values()][0]();assert.equal(await a,"deadline");assert.equal(workers[0].terminated,true);
  finish();assert.deepEqual(await b,{ok:true});assert.equal(timers.size,0);
});
test("schema/build/ABI mismatches and invalid result never publish",async()=>{
  for(const override of [{schema:"wrong"},{release:"wrong"},{abi:99},{protocol:"wrong"},{engine:"wrong"}]){
    const {client,finish}=setup();const result=client.request({});finish(undefined,{},override);await assert.rejects(result,e=>e.code==="protocol");
  }
  const {client,finish,workers}=setup();await assert.rejects(client.request({invalid:true}),/invalid/);assert.equal(workers.length,0);
  const result=client.request({});finish(undefined,{invalid:true});await assert.rejects(result,/invalidresult/);
});
test("worker allocation/crash and typed errors reject without inventing data",async()=>{
  const {client,workers,finish}=setup();const crash=client.request({});workers[0].onerror({preventDefault(){}});await assert.rejects(crash,e=>e.code==="worker_failed");
  const result=client.request({});finish(undefined,null,{type:"error",error:{code:"capacity",message:"Work exceeds limits"}});await assert.rejects(result,e=>e.code==="capacity");
  const allocation=new LatestWorkerClient({engine:"test",schema:"x",release:"x",createWorker:()=>{throw Error("allocation");}});
  await assert.rejects(allocation.request({}),/allocation/);
});
