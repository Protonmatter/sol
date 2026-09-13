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

test('observation DOM preserves failure, retry, original image and deliberate Research navigation',()=>{
  const oldDocument=globalThis.document;
  const ids=['observationImage','observationSource','observationCredit','sunDiameter','sunTemperature',
    'exploreObservation','exploreResearch','openResearchTools','openEarthContext','sunWeather',
    'observationDetails','observationRetry','solarObservation','observationStatus','observationUnavailable'];
  const nodes=Object.fromEntries(ids.map(id=>[id,{id,events:{},attributes:{},hidden:false,
    addEventListener(type,handler){this.events[type]=handler;},setAttribute(k,v){this.attributes[k]=v;},
    querySelector(){return this;},focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}}]));
  const anchor={addEventListener(type,fn){this[type]=fn;}};
  const attrs={}; const modes=[]; let imageChanges=0;
  globalThis.document={getElementById:id=>nodes[id]||null,querySelector:()=>anchor,body:{setAttribute:(k,v)=>attrs[k]=v}};
  try {
    initExplorer((...args)=>modes.push(args),()=>{imageChanges++;renderExplorer('today');});
    assert.match(nodes.observationImage.src,/solar-observation-171\.jpg$/);
    assert.match(nodes.observationImage.alt,/Saved observation, not a live image/);
    assert.match(nodes.observationSource.href,/sdo\.gsfc\.nasa\.gov/);
    nodes.observationImage.onerror();
    assert.equal(nodes.observationUnavailable.hidden,false);
    assert.equal(nodes.observationImage.hidden,true);
    nodes.observationRetry.events.click();
    assert.equal(explorer.media,'loading');
    assert.equal(nodes.observationImage.hidden,false);
    nodes.observationImage.onload();
    assert.equal(nodes.observationUnavailable.hidden,true);
    assert.equal(imageChanges,3);
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
