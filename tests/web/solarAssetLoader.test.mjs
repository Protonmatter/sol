import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {SOLAR_APPEARANCE} from '../../apps/web/js/solarAppearance.js';
import {loadSolarAtlas,SOLAR_ATLAS_TIMEOUT_MS} from '../../apps/web/js/solarAssetLoader.js';

const atlas=SOLAR_APPEARANCE.atlas;
const bytes=await fs.readFile(new URL('../../apps/web/'+atlas.path,import.meta.url));
const bitmap=(width=atlas.dimensions[0],height=atlas.dimensions[1])=>({width,height,closed:0,close(){this.closed++;}});
const source=async()=>new Response(bytes);

test('qualified atlas decodes with explicitly neutral image transforms',async()=>{
  const image=bitmap(),seen={};
  const actual=await loadSolarAtlas({fetcher:async(url,options)=>{seen.url=url;seen.signal=options.signal;return new Response(bytes);},decode:async(blob,options)=>{seen.blob=blob;seen.options=options;return image;}});
  assert.equal(actual,image);assert.equal(image.closed,0);
  assert.equal(seen.url.href,new URL('../../apps/web/'+atlas.path,import.meta.url).href);
  assert.ok(seen.signal instanceof AbortSignal);
  assert.equal(seen.blob.size,atlas.bytes);assert.equal(seen.blob.type,'image/png');
  assert.deepEqual(seen.options,{imageOrientation:'none',colorSpaceConversion:'none',premultiplyAlpha:'none'});
});
test('hash substitution, truncation, and HTTP failure never reach the decoder',async()=>{
  let called=0;const decode=async()=>{called++;return bitmap();};
  const corrupt=Uint8Array.from(bytes);corrupt[4]^=1;
  await assert.rejects(loadSolarAtlas({fetcher:async()=>new Response(corrupt),decode}),/SHA-256|hash/i);
  await assert.rejects(loadSolarAtlas({fetcher:async()=>new Response(bytes.subarray(1)),decode}),/size|truncat/i);
  await assert.rejects(loadSolarAtlas({fetcher:async()=>new Response('',{status:404}),decode}),/404|unavailable/i);
  assert.equal(called,0);
});
test('oversized decoded stream is cancelled before any image decode',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(atlas.bytes+1));},cancel(){cancelled=true;}});
  await assert.rejects(loadSolarAtlas({fetcher:async()=>new Response(stream),decode:async()=>{throw new Error('must not decode');}}),/size|budget/i);
  assert.equal(cancelled,true);
});
test('compressed transfer length is independent of the admitted decoded byte size',async()=>{
  const image=bitmap();
  const actual=await loadSolarAtlas({fetcher:async()=>new Response(bytes,{headers:{'content-encoding':'gzip','content-length':'20000'}}),decode:async()=>image});
  assert.equal(actual,image);
});
test('unexpected image dimensions close rejected bitmap',async()=>{
  const image=bitmap(1024,1024);
  await assert.rejects(loadSolarAtlas({fetcher:source,decode:async()=>image}),/dimension/i);
  assert.equal(image.closed,1);
});
test('already aborted request does not fetch or decode',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadSolarAtlas({signal:controller.signal,fetcher:async()=>{throw new Error('must not fetch');},decode:async()=>bitmap()}),{name:'AbortError'});
});
test('abort during decode rejects promptly and closes a bitmap that arrives later',async()=>{
  const controller=new AbortController();let resolveDecode,started;
  const decodeStarted=new Promise(resolve=>{started=resolve;});
  const result=loadSolarAtlas({signal:controller.signal,fetcher:source,decode:()=>{started();return new Promise(resolve=>{resolveDecode=resolve;});}});
  await decodeStarted;controller.abort();
  await assert.rejects(result,{name:'AbortError'});
  const image=bitmap();resolveDecode(image);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(image.closed,1);
});
test('whole-operation timeout bounds a fetcher which ignores cancellation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let signal;
  const result=loadSolarAtlas({fetcher:(_,options)=>{signal=options.signal;return new Promise(()=>{});},decode:async()=>bitmap()});
  t.mock.timers.tick(SOLAR_ATLAS_TIMEOUT_MS);
  await assert.rejects(result,{name:'TimeoutError'});
  assert.equal(signal.aborted,true);
});
test('timeout during decoding closes a bitmap that resolves after the deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let resolveDecode,started;
  const decodeStarted=new Promise(resolve=>{started=resolve;});
  const result=loadSolarAtlas({fetcher:source,decode:()=>{started();return new Promise(resolve=>{resolveDecode=resolve;});}});
  await decodeStarted;t.mock.timers.tick(SOLAR_ATLAS_TIMEOUT_MS);
  await assert.rejects(result,{name:'TimeoutError'});
  const image=bitmap();resolveDecode(image);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(image.closed,1);
});
test('abort interrupts a stalled response stream and cancels its reader',async()=>{
  const controller=new AbortController();let cancelled=false,started;
  const readStarted=new Promise(resolve=>{started=resolve;});
  const stream=new ReadableStream({pull(){started();return new Promise(()=>{});},cancel(){cancelled=true;}});
  const result=loadSolarAtlas({signal:controller.signal,fetcher:async()=>new Response(stream),decode:async()=>{throw new Error('must not decode');}});
  await readStarted;await Promise.resolve();controller.abort();
  await assert.rejects(result,{name:'AbortError'});assert.equal(cancelled,true);
});
