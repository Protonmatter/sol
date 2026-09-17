import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluatePhysicalMaterialPixel,physicalMaterialMapping,evaluatePhysicalPresentation} from '../../tools/physical_material_checks.mjs';
import {appearanceReference,appearanceUniforms} from '../../apps/web/js/planetAppearance.js';

test('every admitted material pair must actually overwrite the clear pixel',()=>{
  const clear=[.125,.25,.5,.75],drawn=[.1,.2,.3,1];
  assert.equal(evaluatePhysicalMaterialPixel(clear,clear).passed,false,'matching blank programs must fail');
  assert.equal(evaluatePhysicalMaterialPixel(drawn,clear).passed,false);
  assert.equal(evaluatePhysicalMaterialPixel(clear,drawn).passed,false);
  assert.equal(evaluatePhysicalMaterialPixel(drawn,drawn).passed,true);
  assert.equal(evaluatePhysicalMaterialPixel([0,0,0,1],[0,0,0,1]).passed,true,'physical darkness remains valid');
  for(const alpha of [0,.75,.999999,NaN,Infinity]){
    const invalid=[.1,.2,.3,alpha];assert.equal(evaluatePhysicalMaterialPixel(invalid,invalid).passed,false);
  }
});

test('material comparisons retain finite four-channel output and the original tolerance',()=>{
  const drawn=[.1,.2,.3,1];
  assert.equal(evaluatePhysicalMaterialPixel([.1+5e-7,.2,.3,1],drawn).passed,true);
  assert.equal(evaluatePhysicalMaterialPixel([.1+2e-6,.2,.3,1],drawn).passed,false);
  for(const invalid of [[.1,.2,.3],[.1,.2,.3,1,0],[NaN,.2,.3,1],[Infinity,.2,.3,1]])
    assert.equal(evaluatePhysicalMaterialPixel(invalid,invalid).passed,false);
});

test('fixture mapping uses the currently admitted Earth and Mars source transforms',()=>{
  for(const [body,latitude]of [['Earth',2],['Mars',1]]){
    const runtime=appearanceUniforms(appearanceReference(body));
    assert.equal(runtime.map[2],latitude);
    assert.deepEqual(physicalMaterialMapping(body,runtime),runtime);
    const wrong={...runtime,map:[...runtime.map]};wrong.map[2]=0;
    assert.throws(()=>physicalMaterialMapping(body,wrong),/latitude contract changed/);
  }
});

test('presentation must match the current physical producer, including opaque darkness',()=>{
  assert.equal(evaluatePhysicalPresentation([0,0,0,255],[0,0,0,1]).passed,true);
  assert.equal(evaluatePhysicalPresentation([188,188,188,255],[1,1,1,1]).passed,true);
  assert.equal(evaluatePhysicalPresentation([255,255,255,255],[1,1,1,1]).passed,false,'missing tone map');
  assert.equal(evaluatePhysicalPresentation([0,0,0,255],[1,1,1,1]).passed,false,'stale black image');
  assert.equal(evaluatePhysicalPresentation([188,188,188,0],[1,1,1,1]).passed,false);
  assert.equal(evaluatePhysicalPresentation([0,0,0,255],[NaN,0,0,1]).passed,false);
});
