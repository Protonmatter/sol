import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertEphemerisSnapshotV3, parseEphemerisSnapshot, mergeLocalEvents } from "../../apps/web/js/ephemerisContract.js";
import { ephemerisSchema } from "../../apps/web/js/ephemerisSchema.js";
import { fetchServerSky } from "../../apps/web/js/skyEngine.js";
const corpus=JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json",import.meta.url),"utf8"));
const clockBoundary=JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-clock-boundary-20261104.json",import.meta.url),"utf8"));
const clockUlpCases=JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-clock-ulp-cases-20261104.json",import.meta.url),"utf8"));
test("v3 clock residual cutoff has fixed adjacent-float decisions",()=>{
  for(const row of clockUlpCases.cases) {
    const changed=structuredClone(clockBoundary);changed.time[row.field]=row.value;
    if(row.valid)assert.equal(assertEphemerisSnapshotV3(changed),changed);
    else assert.throws(()=>assertEphemerisSnapshotV3(changed),/time/);
  }
});
test("v3 rejects huge finite atomic offsets with unresolved clock anchors",()=>{
  const changed=structuredClone(clockBoundary),t=changed.time;
  t.tai_minus_utc_seconds=1e308;t.jd_tai=t.jd_utc+t.tai_minus_utc_seconds/86400;
  t.jd_tt=t.jd_tai+32.184/86400;t.delta_t_seconds=t.tai_minus_utc_seconds*(1+8*Number.EPSILON);
  assert.ok([t.jd_tai,t.jd_tt,t.delta_t_seconds].every(Number.isFinite));
  assert.throws(()=>assertEphemerisSnapshotV3(changed),/time/);
});
test("v3 admits accurate atomic delta-T beyond the legacy JD subtraction cutoff",()=>{
  const t=clockBoundary.time;
  assert.ok(Math.abs(t.delta_t_seconds-(t.jd_tt-t.jd_ut1)*86400)>5e-5);
  assert.equal(assertEphemerisSnapshotV3(structuredClone(clockBoundary)).time.delta_t_seconds,t.delta_t_seconds);
});
test("v3 retains legacy JD-derived delta-T while checking precise scalar offsets",()=>{
  const legacy=structuredClone(clockBoundary);
  legacy.time.delta_t_seconds=(legacy.time.jd_tt-legacy.time.jd_ut1)*86400;
  assert.equal(assertEphemerisSnapshotV3(legacy),legacy);
  const exact=clockBoundary.time.tai_minus_utc_seconds+32.184-clockBoundary.time.dut1_seconds;
  const allowed=structuredClone(clockBoundary);allowed.time.delta_t_seconds=exact+0.5e-9;
  assert.equal(assertEphemerisSnapshotV3(allowed),allowed);
  for(const offset of [-2e-9,2e-9,-.001,.001]) {
    const changed=structuredClone(clockBoundary);changed.time.delta_t_seconds=exact+offset;
    assert.throws(()=>assertEphemerisSnapshotV3(changed),/time/);
  }
});
test("accurate delta-T cannot conceal other clock inconsistencies or a missing atomic anchor",()=>{
  for(const field of ['jd_tai','jd_tt','jd_ut1']) {
    const changed=structuredClone(clockBoundary);changed.time[field]+=0.001;
    assert.throws(()=>assertEphemerisSnapshotV3(changed),/time/);
  }
  const changed=structuredClone(clockBoundary);
  changed.time.jd_tai=null;changed.time.tai_minus_utc_seconds=null;
  changed.time.input_time_semantics='historical_ut1_proxy';
  changed.time.earth_orientation.quality='pre_utc_ut1_proxy';changed.accuracy.eop_status='pre_utc_ut1_proxy';
  assert.throws(()=>assertEphemerisSnapshotV3(changed),/time/);
});
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
