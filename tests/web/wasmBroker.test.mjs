import test from 'node:test';
import assert from 'node:assert/strict';
import {createWasmModuleBroker} from '../../apps/web/js/wasmBroker.js';
// (module (memory (export "memory") 1)) — actual compilation/instantiation.
const bytes=Uint8Array.from([0,97,115,109,1,0,0,0,5,3,1,0,1,7,10,1,6,109,101,109,111,114,121,2,0]);
const url='https://example.invalid/releases/a/pkg/engine.wasm';
test('one canonical release asset shares compile and supports independent cloned memories despite wrong MIME',async()=>{
 let fetches=0,compiles=0;
 const broker=createWasmModuleBroker({fetchResource:async(u,o)=>{assert.equal(u,url);assert.equal(o.cache,'no-cache');assert.equal(new URL(u).search,'');fetches++;return new Response(bytes,{headers:{'Content-Type':'text/plain'}});},compileModule:b=>{compiles++;return WebAssembly.compile(b);}});
 const first=broker.compiledModule(url);assert.equal(first,broker.compiledModule(new URL(url)));
 const module=await first;assert.equal(await broker.compiledModule(url),module);assert.equal(fetches,1);assert.equal(compiles,1);
 const a=await WebAssembly.instantiate(module),b=await WebAssembly.instantiate(structuredClone(module));
 assert.notEqual(a.exports.memory,b.exports.memory);new Uint8Array(a.exports.memory.buffer)[0]=123;assert.equal(new Uint8Array(b.exports.memory.buffer)[0],0);
});
for(const failure of ['fetch','http','read','compile'])test(`${failure} failure evicts compilation for a later retry`,async()=>{
 let attempt=0;
 const broker=createWasmModuleBroker({fetchResource:async()=>{attempt++;if(attempt===1&&failure==='fetch')throw Error('network');if(attempt===1&&failure==='http')return new Response('',{status:503});return {ok:true,arrayBuffer:async()=>{if(attempt===1&&failure==='read')throw Error('read');return bytes;}};},compileModule:b=>{if(attempt===1&&failure==='compile')throw Error('compile');return WebAssembly.compile(b);}});
 await assert.rejects(broker.compiledModule(url));assert.ok(await broker.compiledModule(url) instanceof WebAssembly.Module);assert.equal(attempt,2);
});
test('different release URLs and different engines never share code entries',async()=>{
 let calls=0;const broker=createWasmModuleBroker({fetchResource:async()=>{calls++;return new Response(bytes);}});
 const a=await broker.compiledModule(url),b=await broker.compiledModule(url.replace('/a/','/b/')),c=await broker.compiledModule(url.replace('engine.wasm','solar.wasm'));
 assert.notEqual(a,b);assert.notEqual(a,c);assert.equal(calls,3);
});
test('bounded hung compilation permits retry and its late failure cannot evict the successful replacement',async()=>{
 let timer,clock=0,compileCount=0,rejectOld;
 const broker=createWasmModuleBroker({deadlineMs:60,now:()=>clock,setTimer:callback=>{timer=callback;return 1;},clearTimer:()=>{},fetchResource:async()=>new Response(bytes),compileModule:b=>++compileCount===1?new Promise((_,reject)=>{rejectOld=reject;}):WebAssembly.compile(b)});
 const first=broker.compiledModule(url);await new Promise(setImmediate);clock=60;timer();await assert.rejects(first,/deadline/i);
 clock=61;const second=await broker.compiledModule(url);rejectOld(Error('late failure'));await new Promise(setImmediate);
 assert.equal(await broker.compiledModule(url),second);assert.equal(compileCount,2);
});
