import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';

test('cold System overview keeps moon identities and curated sky without enrichment requests',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});
  await h.enterOrrery();await h.settle();
  assert.equal(h.catalogueRequests.filter(r=>/moonelements|starcatalog/.test(r.specifier)).length,0);
  assert.ok(h.nodes.orreryPositions.children.some(n=>n.dataset.objectId==='Io'));
  assert.doesNotMatch(h.nodes.orreryObjectCount.textContent,/catalogue loading/);
  assert.deepEqual({...h.state.catalogueStatus},{stars:'idle',moons:'idle'});
});
test('Saturn focus requests orbital knots; named star search independently requests stars',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});await h.enterOrrery();
  h.input('orreryAnchor','Saturn','change');await h.settleCatalogues();
  assert.equal(h.state.catalogueStatus.moons,'ready');assert.equal(h.state.catalogueStatus.stars,'idle');
  h.input('orrerySearch','Sirius');await h.settleCatalogues();
  assert.equal(h.state.catalogueStatus.stars,'ready');
  assert.ok(h.nodes.orreryPositions.children.some(n=>n.textContent.includes('Sirius')));
});
test('failed demand does not retry on ordinary paints and an explicit retry preserves selection',async t=>{
  const h=await orreryHarness(t,{controls:true,catalogues:'failed',reducedMotion:true});await h.enterOrrery();
  h.input('orreryAnchor','Io','change');await h.settleCatalogues();
  assert.equal(h.state.catalogueStatus.moons,'failed');const count=h.catalogueRequests.length;
  h.check('orreryShowLabels',false);h.check('orreryShowLabels',true);await h.settle();assert.equal(h.catalogueRequests.length,count);
  h.setCatalogueMode('ready');h.event('orreryCatalogueRetry','click');await h.settleCatalogues();
  assert.equal(h.state.anchor,'Io');assert.equal(h.state.selected,'Io');assert.equal(h.state.catalogueStatus.moons,'ready');
});

test('Earth and its ELP Moon do not require satellite knots; an unavailable Io keeps its identity',async t=>{
 const h=await orreryHarness(t,{controls:true,catalogues:'ready',reducedMotion:true});await h.enterOrrery();
 h.input('orreryAnchor','Moon','change');await h.settle();assert.equal(h.catalogueRequests.length,0);
 h.input('orreryTime','100');await h.settle();h.input('orreryAnchor','Io','change');await h.settle();
 assert.equal(h.state.anchor,'Io');assert.equal(h.state.selected,'Io');assert.equal(h.catalogueRequests.length,0);
 assert.match(h.nodes.orrerySelectedEpoch.textContent,/unavailable outside/);
 h.now();await h.settleCatalogues();assert.equal(h.state.catalogueStatus.moons,'ready');assert.equal(h.state.anchor,'Io');
});
