import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {createViewLoader} from '../../apps/web/js/viewLoader.js';

const tick=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const held=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
function fixture(t,{enterResearch=null,enterSky=()=>{},enterOrrery=async()=>{}}={}){
  const source=fs.readFileSync(new URL('../../apps/web/app.js',import.meta.url),'utf8');
  const begin=source.indexOf('const loadedViews='),end=source.indexOf("\ndocument.getElementById('viewCodeRetry')?.addEventListener",begin);
  assert.ok(begin>=0&&end>begin);
  const attrs=new Map(),timers=new Map(),imports=[],renderedFlags=[];let serial=0,renderFailure=false;
  const nodes=Object.fromEntries(['viewCodePanel','viewCodeStatus','viewCodeRetry','viewTitle'].map(id=>[id,{hidden:false,textContent:'',focus(){doc.activeElement=this;}}]));
  const doc={hidden:false,activeElement:null,body:{setAttribute(name,value){attrs.set(name,value);}},getElementById:id=>nodes[id]||null,querySelectorAll:()=>[]};
  // The production Research entry renders itself, including its initial model selection.
  const module={enterResearch:enterResearch??(()=>context.renderAll()),enterSky,enterOrrery,leaveResearch(){},leaveSky(){},leaveOrrery(){}};
  const context=vm.createContext({document:doc,store:{activeMode:'today'},explorer:{mode:'research'},updateModeButtons(){},registerDestinationRenderer(){},updateTaskHeader(){},renderAll(){renderedFlags.push(attrs.get('data-view-initialized'));if(renderFailure)throw Error('render failed');},
    createViewLoader(options){return createViewLoader({...options,loaders:Object.fromEntries(['research','sky','orrery'].map(name=>[name,async()=>{imports.push(name);return module;} ])),
      now:()=>0,setTimer(fn){timers.set(++serial,fn);return serial;},clearTimer(id){timers.delete(id);}});},
  });
  vm.runInContext(source.slice(begin,end)+'\nglobalThis.fixtureLoader=viewCode;globalThis.fixtureSelect=selectView;',context);
  const loader=context.fixtureLoader;t.after(()=>loader.activate('observe').catch(()=>null));
  return {loader,doc,nodes,attrs,imports,renderedFlags,select:context.fixtureSelect,renderFailure(value){renderFailure=value;}};
}

test('actual app publishes uninitialized loading and restores ready presentation after first success',async t=>{
  const h=fixture(t),pending=h.loader.activate('research');
  assert.equal(h.attrs.get('data-view-initialized'),'false');assert.equal(h.nodes.viewCodePanel.hidden,false);
  await pending;assert.equal(h.attrs.get('data-view-initialized'),'true');assert.equal(h.nodes.viewCodePanel.hidden,true);
});

test('actual app retains error/retry presentation and initializes only after a successful cached retry',async t=>{
  let fail=true;const h=fixture(t,{enterResearch(){if(fail)throw Error('prepare failed');}});
  await assert.rejects(h.loader.activate('research'),/prepare failed/);
  assert.equal(h.attrs.get('data-view-initialized'),'false');assert.equal(h.nodes.viewCodeRetry.hidden,false);
  fail=false;await h.loader.retry();assert.equal(h.attrs.get('data-view-initialized'),'true');assert.equal(h.imports.length,1);
});

test('actual app preserves an initialized view during re-entry instead of blanking accepted content',async t=>{
  const h=fixture(t);await h.loader.activate('sky');await h.loader.activate('observe');
  const pending=h.loader.activate('sky');assert.equal(h.attrs.get('data-view-initialized'),'true');await pending;
});

test('hidden-before-entry pauses ownership even before the visibility listener has run',async t=>{
  let entered=0;const h=fixture(t,{enterResearch(){entered++;}}),pending=h.loader.activate('research');h.doc.hidden=true;
  assert.equal(await pending,null);assert.equal(h.loader.state.status,'paused');assert.equal(h.loader.state.initialized,false);assert.equal(entered,0);
  h.doc.hidden=false;await h.loader.resumeLoading();assert.equal(entered,1);assert.equal(h.loader.state.initialized,true);
});

test('hidden-during-async-entry cannot publish first readiness before visibility ownership catches up',async t=>{
  const entry=held();let entered=0;const h=fixture(t,{async enterOrrery(){entered++;await entry.promise;}});
  const pending=h.loader.activate('orrery');await tick();assert.equal(h.loader.state.status,'activating');h.doc.hidden=true;entry.resolve();
  assert.equal(await pending,null);assert.equal(h.loader.state.status,'paused');assert.equal(h.loader.state.initialized,false);
  h.doc.hidden=false;await h.loader.resumeLoading();assert.equal(entered,2);assert.equal(h.loader.state.initialized,true);
});

test('Research entry render failure leaves initial content uninitialized and retryable',async t=>{
  const h=fixture(t);h.renderFailure(true);await assert.rejects(h.loader.activate('research'),/render failed/);
  assert.equal(h.attrs.get('data-view-initialized'),'false');h.renderFailure(false);await h.loader.retry();
  assert.equal(h.attrs.get('data-view-initialized'),'true');
});

test('selection publishes initial presentation before any renderer can measure or draw it',async t=>{
  const h=fixture(t);await h.loader.activate('observe');
  const pending=h.select();assert.equal(h.renderedFlags[0],'false');await pending;
  assert.equal(h.attrs.get('data-view-initialized'),'true');
});
