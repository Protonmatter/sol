import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validateDynamicManifest,validateDynamicPacket,loadDynamicResource,loadDynamicScene,parseDynamicJson} from '../../apps/web/js/solarDynamicAssets.js';

const hash='a'.repeat(64);
const resource=(path,bytes=16)=>({path,bytes,sha256:hash});
const manifest=()=>JSON.parse(readFileSync(new URL('../../apps/web/solar-dynamic/active-v1/manifest.json',import.meta.url),'utf8'));
const packet=()=>JSON.parse(readFileSync(new URL('../../apps/web/solar-dynamic/active-v1/t00000/packet.json',import.meta.url),'utf8'));

test('dynamic admission refuses observational authority, invalid dimensions and escaping resource paths', () => {
  assert.equal(validateDynamicManifest(manifest()).id,'active-v1');
  for(const authority of ['observed','calibrated',null])assert.throws(()=>validateDynamicManifest({...manifest(),authority}));
  for(const path of ['../secret','https://evil.invalid/a','/outside','solar-dynamic/%2e%2e/data','solar-dynamic/a?x','solar-dynamic/a\\b']) {
    const m=manifest();m.packet.path=path;assert.throws(()=>validateDynamicManifest(m));
  }
  const big=manifest();big.volumes[0].dimensions=[65536,65536,65536];assert.throws(()=>validateDynamicManifest(big));
  const mismatch=manifest();mismatch.surface.bytes=127;assert.throws(()=>validateDynamicManifest(mismatch));
});

test('packet rejects missing full-sphere semantics, nonfinite geometry and excessive curves', () => {
  const p=packet();
  assert.equal(validateDynamicPacket(p).seed,42);
  assert.throws(()=>validateDynamicPacket({...p,time_s:NaN}));
  assert.throws(()=>validateDynamicPacket({...p,relative_emission:false}));
  assert.throws(()=>validateDynamicPacket({...p,regions:[{...p.regions[0],center:[Infinity,0,0]}]}));
  assert.throws(()=>validateDynamicPacket({...p,strands:Array(4097).fill({})}));
});

test('bounded load verifies exact bytes and digest, rejects redirected and oversized responses', async () => {
  const bytes=new Uint8Array([1,2,3,4]);
  const r={path:'solar-dynamic/a.f32',bytes:4,sha256:createHash('sha256').update(bytes).digest('hex')};
  const digest=async b=>new Uint8Array(createHash('sha256').update(new Uint8Array(b)).digest()).buffer;
  const fetcher=async()=>new Response(bytes,{status:200});
  assert.deepEqual(new Uint8Array(await loadDynamicResource(r,{fetcher,digest})),bytes);
  await assert.rejects(loadDynamicResource({...r,sha256:hash},{fetcher,digest}),/SHA/);
  await assert.rejects(loadDynamicResource(r,{fetcher:async()=>new Response(new Uint8Array(5)),digest}),/size|budget/);
  await assert.rejects(loadDynamicResource(r,{fetcher:async()=>new Response(new Uint8Array(3)),digest}),/truncat|size/);
  const response=new Response(bytes);Object.defineProperty(response,'redirected',{value:true});
  await assert.rejects(loadDynamicResource(r,{fetcher:async()=>response,digest}),/redirect/);
});

test('aborted resource does not fetch and cancels a hanging stream by deadline', async () => {
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(loadDynamicResource(resource('solar-dynamic/a'),{signal:controller.signal,fetcher:async()=>{calls++;return new Response();}}));
  assert.equal(calls,0);
  let cancelled=false;
  await assert.rejects(loadDynamicResource(resource('solar-dynamic/a'),{timeoutMs:10,fetcher:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}))}),/timeout|abort/i);
  assert.equal(cancelled,true);
});

test('early resource rejection cancels the unread response body', async () => {
  let cancelled=false;
  const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-length':'999999'}});
  await assert.rejects(loadDynamicResource(resource('solar-dynamic/a'),{fetcher:async()=>response}),/size/);
  assert.equal(cancelled,true,'rejected downloads cannot outlive their budget');
});


test('dynamic resources reject altered science semantics and duplicate keys',()=>{
  const short=manifest();short.duration_seconds=1;short.keyframes=short.keyframes.filter(k=>k.time_s===0);
  assert.throws(()=>validateDynamicManifest(short),/manifest|time/);
  for(const mutate of [m=>m.rotation.frame_rate_deg_per_day=0,m=>m.surface.latitude_row_zero='north',m=>m.surface.units='kelvin',m=>m.volumes[0].background.layout='z-first',m=>m.volumes[0].pulse.components=1,m=>m.recipe_hash='bad']){
    const m=manifest();mutate(m);assert.throws(()=>validateDynamicManifest(m));
  }
  for(const mutate of [p=>p.abi=3,p=>p.valid_time_range_seconds=[21600,0],p=>p.source_mode='observed',p=>p.surface.euv_texture.domain_warp.amplitude_cells=99,p=>delete p.surface.euv_texture.kind,p=>p.surface.euv_texture.octave_weights=[1,0,0]]){
    const p=packet();mutate(p);assert.throws(()=>validateDynamicPacket(p));
  }
  assert.throws(()=>parseDynamicJson('{"a":1,"a":2}'),/duplicate/);
  assert.throws(()=>parseDynamicJson('{"nested":{"a":1,"a":2}}'),/duplicate/);
  assert.deepEqual(parseDynamicJson('{"a":[1,{"b":2}]}'),{a:[1,{b:2}]});
});

