import assert from "node:assert/strict";
import test from "node:test";
import { SkyConsent, makeSkyPreview, parseSkyLink } from "../../apps/web/js/skyPrivacy.js";
import { skyRows, parseSkyTime, formatSkyTimeInput } from "../../apps/web/js/skyPresentation.js";
import { fetchServerSky, checkServerHealth } from "../../apps/web/js/skyEngine.js";
test("consented snapshot and health requests reject redirects before following",async()=>{
 const previous=globalThis.fetch,seen=[];
 const consent=new SkyConsent();consent.setRecipient("https://approved.invalid");consent.grant();
 globalThis.fetch=async(url,options)=>{seen.push(options.redirect);throw new TypeError("Redirect rejected");};
 try {
   await assert.rejects(fetchServerSky(1700000000,0,0,0,"https://approved.invalid",{consent}),/Redirect rejected/);
   assert.equal(await checkServerHealth("https://approved.invalid",consent),false);
   assert.deepEqual(seen,["error","error"]);
 } finally {globalThis.fetch=previous;}
});
test("denied or revoked remote consent makes zero requests",async()=>{
 const before=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error("Unexpected request");};
 try {const consent=new SkyConsent();consent.setRecipient("https://one.example");
   await assert.rejects(fetchServerSky(1700000000,0,0,0,"https://one.example",{consent}),e=>e.code==="consent_required");
   consent.grant();consent.revoke();await assert.rejects(fetchServerSky(1700000000,0,0,0,"https://one.example",{consent}),e=>e.code==="consent_required");
   assert.equal(await checkServerHealth("https://one.example",consent),false);
   assert.equal(calls,0);
 } finally {globalThis.fetch=before;}
});
test("recipient-specific session consent starts denied and invalidates on change or revoke",()=>{
 const c=new SkyConsent();c.setRecipient("https://one.example/api/");assert.equal(c.allows("https://one.example/api"),false);
 c.grant();assert.equal(c.allows("https://one.example/api/"),true);assert.equal(c.allows("https://two.example/api"),false);
 c.setRecipient("https://two.example/api");assert.equal(c.allows("https://two.example/api"),false);c.grant();c.revoke();assert.equal(c.allows("https://two.example/api"),false);
 c.grant();c.setRecipient("");assert.equal(c.granted,false);assert.throws(()=>c.grant(),/No configured recipient/);
 assert.throws(()=>c.setRecipient("javascript:alert(1)"));
});
test("preview contains exact coordinates elevation and epoch before any side effect",()=>{
 const p=makeSkyPreview({lat:1.23456789,lon:-2.3456789,elev:123.5,unix:-1},"https://example.com/app#old");
 assert.match(p.text,/1.23456789/);assert.match(p.text,/123.5/);assert.match(p.text,/1969/);assert.match(p.url,/#sky=1.23456789,-2.3456789,-1,123.5$/);
});
test("share links round trip exact signed fractional values including small coordinates",()=>{
 for(const value of [{lat:1.23456789,lon:-2.3456789,elev:123.5,unix:-1},{lat:1e-8,lon:-1e-8,elev:0,unix:-62135596800}]) {
   const p=makeSkyPreview(value,"https://example.com/");assert.deepEqual(parseSkyLink(new URL(p.url).hash,0),value);
 }
 assert.equal(parseSkyLink("#sky=oops",0),null);
 assert.throws(()=>parseSkyLink("#sky=91,0,0,0",0));
});
test("Sky filter groups use geometric altitude, zero is at or below, Sun is separate",()=>{
 const bodies=[{name:"Sun",kind:"star",alt_deg:0,alt_refracted_deg:0.5,az_deg:0},{name:"A",kind:"star",alt_deg:-0.2,alt_refracted_deg:0.2,az_deg:1},{name:"Mars",kind:"planet",alt_deg:2,alt_refracted_deg:2,az_deg:2}];
 const rows=skyRows(bodies,"","above","A");assert.deepEqual(rows.map(r=>r.hidden),[true,true,false]);assert.equal(rows[1].selected,true);
 assert.deepEqual(skyRows(bodies,"","stars",null).map(r=>r.hidden),[true,false,true]);
 assert.deepEqual(skyRows(bodies,"mars","all",null).map(r=>r.hidden),[true,true,false]);
});
test("UTC input round trips years 1–9999 and rejects normalized invalid dates",()=>{
 for(const input of ["0001-01-01T00:00","2026-07-01T12:30","9999-12-31T23:59"])assert.equal(formatSkyTimeInput(parseSkyTime(input,"utc"),"utc"),input);
 for(const input of ["2026-02-30T01:00","0000-01-01T00:00","","2026-01-01T25:00"])assert.throws(()=>parseSkyTime(input,"utc"));
});
