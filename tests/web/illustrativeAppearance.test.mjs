import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {ILLUSTRATIVE_ASSETS,illustrativeSelected,planIllustrativeDemand,illustrativeDescription,decodeIllustrativeMap} from '../../apps/web/js/illustrativeAppearance.js';
import {surfaceReferenceShown,appearanceDescription} from '../../apps/web/js/planetAppearance.js';
import {planReferenceDemand} from '../../apps/web/js/referenceDemand.js';
const state={planetLook:'illustrative'};
const names=['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'];
test('opt-in catalog covers exactly seven bodies and protects the scientific default',()=>{
 assert.deepEqual(ILLUSTRATIVE_ASSETS.map(a=>a.body),names);
 for(const name of names){assert.equal(illustrativeSelected(name,{}),false);assert.equal(illustrativeSelected(name,{planetLook:'typo'}),false);assert.equal(illustrativeSelected(name,state),true);assert.equal(illustrativeSelected(name,{...state,useTextures:false}),false);}
 for(const name of ['Sun','Earth','Moon','constructor','__proto__'])assert.equal(illustrativeSelected(name,state),false);
 assert.equal(illustrativeSelected('Venus',{...state,venusRadar:true}),false);
});
test('demand is bounded, visible, deterministic, anchor-prioritized and disabled when unnecessary',()=>{
 const visible=new Map([['Mercury',9],['Venus',50],['Mars',100],['Jupiter',200],['Earth',1000],['Sun',2000],['Neptune',NaN]]);
 assert.deepEqual(planIllustrativeDemand(visible,{...state,anchor:'Mercury'}).map(a=>a.body),['Mercury','Jupiter']);
 assert.deepEqual(planIllustrativeDemand(visible,state).map(a=>a.body),['Jupiter','Mars']);
 for(const s of [{},{...state,useTextures:false},{...state,galaxy:true}])assert.deepEqual(planIllustrativeDemand(visible,s),[]);
 assert.deepEqual(planIllustrativeDemand(new Map([['Mars',7],['Venus',90]]),{...state,venusRadar:true}),[]);
});
test('illustrative materials suppress registered demand and source-ready claims only while selected',()=>{
 const visible=new Map([['Mars',80],['Earth',100]]);
 assert.equal(surfaceReferenceShown('Mars',state),false);
 assert.ok(planReferenceDemand(visible,state).every(a=>a.body==='Earth'));
 assert.ok(planReferenceDemand(visible,{}).some(a=>a.body==='Mars'));
 assert.match(appearanceDescription('Mars',state),/Illustrative/);
 assert.match(appearanceDescription('Earth',state),/Reference/);
 for(const status of ['deferred','loading','ready','unavailable']){const text=illustrativeDescription('Mars',{...state,illustrativeStatus:{Mars:status}});assert.match(text,/Solar System Scope/);assert.match(text,/not.*registered/i);assert.match(text,/suppresses the registered surface/);assert.match(text,/suspended while this look is selected/);if(status==='unavailable')assert.match(text,/unavailable/);}
 const displaced=illustrativeDescription('Mars',{...state,selected:'Mars',illustrativeStatus:{Mars:'deferred'},illustrativeVisibleFocused:['Mars'],illustrativeDemandBodies:['Jupiter','Venus']});
 assert.match(displaced,/two illustrative maps/);assert.doesNotMatch(displaced,/Focus or zoom/);
 assert.match(illustrativeDescription('Mars',{...state,illustrativeStatus:{Mars:'deferred'}}),/Focus or zoom/);
});
test('every local map matches provenance bytes and SHA-256',async()=>{
 for(const a of ILLUSTRATIVE_ASSETS){const b=await readFile(new URL('../../apps/web/'+a.path,import.meta.url));assert.equal(b.length,a.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),a.sha256);assert.deepEqual(a.dimensions,[2048,1024]);assert.equal(a.license,'CC BY 4.0');assert.match(a.sourceUrl,/solarsystemscope.com/);}
});
test('decode rejects byte/hash/dimension errors and closes bitmaps aborted during decoding',async()=>{
 const asset=ILLUSTRATIVE_ASSETS[0],bytes=await readFile(new URL('../../apps/web/'+asset.path,import.meta.url));
 let closed=0,decoded=0;const bitmap={width:2048,height:1024,close(){closed++;}};
 const services={fetch:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}),digest:b=>webcrypto.subtle.digest('SHA-256',b),decode:async()=>{decoded++;return bitmap;}};
 const control=new AbortController();assert.equal(await decodeIllustrativeMap(asset,control.signal,services),bitmap);
 await assert.rejects(decodeIllustrativeMap({...asset,bytes:1},control.signal,services),/size/);
 await assert.rejects(decodeIllustrativeMap({...asset,sha256:'0'.repeat(64)},control.signal,services),/hash/);
 await assert.rejects(decodeIllustrativeMap({...asset,dimensions:[1,1]},control.signal,services),/dimensions/);assert.equal(closed,1);
 const abort=new AbortController();await assert.rejects(decodeIllustrativeMap(asset,abort.signal,{...services,decode:async()=>{abort.abort();return bitmap;}}),/aborted/);assert.equal(closed,2);
 const previous=decoded;await assert.rejects(decodeIllustrativeMap(asset,abort.signal,services),/aborted/);assert.equal(decoded,previous);
 await assert.rejects(decodeIllustrativeMap(asset,control.signal,{...services,fetch:async()=>({ok:false})}),/unavailable/);
});
