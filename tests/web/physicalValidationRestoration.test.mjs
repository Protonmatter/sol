import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {appearanceReference,earthCloudRole} from '../../apps/web/js/planetAppearance.js';
import {terrainReference} from '../../apps/web/js/terrainAssets.js';
import {BODY} from '../../apps/web/js/bodyData.js';

const source=fs.readFileSync(new URL('../../tools/physical_rendering_validation.mjs',import.meta.url),'utf8');
function between(start,end){
  assert.equal(source.split(start).length,2);
  const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
  assert.ok(last>first);return source.slice(first,last);
}
async function resourceWait(s,onImports){
  let polling;
  const context=vm.createContext({assert,URL,window:{},document:{querySelector:()=>({src:'https://local.test/app.js?v=restore-test'})},
    page:{waitForFunction:(fn,options,...args)=>polling(()=>fn(...args),options)},
    readStateJSON:()=>JSON.stringify({...s,shaderErrors:[]})});
  if(onImports){
    const PagePromise=vm.runInContext('Promise',context),all=PagePromise.all.bind(PagePromise);
    PagePromise.all=inputs=>new PagePromise((resolve,reject)=>{all(inputs).then(values=>onImports(values,resolve),reject);});
  }
  vm.runInContext('globalThis.state=async()=>JSON.parse(readStateJSON())',context);
  const modules=new Map();
  for(const [name,values] of Object.entries({'store.js':{store:{orrery:s}},'planetAppearance.js':{appearanceReference,earthCloudRole}})){
    const module=new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});
    await module.link(()=>{});await module.evaluate();modules.set('./js/'+name+'?v=restore-test',module);
  }
  const module=new vm.SourceTextModule('export '+between('async function waitReady(','async function capture('),{context,
    importModuleDynamically:specifier=>{assert.ok(modules.has(specifier));return modules.get(specifier);}});
  await module.link(()=>{});await module.evaluate();
  return (poll,options={terrain:true})=>{polling=poll;return module.namespace.waitReady('Mars',options);};
}
async function complete(h){for(let i=0;i<3;i++){h.completePrograms();if(h.frames.size)h.frame(100);await h.settle();}}
async function boot(t){
  const h=await orreryHarness(t,{controls:true,parallelPrograms:true,reducedMotion:true,
    incidentField:async()=>({values:new Float32Array(4*257*195),width:257,height:195,domain:{minHeightKm:0,maxHeightKm:16,quadratic:true}}),
    terrainMesh:async body=>{const radius=BODY[body].radiusKm,ref=terrainReference(body);return {
      pos:new Float32Array([1,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,0,1]),idx:new Uint16Array([0,1,2]),
      width:4,height:2,heightsKm:new Float32Array(8),minRadiusKm:radius,maxRadiusKm:radius,
      sourceId:ref.id,sourceSha256:ref.sha256,shadow:{shape:[radius,radius,radius,.5],poles:[0,0]}};}});
  t.after(()=>h.leaveOrrery());const entry=h.enterOrrery();await h.settle();await complete(h);await entry;
  h.setAnimate(false);h.input('orreryAnchor','Mars','change');await h.settle();await complete(h);
  image(h).onload();await h.settle();assert.equal(h.state.terrainStatus.Mars,'ready');assert.equal(h.state.opticsStatus.Mars,'ready');
  return h;
}
function image(h){const asset=appearanceReference('Mars'),image=h.images.findLast(candidate=>candidate.src===asset.path);
  assert.ok(image);[image.width,image.height]=asset.dimensions;return image;}

