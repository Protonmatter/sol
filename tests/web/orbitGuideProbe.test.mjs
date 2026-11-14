import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import * as probe from '../../tools/orbit_guide_probe.mjs';

function fixture({lineX=64,bodyChange=false,blank=false,flood=false}={}) {
  const off=new PNG({width:128,height:128}),on=new PNG({width:128,height:128});
  for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
    const i=(y*128+x)*4,inside=Math.hypot(x-64,y-64)<=20;
    const base=inside&&!blank?[20,70,100]:[0,0,0];
    const rgb=!inside&&(x===lineX||flood)?[40,90,140]:base;
    off.data.set([...base,255],i);on.data.set([...rgb,255],i);
  }
  if(bodyChange)on.data.set([100,200,255],(64*128+64)*4);
  const plan={width:128,height:128,center:[64,64],coreRadius:10,
    samples:[12,22,32,42,86,96,106,116].map(y=>[64,y])};
  return{off:PNG.sync.write(off),on:PNG.sync.write(on),plan};
}
function check(...args){assert.equal(typeof probe.assertOrbitGuidePair,'function');return probe.assertOrbitGuidePair(...args);}

test('a thin visible guide follows the expected orbit and leaves the opaque planet unchanged',()=>{
  const {off,on,plan}=fixture(),result=check(off,on,plan);
  assert.ok(result.changedPixels>=50);assert.equal(result.coreChangedPixels,0);assert.equal(result.sampleCoverage,1);
});
test('the missing-guide regression and a line at the wrong location fail',()=>{
  const {off,plan}=fixture();assert.throws(()=>check(off,off,plan));
  const wrong=fixture({lineX:15});assert.throws(()=>check(wrong.off,wrong.on,wrong.plan));
});
test('planet changes, broad scene changes and a missing planet cannot satisfy guide visibility',()=>{
  for(const options of [{bodyChange:true},{flood:true},{blank:true}]){
    const {off,on,plan}=fixture(options);assert.throws(()=>check(off,on,plan));
  }
});
test('invalid geometry, empty sample populations and mismatched image dimensions fail',()=>{
  const {off,on,plan}=fixture();
  for(const bad of [{...plan,samples:[]},{...plan,coreRadius:NaN},{...plan,center:[Infinity,64]},
    {...plan,width:127},{...plan,samples:plan.samples.map(()=>[64,64])}])assert.throws(()=>check(off,on,bad));
  assert.throws(()=>check(off,PNG.sync.write(new PNG({width:64,height:128})),plan));
});

test('the legacy ellipse oracle projects a physical-scale circular orbit at the expected radius',()=>{
  const phase=1.07,body={name:'Neptune',a_au:30,ecc:0,inc_deg:0,node_deg:0,argp_deg:0,
    x_au:30*Math.cos(phase),y_au:30*Math.sin(phase),z_au:0};
  const camera={radius:.0015,az:0,el:.62};
  const plan=probe.orbitGuidePlan(body,camera,795,612);
  assert.ok(plan.samples.length>=8);assert.ok(plan.coreRadius>20);
  const scale=2*camera.radius*Math.tan(21*Math.PI/180)/612;
  for(const [px,py]of plan.samples){
    const x=body.x_au+(px-795/2)*scale,y=body.y_au-(py-612/2)*scale;
    assert.ok(Math.abs(Math.hypot(x,y)-30)<1e-9);
    assert.ok(Math.hypot(px-795/2,py-612/2)>1.35*plan.bodyRadius+6);
  }
});

test('fractional CSS and rounded page crop map backing-buffer points into the actual screenshot',()=>{
  assert.equal(typeof probe.orbitGuideCapturePlan,'function');
  const before=[125.796875,144.0625,731.609375,612,0,69,732,612];
  const geometry={before,after:[...before]};
  const drawing={width:732,height:612,center:[366,306],coreRadius:40,bodyRadius:90,samples:[[100,100],[600,500]]};
  const mapped=probe.orbitGuideCapturePlan(drawing,geometry,731,612);
  assert.equal(mapped.width,731);assert.equal(mapped.height,612);
  assert.equal(mapped.center[0],365.6015625);assert.equal(mapped.center[1],306.0625);
  assert.equal(mapped.captureTransform.cropX,.203125);assert.equal(mapped.captureTransform.cropY,-.0625);
  assert.ok(mapped.coreRadius<40);assert.equal(mapped.bodyRadius,90);
  assert.throws(()=>probe.orbitGuideCapturePlan(drawing,geometry,732,612));
  assert.throws(()=>probe.orbitGuideCapturePlan(drawing,{before,after:before.map((x,i)=>i===0?x+1:x)},731,612));
  assert.throws(()=>probe.orbitGuideCapturePlan({...drawing,width:731},geometry,731,612));
});
