import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { readDataBundle, BUNDLE_SCHEMAS } from "../../apps/web/js/dataBundle.js";

const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
const hash=raw=>createHash("sha256").update(raw).digest("hex");
const snapshot=JSON.parse(fs.readFileSync(new URL("../../apps/web/data/latest-state.json",import.meta.url),"utf8"));
function fixture(id, mutate=()=>{}){
  const source={schema_version:"public-data-cache-manifest.v2",bundle_id:"source",acquired_at_utc:"2026-09-11T00:00:00Z",failures:[],products:[{product_id:"fixture.json",source:"fixture",origin:"fixture",observation_time_utc:null,retrieved_at_utc:null,quality:["fixture"],failure:null,license:"fixture",critical:true,path:"payloads/fixture.json",size_bytes:2,sha256:hash(bytes({}))}]};
  const values={snapshot,observations:snapshot.observations[0],feed_status:{schema_version:"daily-ingest-status.v2",bundle_id:id,source_bundle_id:"source",status:"degraded",generated_at_utc:"2026-09-11T00:00:00Z",observation_time_utc:null,delivery_state:"validated",warnings:["fixture"]},series_manifest:{schema_version:"series-manifest.v1",frames:[]},source_manifest:source};
  mutate(values);
  const root=`https://example.invalid/data/bundles/${id}/`,files=new Map(),components=[];
  for(const [role,value] of Object.entries(values)){const raw=bytes(value),path=`${role}.json`;files.set(root+path,raw);components.push({role,path,schema_version:value.schema_version,size_bytes:raw.length,sha256:hash(raw)});}
  const manifest=bytes({schema_version:"research-data-bundle.v1",bundle_id:id,source_bundle_id:"source",source_manifest_sha256:hash(bytes(source)),generated_at_utc:"2026-09-11T00:00:00Z",components});
  files.set(root+"manifest.json",manifest);
  return {files,pointer:bytes({schema_version:"bundle-pointer.v1",bundle_id:id,manifest_path:`bundles/${id}/manifest.json`,manifest_sha256:hash(manifest)})};
}
test("bundle schemas exactly match canonical documents and UTC rejects normalized invalid dates",async()=>{
  for(const [version,schema]of Object.entries(BUNDLE_SCHEMAS)){
    const names={"bundle-pointer.v1":"bundle-pointer-v1","public-data-cache-manifest.v2":"public-data-cache-manifest-v2","research-data-bundle.v1":"research-data-bundle-v1","daily-ingest-status.v2":"daily-ingest-status-v2"};
    assert.deepEqual(schema,JSON.parse(fs.readFileSync(new URL(`../../docs/${names[version]}.schema.json`,import.meta.url),"utf8")));
  }
  for(const stamp of ["2026-02-30T00:00:00Z","2026-09-11 00:00:00Z","2026-09-11T00:00Z"]){
    const a=fixture("a",values=>{values.source_manifest.acquired_at_utc=stamp;});
    const fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
    await assert.rejects(readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto}),/UTC/);
  }
});
test("bundle reader stays pinned across pointer switch and rollback",async()=>{
  const a=fixture("a"),b=fixture("b"),files=new Map([...a.files,...b.files]);let pointer=a.pointer,reads=0;
  const fetcher=async url=>{
    if(url.endsWith("current.json")){reads++;return new Response(pointer);}
    if(url.endsWith("snapshot.json"))pointer=b.pointer;
    return new Response(files.get(url));
  };
  const result=await readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto});
  assert.equal(reads,1);assert.equal(result.bundleId,"a");assert.equal(result.feedStatus.bundle_id,"a");
  assert.deepEqual(result.identity,{bundle_id:"a",source_bundle_id:"source",manifest_sha256:JSON.parse(new TextDecoder().decode(a.pointer)).manifest_sha256});
  assert.ok(Object.isFrozen(result.identity));
  pointer=a.pointer;assert.equal(result.bundleId,"a");assert.ok(Object.isFrozen(result.snapshot));
});
test("hash mismatch never falls back to mutable aliases",async()=>{
  const a=fixture("a"),seen=[];
  const fetcher=async url=>{seen.push(url);if(url.endsWith("current.json"))return new Response(a.pointer);if(url.endsWith("feed_status.json"))return new Response("{}");return new Response(a.files.get(url));};
  await assert.rejects(readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto}),/hash|size/);
  assert.ok(seen.every(url=>!url.endsWith("latest-state.json")));
});
test("declared gaps retain all manifest indices and fixture health cannot become ok",async()=>{
  const a=fixture("a",values=>{values.series_manifest.frames=[{file:"a.json",months:0,availability:"unavailable",reason:"fixture gap"},{file:"b.json",months:24,availability:"unavailable",reason:"fixture gap"}];});
  let chosen=a;
  const fetcher=async url=>new Response(url.endsWith("current.json")?chosen.pointer:chosen.files.get(url));
  const result=await readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto});
  assert.equal(result.seriesRecords.length,2);assert.equal(result.seriesRecords[1].index,1);assert.equal(result.seriesRecords[1].months,24);assert.equal(result.seriesRecords[1].status,"unavailable");
  chosen=fixture("a",values=>{values.feed_status.status="ok";});
  await assert.rejects(readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto}),/degradation/);
});
test("release-bound bundle uses immutable manifest and critical asset size/hash identities",async()=>{
  const a=fixture("a"),prefix="https://example.invalid/sol/releases/release-a/",files=new Map();
  for(const [url,raw]of a.files)files.set(url.replace("https://example.invalid/",prefix),raw);
  const descriptor=JSON.parse(new TextDecoder().decode(a.pointer));
  const release={schema_version:"web-release-manifest.v1",release_id:"release-a",namespace:"releases/release-a/",base_path:"/sol/",data_bundle_id:"a",
    data_bundle:{bundle_id:"a",manifest_path:"releases/release-a/data/"+descriptor.manifest_path,manifest_sha256:descriptor.manifest_sha256},
    assets:[...files].map(([url,raw])=>({path:new URL(url).pathname.slice(5),size:raw.length,sha256:hash(raw),role:"critical"}))};
  files.set(prefix+"web-release-manifest.json",bytes(release));
  const seen=[],fetcher=async url=>{seen.push(url);return new Response(files.get(url));};
  const selected=await readDataBundle({releaseUrl:prefix+"web-release-manifest.json",expectedReleaseId:"release-a",fetcher,crypto:webcrypto});
  assert.equal(selected.bundleId,"a");assert.ok(seen.every(url=>url.startsWith(prefix)));
});
