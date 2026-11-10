import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

test('failed catalogues show truthful persistent status after repaint',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'failed',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();
  assert.match(h.nodes.orreryCatalogueStatus.textContent,/unavailable/i);
  assert.doesNotMatch(h.nodes.orreryObjectCount.textContent,/catalogue loading/);
  assert.equal(h.nodes.orreryCataloguePanel.hidden,false);
  assert.equal(h.nodes.orreryCatalogueRetry.hidden,false);
  h.check('orreryShowSmall',false);
  assert.match(h.state.moonsHiddenReason,/orbital elements failed to load/i);
  assert.match(h.nodes.orreryAccuracy.textContent,/orbital elements failed to load/i);
  assert.equal(h.state.engineError,'','catalogue failure must not invalidate planetary positions');
});

test('explicit catalogue retry preserves time, camera, selection and planetary coordinates',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'failed',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();
  h.input('orreryTime','1');await h.settle();
  const before={unix:h.state.renderUnix,metadata:h.state.metadataUnix,anchor:h.state.anchor,selected:h.state.selected,az:h.state.az,el:h.state.el,radius:h.state.radius,bodies:structuredClone(h.state.bodies)};
  h.nodes.orreryCatalogueRetry.focus();h.setCatalogueMode('ready');
  h.event('orreryCatalogueRetry','click');h.event('orreryCatalogueRetry','click');
  await h.settleCatalogues();await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'ready',moons:'ready'});
  assert.equal(h.catalogueRequests.filter(r=>r.specifier.includes('starcatalog')).length,2);
  assert.equal(h.catalogueRequests.filter(r=>r.specifier.includes('moonelements')).length,2);
  assert.equal(h.nodes.orreryCatalogueRetry.hidden,true);
  assert.equal(h.nodes.orreryCatalogueStatus.ownerDocument.activeElement,h.nodes.orreryCatalogueStatus);
  assert.deepEqual({unix:h.state.renderUnix,metadata:h.state.metadataUnix,anchor:h.state.anchor,selected:h.state.selected,az:h.state.az,el:h.state.el,radius:h.state.radius,bodies:structuredClone(h.state.bodies)},before);
  assert.deepEqual(h.errors,[]);
});

test('failed named stars remain retryable while moon data is pending',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:{starcatalog:'failed',moonelements:'pending'},reducedMotion:true});
  await h.enterOrrery();await h.settle();await h.settle();
  assert.equal(h.state.catalogueStatus.stars,'failed');
  assert.equal(h.state.catalogueStatus.moons,'loading');
  assert.equal(h.nodes.orreryCatalogueRetry.hidden,false);assert.equal(h.nodes.orreryCatalogueRetry.disabled,false);
  h.setCatalogueMode({starcatalog:'ready',moonelements:'pending'});h.event('orreryCatalogueRetry','click');
  await h.settle();await h.settle();
  assert.equal(h.state.catalogueStatus.stars,'ready');assert.equal(h.state.catalogueStatus.moons,'loading');
  assert.equal(h.catalogueRequests.filter(r=>r.specifier.includes('moonelements')).length,1);
  assert.equal(h.catalogueRequests.filter(r=>r.specifier.includes('starcatalog')).length,2);
});

test('a repeated star failure can retry while the same moon retry remains held',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'failed',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();
  h.setCatalogueMode({starcatalog:'failed',moonelements:'held'});h.event('orreryCatalogueRetry','click');await h.settle();await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'failed',moons:'loading'});
  assert.equal(h.nodes.orreryCatalogueRetry.disabled,false,'a failed resource remains independently retryable');
  h.setCatalogueMode({starcatalog:'ready',moonelements:'held'});h.event('orreryCatalogueRetry','click');await h.settle();await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'ready',moons:'loading'});
  assert.equal(h.catalogueRequests.filter(r=>r.specifier.includes('starcatalog')).length,3);
  assert.equal(h.catalogueRequests.filter(r=>r.specifier.includes('moonelements')).length,2);
  await h.releaseCatalogue(0);await h.settleCatalogues();await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'ready',moons:'ready'});
});

test('completion after focus moves does not steal focus',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'failed',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setCatalogueMode('ready');
  h.nodes.orreryCatalogueRetry.focus();h.event('orreryCatalogueRetry','click');h.nodes.orrerySearch.focus();
  await h.settleCatalogues();await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'ready',moons:'ready'});
  assert.equal(h.nodes.orrerySearch.ownerDocument.activeElement,h.nodes.orrerySearch);
});

test('retry restores focus after the browser blurs a disabled button',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'failed',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setCatalogueMode('ready');
  const document=h.nodes.orreryCatalogueRetry.ownerDocument;document.body={};
  h.nodes.orreryCatalogueRetry.focus();h.event('orreryCatalogueRetry','click');document.activeElement=document.body;
  await h.settleCatalogues();await h.settle();
  assert.equal(document.activeElement,h.nodes.orreryCatalogueStatus);
});

test('leaving the document revokes retry focus intent without discarding catalogue work',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'failed',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setCatalogueMode('held');
  const document=h.nodes.orreryCatalogueRetry.ownerDocument;document.body={};
  h.nodes.orreryCatalogueRetry.focus();h.event('orreryCatalogueRetry','click');document.activeElement=document.body;await h.settle();
  h.setHidden(true);h.setHidden(false);await h.settle();
  await h.releaseCatalogue(0);await h.releaseCatalogue(1);await h.settleCatalogues();await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'ready',moons:'ready'});
  assert.equal(document.activeElement,document.body,'returning to the document cannot revive stale focus intent');
});

test('navigation cancels pending ownership and reopening can load the catalogues',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'pending',reducedMotion:true});
  await h.enterOrrery();h.leaveOrrery();h.setCatalogueMode('ready');
  await h.enterOrrery();await h.settleCatalogues();await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'ready',moons:'ready'});
  assert.equal(h.state.active,true);assert.deepEqual(h.errors,[]);
});

for(const rejectOld of [false,true])test(`late catalogue ${rejectOld?'failure':'success'} after navigation cannot overwrite a replacement`,async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'held',reducedMotion:true});
  await h.enterOrrery();await h.settle();assert.equal(h.heldCatalogues.length,2);
  h.leaveOrrery();await h.enterOrrery();await h.settle();assert.equal(h.heldCatalogues.length,4);
  await h.releaseCatalogue(0,rejectOld);await h.releaseCatalogue(1,rejectOld);await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'loading',moons:'loading'});
  await h.releaseCatalogue(2);await h.releaseCatalogue(3);await h.settleCatalogues();await h.settle();
  assert.deepEqual({...h.state.catalogueStatus},{stars:'ready',moons:'ready'});
  assert.deepEqual(h.warnings,[]);assert.deepEqual(h.errors,[]);
});

test('a retry finishing after navigation leaves status hidden and focus untouched',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'failed',reducedMotion:true});
  await h.enterOrrery();await h.settleCatalogues();h.setCatalogueMode('held');
  h.nodes.orreryCatalogueRetry.focus();h.event('orreryCatalogueRetry','click');await h.settle();
  h.leaveOrrery();h.nodes.orrerySearch.focus();
  await h.releaseCatalogue(0);await h.releaseCatalogue(1);await h.settleCatalogues();await h.settle();
  assert.equal(h.nodes.orreryCataloguePanel.hidden,true);
  assert.equal(h.nodes.orrerySearch.ownerDocument.activeElement,h.nodes.orrerySearch);
  assert.equal(h.state.active,false);
});
