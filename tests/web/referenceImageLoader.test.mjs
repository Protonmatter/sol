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

test('every pinned reference asset exposes its declared source grid in its own container format',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {referenceSourceGrid}=await import('../../apps/web/js/referenceImageLoader.js');
 const manifest=JSON.parse(await readFile(new URL('../../apps/web/visual-assets.v1.json',import.meta.url),'utf8'));
 const assets=[];
 const visit=node=>{
  if(Array.isArray(node))node.forEach(visit);
  else if(node&&typeof node==='object'){
   if(typeof node.path==='string'&&node.path.startsWith('textures/reference/')&&node.sha256)assets.push(node);
   Object.values(node).forEach(visit);
  }
 };
 visit(manifest);
 const formats=new Set();
 for(const asset of assets){
  const file=await readFile(new URL('../../apps/web/'+asset.path,import.meta.url));
  const bytes=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);
  const grid=referenceSourceGrid(bytes,asset.path);
  assert.ok(grid,asset.path);
  assert.deepEqual([grid.width,grid.height],asset.dimensions,asset.path);
  formats.add(grid.type);
 }
 // The manifest admits both containers; a PNG-only reader rejected Earth and Moon maps.
 assert.deepEqual([...formats].sort(),['image/jpeg','image/png']);
});

async function jpegFixture(width=5400,height=2700){
 // SOI, APP0 (JFIF, 16-byte segment), SOF0 with the frame grid, then EOI.
 const bytes=new Uint8Array([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,
   0xff,0xc0,0,17,8,height>>8,height&255,width>>8,width&255,3,1,0x22,0,2,0x11,1,3,0x11,1,0xff,0xd9]).buffer;
 const sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const asset={path:'textures/reference/earth-land-2004.jpg',bytes:bytes.byteLength,sha256,dimensions:[width,height],role:'surface',nodata:'none'};
 const service={fetch:async()=>({ok:true,arrayBuffer:async()=>bytes}),digest:b=>webcrypto.subtle.digest('SHA-256',b)};
 return {bytes,asset,service};
}

test('JPEG references decode from their frame grid as image/jpeg',async()=>{
 const {asset,service}=await jpegFixture(),plan=planTextureDisplay(asset,300,1,16384);
 const image={width:plan.width,height:plan.height,close(){throw Error('live image must not be closed');}};
 const result=await decodeReferenceImage(asset,plan,new AbortController().signal,{...service,decode:async blob=>{assert.equal(blob.type,'image/jpeg');return image;}});
 assert.equal(result,image);
});

test('container, extension and truncated-header drift fail closed before decode',async()=>{
 const {referenceSourceGrid}=await import('../../apps/web/js/referenceImageLoader.js');
 const {bytes,asset,service}=await jpegFixture();let calls=0;
 const services={...service,decode:async()=>{calls++;return {};}};
 await assert.rejects(decodeReferenceImage({...asset,dimensions:[4096,2048]},planTextureDisplay(asset),new AbortController().signal,services),/source grid/);
 assert.equal(referenceSourceGrid(bytes,'textures/reference/earth.png'),null);
 assert.equal(referenceSourceGrid(bytes.slice(0,22),asset.path),null);
 assert.equal(referenceSourceGrid(bytes,'textures/reference/earth.webp'),null);
 const png=(await fixture());
 const pngBytes=await (await png.service.fetch()).arrayBuffer();
 assert.equal(referenceSourceGrid(pngBytes,'textures/reference/earth.jpg'),null);
 assert.equal(calls,0);
});
