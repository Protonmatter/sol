import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {createViewLoader} from '../../apps/web/js/viewLoader.js';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';

// Execute full Research/wavelength sources and the real app activation callback.
// Rendering/data host boundaries count requests; they do not claim pixel/model acceptance.
async function fixture(t){
  const attrs=new Map(),renders=[],timers=new Map(),retries=[];let timer=0,loads=0,failRender=false,hideOnRender=false;
  const snapshot=Object.freeze({marker:'renderer-boundary identity, not scientific fixture data'});
  const store={state:snapshot,activeMode:'today',wavelength:'continuum',selectedRegionId:null,timelineIndex:-1,liveEngineRun:false};
  const input=()=>({checked:false,addEventListener(){}}),nodes={layerConfidence:input(),layerRegions:input()};
  for(const id of ['viewCodePanel','viewCodeStatus','viewCodeRetry','viewTitle'])nodes[id]={hidden:false,textContent:'',focus(){}};
  const document={hidden:false,activeElement:null,body:{setAttribute(name,value){attrs.set(name,value);}},getElementById:id=>nodes[id]||null,
    querySelectorAll:()=>[],addEventListener(){}};
  const renderAll=()=>{
    renders.push({snapshot:store.state,wavelength:store.wavelength,activeMode:store.activeMode,timelineIndex:store.timelineIndex,
      liveEngineRun:store.liveEngineRun,selectedRegionId:store.selectedRegionId,initialized:attrs.get('data-view-initialized')});
    if(hideOnRender)document.hidden=true;if(failRender)throw Error('entry render failed');
  };
  const pending=new Promise(()=>{}),noop=()=>{};
  const context=vm.createContext({document,window:{addEventListener(){}},Event:class{},store,explorer:{mode:'research'},
    renderAll,updateTaskHeader:noop,updateModeButtons:noop,registerDestinationRenderer:noop});
  const [research]=await loadSourceModules(context,[new URL('../../apps/web/js/research.js',import.meta.url)],{resolveImport:(_specifier,url)=>{
    const name=url.pathname.split('/').at(-1);
    if(name==='store.js')return {store};
    if(name==='view.js')return {renderAll};
    if(name==='config.js')return {TOUR_STEPS:[],WAVELENGTHS:[],BASE_IMAGES:{}};
    if(name==='data.js')return {loadState:()=>{loads++;return pending;},baseImageState:()=> 'pending',retryBaseImage:id=>retries.push(id)};
    if(name==='timeline.js')return Object.fromEntries(['setTimelineFrame','goLive','togglePlay','runLiveEngine','stopPlay','cancelLiveEngine','stepTimeline'].map(name=>[name,noop]));
    if(name==='tour.js')return {startTour:noop,endTour:noop,showTourStep:noop};
    if(name==='sunlayers.js')return {buildSunCutaway:noop};
    if(name==='workspace.js')return {openInspector:noop};
    if(name==='researchView.js')return {};
  }});
  // The fixture replaces every loader, so document recovery has nothing to probe or reload.
  context.createDocumentRecovery=()=>async()=>false;
  context.createViewLoader=options=>createViewLoader({...options,loaders:{research:async()=>research,sky:async()=>({}),orrery:async()=>({})},
    now:()=>0,setTimer(fn){timers.set(++timer,fn);return timer;},clearTimer(id){timers.delete(id);}});
  const app=fs.readFileSync(new URL('../../apps/web/app.js',import.meta.url),'utf8');
  const begin=app.indexOf('const loadedViews='),end=app.indexOf("\ndocument.getElementById('viewCodeRetry')?.addEventListener",begin);
  assert.ok(begin>=0&&end>begin);
  vm.runInContext(app.slice(begin,end)+'\nglobalThis.__entryLoader=viewCode;',context);
  const loader=context.__entryLoader;t.after(()=>loader.activate('observe').catch(()=>null));
  return {loader,research,attrs,renders,retries,store,snapshot,document,loads:()=>loads,
    fail(value){failRender=value;},hide(value){hideOnRender=value;}};
}

test('first app Research entry requests one complete render with current model controls before data publication',async t=>{
  const h=await fixture(t);await h.loader.activate('research');
  assert.equal(h.renders.length,1,'setWavelength, entry and activation must not repeat the same render');
  const row=h.renders[0];assert.equal(row.snapshot,h.snapshot);assert.equal(row.wavelength,'model');assert.equal(row.activeMode,'today');
  assert.equal(row.timelineIndex,-1);assert.equal(row.liveEngineRun,false);assert.equal(row.selectedRegionId,null);assert.equal(row.initialized,'false');
  assert.equal(h.loads(),1);assert.deepEqual(h.retries,['model']);assert.equal(h.loader.state.initialized,true);
});

test('public Research entry still renders once directly on both first call and reentry',async t=>{
  const h=await fixture(t);h.research.enterResearch();assert.equal(h.renders.length,1);
  h.renders.length=0;h.research.enterResearch();assert.equal(h.renders.length,1);assert.equal(h.loads(),1);
  assert.equal(h.store.state,h.snapshot);assert.equal(h.renders[0].wavelength,'model');
});

test('cached app reentry renders once while retaining initialized content and pending data ownership',async t=>{
  const h=await fixture(t);await h.loader.activate('research');await h.loader.activate('observe');h.renders.length=0;
  await h.loader.activate('research');assert.equal(h.renders.length,1);assert.equal(h.renders[0].initialized,'true');assert.equal(h.loads(),1);
});

test('entry rendering failure remains uninitialized and retry still performs its complete render',async t=>{
  const h=await fixture(t);h.fail(true);await assert.rejects(h.loader.activate('research'),/entry render failed/);
  assert.equal(h.loader.state.initialized,false);assert.equal(h.loads(),0);
  h.fail(false);h.renders.length=0;await h.loader.retry();assert.equal(h.renders.length,1);assert.equal(h.loads(),1);assert.equal(h.loader.state.initialized,true);
});

test('hidden during the owned entry render pauses publication and visible resume renders current state once',async t=>{
  const h=await fixture(t);h.hide(true);assert.equal(await h.loader.activate('research'),null);
  assert.equal(h.loader.state.status,'paused');assert.equal(h.loader.state.initialized,false);assert.equal(h.renders.length,1);
  h.hide(false);h.document.hidden=false;h.renders.length=0;await h.loader.resumeLoading();
  assert.equal(h.renders.length,1);assert.equal(h.loads(),1);assert.equal(h.loader.state.initialized,true);
});
