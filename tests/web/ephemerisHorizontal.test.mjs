import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertEphemerisSnapshotV3 } from "../../apps/web/js/ephemerisContract.js";
import { fetchServerSky } from "../../apps/web/js/skyEngine.js";
import { SkyConsent } from "../../apps/web/js/skyPrivacy.js";

const snapshot=JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json",import.meta.url),"utf8")).snapshot;
const labels=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
function direction(latitude,ra,dec,alt,az) {
  const data=structuredClone(snapshot);data.time.lst_deg=0;
  data.observer.terrestrial_lat_deg=latitude;data.observer.polar_motion_corrected_lat_deg=latitude;
  for(const body of data.bodies) {
    Object.assign(body,{ra_deg:ra,dec_deg:dec,topocentric_apparent_ra_deg:ra,topocentric_apparent_dec_deg:dec,alt_deg:alt,az_deg:az,alt_refracted_deg:alt,above_horizon:alt>0,compass:labels[Math.floor(((az+11.25)%360)/22.5)]});
    if(body.range_approximation==="infinite_catalogue_star") Object.assign(body,{geocentric_apparent_ra_deg:ra,geocentric_apparent_dec_deg:dec});
  }
  return data;
}
test("direction coherence handles cardinal axes, both poles, zenith, nadir and azimuth wrap",()=>{
  for(const values of [[0,0,0,90,137],[0,180,0,-90,257],[0,90,0,0,90],[0,270,0,0,270],[0,0,90,0,359.99999999],[0,0,-90,0,180],[90,0,0,0,180],[-90,0,0,0,0]]) {
    const data=direction(...values),before=JSON.stringify(data);
    assert.equal(assertEphemerisSnapshotV3(data),data);assert.equal(JSON.stringify(data),before);
  }
});
test("one-arcminute coherence allowance is bounded and does not become a coordinate rewrite",()=>{
  for(const [arcminutes,valid] of [[0.999,true],[1,true],[1.001,false]]) {
    const data=direction(0,0,90,arcminutes/60,0),before=JSON.stringify(data);
    if(valid) assert.equal(assertEphemerisSnapshotV3(data),data);
    else assert.throws(()=>assertEphemerisSnapshotV3(data),/horizontal.*equatorial/);
    assert.equal(JSON.stringify(data),before);
  }
});
test("horizontal coordinates must describe the accepted equatorial direction",()=>{
  for(const mutate of [
    s=>{s.bodies[0].alt_deg+=10;},
    s=>{s.bodies[0].az_deg=(s.bodies[0].az_deg+180)%360;s.bodies[0].compass="NE";},
    s=>{s.time.lst_deg=(s.time.lst_deg+30)%360;},
    s=>{s.observer.polar_motion_corrected_lat_deg=45;},
  ]) {
    const data=structuredClone(snapshot);mutate(data);
    // Keep the unrelated compass predicate valid for this negative control.
    data.bodies[0].compass=labels[Math.floor(((data.bodies[0].az_deg+11.25)%360)/22.5)];
    assert.throws(()=>assertEphemerisSnapshotV3(data),/horizontal.*equatorial/);
  }
});
test("remote contradictory direction is rejected before publication",async t=>{
  const data=structuredClone(snapshot);data.bodies[0].alt_deg+=10;
  const raw=JSON.stringify(data);
  t.mock.method(globalThis,"fetch",async()=>({ok:true,text:async()=>raw}));
  const consent=new SkyConsent();consent.setRecipient("https://example.invalid");consent.grant();
  await assert.rejects(fetchServerSky((data.time.jd_utc-2440587.5)*86400,0,0,0,"https://example.invalid",{consent}),/horizontal.*equatorial/);
  assert.equal(JSON.stringify(data),raw);
});
