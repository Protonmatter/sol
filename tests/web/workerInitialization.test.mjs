import test from 'node:test';
import assert from 'node:assert/strict';
import {LatestWorkerClient} from '../../apps/web/js/workerClient.js';
function fixture(options={}){
  const workers=[],timers=new Map();let clock=0,nextId=0;
  const client=new LatestWorkerClient({engine:'test',schema:'test.v1',release:'local',initialize:true,startupDeadlineMs:60,deadlineMs:10,now:()=>clock,
    createWorker:()=>{const worker={sent:[],postMessage(message){this.sent.push(message);},terminate(){this.terminated=true;}};workers.push(worker);return worker;},
    setTimer:(callback,delay)=>{const id=++nextId;timers.set(id,{callback,delay});return id;},clearTimer:id=>timers.delete(id),...options});
  const reply=(type,value={},worker=workers.at(-1),overrides={})=>worker.onmessage({data:{...worker.sent.at(-1),type,value,...overrides}});
  return {client,workers,timers,reply,advance(value){clock=value;}};
}
test('bounded initialization precedes an unchanged calculation deadline; cached workers skip repeated initialization',async()=>{
  const f=fixture(),a=f.client.request({id:1});assert.equal(f.workers[0].sent[0].type,'initialize');assert.equal('payload'in f.workers[0].sent[0],false);assert.equal([...f.timers.values()][0].delay,60);
  f.advance(59);f.reply('ready');assert.equal([...f.timers.values()][0].delay,10);assert.equal(f.workers[0].sent[1].type,'compute');
  f.reply('result',{id:1});assert.deepEqual(await a,{id:1});const b=f.client.request({id:2});assert.deepEqual(f.workers[0].sent.map(item=>item.type),['initialize','compute','compute']);f.reply('result',{id:2});assert.deepEqual(await b,{id:2});assert.equal(f.timers.size,0);
});
test('readiness at the initialization deadline is rejected even before a delayed timer runs',async()=>{
  const f=fixture(),result=f.client.request({});f.advance(60);f.reply('ready');await assert.rejects(result,error=>error.code==='initialization_deadline');assert.equal(f.workers[0].terminated,true);assert.equal(f.workers[0].sent.length,1);assert.equal(f.timers.size,0);
});
for(const initialize of [false,true])test(`late computation cannot beat a delayed timer with initialize=${initialize}`,async()=>{
  const f=fixture({initialize}),result=f.client.request({});if(initialize)f.reply('ready');f.advance(11);f.reply('result',{wrong:'late'});
  await assert.rejects(result,error=>error.code==='deadline');assert.equal(f.workers[0].terminated,true);assert.equal(f.timers.size,0);
});
test('an already-cleared initialization timer cannot terminate the calculation phase',async()=>{
  const f=fixture(),result=f.client.request({}),old=[...f.timers.values()][0].callback;f.advance(1);f.reply('ready');old();f.reply('result',{ok:true});assert.deepEqual(await result,{ok:true});assert.equal(f.timers.size,0);
});
test('an already-cleared previous-job timer cannot terminate a replacement job',async()=>{
  const f=fixture({initialize:false}),first=f.client.request({id:1}),old=[...f.timers.values()][0].callback;f.reply('result',{id:1});await first;
  const second=f.client.request({id:2});old();f.reply('result',{id:2});assert.deepEqual(await second,{id:2});
});
test('latest pending intent reuses preparation and never computes the superseded request',async()=>{
  const f=fixture(),a=f.client.request({id:1}).catch(error=>error.code),b=f.client.request({id:2}).catch(error=>error.code),c=f.client.request({id:3});
  assert.equal(await b,'superseded');f.advance(40);f.reply('ready');assert.equal(await a,'superseded');assert.equal(f.workers.length,1);assert.equal(f.workers[0].sent.length,2);assert.equal(f.workers[0].sent[1].payload.id,3);
  f.reply('result',{id:3});assert.deepEqual(await c,{id:3});assert.equal(f.timers.size,0);
});
test('cancelling preparation terminates its worker and late readiness cannot adopt a replacement',async()=>{
  const f=fixture(),a=f.client.request({}).catch(error=>error.code),old=f.workers[0];f.client.cancel();assert.equal(await a,'cancelled');assert.equal(old.terminated,true);
  const b=f.client.request({});f.reply('ready',{},old);assert.equal(f.workers[1].sent.length,1);f.reply('ready');f.reply('result',{fresh:true});assert.deepEqual(await b,{fresh:true});assert.equal(f.timers.size,0);
});
test('initialization timeout terminates one worker and admits only the latest pending replacement',async()=>{
  const f=fixture(),a=f.client.request({}).catch(error=>error.code),b=f.client.request({id:2});f.advance(60);[...f.timers.values()][0].callback();assert.equal(await a,'initialization_deadline');assert.equal(f.workers[0].terminated,true);assert.equal(f.workers[1].sent[0].type,'initialize');
  f.reply('ready');f.reply('result',{id:2});assert.deepEqual(await b,{id:2});assert.equal(f.timers.size,0);
});
test('invalid readiness identity and initialization failure cannot leave a prepared worker cached',async()=>{
  for(const overrides of [{schema:'wrong'},{type:'error',error:{code:'unavailable',message:'engine download failed'}}]){
    const f=fixture(),a=f.client.request({});f.reply('ready',{},undefined,overrides);await assert.rejects(a);assert.equal(f.workers[0].terminated,true);
    const b=f.client.request({});assert.equal(f.workers[1].sent[0].type,'initialize');f.reply('ready');f.reply('result',{ok:true});await b;
  }
});
test('unexpected readiness during computation is a protocol failure',async()=>{
  const f=fixture(),result=f.client.request({});f.reply('ready');f.reply('ready');await assert.rejects(result,error=>error.code==='protocol');assert.equal(f.workers[0].terminated,true);
});
test('disposal clears both startup intents and observes late responses',async()=>{
  const f=fixture(),a=f.client.request({}).catch(error=>error.code),b=f.client.request({}).catch(error=>error.code);f.client.dispose();assert.equal(await a,'cancelled');assert.equal(await b,'cancelled');f.reply('ready');await assert.rejects(f.client.request({}),error=>error.code==='disposed');assert.equal(f.timers.size,0);
});
test('invalid initialization bounds and clocks fail explicitly without an orphaned worker',async()=>{
  for(const startupDeadlineMs of [0,-1,NaN,Infinity,1.5])assert.throws(()=>fixture({startupDeadlineMs}),/initialization/i);
  const f=fixture({now:()=>NaN});await assert.rejects(f.client.request({}),/clock/i);assert.equal(f.workers[0].terminated,true);assert.equal(f.timers.size,0);
});
test('a reversing preparation clock cannot admit readiness',async()=>{
  const f=fixture();f.advance(20);const result=f.client.request({});f.advance(19);f.reply('ready');await assert.rejects(result,error=>error.code==='clock');assert.equal(f.workers[0].terminated,true);
});
