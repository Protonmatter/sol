import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorerState, observationPresentation, explorer, initExplorer, renderExplorer} from '../../apps/web/js/explorer.js';

const asset = {label:'SDO / AIA 171 Å',capturedAt:'2026-09-12T00:07:22Z',sourceUrl:'https://sdo.gsfc.nasa.gov/example.jpg',credits:'NASA/SDO',interpretation:'False-color extreme ultraviolet',status:'archival'};
test('exploration defaults to observation and cannot manufacture a ready image',()=>{
  const state=createExplorerState();
  assert.equal(state.mode,'observe'); assert.equal(state.media,'loading');
  state.choose('research'); assert.equal(state.mode,'research');
  assert.throws(()=>state.choose('live'),/Unknown/);
  assert.equal(state.mode,'research');
});
test('observation revision retains its own capture time, source and registration restriction',()=>{
  const p=observationPresentation(asset,'ready');
  assert.equal(p.sourceKind,'observed'); assert.equal(p.availability,'ready');
  assert.match(p.timeLabel,/2026-09-12/); assert.match(p.timeLabel,/archival/i);
  assert.equal(p.compositingPermitted,false);
  assert.equal(p.sourceUrl,asset.sourceUrl);
  assert.equal(p.modelBundleIdentity,null);
});
test('loading, failed and unknown capture states never claim current observations',()=>{
  for(const media of ['loading','failed']) {
    const p=observationPresentation({...asset,capturedAt:null},media);
    assert.notEqual(p.availability,'ready');
    assert.match(p.timeLabel,/unavailable/);
    assert.doesNotMatch(p.headline,/live|current conditions/i);
  }
});

test('main application adopts an already loaded observation without requesting it again',()=>{
  const oldDocument=globalThis.document;
  let assignments=0,changes=0;
  const source='textures/solar-observation-171.jpg';
  const image={complete:true,naturalWidth:1024,currentSrc:'https://sol.example/'+source,
    get src(){return this.currentSrc;},set src(value){assignments++;},
    getAttribute(name){return name==='src'?source:null;},addEventListener(){}};
  globalThis.document={baseURI:'https://sol.example/',getElementById:id=>id==='observationImage'?image:null,querySelector:()=>null};
  try {
    initExplorer(()=>{},()=>{changes++;});
    assert.equal(explorer.media,'ready','an event fired before application startup is still observed');
    assert.equal(assignments,0,'adoption must not restart the parser-discovered image');
    assert.equal(changes,1);
  } finally {globalThis.document=oldDocument;explorer.media='loading';}
});