test('real context restoration waits past stale loss statuses for rebuilt resources',async t=>{
  const h=await boot(t),invariant=JSON.stringify([h.state.renderUnix,h.state.bodies]);
  h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');
  assert.equal(h.state.programStatus.base,'loading');assert.equal(h.state.terrainStatus.Mars,undefined);
  assert.equal(h.state.appearanceStatus[appearanceReference('Mars').id],'unavailable');
  const wait=await resourceWait(h.state);
  await wait(async(poll,options)=>{
    assert.equal(options.timeout,31234);assert.equal(options.polling,100);
    assert.equal(await poll(),false,'Retained context-loss statuses must not terminate pending base restoration');
    await complete(h);assert.equal(h.state.programStatus.base,'ready');
    assert.equal(h.state.appearanceStatus[appearanceReference('Mars').id],'loading');
    assert.equal(await poll(),false,'New image/physical requests must still complete');
    image(h).onload();await complete(h);
    assert.equal(await poll(),true);
  },{terrain:true,timeoutMs:31234});
  assert.equal(JSON.stringify([h.state.renderUnix,h.state.bodies]),invariant);
});

test('actual base restoration failure remains terminal and fails resource admission',async t=>{
  const h=await boot(t);h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');
  h.setGraphicsFailure('link');await complete(h);
  assert.equal(h.state.programStatus.base,'unavailable');assert.ok(h.state.engineError);
  const wait=await resourceWait(h.state);
  await assert.rejects(wait(async poll=>assert.equal(await poll(),true)),/graphics.*restoration|graphics.*unavailable|base programs unavailable/i);
});

test('actual base-ready promise boundary cannot expose loss statuses before its source restart',async t=>{
  const h=await boot(t);h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');
  let releaseImports,held=false,base=h.state.programStatus.base,observedBoundary=false;
  const wait=await resourceWait(h.state,(values,resolve)=>{
    if(held)resolve(values);else{held=true;releaseImports=()=>resolve(values);}
  });
  // Release the pending browser import at the real finishGL publication. This
  // queues the actual validator continuation immediately before production's
  // result.then(restored), without replacing either lifecycle implementation.
  Object.defineProperty(h.state.programStatus,'base',{configurable:true,enumerable:true,
    get(){if(base==='ready'&&h.state.appearanceStatus[appearanceReference('Mars').id]==='unavailable')observedBoundary=true;return base;},
    set(value){base=value;if(value==='ready')releaseImports();}});
  await wait(async poll=>{
    const pending=poll();await h.settle();assert.equal(typeof releaseImports,'function');
    h.completePrograms();h.frame(100);
    assert.equal(await pending,false,'The base-ready continuation must restart sources before their statuses are read');
    assert.equal(observedBoundary,true,'Exercise the exact base-ready, source-not-restarted microtask boundary');
    await h.settle();image(h).onload();await complete(h);assert.equal(await poll(),true);
  });
});

test('a new image failure after actual base restoration is terminal, never silently retried',async t=>{
  const h=await boot(t);h.event('orreryCanvas','webglcontextlost');h.event('orreryCanvas','webglcontextrestored');
  await complete(h);image(h).onerror();await complete(h);
  assert.equal(h.state.programStatus.base,'ready');assert.equal(h.state.opticsStatus.Mars,'ready');
  const requests=h.images.length,wait=await resourceWait(h.state);
  await assert.rejects(wait(async poll=>assert.equal(await poll(),true)),/Source unavailable/);
  assert.equal(h.images.length,requests,'Validation must not retry a terminal source failure');
});

test('resource restoration uses only the remainder of the original request-time 40-second budget',async()=>{
  const block=between('    const restoreStarted=performance.now();','    evidence.context_restore=await page.evaluate(()=>');
  for(const elapsed of [31.2,31000,40000]){
    let now=500,passedTimeout;
    const context=vm.createContext({assert,performance:{now:()=>now},evidence:{},save(){},requestContextRestoration(){},
      page:{evaluate:async(_fn,options)=>{assert.equal(options.timeoutMs,10000);now+=elapsed;return {}; }},
      waitReady:async(body,options)=>{assert.equal(body,'Mars');assert.equal(options.terrain,true);passedTimeout=options.timeoutMs;}});
    const run=vm.runInContext(`(async()=>{${block}})()`,context);
    if(elapsed>=40000){await assert.rejects(run,/40000ms from request/);assert.equal(passedTimeout,undefined);}
    else{await run;assert.equal(passedTimeout,Math.floor(40000-elapsed));}
  }
});
