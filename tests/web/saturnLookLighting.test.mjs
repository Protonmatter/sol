import test from 'node:test';
import assert from 'node:assert/strict';
import {saturnLookLight} from '../../apps/web/js/illustrativeAppearance.js';

test('inspection light follows the camera using the recovered lab direction',()=>{
  const a=saturnLookLight([0,-4,0],[0,0,0]);
  assert.ok(a.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...a)-1)<1e-12);
  assert.ok(a[0]>0&&a[1]<0&&a[2]>0);
  const b=saturnLookLight([4,0,0],[0,0,0]);
  assert.ok(Math.abs(b[0]+a[1])<1e-12&&Math.abs(b[1]-a[0])<1e-12&&Math.abs(b[2]-a[2])<1e-12);
  assert.deepEqual(saturnLookLight([9,-1,7],[9,3,7]),a,'translation must not change the light');
  for(const eye of [[0,0,4],[0,0,-4]])assert.ok(saturnLookLight(eye,[0,0,0]).every(Number.isFinite));
  assert.equal(saturnLookLight([0,0,0],[0,0,0]),null);
});
