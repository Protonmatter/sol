import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EARTH_LOOK_ASSET,earthLookSelected,earthLookDescription,advanceSolEarthCloudPhase} from '../../apps/web/js/earthLook.js';
import {oceanMaskPixels,OCEAN_MASK_SHA256} from '../../apps/web/js/earthOceanMask.js';
import {appearanceReference,surfaceReferenceShown,appearanceDescription,appearanceSummary} from '../../apps/web/js/planetAppearance.js';
import {planReferenceDemand} from '../../apps/web/js/referenceDemand.js';

test('recovered Earth assets retain the deployed v7 identities',async()=>{
  const bytes=await readFile(new URL('../../apps/web/'+EARTH_LOOK_ASSET.path,import.meta.url));
  assert.equal(bytes.length,1617810);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'f55226d46d27e05511f2118dc6aa24f5dbf9b6b2cddc87cc6e0e7dd067c00b11');
  assert.equal(createHash('sha256').update(oceanMaskPixels()).digest('hex'),OCEAN_MASK_SHA256);
  assert.equal(appearanceReference('Earth','cloud-composite').sha256,'82005bba2cec05b41137b766985d516eaf6b66ea045191d8869d45abd05f7995');
  assert.equal(appearanceReference('Earth','night-lights').sha256,'4d2158f59123dadf0696a1cf8909c45018a1de8d0daab40da04122a5aa7f27c6');
});
test('Earth look preserves the scientific layer and HDR options',()=>{
  assert.equal(earthLookSelected({planetLook:'illustrative'}),true);
  for(const state of [{planetLook:'source-qualified'},{},{planetLook:'illustrative',useTextures:false},
    {planetLook:'illustrative',earthCloudSource:'daily'},{planetLook:'illustrative',earthIce:true},
    {planetLook:'illustrative',hdrEnabled:true},{planetLook:'illustrative',galaxy:true}])assert.equal(earthLookSelected(state),false);
  for(const status of ['ready','loading','unavailable','deferred'])assert.match(earthLookDescription({earthLookStatus:status}),/July 2004/);
});
test('SOL drift retains the lab 35-percent ratio at capped spin and after suspension',()=>{
  assert.ok(Math.abs(advanceSolEarthCloudPhase(.1,.1,86400,24,true)-.107)<1e-12);
  assert.ok(Math.abs(advanceSolEarthCloudPhase(.1,.1,-86400,24,true)-.093)<1e-12);
  assert.ok(advanceSolEarthCloudPhase(.1,100,86400000,24,true)-.1<=.007+1e-12);
  assert.equal(advanceSolEarthCloudPhase(.1,.1,86400,24,false),.1);
  assert.equal(advanceSolEarthCloudPhase(.1,0,86400,24,true),.1);
});

test('Earth keeps its registered surface demanded and disclosed until the look is ready',()=>{
  const reference=appearanceReference('Earth'),visible=new Map([['Earth',100]]);
  for(const earthLookStatus of ['deferred','loading','unavailable','ready']){
    const state={planetLook:'illustrative',earthLookStatus,appearanceStatus:{[reference.id]:'ready'}};
    assert.equal(surfaceReferenceShown('Earth',state),earthLookStatus!=='ready');
    assert.equal(planReferenceDemand(visible,state).some(asset=>asset.id===reference.id),earthLookStatus!=='ready');
    for(const describe of [appearanceDescription,appearanceSummary]){
      const text=describe('Earth',state);
      if(earthLookStatus!=='ready')assert.ok(text.includes(reference.label),'Fallback identifies its actual registered source');
      else assert.doesNotMatch(text,/Registered surface fallback/);
    }
  }
});
