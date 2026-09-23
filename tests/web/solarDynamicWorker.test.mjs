import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {sampleSolarAppearance,validateAppearanceRequest} from '../../apps/web/js/solarDynamicSampling.js';

test('appearance ABI validates range and copies the owned result before later WASM calls', () => {
  const packet=JSON.parse(readFileSync(new URL('../../apps/web/solar-dynamic/quiet-v1/t00000/packet.json',import.meta.url),'utf8'));
  packet.strands=[];packet.field=null;packet.emission_regions=[];packet.attachment_groups=[];
  const bytes=new TextEncoder().encode(JSON.stringify(packet)),memory={buffer:new ArrayBuffer(65536)};
  new Uint8Array(memory.buffer,16,bytes.length).set(bytes);
  let called=[];
  const wasm={memory,appearance_abi_version:()=>1,appearance_eval_v1:(...args)=>{called=args;return 16;},appearance_result_len_v1:()=>bytes.length};
  const result=sampleSolarAppearance(wasm,{seed:42,time_s:0,recipe_id:'quiet-v1',lod:0});
  assert.equal(result.seed,42);assert.deepEqual(called,[42,0,0,0]);
  new Uint8Array(memory.buffer).fill(0);assert.equal(result.recipe_id,'quiet-v1');
  assert.throws(()=>sampleSolarAppearance({...wasm,appearance_abi_version:()=>2},{seed:42,time_s:0,recipe_id:'quiet-v1',lod:0}),/ABI/);
  assert.throws(()=>sampleSolarAppearance({...wasm,appearance_result_len_v1:()=>1e9},{seed:42,time_s:0,recipe_id:'quiet-v1',lod:0}),/buffer|size/);
});

test('appearance requests reject unknown recipes, invalid seed, time and resolution', () => {
  const good={seed:42,time_s:0,recipe_id:'active-v1',lod:0};
  assert.deepEqual(validateAppearanceRequest(good),good);
  for(const invalid of [{seed:-1},{seed:2**32},{time_s:NaN},{time_s:21601},{recipe_id:'observed'},{lod:10}])
    assert.throws(()=>validateAppearanceRequest({...good,...invalid}));
});
