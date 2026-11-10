import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';

async function harness(){
  const calls=[],nodes=new Map(),store={activeMode:'today',sky:null,orrery:null,presentation:null,state:{}},explorer={mode:'observe',media:'ready'};
  for(const id of ['plainInsight','destinationTitle','destinationDescription','destinationFacts','destinationPreview'])nodes.set(id,{textContent:'old body',dataset:{content:'old facts'},replaceChildren(){calls.push('clear facts');},hidden:false});
  const context=vm.createContext({document:{getElementById:id=>nodes.get(id)||null,querySelector:()=>null,body:{setAttribute(){}}}});
  const [view,registry]=await loadSourceModules(context,[new URL('../../apps/web/js/view.js',import.meta.url),new URL('../../apps/web/js/viewRegistry.js',import.meta.url)],{resolveImport:(_,url)=>{
    if(url.pathname.endsWith('/store.js'))return {store};
    if(url.pathname.endsWith('/workspace.js'))return {renderWorkspace(){calls.push('workspace');}};
    if(url.pathname.endsWith('/explorer.js'))return {explorer,renderExplorer(){calls.push('header');},currentObservationPresentation:()=>({headline:'Sun'})};
  }});
  return {view,registry,store,explorer,calls,nodes};
}
for(const target of ['sky','orrery'])test(`a registered overview does not render ${target} before that module's state exists`,async()=>{
  const h=await harness();h.registry.registerDestinationRenderer((surface,sky,system)=>{if(surface!=='today')assert.ok(surface==='sky'?sky:system);h.calls.push('destination');});
  h.store.activeMode=target;h.view.renderAll();assert.ok(!h.calls.includes('destination'));assert.equal(h.nodes.get('destinationTitle').textContent,target==='sky'?'My Sky':'Solar System');assert.ok(h.calls.includes('clear facts'));assert.equal(h.nodes.get('destinationPreview').hidden,true);
  h.store[target]={};h.view.renderAll();assert.ok(h.calls.includes('destination'));
});
test('Research preparation remains before header and drawing remains after it',async()=>{
  const h=await harness();h.explorer.mode='research';h.registry.registerResearchRenderer({prepare:on=>{assert.equal(on,true);h.calls.push('prepare');},draw:on=>{assert.equal(on,true);h.calls.push('draw');}});
  h.view.renderAll();assert.deepEqual(h.calls,['workspace','prepare','header','draw']);
});
test('invalid renderer adapters fail explicitly',async()=>{
  const h=await harness();assert.throws(()=>h.registry.registerResearchRenderer({}),/Invalid/);assert.throws(()=>h.registry.registerDestinationRenderer(null),/Invalid/);
});
test('pending Research cannot retain the saved observation description',async()=>{
  const h=await harness();h.view.updateTaskHeader();assert.equal(h.nodes.get('plainInsight').textContent,'Sun');
  h.explorer.mode='research';h.view.updateTaskHeader();assert.match(h.nodes.get('plainInsight').textContent,/model.*separate.*observation/i);assert.notEqual(h.nodes.get('plainInsight').textContent,'Sun');
});
test('inactive Research cannot rebuild its hidden panels or canvases during another view update',async()=>{
  const h=await harness();let preparation=0,drawing=0;
  h.registry.registerResearchRenderer({prepare(){preparation++;},draw(){drawing++;}});
  for(const mode of ['today','sky','orrery']){h.store.activeMode=mode;h.view.renderAll();}
  assert.equal(preparation,0);assert.equal(drawing,0);
  h.store.activeMode='today';h.explorer.mode='research';h.view.renderAll();assert.equal(preparation,1);assert.equal(drawing,1);
});
