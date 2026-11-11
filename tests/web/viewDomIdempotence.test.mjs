import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';

async function fixture(){
  const writes=[],nodes=new Map();
  class ElementHost {
    constructor(id){this.id=id;this.childNodes=[];this.attributes=new Map();}
    get textContent(){return this.childNodes.filter(n=>n.nodeType!==8).map(n=>n.textContent).join('');}
    set textContent(value){writes.push([this.id,'text']);const text=value==null?'':String(value);this.childNodes=text?[{nodeType:3,textContent:text}]:[];}
    getAttribute(name){return this.attributes.get(name)??null;}
    setAttribute(name,value){writes.push([this.id,name]);this.attributes.set(name,String(value));}
    get hidden(){return this.attributes.has('hidden');}
    set hidden(value){writes.push([this.id,'hidden']);if(value)this.attributes.set('hidden','');else this.attributes.delete('hidden');}
    get inert(){return this.attributes.has('inert');}
    set inert(value){writes.push([this.id,'inert']);if(value)this.attributes.set('inert','');else this.attributes.delete('inert');}
    get classList(){const self=this;return {toggle(name,force){const classes=new Set((self.getAttribute('class')||'').split(/\s+/).filter(Boolean));
      if(classes.has(name)!==force){if(force)classes.add(name);else classes.delete(name);self.setAttribute('class',[...classes].join(' '));}return force;}};}
    replaceChildren(){writes.push([this.id,'replaceChildren']);this.childNodes=[];}
    get dataset(){return this.data??={};}
  }
  const ids=['viewInspector','destinationOverview','panelToggle','timeline','timelineToggle','focusToggle','solarObservation',
    'exploreObservation','exploreResearch','observationStatus','observationUnavailable','observationLoading','observationMedia','observationImage',
    'viewTitle','plainInsight','surfaceInsight','viewSource','viewTime','viewAvailability','snapshotStatus','retrySnapshot'];
  for(const id of ids)nodes.set(id,new ElementHost(id));
  const body=new ElementHost('body'),calls={prepare:0,draw:[],destination:0,resizes:0};
  const store={activeMode:'today',state:{run:{time_seconds:0}},presentation:null,sky:{presentation:null},orrery:{presentation:null}};
  const document={body,getElementById:id=>nodes.get(id)||null,querySelector:selector=>selector==='.control-panel'?nodes.get('viewInspector'):null};
  const context=vm.createContext({document,window:{dispatchEvent(){calls.resizes++;}},Event:class{constructor(type){this.type=type;}}});
  const urls=['view.js','workspace.js','explorer.js'].map(name=>new URL('../../apps/web/js/'+name,import.meta.url));
  const [view,workspace,explorer]=await loadSourceModules(context,urls,{resolveImport:(_specifier,url)=>{
    if(url.pathname.endsWith('/store.js'))return {store};
    if(url.pathname.endsWith('/viewRegistry.js'))return {
      getResearchRenderer:()=>({prepare:force=>{assert.equal(force,true);calls.prepare++;},draw:(...args)=>calls.draw.push(args)}),
      getDestinationRenderer:()=>()=>{calls.destination++;},
    };
  }});
  return {view,workspace,explorer,store,nodes,body,writes,calls};
}

test('unchanged workspace refresh keeps native setters idle and repairs live DOM tampering',async()=>{
  const h=await fixture();h.workspace.renderWorkspace('today');h.writes.length=0;const resized=h.calls.resizes;
  h.workspace.renderWorkspace('today');assert.equal(h.writes.length,0,'stable layout should not replace button text or repeat attribute/property assignments');
  assert.equal(h.calls.resizes,resized);
  h.workspace.workspace.focus=true;h.workspace.renderWorkspace('today');
  assert.equal(h.nodes.get('focusToggle').textContent,'Exit focus');assert.equal(h.nodes.get('focusToggle').getAttribute('aria-pressed'),'true');
  const toggle=h.nodes.get('panelToggle');toggle.childNodes=[{nodeType:1,textContent:toggle.textContent}];
  toggle.attributes.set('aria-expanded','wrong');h.nodes.get('viewInspector').hidden=false;h.writes.length=0;
  h.workspace.renderWorkspace('today');assert.equal(toggle.childNodes.length,1);assert.equal(toggle.childNodes[0].nodeType,3,'equal aggregate text still flattens nested markup');
  assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(h.nodes.get('viewInspector').hidden,true);assert.ok(h.writes.length>0);
});

