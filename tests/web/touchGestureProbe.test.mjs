import assert from 'node:assert/strict';
import test from 'node:test';
import * as probe from '../../tools/touch_gesture_probe.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

async function readinessFixture({appReady='true',surface='orrery',code='ready',system}={}){
  assert.equal(typeof probe.touchSystemReady,'function');let imports=0;
  const store={orrery:system},context=vm.createContext({URL,document:{body:{dataset:{appReady,surface,viewCode:code,viewCodeName:'orrery'}},
    querySelector:()=>({src:'http://127.0.0.1/app.js?v=fixed'}),getElementById:()=>({checkVisibility:()=>true,getBoundingClientRect:()=>({width:390,height:600})})}});
  const model=new vm.SyntheticModule(['store'],function(){this.setExport('store',store);},{context});await model.link(()=>{});await model.evaluate();
  const module=new vm.SourceTextModule(`export default (${probe.touchSystemReady.toString()});`,{context,importModuleDynamically:async()=>{imports++;return model;}});
  await module.link(()=>{});await module.evaluate();
  return {run:()=>module.namespace.default(),imports:()=>imports,store,context};
}
test('touch readiness waits for bound shell and the current destination before importing lazy state',async()=>{
  for(const options of [{appReady:''},{appReady:'false'},{surface:'sky'}]){
    const f=await readinessFixture(options);assert.equal(await f.run(),false);assert.equal(f.imports(),0);
  }
  const missing=await readinessFixture();delete missing.context.document.body.dataset.appReady;assert.equal(await missing.run(),false);assert.equal(missing.imports(),0);
});
test('touch readiness tolerates absent lazy state and then requires ready accepted rendering',async()=>{
  const f=await readinessFixture({system:null});assert.equal(await f.run(),false);
  f.store.orrery={engineError:'',active:true,bodies:Array(9).fill({}),backend:'WebGL2 · fixture'};assert.equal(await f.run(),true);
  f.context.document.body.dataset.viewCode='loading';assert.equal(await f.run(),false);
  f.context.document.body.dataset.viewCode='ready';f.store.orrery.active=false;assert.equal(await f.run(),false);
});
test('touch readiness exposes engine and code failures for immediate explicit rejection',async()=>{
  const engine=await readinessFixture({system:{engineError:'engine failed'}});assert.equal(await engine.run(),true);
  const code=await readinessFixture({code:'failed',system:null});assert.equal(await code.run(),true);
});

test('surviving finger accepts actual one-pixel orbit movement without zoom',()=>{
  probe.assertSurvivingPointerMotion({az:.54,radius:17},{az:.532,radius:17},1);
  probe.assertSurvivingPointerMotion({az:.54,radius:17},{az:.38,radius:17},20);
});

test('surviving finger rejects zero or opposite motion that the old tolerance accepted',()=>{
  assert.throws(()=>probe.assertSurvivingPointerMotion({az:.54,radius:17},{az:.54,radius:17},1),/Surviving finger/);
  assert.throws(()=>probe.assertSurvivingPointerMotion({az:.54,radius:17},{az:.548,radius:17},1),/Surviving finger/);
});

test('surviving finger rejects continued pinch zoom even when the angle matches',()=>{
  assert.throws(()=>probe.assertSurvivingPointerMotion({az:.54,radius:17},{az:.532,radius:17.14},1),/must not zoom/);
});

function finalizerFixture({lateError=false,lateRequest=false}={}){
  const source=fs.readFileSync(new URL('../../tools/touch_gesture_probe.mjs',import.meta.url),'utf8');
  const first='    clearTimeout(timer);let closeTimer,cleanupError;',last='    if(cleanupError)throw cleanupError;';
  assert.equal(source.split(first).length,2);assert.equal(source.split(last).length,2);
  const begin=source.indexOf(first),end=source.indexOf(last,begin)+last.length;
  const evidence={status:'passed',errors:[],offOriginRequests:[]};let written;
  const context=vm.createContext({timer:null,primaryError:undefined,evidence,setTimeout,clearTimeout,path,directory:'/owned-output',
    context:{async close(){await Promise.resolve();if(lateError)evidence.errors.push('late child error during close');if(lateRequest)evidence.offOriginRequests.push('https://blocked.invalid/late');}},
    fs:{writeFileSync(_file,text){written=JSON.parse(text);}}});
  return {run:()=>vm.runInContext(`(async()=>{${source.slice(begin,end)}})()`,context),evidence,written:()=>written};
}

test('touch finalizer rejects late child errors and off-origin requests without misreporting closure',async()=>{
  for(const options of [{lateError:true},{lateRequest:true}]){
    const f=finalizerFixture(options);await assert.rejects(f.run(),options.lateError?/late child error during close/:/blocked.invalid/);
    assert.equal(f.evidence.contextClosed,true);assert.equal(f.written().status,'failed');
    assert.deepEqual(f.written().errors,options.lateError?['late child error during close']:[]);
    assert.deepEqual(f.written().offOriginRequests,options.lateRequest?['https://blocked.invalid/late']:[]);
  }
});

test('touch finalizer retains successful acceptance when closing emits no error',async()=>{
  const f=finalizerFixture();await f.run();
  assert.equal(f.evidence.contextClosed,true);assert.equal(f.written().status,'passed');assert.deepEqual(f.written().errors,[]);
});
