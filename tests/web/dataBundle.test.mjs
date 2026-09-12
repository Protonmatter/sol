import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { readDataBundle, BUNDLE_SCHEMAS } from "../../apps/web/js/dataBundle.js";

const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
const hash=raw=>createHash("sha256").update(raw).digest("hex");
const snapshot=JSON.parse(fs.readFileSync(new URL("../../apps/web/data/latest-state.json",import.meta.url),"utf8"));
function fixture(id, mutate=()=>{}){
  const source={schema_version:"public-data-cache-manifest.v2",bundle_id:"source",acquired_at_utc:"2026-09-11T00:00:00Z",failures:[],products:[{product_id:"fixture.json",source:"fixture",origin:"fixture",observation_time_utc:null,retrieved_at_utc:null,quality:["fixture"],failure:null,license:"fixture",critical:true,path:"payloads/fixture.json",size_bytes:2,sha256:hash(bytes({}))}]};
  const values={snapshot,observations:snapshot.observations[0],feed_status:{schema_version:"daily-ingest-status.v2",bundle_id:id,source_bundle_id:"source",status:"degraded",generated_at_utc:"2026-09-11T00:00:00Z",observation_time_utc:null,delivery_state:"validated",warnings:["fixture"]},series_manifest:{schema_version:"series-manifest.v1",frames:[]},source_manifest:source};
  values.snapshot=structuredClone(snapshot);
  values.observations=structuredClone(snapshot.observations[0]);
  mutate(values);
  values.feed_status.sources=source.products.map(p=>({file:p.product_id,source:p.source,ok:p.failure===null,
    origin:p.origin,observation_time_utc:p.observation_time_utc,retrieved_at_utc:p.retrieved_at_utc}));
  const root=`https://example.invalid/data/bundles/${id}/`,files=new Map(),components=[];
  for(const [role,value] of Object.entries(values)){const raw=bytes(value),path=role.startsWith("series_frame:")?`series/frame-${role.slice(13)}.json`:`${role}.json`;files.set(root+path,raw);components.push({role,path,schema_version:value.schema_version,size_bytes:raw.length,sha256:hash(raw)});}
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

test("hash-bound but conflicting snapshot and observation evidence is rejected",async()=>{
  const changes={
    source:v=>{v.observations.frames[0].provenance.source="other instrument";},
    order:v=>{v.observations.frames.reverse();},
    omitted:v=>{v.observations.frames.pop();},
    mode:v=>{v.observations.source_mode="cached";},
    context:v=>{v.observations.observed_context.activity_index=0.2;},
    topContext:v=>{v.snapshot.observed_context.activity_index=0.2;},
    rawType:v=>{v.observations.frames[0].provenance.raw_source_metadata.active=1;},
    reportCount:v=>{v.snapshot.observations.push(structuredClone(v.snapshot.observations[0]));},
  };
  for(const [name,change] of Object.entries(changes)){
    const a=fixture("a",change);
    const fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
    await assert.rejects(readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto}),/snapshot.*observations|observation.*context/i,name);
  }
});

test("object key order and excluded unattributed report frames do not create false mismatches",async()=>{
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  const a=fixture("a",values=>{
    for(const invalid of [null,"","  "," unknown ",17,false]){
      const frame=structuredClone(values.observations.frames[0]);frame.provenance.source=invalid;
      values.observations.frames.push(frame);
    }
    values.observations=reorder(values.observations);
  });
  const fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
  const accepted=await readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto});
  assert.equal(accepted.observations.frames.length,8);
  assert.equal(accepted.snapshot.observations[0].frames.length,2);
  assert.equal(accepted.snapshot.observed_context.activity_index,0.9);
});

test("the actual loader retains its complete publication for invalid rehashed evidence or series roles",async()=>{
  const good=fixture("good"),bad=fixture("bad",v=>{v.observations.observed_context.activity_index=0.2;});
  let selected=good;
  const fetcher=async url=>new Response(url.endsWith("current.json")?selected.pointer:selected.files.get(url));
  const store={state:null,timelineIndex:-1,selectedRegionId:null};
  const source=fs.readFileSync(new URL("../../apps/web/js/data.js",import.meta.url),"utf8")
    .replace(/^import .*;\r?\n/gm,"").replaceAll("export ","").replaceAll("import.meta.url",'"https://example.invalid/js/data.js"');
  const context=vm.createContext({store,URL,Image:class{},FALLBACK_STATE:{fallback:true},BASE_IMAGES:{},
    document:{getElementById:()=>null},window:{},renderAll:()=>{},maybeAutoStartTour:()=>{},prepareBundlePublication:()=>{},
    readDataBundle:()=>readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto})});
  vm.runInContext(source,context);
  await context.loadState();
  const before={snapshot:store.state,identity:store.dataBundleIdentity,status:store.feedStatus,series:store.seriesRecords};
  assert.equal(before.identity.bundle_id,"good");
  const wrongLongitude=fixture("wrong-longitude",v=>{v.snapshot.active_regions[0].model_position.lon_deg=(v.snapshot.active_regions[0].model_position.lon_deg+30)%360;});
  const wrongSource=fixture("wrong-source",v=>{v.source_manifest.products[0].source="\u001cUNKNOWN\u0085";});
  for(const candidate of [bad,seriesFixture("series_frame:00"),wrongLongitude,wrongSource]){
    selected=candidate;await context.loadState();
    assert.equal(store.state,before.snapshot);assert.equal(store.liveState,before.snapshot);
    assert.equal(store.dataBundleIdentity,before.identity);assert.equal(store.feedStatus,before.status);assert.equal(store.seriesRecords,before.series);
    assert.match(store.dataError,/observations|Orphan series|longitude|attributable source product/);
  }
  selected=good;await context.loadState();assert.equal(store.dataError,null);
});

