import assert from 'node:assert/strict';
import test from 'node:test';
import { referencePixelDiameter, planReferenceDemand, MAX_REFERENCE_TEXTURES } from '../../apps/web/js/referenceDemand.js';
import { appearanceReference, appearanceReferences } from '../../apps/web/js/planetAppearance.js';
import { perspective } from '../../apps/web/js/orreryMath.js';

test('reference demand excludes subpixel, offscreen, clipped and invalid surfaces', () => {
  const vp = perspective(Math.PI / 2, 1, .01, 100), size = {width:800,height:800};
  assert.equal(referencePixelDiameter([0,0,-10], .01, vp, size), 0);
  assert.equal(referencePixelDiameter([30,0,-10], 1, vp, size), 0);
  assert.equal(referencePixelDiameter([0,0,10], 1, vp, size), 0);
  assert.equal(referencePixelDiameter([0,0,-200], 1, vp, size), 0);
  assert.equal(referencePixelDiameter([0,0,-10], NaN, vp, size), 0);
  assert.equal(referencePixelDiameter([0,0,-10], 1, vp, {width:0,height:800}), 0);
  assert.equal(referencePixelDiameter([0,0,-10],1,new Array(16).fill(0),size),0);
  assert.ok(referencePixelDiameter([0,0,-10], 1, vp, size) > 79);
  assert.ok(referencePixelDiameter([10,0,-10], 1, vp, size) > 79, 'partly visible limb remains eligible');
  assert.ok(referencePixelDiameter([2,0,-1], .8, vp, size) >= 8,
    'off-axis limb reaches x766 even when the center-plane disc misses the viewport');
  assert.ok(referencePixelDiameter([0,0,-100.2], 2, vp, size) >= 8,'far-plane intersection remains eligible');
  assert.ok(referencePixelDiameter([0,0,-.005], .01, vp, size) >= 8,'near-plane intersection remains eligible');
});

test('the admitted full-resolution cache has an explicit RGBA and mipmap payload bound', () => {
  const bytes = appearanceReferences().map(asset=>{
    let [width,height] = asset.dimensions, total = 0;
    for (;;) {
      total += width*height*4;
      if (asset.role==='sea-ice'||width===1&&height===1) return total;
      width=Math.max(1,Math.floor(width/2)); height=Math.max(1,Math.floor(height/2));
    }
  }).sort((a,b)=>b-a).slice(0,MAX_REFERENCE_TEXTURES).reduce((a,b)=>a+b,0);
  assert.ok(bytes<=179424636,'new larger admitted grids require an explicit memory-budget review');
});

test('a useful Earth requests only its enabled layers and selected cloud source', () => {
  const visible = new Map([['Earth',200], ['Mars',40]]);
  const paths = state => planReferenceDemand(visible,state).map(a=>a.id);
  const expected = ['surface','night-lights','cloud-composite'].map(role=>appearanceReference('Earth',role).id);
  assert.deepEqual(paths({}), [...expected, appearanceReference('Mars').id]);
  assert.deepEqual(paths({earthNight:false,earthWeather:false,earthIce:true}),
    ['surface','sea-ice'].map(role=>appearanceReference('Earth',role).id).concat(appearanceReference('Mars').id));
  assert.ok(paths({earthCloudSource:'daily'}).includes(appearanceReference('Earth','weather').id));
  assert.ok(!paths({earthCloudSource:'daily'}).includes(appearanceReference('Earth','cloud-composite').id));
  assert.deepEqual(paths({useTextures:false}),[]);
  assert.deepEqual(paths({galaxy:true}),[]);
  assert.deepEqual(planReferenceDemand(new Map([['Sun',400],['Titan',300]]),{}),[]);
});

test('demand prioritizes useful focus and bounds simultaneous material residency', () => {
  const visible = new Map(['Earth','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Moon','Io'].map((name,i)=>[name,200-i]));
  const result = planReferenceDemand(visible,{anchor:'Io',earthIce:true});
  assert.equal(result[0].body,'Io');
  assert.equal(result.length,MAX_REFERENCE_TEXTURES);
  assert.equal(new Set(result.map(a=>a.id)).size,result.length);
  assert.equal(planReferenceDemand(new Map([['Earth',0],['Mars',NaN]]),{}).length,0);
});
