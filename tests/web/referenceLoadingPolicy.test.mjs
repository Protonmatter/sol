import test from 'node:test';
import assert from 'node:assert/strict';
import {orreryHarness} from './helpers/orreryHarness.mjs';
import {appearanceReference} from '../../apps/web/js/planetAppearance.js';

test('an inspected Earth uploads a bounded full-extent display grid instead of its native 5400 grid',async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true});await h.enterOrrery();h.input('orreryAnchor','Earth','change');
 const asset=appearanceReference('Earth'),image=h.images.findLast(i=>i.src===asset.path);assert.ok(image);
 [image.width,image.height]=asset.dimensions;image.onload();await h.settle();
 const upload=h.textureRecords.findLast(r=>r.pixels===image||r.pixels?.source===image);assert.ok(upload);
 assert.ok(upload.pixels.width<=2048,'GPU upload is bounded independently of MAX_TEXTURE_SIZE');
 assert.equal(upload.pixels.width/upload.pixels.height,2,'the entire registered geographic extent is retained');
 assert.equal(h.state.appearanceStatus[asset.id],'ready');
});

for(const outcome of ['ready','failed'])test(`larger inspection preserves reference color while its texture upgrade is pending and ${outcome}`,async t=>{
 const h=await orreryHarness(t,{controls:true,reducedMotion:true});await h.enterOrrery();h.resize(240,160);h.input('orreryAnchor','Earth','change');
 const asset=appearanceReference('Earth'),first=h.images.findLast(i=>i.src===asset.path);[first.width,first.height]=asset.dimensions;first.onload();await h.settle();
 for(const role of ['night-lights','cloud-composite']){const a=appearanceReference('Earth',role),i=h.images.findLast(i=>i.src===a.path);[i.width,i.height]=a.dimensions;i.onload();}
 assert.equal(first.width,512);const upload=h.textureRecords.findLast(r=>r.pixels===first),old=upload.texture;
 assert.equal(upload.args[2],h.gl.SRGB8_ALPHA8,'the retained texture already decodes sRGB during sampling');
 const assertLinearDraw=(texture,start=0)=>{
  const draw=h.gpuDraws.slice(start).findLast(draw=>draw.uniforms.u_texMode===3&&draw.textures.get(0)===texture);
  assert.ok(draw,'the registered surface is drawn with the expected texture');
  assert.equal(draw.uniforms.u_textureLinear,1,'sRGB textures must not be decoded a second time by the shader');
 };
 assertLinearDraw(old);
 const pendingStart=h.gpuDraws.length;
 h.resize(800,600);const next=h.images.findLast(i=>i.src===asset.path);
 assert.notEqual(next,first,'a larger projected globe requests a larger display variant');
 assert.ok(!h.deletedTextures.includes(old),'the ready map remains until replacement is uploaded');
 h.check('orreryShowLabels',false);
 assertLinearDraw(old,pendingStart);
 const settledStart=h.gpuDraws.length;
 if(outcome==='ready'){
  [next.width,next.height]=asset.dimensions;next.onload();await h.settle();
  assert.ok(next.width>512&&next.width<=2048);assert.ok(h.deletedTextures.includes(old));
  assertLinearDraw(h.textureRecords.findLast(r=>r.pixels===next).texture,settledStart);
 }else{
  next.onerror();await h.settle();
  assert.ok(!h.deletedTextures.includes(old),'a failed upgrade retains the ready map');
  assertLinearDraw(old,settledStart);
 }
});

test('simultaneous decodes upload one per frame and stale bitmaps are closed',async t=>{
 const pending=[];const h=await orreryHarness(t,{controls:true,reducedMotion:true,referenceImageLoader:(asset,request)=>pending.push({asset,...request})});
 await h.enterOrrery();h.input('orreryAnchor','Earth','change');
 const active=pending.filter(p=>!p.signal.aborted);assert.equal(active.length,2);
 const bitmaps=active.map(p=>({width:p.plan.width,height:p.plan.height,closed:0,close(){this.closed++;}}));
 const before=h.textureRecords.length;active.forEach((p,i)=>p.onReady(bitmaps[i]));
 assert.equal(h.textureRecords.length,before,'decode completion never uploads outside a frame');
 h.check('orreryShowLabels',false);assert.equal(h.textureRecords.length,before+1);
 h.check('orreryShowLabels',true);assert.equal(h.textureRecords.length,before+2);
 assert.deepEqual(bitmaps.map(b=>b.closed),[1,1]);
 const stale=pending.find(p=>p.signal.aborted);assert.ok(stale);
 const bitmap={closed:0,close(){this.closed++;}};stale.onReady(bitmap);assert.equal(bitmap.closed,1);
 assert.ok(h.state.textureBudget.pendingBytes<=32*1024*1024);assert.ok(h.state.textureBudget.residentBytes<=96*1024*1024);
});
