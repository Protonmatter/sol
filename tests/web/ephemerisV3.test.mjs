import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertEphemerisSnapshotV3, parseEphemerisSnapshot, mergeLocalEvents } from "../../apps/web/js/ephemerisContract.js";
import { ephemerisSchema } from "../../apps/web/js/ephemerisSchema.js";
import { fetchServerSky } from "../../apps/web/js/skyEngine.js";
const corpus=JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json",import.meta.url),"utf8"));
test("parsed worker snapshots reject sparse arrays that JSON cannot preserve",()=>{
 const snap=structuredClone(corpus.snapshot);snap.warnings=new Array(1);assert.throws(()=>assertEphemerisSnapshotV3(snap),/sparse|incorrect type/);
});
function parent(data,path) { const keys=path.split("."); for(const key of keys.slice(0,-1)) data=data[key]; return [data,keys.at(-1)]; }
for(const scenario of corpus.cases) test(`v3 shared corpus: ${scenario.name}`,()=>{
  const data=structuredClone(corpus.snapshot);
  for(const [path,value] of scenario.changes) { const [node,key]=parent(data,path); node[key]=value; }
  if(scenario.remove) { const [node,key]=parent(data,scenario.remove); delete node[key]; }
  if(scenario.valid) assert.equal(assertEphemerisSnapshotV3(data),data);
  else assert.throws(()=>assertEphemerisSnapshotV3(data));
});
test("generated schema exactly matches canonical schema",()=>assert.deepEqual(ephemerisSchema,JSON.parse(fs.readFileSync(new URL("../../docs/ephemeris-snapshot-v3.schema.json",import.meta.url),"utf8"))));
test("strict JSON rejects duplicate members and non-JSON numbers",()=>{
  for(const text of ['{"a":1,"a":2}','{"a":NaN}','{"a":Infinity}','{"a":1} trailing']) assert.throws(()=>parseEphemerisSnapshot(text));
});
test("hybrid event backfill preserves source and input snapshots",()=>{
  const remote=structuredClone(corpus.snapshot),local=structuredClone(corpus.snapshot);
  local.bodies[1].events.transit.source={engine:"local-regression",version:"3"};
  const before=JSON.stringify(remote), merged=mergeLocalEvents(remote,local);
  assert.equal(JSON.stringify(remote),before);
  assert.deepEqual(merged.bodies[1].events.transit.source,local.bodies[1].events.transit.source);
  assert.notEqual(merged.bodies[1].events,local.bodies[1].events);
  local.observer.elev_m=1; assert.throws(()=>mergeLocalEvents(remote,local),/observer mismatch/);
  local.observer.elev_m=0;local.time.jd_utc+=1;assert.throws(()=>mergeLocalEvents(remote,local));
});
test("unsupported epochs and observers are rejected before remote I/O",async()=>{
  let calls=0; const previous=globalThis.fetch; globalThis.fetch=async()=>{calls++;throw new Error("should not fetch");};
  try {
    await assert.rejects(fetchServerSky(-62135596801,0,0,0,"https://example.invalid"),/outside supported/);
    await assert.rejects(fetchServerSky(0,91,0,0,"https://example.invalid"),/observer/i);
    assert.equal(calls,0);
  } finally { globalThis.fetch=previous; }
});