test('attachment-derived emission is inseparable from its admitted loop endpoints and profiles',()=>{
  const original=packet();assert.equal(original.emission_model?.kind,'hierarchical_euv_v1');
  validateDynamicPacket(original);
  for(const mutate of [
    p=>delete p.emission_model,
    p=>p.emission_regions[0].cores[0].center=[0,0,1],
    p=>p.emission_regions[0].cores[0].attachment_group_id=99999,
    p=>p.emission_regions[0].cores[0].strand_id=99999,
    p=>p.strands[0].emissivity_gain.pop(),
    p=>p.strands[0].emissivity_gain[0]=2,
    p=>p.attachment_groups[0].strand_ids.push(99999),
  ]){
    const value=structuredClone(original);mutate(value);assert.throws(()=>validateDynamicPacket(value));
  }
});

test('full packets preserve stable attachment counts, identities and per-core budgets',()=>{
  for(const mutate of [
    p=>{p.emission_regions=[];p.attachment_groups=[];},
    p=>{p.emission_regions[0].cores[0].emission_relative=.8;p.emission_regions[0].cores[1].emission_relative=.6;},
    p=>p.emission_regions[0].cores[0].id=999,
    p=>p.attachment_groups.pop(),
    p=>p.emission_regions[0].cores.pop(),
    p=>{const a=p.emission_regions[0].cores;[a[0].id,a[1].id]=[a[1].id,a[0].id];},
  ]){const p=packet();mutate(p);assert.throws(()=>validateDynamicPacket(p));}
  const compact=packet();compact.field=null;compact.strands=[];compact.emission_regions=[];compact.attachment_groups=[];
  assert.equal(validateDynamicPacket(compact),compact);
  assert.throws(()=>validateDynamicPacket(compact,{requireGeometry:true}));
});

test('R4 production requires diffuse-only volume and exact reference map semantics',()=>{
  for(const mutate of [
    m=>{for(const v of m.volumes)delete v.background;},
    m=>m.surface.transfer_id='legacy',
    m=>{m.surface.dimensions=[512,256];m.surface.bytes=512*256*4;},
  ]){const m=manifest();mutate(m);assert.throws(()=>validateDynamicManifest(m));}
});


test('R4 loader fetches admitted packet and selected background only', async()=>{
  const root=new URL('../../apps/web/',import.meta.url);
  const path='solar-dynamic/active-v1/manifest.json';
  const bytes=readFileSync(new URL(path,root));
  const record={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const m=JSON.parse(bytes.toString('utf8'));
  for(const quality of ['low','standard']){
    const requested=[];
    const fetcher=async url=>{
      const relative=String(url).slice(root.href.length);
      assert.ok(String(url).startsWith(root.href));
      requested.push(relative);
      return new Response(readFileSync(new URL(relative,root)));
    };
    const digest=async data=>new Uint8Array(createHash('sha256').update(new Uint8Array(data)).digest()).buffer;
    const scene=await loadDynamicScene(record,{quality,fetcher,digest});
    const selected=m.volumes.find(v=>v.id===quality);
    assert.deepEqual(requested,[path,m.packet.path,selected.background.path]);
    assert.equal(scene.analyticSurface,true);
    assert.equal(scene.analyticStrands,true);
    assert.equal(scene.surfaceData,null);
    assert.equal(scene.pulseData,null);
    assert.equal(scene.selection.surface.referenceTextureUsed,false);
    assert.deepEqual(scene.selection.surface.packet,m.packet);
    assert.deepEqual(scene.selection.corona.field,selected.background);
    assert.equal(scene.volumeData.length,selected.background.bytes/4);
  }
});


test('attachment group centroid and directed axis derive from actual fixed endpoints',()=>{
  const reversed=packet(),group=reversed.attachment_groups[0];
  group.axis_u=group.axis_u.map(v=>-v);
  for(const region of reversed.emission_regions)for(const core of region.cores){
    if(core.attachment_group_id===group.id)core.axis_u=[...group.axis_u];
  }
  assert.throws(()=>validateDynamicPacket(reversed,{requireGeometry:true}));
  const shifted=packet(),g=shifted.attachment_groups[0];
  // Negation preserves unit length and tangent-axis orthogonality, but cannot
  // be the actual normalized centroid of this group's nearby footpoints.
  g.center=g.center.map(v=>-v);
  assert.throws(()=>validateDynamicPacket(shifted,{requireGeometry:true}));
});
