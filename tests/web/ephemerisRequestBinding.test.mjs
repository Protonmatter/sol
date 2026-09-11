import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertEphemerisSnapshotV3, mergeLocalEvents } from "../../apps/web/js/ephemerisContract.js";
import { fetchServerSky } from "../../apps/web/js/skyEngine.js";
import { SkyConsent } from "../../apps/web/js/skyPrivacy.js";

const snapshot=JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json",import.meta.url),"utf8")).snapshot;
const unix=(snapshot.time.jd_utc-2440587.5)*86400;
function atOffset(days) {
  const data=structuredClone(snapshot);
  for(const key of ["jd_utc","jd_tai","jd_tt","jd_ut1"]) if(data.time[key]!==null) data.time[key]+=days;
  return assertEphemerisSnapshotV3(data);
}
async function fetchFixture(data, requestUnix=unix, lat=0, lon=0, elev=0) {
  const previousFetch=globalThis.fetch, previousWindow=globalThis.window;
  globalThis.window={location:{href:"https://example.invalid/"},localStorage:{getItem:()=>"granted"}};
  globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify(data)});
  const consent=new SkyConsent();consent.setRecipient("https://example.invalid");consent.grant();
  try { return await fetchServerSky(requestUnix,lat,lon,elev,"https://example.invalid",{consent}); }
  finally { globalThis.fetch=previousFetch; if(previousWindow===undefined) delete globalThis.window; else globalThis.window=previousWindow; }
}

test("remote intake accepts only the requested instantaneous epoch",async()=>{
  const matching=await fetchFixture(snapshot);
  assert.equal(matching.time.jd_utc,snapshot.time.jd_utc);
  await assert.rejects(fetchFixture(atOffset(0.125)),/epoch.*request|request.*epoch/i);
  await assert.rejects(fetchFixture(snapshot,unix+10800),/epoch.*request|request.*epoch/i);
});
test("remote intake requires exact terrestrial observer identity",async()=>{
  for(const [key,lat,lon,elev] of [["terrestrial_lat_deg",1,0,0],["terrestrial_lon_deg_east",0,1,0],["elev_m",0,0,1]]) {
    await assert.rejects(fetchFixture(snapshot,unix,lat,lon,elev),/observer.*request|request.*observer/i,key);
  }
});
test("epoch serialization tolerance is inclusive at four modern JD ulps, not five",async()=>{
  // At this JD a binary64 ulp is 2^-31 days. Four ulps are 2^-29 days (~0.161ms).
  for(const sign of [-1,1]) {
    const boundary=atOffset(sign*1.862645149230957e-9);
    assert.equal((await fetchFixture(boundary)).time.jd_utc,boundary.time.jd_utc);
    await assert.rejects(fetchFixture(atOffset(sign*2.3283064365386963e-9)),/epoch.*request|request.*epoch/i);
    assert.doesNotThrow(()=>mergeLocalEvents(snapshot,boundary));
    assert.throws(()=>mergeLocalEvents(snapshot,atOffset(sign*2.3283064365386963e-9)),/epoch/i);
  }
});
test("hybrid instantaneous stars cannot come from another instant in the same day",()=>{
  const remote=structuredClone(snapshot);
  remote.bodies=remote.bodies.filter(b=>b.range_approximation!=="infinite_catalogue_star");
  assertEphemerisSnapshotV3(remote);
  const local=atOffset(0.125),beforeRemote=JSON.stringify(remote),beforeLocal=JSON.stringify(local);
  assert.throws(()=>mergeLocalEvents(remote,local),/epoch/i);
  assert.equal(JSON.stringify(remote),beforeRemote);
  assert.equal(JSON.stringify(local),beforeLocal);
});
test("same-instant hybrid retains differing EOP metadata without mutating sources",()=>{
  const remote=structuredClone(snapshot),local=structuredClone(snapshot);
  remote.bodies=remote.bodies.filter(b=>b.range_approximation!=="infinite_catalogue_star");
  remote.time.earth_orientation.quality="degraded";
  remote.time.earth_orientation.source="offline server fixture without independent EOP";
  remote.accuracy.eop_status="degraded";
  remote.time.dut1_seconds=0;
  remote.time.jd_ut1=remote.time.jd_utc;
  remote.time.delta_t_seconds=(remote.time.jd_tt-remote.time.jd_ut1)*86400;
  assertEphemerisSnapshotV3(remote); assertEphemerisSnapshotV3(local);
  const beforeRemote=JSON.stringify(remote),beforeLocal=JSON.stringify(local);
  const merged=mergeLocalEvents(remote,local);
  assert.deepEqual(merged.time,remote.time);
  assert.ok(merged.bodies.some(b=>b.range_approximation==="infinite_catalogue_star"));
  assert.equal(JSON.stringify(remote),beforeRemote); assert.equal(JSON.stringify(local),beforeLocal);
});
