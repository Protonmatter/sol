import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {BODY,SUN_RADIUS_KM as publicRadius} from '../../apps/web/js/bodyData.js';
import {getSolarObservation} from '../../apps/web/js/solarObservation.js';

const inventory=JSON.parse(fs.readFileSync(new URL('../../apps/web/visual-assets.v1.json',import.meta.url),'utf8'));

test('the default source projection is exactly the authoritative archival record',async()=>{
  const {defaultObservationRecord}=await import('../../apps/web/js/sourceRecords.js');
  assert.deepEqual(defaultObservationRecord,inventory.observed_images[0]);
  const visit=value=>{if(value&&typeof value==='object'){assert.equal(Object.isFrozen(value),true);for(const nested of Object.values(value))visit(nested);}};
  visit(defaultObservationRecord);
  assert.throws(()=>defaultObservationRecord.allowed_usages.push('global-sphere'),TypeError);
  const view=getSolarObservation();
  assert.equal(view.path,defaultObservationRecord.path);assert.equal(view.sha256,defaultObservationRecord.sha256);
  assert.equal(view.sourceUrl,defaultObservationRecord.source_url);assert.equal(view.capturedAt,defaultObservationRecord.captured_at);
  assert.equal(view.scientificAnalysisAllowed,false);assert.equal(view.globalMappingAllowed,false);
});

test('Sun reference facts preserve existing body values and the public radius export',async()=>{
  const {SUN_RADIUS_KM,SUN_MEAN_TEMP_K}=await import('../../apps/web/js/sunFacts.js');
  assert.equal(SUN_RADIUS_KM,695700);assert.equal(SUN_MEAN_TEMP_K,5772);
  assert.equal(publicRadius,SUN_RADIUS_KM);assert.equal(BODY.Sun.radiusKm,SUN_RADIUS_KM);assert.equal(BODY.Sun.polarKm,SUN_RADIUS_KM);
  assert.equal(BODY.Sun.meanTempK,SUN_MEAN_TEMP_K);
});

test('observation metadata and facts do not pull planet-wide inventories into startup',()=>{
  for(const [name,forbidden]of [['solarObservation.js','visualAssetManifest.js'],['explorer.js','bodyData.js']]){
    const text=fs.readFileSync(new URL('../../apps/web/js/'+name,import.meta.url),'utf8');
    const source=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const imports=source.statements.filter(ts.isImportDeclaration).map(node=>node.moduleSpecifier.text.split('?')[0]);
    assert.ok(!imports.some(path=>path.endsWith('/'+forbidden)),`${name} must consume its small immutable reference`);
  }
});
