import test from 'node:test';
import assert from 'node:assert/strict';
import {transferTargetSize,solarTransferColor} from '../../apps/web/js/solarEmissionComposition.js';

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
  assert.ok(hidpi.width*hidpi.height*12<=budget,'fits the byte budget');
  assert.ok(hidpi.scaleX>.85&&hidpi.scaleX<1,'only a mild reduction');
  assert.ok(Math.abs(hidpi.scaleX-hidpi.scaleY)<.002,'uniform scale keeps the aspect');
  assert.deepEqual(transferTargetSize(1280,800,budget),{width:1280,height:800,scaleX:1,scaleY:1},'small viewports stay 1:1');
  const wide=transferTargetSize(8192,1000,budget);
  assert.ok(wide.width<=4096&&wide.height<=4096,'dimension cap holds');
  assert.throws(()=>transferTargetSize(0,10),RangeError);
  assert.throws(()=>transferTargetSize(10,10,4),RangeError);
});