test('unchanged observation controls avoid setters and changed media state stays current',async()=>{
  const h=await fixture();h.explorer.explorer.media='ready';h.explorer.renderExplorer('today');h.writes.length=0;
  h.explorer.renderExplorer('today');assert.equal(h.writes.length,0,'stable observation caption and controls should keep their DOM');
  h.explorer.explorer.media='failed';h.explorer.renderExplorer('today');
  assert.equal(h.nodes.get('observationUnavailable').hidden,false);assert.equal(h.nodes.get('observationLoading').hidden,true);
  assert.equal(h.nodes.get('observationImage').hidden,true);assert.equal(h.nodes.get('observationMedia').getAttribute('aria-busy'),'false');
  assert.ok(h.writes.length>0);
});

test('unchanged header preserves leaves but still recomputes current facts and repairs replaced text',async()=>{
  const h=await fixture();h.store.activeMode='orrery';let reads=0,time='epoch one';
  const p={headline:'Accepted scene',sourceKind:'model',providerLabel:'Reference',availability:'ready',get timeLabel(){reads++;return time;}};
  h.store.orrery.presentation=p;h.view.renderAll();const leaf=h.nodes.get('viewTime').childNodes[0];h.writes.length=0;const initialReads=reads,initialDestination=h.calls.destination;
  h.view.renderAll('resize');assert.equal(h.writes.length,0,'an unchanged header refresh should perform no native DOM assignments');
  assert.equal(h.nodes.get('viewTime').childNodes[0],leaf);assert.ok(reads>initialReads);assert.ok(h.calls.destination>initialDestination);
  time='epoch two';p.providerLabel='Updated reference';p.error='retained update failure';p.availability='last_valid';h.view.renderAll('resize');
  assert.equal(h.nodes.get('viewTime').textContent,'epoch two');assert.equal(h.nodes.get('viewSource').textContent,'model · Updated reference');
  assert.match(h.nodes.get('viewAvailability').textContent,/last valid.*retained update failure/);
  h.nodes.get('viewTitle').childNodes=[{nodeType:3,textContent:'stale external edit'}];h.view.renderAll('resize');assert.equal(h.nodes.get('viewTitle').textContent,'Solar System');
});

test('resize retains fresh research preparation and draw intent even when the DOM is unchanged',async()=>{
  const h=await fixture();h.explorer.explorer.mode='research';h.store.presentation={headline:'Model',sourceKind:'model',timeLabel:'model epoch',availability:'ready'};
  h.view.renderAll('resize');h.writes.length=0;h.view.renderAll('resize');
  assert.equal(h.calls.prepare,2);assert.deepEqual(h.calls.draw,[[true,true],[true,true]]);
  assert.equal(h.writes.length,0,'idempotence cannot be implemented by skipping fresh preparation');
  h.store.presentation.error='new failure';h.store.presentation.availability='last_valid';h.store.state.run.time_seconds=42;h.view.renderAll('resize');
  assert.equal(h.calls.prepare,3);assert.match(h.nodes.get('snapshotStatus').textContent,/elapsed time 42 s/);
  assert.match(h.nodes.get('snapshotStatus').textContent,/new failure/);assert.equal(h.nodes.get('retrySnapshot').hidden,false);
});


test('observation failure and retry stay visible in the header outside the closed view notes',async()=>{
  const h=await fixture(),status=h.nodes.get('viewAvailability');
  h.explorer.explorer.media='ready';h.view.updateTaskHeader();
  assert.equal(status.hidden,true,'ready observation keeps the compact header');
  for(const media of ['failed','loading','failed']){
    h.explorer.explorer.media=media;h.view.updateTaskHeader();
    assert.equal(status.hidden,false,`${media} must be visible without opening About`);
    assert.match(status.textContent,media==='failed'?/could not.*load|unavailable|failed/i:/loading/i);
    assert.match(h.nodes.get('viewSource').textContent,/observed.*NASA/);
    h.writes.length=0;h.view.updateTaskHeader();assert.equal(h.writes.length,0,'unchanged status is idempotent');
  }
  h.explorer.explorer.media='ready';h.view.updateTaskHeader();assert.equal(status.hidden,true);
  h.explorer.explorer.mode='research';h.view.updateTaskHeader();assert.equal(status.hidden,false,'other views retain availability');
  const html=fs.readFileSync(new URL('../../apps/web/index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('id="viewAvailability"')<html.indexOf('<details id="viewNotes"'),
    'status is a header sibling before the collapsed disclosure');
  const css=fs.readFileSync(new URL('../../apps/web/styles.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/body\[data-surface="today"\]\[data-experience="observe"\]\s+#viewAvailability\s*[,{}]/,
    'observe CSS cannot unconditionally suppress the visible status');
});