test('observation DOM preserves failure, retry, original image and deliberate Research navigation',()=>{
  const oldDocument=globalThis.document;
  const ids=['observationImage','observationSource','observationCredit','sunDiameter','sunTemperature',
    'exploreObservation','exploreResearch','openResearchTools','openEarthContext','sunWeather',
    'observationDetails','observationRetry','solarObservation','observationStatus','observationUnavailable',
    'observationMedia','observationLoading'];
  const nodes=Object.fromEntries(ids.map(id=>[id,{id,events:{},attributes:{},hidden:false,
    addEventListener(type,handler){this.events[type]=handler;},setAttribute(k,v){this.attributes[k]=v;},
    getAttribute(k){return k==='src'?this.src??null:this.attributes[k]??null;},
    querySelector(){return this;},focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}}]));
  const anchor={addEventListener(type,fn){this[type]=fn;}};
  const attrs={'data-surface':'today'}; const modes=[]; let imageChanges=0;
  globalThis.document={getElementById:id=>nodes[id]||null,querySelector:()=>anchor,body:{setAttribute:(k,v)=>attrs[k]=v,getAttribute:k=>attrs[k]}};
  try {
    initExplorer((mode,...args)=>{explorer.choose(mode);modes.push([mode,...args]);},()=>{imageChanges++;renderExplorer('today');});
    assert.match(nodes.observationImage.src,/solar-observation-171\.jpg$/);
    assert.match(nodes.observationImage.alt,/Saved observation, not a live image/);
    assert.match(nodes.observationSource.href,/sdo\.gsfc\.nasa\.gov/);
    renderExplorer('today');
    assert.equal(nodes.observationLoading.hidden,false,'initial pending state has visible feedback');
    assert.equal(nodes.observationMedia.attributes['aria-busy'],'true');
    assert.equal(nodes.observationImage.hidden,true,'pending image cannot show a broken bitmap');
    const capture=nodes.observationStatus.textContent;
    nodes.observationImage.events.error();
    assert.equal(nodes.observationUnavailable.hidden,false);
    assert.equal(nodes.observationLoading.hidden,true);
    assert.equal(nodes.observationMedia.attributes['aria-busy'],'false');
    assert.equal(nodes.observationImage.hidden,true);
    nodes.observationRetry.events.click();
    assert.equal(explorer.media,'loading');
    assert.equal(nodes.observationImage.hidden,true);
    assert.equal(nodes.observationLoading.hidden,false,'retry cannot leave an unexplained blank frame');
    assert.equal(nodes.observationMedia.attributes['aria-busy'],'true');
    assert.equal(nodes.observationUnavailable.hidden,true);
    assert.equal(nodes.observationStatus.textContent,capture,'pending feedback preserves the source date');
    renderExplorer('today'); renderExplorer('today');
    assert.equal(explorer.media,'loading','repeated rendering does not manufacture readiness');
    assert.equal(imageChanges,3,'initial adoption and explicit events alone publish media changes');
    nodes.observationImage.naturalWidth=1024;
    nodes.observationImage.events.load();
    assert.equal(nodes.observationUnavailable.hidden,true);
    assert.equal(nodes.observationLoading.hidden,true);
    assert.equal(nodes.observationMedia.attributes['aria-busy'],'false');
    assert.equal(nodes.observationImage.hidden,false);
    assert.equal(imageChanges,4);
    nodes.exploreObservation.events.click(); nodes.exploreResearch.events.click();
    nodes.openResearchTools.events.click(); nodes.openEarthContext.events.click();
    assert.deepEqual(modes,[['observe'],['research'],['research',true],['research',true]]);
    assert.equal(nodes.sunWeather.open,true); assert.equal(nodes.sunWeather.focused,true);
    anchor.click(); assert.equal(nodes.observationDetails.open,true);
    explorer.choose('research'); renderExplorer('today'); assert.equal(nodes.solarObservation.hidden,true);
    explorer.choose('observe'); renderExplorer('sky'); assert.equal(nodes.solarObservation.hidden,true);
    renderExplorer('today'); assert.equal(nodes.solarObservation.hidden,false);
    assert.equal(attrs['data-experience'],'observe');
    assert.equal(nodes.exploreObservation.attributes['aria-pressed'],'true');
  } finally { globalThis.document=oldDocument; explorer.choose('observe'); explorer.media='loading'; }
});

for(const interruption of ['none','focus','pointer','keyboard','close inspector','hide and return','navigation','cancel']){
  test(`Earth context deferred focus respects ${interruption} intent`,async()=>{
    const priorDocument=globalThis.document;let resolve;
    const activation=new Promise(yes=>{resolve=yes;}),events=new EventTarget(),close={},outside={};
    const button={addEventListener(type,fn){this[type]=fn;}},summary={focused:false,focus(){this.focused=true;document.activeElement=this;}};
    const details={open:false,querySelector:()=>summary,scrollIntoView(){}};
    const doc={hidden:false,activeElement:close,surface:'today',body:{getAttribute:()=>doc.surface},
      getElementById:id=>id==='openEarthContext'?button:id==='sunWeather'?details:null,querySelector:()=>null,
      addEventListener:events.addEventListener.bind(events)};
    globalThis.document=doc;
    try{
      initExplorer(()=>{explorer.choose('research');return activation;},()=>{});button.click();assert.equal(summary.focused,false);
      if(interruption==='focus'||interruption==='close inspector'){doc.activeElement=outside;events.dispatchEvent(new Event('focusin'));}
      if(interruption==='pointer')events.dispatchEvent(new Event('pointerdown'));
      if(interruption==='keyboard')events.dispatchEvent(new Event('keydown'));
      if(interruption==='hide and return'){doc.hidden=true;events.dispatchEvent(new Event('visibilitychange'));doc.hidden=false;events.dispatchEvent(new Event('visibilitychange'));}
      if(interruption==='navigation')doc.surface='sky';
      resolve(interruption==='cancel'?null:{});for(let i=0;i<5;i++)await Promise.resolve();
      assert.equal(summary.focused,interruption==='none');assert.equal(details.open,interruption==='none');
    }finally{globalThis.document=priorDocument;explorer.choose('observe');}
  });
}
