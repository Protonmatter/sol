import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {requestContextRestoration} from '../../tools/context_restore.mjs';

function fixture(){
  let now=0,lost=true,nextTimer=0;const listeners=[],timers=new Map();
  const canvas={
    addEventListener(type,fn,options={}){listeners.push({type,fn,capture:options===true||options.capture,once:options.once});},
    removeEventListener(type,fn,options=false){const index=listeners.findIndex(x=>x.type===type&&x.fn===fn&&!!x.capture===!!(options===true||options.capture));if(index>=0)listeners.splice(index,1);},
  };
  const window={__physicalLoss:{observed:true,canvas,context:{isContextLost:()=>lost},extension:{restoreContext(){}},lossMs:0}};
  const context={window,performance:{now:()=>now},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}};
  const invoke=vm.runInNewContext('('+requestContextRestoration.toString()+')',context);
  return {window,timers,invoke,
    restore(at,{stillLost=false}={}){now=at;lost=stillLost;const ordered=[...listeners].sort((a,b)=>Number(!!b.capture)-Number(!!a.capture));for(const item of ordered){if(!listeners.includes(item))continue;item.fn({target:canvas});if(item.once)canvas.removeEventListener(item.type,item.fn,item.capture);}},
    expire(at){now=at;for(const item of [...timers.values()])item.fn();},
  };
}

test('native restoration evidence retains its promise and the matching 10s deadline',async()=>{
  const f=fixture(),promise=f.invoke();assert.equal(f.window.__physicalRestorePromise,promise);
  assert.equal([...f.timers.values()][0].ms,10000);f.restore(52);
  const result=await promise;assert.equal(result.event_ms,52);assert.equal(result.callback_completed_ms,52);assert.equal(f.timers.size,0);
});
test('missing native restoration stays failed at the original deadline',async()=>{
  const f=fixture(),promise=f.invoke();const rejected=assert.rejects(promise,/10000ms deadline/);f.expire(10000);await rejected;assert.equal(f.window.__physicalRestoreEvidence.event_ms,null);
});
test('a late restored event cannot bypass a delayed JavaScript timeout callback',async()=>{
  const f=fixture(),promise=f.invoke();const rejected=assert.rejects(promise,/10000ms deadline/);f.restore(10001);await rejected;
});
test('unmatched loss and an event that leaves the context lost are rejected',async()=>{
  const f=fixture();f.window.__physicalLoss.observed=false;assert.throws(()=>f.invoke(),/Matching context loss/);
  f.window.__physicalLoss.observed=true;const promise=f.invoke(),rejected=assert.rejects(promise,/left matching context lost/);f.restore(20,{stillLost:true});await rejected;
});