test("attribution whitespace is the same as daily derivation including control separators",async()=>{
  for(const source of ["\u0085","\u001c","\u001d","\u001e","\u001f","\u0085unknown\u001c","un\u212anown","\ufeff"]){
    const a=fixture("a",values=>{
      const frame=structuredClone(values.observations.frames[0]);frame.provenance.source=source;
      values.observations.frames.push(frame);
      if(source==="\ufeff")values.snapshot.observations[0].frames.push(structuredClone(frame));
    });
    const fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
    const accepted=await readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto});
    assert.equal(accepted.snapshot.observations[0].frames.length,source==="\ufeff"?3:2);
  }
});

test("source products retain FEFF attribution in hash-valid bundles",async()=>{
  for(const source of ["\ufeff", "\ufeffUNKNOWN", "UNKNOWN\ufeff", "\u001cNOAA\u0085"]){
    const a=fixture("a",values=>{values.source_manifest.products[0].source=source;});
    const before=[...a.files].map(([url,raw])=>[url,hash(raw)]);
    const fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
    assert.equal((await readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto})).bundleId,"a");
    assert.deepEqual([...a.files].map(([url,raw])=>[url,hash(raw)]),before);
  }
});

test("source products reject shared whitespace and Unicode unknown before admission",async()=>{
  for(const source of ["\u001c", "\u001d", "\u001e", "\u001f", "\u0085", "\u001c UnKnOwN\u001f", "un\u212anown"]){
    const a=fixture("a",values=>{values.source_manifest.products[0].source=source;});
    const fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
    await assert.rejects(readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto}),/attributable source product/,JSON.stringify(source));
  }
});

test("numeric evidence outside the shared comparison range cannot be silently rounded into agreement",async()=>{
  for(const counter of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 9007199254740992, -9007199254740992, 1e30]){
    const a=fixture("a",values=>{
      for(const report of [values.observations,values.snapshot.observations[0]])report.frames[0].provenance.raw_source_metadata.counter=counter;
    });
    const fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
    const result=readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto});
    if(Math.abs(counter)<=Number.MAX_SAFE_INTEGER)assert.equal((await result).snapshot.observations[0].frames[0].provenance.raw_source_metadata.counter,counter);
    else await assert.rejects(result,/snapshot.*observations/i);
  }
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
  const a=fixture("a",values=>{values.source_manifest.products[0].source="\ufeffUNKNOWN";}),prefix="https://example.invalid/sol/releases/release-a/",files=new Map();
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

function seriesFixture(extraRole=null){
  return fixture("series",values=>{
    values.series_manifest.frames=Array.from({length:11},(_,index)=>({
      file:`frame-${index}.json`,months:index*12,index,
      stage:snapshot.learning.cycle_stage,activity_index:snapshot.run.activity_index,region_count:snapshot.active_regions.length,
      ...(index===0||index===10?{}:{availability:"unavailable",reason:"declared gap"}),
    }));
    values["series_frame:0"]=structuredClone(snapshot);
    values["series_frame:10"]=structuredClone(snapshot);
    if(extraRole)values[extraRole]=structuredClone(snapshot);
  });
}

test("canonical series roles retain multi-digit indices and declared gaps",async()=>{
  const a=seriesFixture(),fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
  const selected=await readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto});
  assert.equal(selected.seriesFrames.length,11);
  assert.equal(selected.seriesRecords[0].status,"ready");
  assert.equal(selected.seriesRecords[1].status,"unavailable");
  assert.equal(selected.seriesFrames[1],null);
  assert.equal(selected.seriesRecords[10].status,"ready");
  assert.equal(selected.seriesRecords[10].months,120);
});

test("rehashed leading-zero series role aliases are rejected as unselected components",async()=>{
  for(const role of ["series_frame:00","series_frame:000","series_frame:010","series_frame:01"]){
    const a=seriesFixture(role),fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
    await assert.rejects(readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto}),/orphan series/i,role);
  }
});

test("series gap payloads and out-of-range canonical components remain rejected",async()=>{
  for(const role of ["series_frame:1","series_frame:11","series_frame:999"]){
    const a=seriesFixture(role),fetcher=async url=>new Response(url.endsWith("current.json")?a.pointer:a.files.get(url));
    await assert.rejects(readDataBundle({pointerUrl:"https://example.invalid/data/current.json",fetcher,crypto:webcrypto}),/gap|orphan series/i,role);
  }
});
