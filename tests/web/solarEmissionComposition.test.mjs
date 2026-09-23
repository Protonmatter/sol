import test from 'node:test';
import assert from 'node:assert/strict';
import {solarTransferColor} from '../../apps/web/js/solarEmissionComposition.js';

test('one final channel palette depends on total ray intensity, not emitter partition', () => {
  const surface=solarTransferColor(.2,0,'euv');
  const corona=solarTransferColor(0,.016,'euv');
  surface.forEach((v,i)=>assert.ok(Math.abs(v-corona[i])<1e-12));
  assert.deepEqual(solarTransferColor(0,0,'euv'),[0,0,0]);
  assert.deepEqual(solarTransferColor(1,.5,'visible'),[4,4,4]);
  assert.ok(solarTransferColor(4,1,'euv').some(v=>v>1),'linear radiance-relative output is not prematurely clipped');
  for(const v of [-1,NaN,Infinity])assert.throws(()=>solarTransferColor(v,0,'euv'));
});
