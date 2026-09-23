import test from 'node:test';
import assert from 'node:assert/strict';
import {transferTargetSize,transferBytes,bloomTargetSize,solarTransferColor} from '../../apps/web/js/solarEmissionComposition.js';

test('one final channel palette depends on total ray intensity, not emitter partition', () => {
  const surface=solarTransferColor(.2,0,'euv');
  const corona=solarTransferColor(0,.016,'euv');
  surface.forEach((v,i)=>assert.ok(Math.abs(v-corona[i])<1e-12));
  assert.deepEqual(solarTransferColor(0,0,'euv'),[0,0,0]);
  assert.deepEqual(solarTransferColor(1,.5,'visible'),[4,4,4]);
  assert.ok(solarTransferColor(4,1,'euv').some(v=>v>1),'linear radiance-relative output is not prematurely clipped');
  for(const v of [-1,NaN,Infinity])assert.throws(()=>solarTransferColor(v,0,'euv'));
});

test('HiDPI viewports render the transfer target at a reduced scale instead of failing', () => {
  const budget=48*1024*1024;
  // 1440x900 CSS at DPR 2: about 62 MB at full size, over the 48 MiB budget.
  const hidpi=transferTargetSize(2880,1800,budget);
  assert.ok(transferBytes(hidpi.width,hidpi.height)<=budget,'fits the byte budget, bloom included');
  assert.ok(hidpi.scaleX>.85&&hidpi.scaleX<1,'only a mild reduction');
  assert.ok(Math.abs(hidpi.scaleX-hidpi.scaleY)<.002,'uniform scale keeps the aspect');
  assert.deepEqual(transferTargetSize(1280,800,budget),{width:1280,height:800,scaleX:1,scaleY:1},'small viewports stay 1:1');
  const wide=transferTargetSize(8192,1000,budget);
  assert.ok(wide.width<=4096&&wide.height<=4096,'dimension cap holds');
  assert.throws(()=>transferTargetSize(0,10),RangeError);
  assert.throws(()=>transferTargetSize(10,10,4),RangeError);
});

test('bloom layers are quarter resolution and counted in the byte budget', () => {
  assert.deepEqual(bloomTargetSize(1280,800),{width:320,height:200});
  assert.deepEqual(bloomTargetSize(1,3),{width:1,height:1});
  assert.equal(transferBytes(1280,800),1280*800*12+2*320*200*8);
  for(const [w,h] of [[1280,800],[2880,1800],[4096,4096],[333,77]]){
    const size=transferTargetSize(w,h);
    assert.ok(transferBytes(size.width,size.height)<=48*1024*1024,`${w}x${h}`);
  }
});
