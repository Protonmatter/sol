import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';
const bytes=Uint8Array.from([0,97,115,109,1,0,0,0,5,3,1,0,1,7,10,1,6,109,101,109,111,114,121,2,0]);
const base=new URL('../../apps/web/',import.meta.url);
const sky=JSON.parse(fs.readFileSync(new URL('../fixtures/ephemeris-v3-corpus.json',import.meta.url))).snapshot;
const unix=(sky.time.jd_utc-2440587.5)*86400;
function systemSnapshot(unix){return {schema_version:'system-snapshot.v1',jd_utc:unix/86400+2440587.5,bodies:['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Moon'].map(name=>({name,x_au:1,y_au:0,z_au:0,dist_au:1,geo_dist_au:1,speed_kms:1,phase_angle_deg:null,illuminated_fraction:null,magnitude:null,equilibrium_temp_k:null,mean_temp_k:null,a_au:1,ecc:0,inc_deg:0,node_deg:0,argp_deg:0}))};}
const hosts={URL,TextDecoder,Uint8Array,Float64Array,AbortController,setTimeout,clearTimeout,performance,WebAssembly};
test('main positions and both worker clients share compiled ephemeris while every worker memory is separate',async t=>{
 let fetches=0,compiles=0;const workers=[];
 class Worker {
  constructor(){workers.push(this);}
  postMessage(message){
   this.latest=message;
   Promise.resolve().then(async()=>{
    if(message.type==='initialize'){
     assert.ok(message.module instanceof WebAssembly.Module);
     this.instance=await WebAssembly.instantiate(structuredClone(message.module));
     this.onmessage({data:{...message,type:'ready'}});
    }else this.onmessage({data:{...message,type:'result',value:message.engine==='system'?systemSnapshot(message.payload.unix):{operation:'snapshot',snapshot:structuredClone(sky)}}});
   }).catch(error=>this.onerror({preventDefault(){},message:error.message}));
  }
  terminate(){this.terminated=true;}
 }
 const context=vm.createContext({...hosts,Worker,fetch:async url=>{assert.match(String(url),/solar_ephemeris.wasm/);fetches++;return new Response(bytes);},WebAssembly:{...WebAssembly,Module:WebAssembly.Module,instantiate:WebAssembly.instantiate,compile:b=>{compiles++;return WebAssembly.compile(b);}}});
 const [engine,system,skyClient]=await loadSourceModules(context,['js/skyEngine.js','js/systemWorkerClient.js','js/skyWorkerClient.js'].map(p=>new URL(p,base)));
 const client=skyClient.createSkyWorkerClient();t.after(()=>{client.dispose();system.cancelSystemSnapshot();});
 const request={operation:'snapshot',unix,lat:0,lon:0,elev:0};
 const [main]=await Promise.all([engine.loadSkyEngine(),system.requestSystemSnapshot(unix),client.request(request)]);
 assert.equal(fetches,1);assert.equal(compiles,1);assert.equal(workers.length,2);
 const memories=[main.memory,...workers.map(w=>w.instance.exports.memory)];assert.equal(new Set(memories).size,3);
 new Uint8Array(main.memory.buffer)[0]=42;assert.ok(memories.slice(1).every(m=>new Uint8Array(m.buffer)[0]===0));
 const oldMemory=workers[1].instance.exports.memory;client.cancel();await client.request(request);
 assert.equal(fetches,1);assert.equal(compiles,1);assert.notEqual(workers.at(-1).instance.exports.memory,oldMemory);
});
test('both real loaders instantiate supplied code without fetch and retain one instance per realm',async()=>{
 const module=await WebAssembly.compile(bytes),memories=[];
 for(const path of ['js/skyEngine.js','engine.js'])for(let realm=0;realm<2;realm++){
  const context=vm.createContext({...hosts,fetch:()=>{throw Error('supplied code must not fetch');}});
  const [api]=await loadSourceModules(context,[new URL(path,base)]);
  const load=api.loadSkyEngine||api.loadEngine;
  const first=load(structuredClone(module));assert.equal(load(),first);
  const exports=await first;memories.push(exports.memory);
 }
 assert.equal(new Set(memories).size,4);
});

test('Solar compute-only client reuses main compiled code across worker restarts',async t=>{
 const solar=JSON.parse(fs.readFileSync(new URL('../../apps/web/data/latest-state.json',import.meta.url)));
 let fetches=0;const workers=[];
 class Worker {
  constructor(){workers.push(this);}
  postMessage(message){
   assert.equal(message.type,'compute');assert.ok(message.module instanceof WebAssembly.Module);
   Promise.resolve().then(async()=>{
    this.instance??=await WebAssembly.instantiate(structuredClone(message.module));
    this.onmessage({data:{...message,type:'result',value:solar}});
   }).catch(error=>this.onerror({preventDefault(){},message:error.message}));
  }
  terminate(){}
 }
 const context=vm.createContext({...hosts,Worker,fetch:async url=>{fetches++;assert.match(String(url),/solar_wasm.wasm/);return new Response(bytes);}});
 const [engine,client]=await loadSourceModules(context,['engine.js','js/solarWorkerClient.js'].map(p=>new URL(p,base)));
 t.after(()=>client.cancelSolarSimulation());
 const request={seed:42,steps:1,dtHours:1,activity:0.9,lon:8,lat:4};
 const [main]=await Promise.all([engine.loadEngine(),client.requestSolarSimulation(request)]);
 const first=workers[0].instance.exports.memory;assert.notEqual(main.memory,first);client.cancelSolarSimulation();await client.requestSolarSimulation(request);
 assert.notEqual(workers[1].instance.exports.memory,first);assert.equal(fetches,1);
});

test('instantiation failure retries the cached compiled code without fetching or compiling it again',async()=>{
 for(const path of ['engine.js','js/skyEngine.js']) {
  let fetches=0,compiles=0,instances=0;
  const context=vm.createContext({...hosts,fetch:async()=>{fetches++;return new Response(bytes);},WebAssembly:{compile:b=>{compiles++;return WebAssembly.compile(b);},instantiate:module=>{if(++instances===1)throw Error('allocation failed');return WebAssembly.instantiate(module);}}});
  const [api]=await loadSourceModules(context,[new URL(path,base)]),load=api.loadEngine||api.loadSkyEngine;
  await assert.rejects(load(),/allocation failed/);assert.ok((await load()).memory instanceof WebAssembly.Memory);
  assert.equal(fetches,1);assert.equal(compiles,1);assert.equal(instances,2);
 }
});
