import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {decodeReferenceImage} from '../../apps/web/js/referenceImageLoader.js';
import {planTextureDisplay,textureBytes,MAX_REFERENCE_GPU_BYTES,MAX_REFERENCE_PENDING_BYTES} from '../../apps/web/js/textureDisplayBudget.js';

async function fixture() {
 const bytes=new ArrayBuffer(24),v=new DataView(bytes);[137,80,78,71,13,10,26,10].forEach((n,i)=>v.setUint8(i,n));
 v.setUint32(12,0x49484452);v.setUint32(16,5400);v.setUint32(20,2700);
 const sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const asset={path:'earth.png',bytes:24,sha256,dimensions:[5400,2700],role:'surface'};
 const service={fetch:async()=>({ok:true,arrayBuffer:async()=>bytes}),digest:b=>webcrypto.subtle.digest('SHA-256',b)};
 return {asset,service};
}
test('source image validates pinned bytes before asynchronous resized decode and preserves full grid aspect',async()=>{
 const {asset,service}=await fixture(),plan=planTextureDisplay(asset,300,1,16384);let options;
 const image={width:1024,height:512,close(){throw Error('live image must not be closed');}};
 const result=await decodeReferenceImage(asset,plan,new AbortController().signal,{...service,decode:async(blob,o)=>{options=o;assert.equal(blob.type,'image/png');return image;}});
 assert.equal(result,image);assert.equal(options.resizeWidth,1024);assert.equal(options.resizeHeight,512);
 assert.equal(options.imageOrientation,'none');assert.equal(options.premultiplyAlpha,'none');
});
test('hash or pinned source-grid drift is rejected before decode',async()=>{
 const {asset,service}=await fixture();let calls=0;
 const services={...service,decode:async()=>{calls++;return {};}};
 await assert.rejects(decodeReferenceImage({...asset,sha256:'0'.repeat(64)},planTextureDisplay(asset),new AbortController().signal,services),/hash/);
 await assert.rejects(decodeReferenceImage({...asset,dimensions:[4096,2048]},planTextureDisplay(asset),new AbortController().signal,services),/source grid/);
 assert.equal(calls,0);
});
test('aborted decode closes its late bitmap and never publishes it',async()=>{
 const {asset,service}=await fixture(),abort=new AbortController();let closes=0;
 await assert.rejects(decodeReferenceImage(asset,planTextureDisplay(asset),abort.signal,{...service,decode:async()=>{abort.abort();return {width:512,height:256,close(){closes++;}};}}),/cancelled/);
 assert.equal(closes,1);
});
test('continuous imagery has bounded pixels and mip bytes; palette data keeps its exact grid',()=>{
 const photo={dimensions:[5400,2700]},ice={dimensions:[2048,1024],role:'sea-ice'};
 assert.deepEqual(planTextureDisplay(photo,100,1,16384),{width:512,height:256,bytes:699052,decodedBytes:524288,exact:false});
 const large=planTextureDisplay(photo,4000,2,16384);assert.equal(large.width,2048);
 assert.ok(large.bytes*8<MAX_REFERENCE_GPU_BYTES);assert.ok(large.decodedBytes*2<=MAX_REFERENCE_PENDING_BYTES);
 const categorical=planTextureDisplay(ice,8,1,4096);assert.equal(categorical.width,2048);assert.equal(categorical.bytes,8388608);
 assert.throws(()=>planTextureDisplay(ice,8,1,1024),/palette/);
 assert.equal(textureBytes(2,1),12);
});

test('the separate illustrative Earth map also decodes to a bounded display bitmap',async()=>{
 const {decodeIllustrativeMap}=await import('../../apps/web/js/illustrativeAppearance.js');
 const bytes=new Uint8Array([1,2,3]).buffer,sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const image=await decodeIllustrativeMap({path:'earth.jpg',bytes:3,sha256,dimensions:[5400,2700]},new AbortController().signal,{
   maxDimension:2048,fetch:async()=>({ok:true,arrayBuffer:async()=>bytes}),digest:b=>webcrypto.subtle.digest('SHA-256',b),
   decode:async(_blob,options)=>{assert.equal(options?.resizeWidth,2048);return {width:2048,height:1024,close(){}};},
 });
 assert.equal(image.width,2048);
});

test('exact scientific palettes disable color conversion during bitmap decode',async()=>{
 const {asset,service}=await fixture(),palette={...asset,role:'sea-ice'},plan=planTextureDisplay(palette,8,1,8192);
 await decodeReferenceImage(palette,plan,new AbortController().signal,{...service,decode:async(_blob,o)=>{
  assert.equal(o.colorSpaceConversion,'none');assert.equal(o.premultiplyAlpha,'none');
  assert.equal(o.resizeWidth,5400);return {width:5400,height:2700,close(){}};
 }});
});
