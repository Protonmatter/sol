import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import * as cleanup from '../../tools/worker_coverage.mjs';

// The unchanged legacy entry point is the baseline control until the stricter
// qualification entry point is implemented. Its false-clean paths must fail.
const qualify=cleanup.closeOwnedBrowserVerified??cleanup.closeOwnedBrowser;
function child(){return Object.assign(new EventEmitter(),{pid:42123,exitCode:null,signalCode:null,
  kill(){this.signalCode='SIGKILL';this.emit('exit',null,'SIGKILL');return true;}});}
const details=error=>(error.errors??[error]).map(item=>String(item.message??item)).join('\n');

test('legacy cleanup retains its existing diagnostic and owned-kill behavior',async()=>{
  const process=child(),messages=[];
  await cleanup.closeOwnedBrowser({process:()=>process,close:async()=>{throw Error('legacy graceful failure');}},
    {timeoutMs:5,diagnostic:message=>messages.push(message)});
  assert.deepEqual(messages,['legacy graceful failure']);assert.equal(process.signalCode,'SIGKILL');
});

test('qualification waits for the owned child exit after close resolves',async()=>{
  const process=child();
  const browser={process:()=>process,close:async()=>{setImmediate(()=>{process.exitCode=0;process.emit('exit',0,null);});}};
  assert.equal(await qualify(browser,{timeoutMs:30}),undefined);assert.equal(process.exitCode,0);
  assert.equal(process.listenerCount('exit'),0);assert.equal(process.listenerCount('error'),0);
});

test('graceful-close rejection remains failed even when owned kill exits',async()=>{
  const process=child();
  await assert.rejects(()=>qualify({process:()=>process,close:async()=>{throw Error('graceful refusal');}},{timeoutMs:5}),
    error=>{assert.match(details(error),/graceful refusal/);return true;});
  assert.equal(process.signalCode,'SIGKILL');
});

test('close acknowledgement without physical exit cannot pass qualification',async()=>{
  const process=child();
  await assert.rejects(()=>qualify({process:()=>process,close:async()=>{}},{timeoutMs:5}),/owned browser exit/i);
  assert.equal(process.listenerCount('exit'),0);assert.equal(process.listenerCount('error'),0);
});

test('missing launch ownership is refused before browser-close mutation',async()=>{
  let calls=0;
  await assert.rejects(()=>qualify({process:()=>null,close:async()=>{calls++;}},{timeoutMs:5}),/owned.*process/i);
  assert.equal(calls,0);
});

test('an already exited owned child makes verified retirement idempotent',async()=>{
  const process=child();process.exitCode=0;let calls=0;
  await qualify({process:()=>process,close:async()=>{calls++;throw Error('already retired');}},{timeoutMs:5});
  assert.equal(calls,0);
});

test('failed owned kill retains graceful failure and missing-exit evidence',async()=>{
  const process=child();process.kill=()=>{throw Error('owned kill failed');};
  await assert.rejects(()=>qualify({process:()=>process,close:async()=>{throw Error('graceful refusal');}},{timeoutMs:5}),
    error=>{const text=details(error);assert.match(text,/graceful refusal/);assert.match(text,/owned kill failed/);assert.match(text,/owned browser exit/i);return true;});
  assert.equal(process.listenerCount('exit'),0);assert.equal(process.listenerCount('error'),0);
});

for(const field of ['exitCode','signalCode'])test(`incomplete ${field} cannot be mistaken for physical exit`,async()=>{
  const process=child();delete process[field];let calls=0;
  await assert.rejects(()=>qualify({process:()=>process,close:async()=>{calls++;}},{timeoutMs:5}),/owned.*state/i);
  assert.equal(calls,0);
});

test('invalid deadlines are refused before touching launch ownership',async()=>{
  for(const timeoutMs of [0,-1,NaN,Infinity,1.5,60001]){
    let calls=0;
    await assert.rejects(()=>qualify({process:()=>{calls++;return child();},close:async()=>{}},{timeoutMs}),RangeError);
    assert.equal(calls,0);
  }
});

test('a child-process error is retained and its listener is retired',async()=>{
  const process=child();
  await assert.rejects(()=>qualify({process:()=>process,close:async()=>{process.emit('error',Error('owned process fault'));process.exitCode=0;process.emit('exit',0,null);}},{timeoutMs:5}),
    error=>{assert.match(details(error),/owned process fault/);return true;});
  assert.equal(process.listenerCount('error'),0);
});
