import test from 'node:test';
import assert from 'node:assert/strict';
import pngjs from 'pngjs';
import {countSaturnPolarPixels} from '../../tools/saturn_look_probe.mjs';

test('Saturn probe decodes the PNG bytes returned by the shared screenshot helper',()=>{
  const image=new pngjs.PNG({width:32,height:32});
  for(let i=0;i<image.data.length;i+=4)image.data.set([190,175,125,255],i);
  for(let i=0;i<128;i++)image.data.set([130,152,142,255],i*4);
  assert.equal(countSaturnPolarPixels(pngjs.PNG.sync.write(image)),128);
  image.data.fill(0);
  assert.equal(countSaturnPolarPixels(pngjs.PNG.sync.write(image)),0);
  assert.throws(()=>countSaturnPolarPixels(Buffer.from('not a PNG')));
});
