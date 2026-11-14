import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {TargetCloseError} from 'puppeteer-core';
import {createWorkerExceptionObserver} from '../../tools/worker_exception_observer.mjs';

const exception=message=>({exceptionDetails:{exception:{description:message},text:message}});
function fixture({send,create,timeoutMs=1000,maxTargets=128,unowned=false,now,onException,onSetupError}={}){
  const browser=new EventEmitter(),session=new EventEmitter(),owner={name:'pair',errors:[]},errors=[],targets=[];
  const context={};
  const target={type:()=> 'worker',url:()=> 'http://127.0.0.1/worker.js',browserContext:()=>context,
    createCDPSession:()=>create?create(session):Promise.resolve(session)};
  session.send=method=>send?send({method,session,browser,target}):Promise.resolve();
  const observer=createWorkerExceptionObserver(browser,{ownerForTarget:()=>unowned?undefined:owner,errors,targets,timeoutMs,maxTargets,now,onException,onSetupError});
  return {browser,session,target,owner,errors,targets,observer,start(){browser.emit('targetcreated',target);}};
}
test('runtime errors emitted during enable and after enable are both retained exactly once',async()=>{
  const f=fixture({send:async({method,session})=>{assert.equal(method,'Runtime.enable');session.emit('Runtime.exceptionThrown',exception('during enable'));}});
  f.start();await f.observer.settle();f.session.emit('Runtime.exceptionThrown',exception('after enable'));
  assert.deepEqual(f.owner.errors,['worker: during enable','worker: after enable']);assert.equal(f.targets[0].observation,'ready');f.observer.dispose();
});
test('settlement joins held setup before allowing a final owner snapshot',async()=>{
  let release;const f=fixture({create:()=>new Promise(resolve=>{release=resolve;})});f.start();
  let done=false;const joined=f.observer.settle().then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);
  release(f.session);await joined;assert.equal(done,true);assert.equal(f.targets[0].observation,'ready');f.observer.dispose();
});
test('a held setup failure is retained before settlement returns',async()=>{
  let reject;const f=fixture({create:()=>new Promise((_,fail)=>{reject=fail;})});f.start();const joined=f.observer.settle();
  reject(new Error('late setup failure'));await joined;assert.match(f.owner.errors.join(' '),/late setup failure/);f.observer.dispose();
});
test('a live-target error containing closed is not suppressed',async()=>{
  const f=fixture({send:async()=>{throw new Error('unexpected closed protocol channel');}});f.start();await f.observer.settle();
  assert.match(f.owner.errors.join(' '),/unexpected closed protocol channel/);f.observer.dispose();
});
test('confirmed destruction suppresses only its specific TargetCloseError',async()=>{
  const f=fixture({send:async({browser,target})=>{browser.emit('targetdestroyed',target);throw new TargetCloseError('Target closed');}});
  f.start();await f.observer.settle();assert.deepEqual(f.owner.errors,[]);assert.equal(f.targets[0].observation,'closed');f.observer.dispose();
});
test('destruction does not suppress a runtime exception or a different setup error',async()=>{
  const f=fixture({send:async({browser,target,session})=>{session.emit('Runtime.exceptionThrown',exception('real exception'));browser.emit('targetdestroyed',target);throw new Error('different closed error');}});
  f.start();await f.observer.settle();assert.equal(f.owner.errors.length,2);assert.match(f.owner.errors.join(' '),/real exception.*different closed error/);f.observer.dispose();
});
test('TargetCloseError without confirmed destruction remains a failure',async()=>{
  const f=fixture({send:async()=>{throw new TargetCloseError('Target closed');}});f.start();await f.observer.settle();
  assert.equal(f.owner.errors.length,1);f.observer.dispose();
});
test('unattributed worker errors enter the campaign error owner',async()=>{
  const f=fixture({unowned:true,send:async({session})=>session.emit('Runtime.exceptionThrown',exception('unowned'))});
  f.start();await f.observer.settle();assert.deepEqual(f.errors,['worker: unowned']);f.observer.dispose();
});
test('setup deadline bounds an unresolved physical creation and prevents late enable',async()=>{
  let release,enabled=0;const f=fixture({timeoutMs:10,create:()=>new Promise(resolve=>{release=resolve;}),send:async()=>{enabled++;}});
  f.start();await f.observer.settle();assert.match(f.owner.errors.join(' '),/deadline/);assert.equal(f.targets[0].observation,'failed');
  release(f.session);await Promise.resolve();await Promise.resolve();assert.equal(enabled,0);f.observer.dispose();
});
test('late enable rejection remains observed after a setup deadline',async()=>{
  let reject;const f=fixture({timeoutMs:10,send:()=>new Promise((_,fail)=>{reject=fail;})});f.start();await f.observer.settle();
  assert.match(f.owner.errors.join(' '),/deadline/);reject(new Error('late rejection'));await Promise.resolve();await Promise.resolve();
  assert.equal(f.targets[0].observation,'failed');f.observer.dispose();
});
test('observation capacity fails closed and normal target destruction records no exception',async()=>{
  const f=fixture({maxTargets:1});f.start();await f.observer.settle();f.browser.emit('targetdestroyed',f.target);
  assert.deepEqual(f.owner.errors,[]);f.browser.emit('targetcreated',{...f.target});await f.observer.settle();assert.match(f.errors.join(' '),/capacity/);f.observer.dispose();
});
for(const phase of ['create','enable','backward'])test(`arrival admission rejects ${phase} clock boundary before delayed timer delivery`,async()=>{
  let clock=0;
  const f=fixture({now:()=>clock,create:session=>{if(phase==='create')clock=1000;if(phase==='backward')clock=-1;return Promise.resolve(session);},
    send:async()=>{if(phase==='enable')clock=1000;}});
  f.start();await f.observer.settle();assert.equal(f.targets[0].observation,'failed');assert.match(f.owner.errors.join(' '),/deadline|invalid clock/);f.observer.dispose();
});
test('pending enable cannot be disposed and settled disposal removes installed listeners',async()=>{
  let finish;const f=fixture({send:()=>new Promise(resolve=>{finish=resolve;})});f.start();await Promise.resolve();
  assert.throws(()=>f.observer.dispose(),/before setup settled/);assert.equal(f.session.listenerCount('Runtime.exceptionThrown'),1);
  const joined=f.observer.settle();finish();await joined;f.observer.dispose();assert.equal(f.session.listenerCount('Runtime.exceptionThrown'),0);
});
test('structured runtime provenance and setup failures have separate explicit callbacks',async()=>{
  const runtime=[],setup=[];const f=fixture({onException:entry=>runtime.push(entry),onSetupError:entry=>setup.push(entry),
    send:async({session})=>{session.emit('Runtime.exceptionThrown',exception('precise integrity error'));throw new Error('setup failed');}});
  f.start();await f.observer.settle();assert.equal(runtime.length,1);assert.equal(runtime[0].message,'precise integrity error');assert.equal(runtime[0].target,f.target);
  assert.equal(setup.length,1);assert.match(String(setup[0].error),/setup failed/);assert.equal(f.owner.errors.length,2);f.observer.dispose();
});
test('a provenance callback failure cannot erase the runtime error or become uncaught',async()=>{
  const f=fixture({onException:()=>{throw Error('provenance failed');},send:async({session})=>session.emit('Runtime.exceptionThrown',exception('real error'))});
  f.start();await f.observer.settle();assert.deepEqual(f.owner.errors,['worker: real error']);assert.match(f.errors.join(' '),/provenance failed/);f.observer.dispose();
});
