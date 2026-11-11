import test from 'node:test';
import assert from 'node:assert/strict';
import { constellationFrame, altAz } from '../../apps/web/js/skyFrame.js';
import { mergeLocalEvents } from '../../apps/web/js/ephemerisContract.js';
import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/ephemeris-v4-corpus.json',import.meta.url))).snapshot;
function snapshot() {
  const s=structuredClone(fixture);
  s.star_frame={version:1,jd_utc:s.time.jd_utc,observer:{...s.observer},lst_deg:s.time.lst_deg,
    source:'solar-ephemeris',j2000_to_true_equatorial:[[0,-1,0],[1,0,0],[0,0,1]]};
  return s;
}
test('engine rotation maps RA seam and polar vectors into the corrected local horizon',()=>{
  const s=snapshot();
  s.star_frame.observer.polar_motion_corrected_lat_deg=71;
  const f=constellationFrame(s);
  for(const [ra,dec] of [[359.999,0],[0.001,0],[37.9546,89.2641],[180,-89.9999]]) {
    const actual=f.project(ra,dec), expected=altAz(ra+90,dec,s.time.lst_deg,71);
    assert.ok(Math.abs(actual.alt-expected.alt)<1e-9);
    assert.ok(Math.abs(actual.az-expected.az)<1e-7);
  }
});
test('catalogue matches use actual proper-motion-reduced geometric positions, including near pole',()=>{
  const s=snapshot();
  s.bodies.push({kind:'star',catalogue_ra_deg:37.954,catalogue_dec_deg:89.264,alt_deg:25,alt_refracted_deg:26,az_deg:4});
  assert.deepEqual(constellationFrame(s).project(37.9546,89.2641),{alt:25,az:4});
});
test('missing, malformed and mismatched frames degrade explicitly',()=>{
  const absent=constellationFrame(fixture);assert.equal(absent.available,false);assert.match(absent.status,/unavailable/i);assert.equal(absent.project(0,0),null);
  for(const change of [s=>s.star_frame.jd_utc++,s=>s.star_frame.observer.terrestrial_lat_deg++,s=>s.star_frame.lst_deg=NaN,s=>s.star_frame.observer.polar_motion_corrected_lat_deg=91,s=>s.star_frame.j2000_to_true_equatorial[0][0]=2]) {
    const s=snapshot();change(s);assert.equal(constellationFrame(s).available,false);
  }
});
test('local augmentation carries its independently bound frame while legacy providers remain valid',()=>{
  const local=snapshot(),remote=structuredClone(fixture);
  const merged=mergeLocalEvents(remote,local);
  assert.deepEqual(merged.star_frame,local.star_frame);
  assert.equal(constellationFrame(merged).available,true);
  assert.equal(constellationFrame(mergeLocalEvents(remote,remote)).available,false);
});
test('geometric projection stays finite at poles, zenith and horizon, with east-positive compass map azimuth',()=>{
  for(const lat of [-90,0,90]) for(const dec of [-90,0,90]) for(const ra of [0,90,359.999]) {
    const p=altAz(ra,dec,0,lat);assert.ok(Number.isFinite(p.alt)&&Number.isFinite(p.az));
  }
  assert.equal(altAz(90,0,0,0).az,90);
  assert.ok(Math.abs(altAz(90,0,0,0).alt)<1e-12);
  assert.ok(altAz(0,-0.1,90,0).alt<1e-10);
});

test('ambiguous rounded catalogue matches use rotation and RA seam matches retain proper motion',()=>{
  const s=snapshot(), base={kind:'star',catalogue_ra_deg:359.9998,catalogue_dec_deg:20,alt_deg:12,az_deg:24};
  s.bodies.push(base);
  assert.deepEqual(constellationFrame(s).project(0.0001,20),{alt:12,az:24});
  const ambiguous=structuredClone(s);ambiguous.bodies.push({...base,alt_deg:13});
  const p=constellationFrame(ambiguous).project(0.0001,20);
  const expected=altAz(90.0001,20,s.time.lst_deg,s.observer.polar_motion_corrected_lat_deg);
  assert.ok(Math.abs(p.alt-expected.alt)<1e-9);assert.ok(Math.abs(p.az-expected.az)<1e-9);
});
