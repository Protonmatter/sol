import assert from "node:assert/strict";
import test from "node:test";
import {harness,release,origin} from "./helpers/releaseCacheHarness.mjs";

test("only known immutable namespaces enter cache handling",async()=>{
  const h=harness("A",await release("A"));await h.event("install");
  assert.equal(await h.request("data/latest-state.json"),undefined);
  assert.equal(await h.request("app.js?v=old"),undefined);
  assert.equal(await h.request("https://other.example/sol/releases/A/app.js"),undefined);
  assert.equal(await h.request("releases/A/app.js","cors","POST"),undefined);
  assert.equal((await h.request("releases/A/not-in-manifest.js")).status,409);
  assert.equal((await(await h.request("releases/A/web-release-manifest.json")).json()).release_id,"A");
});
test("refetch after cache eviction still verifies hashes and does not substitute new bytes",async()=>{
  const data=await release("A"),h=harness("A",data);await h.event("install");
  const key=origin+"/sol/releases/A/app.js";h.shared.get("sol-release-A").delete(key);
  h.setCorrupt("releases/A/app.js");
  assert.equal((await h.request("releases/A/app.js")).status,409);
  h.setCorrupt(null);assert.equal(await(await h.request("releases/A/app.js")).text(),"app A");
  h.shared.get("sol-release-A").delete(key);h.setOffline();assert.equal((await h.request("releases/A/app.js")).status,409);
});
test("install fails closed on incomplete identity and reused release IDs",async()=>{
  const data=await release("A"),h=harness("A",data);await h.event("install");await h.event("install");
  data.manifest.source_sha="b".repeat(40);await assert.rejects(h.event("install"),/reused/);
  const missing=await release("B");delete missing.files["releases/B/app.js"];await assert.rejects(harness("B",missing).event("install"),/fetch/);
  const never=harness("never",await release("never"));await assert.rejects(never.event("activate"),/incomplete/);
  assert.equal((await never.request("","navigate")).status,409);
});
test("explicit activation is bound to release and same-origin client; legacy cache retained for legacy tab",async()=>{
  const h=harness("A",await release("A"));await h.event("install");
  for(const extra of [{},{data:{type:"ACTIVATE_RELEASE",release_id:"B"},source:{url:origin+"/sol/"}},{data:{type:"ACTIVATE_RELEASE",release_id:"A"},source:{url:"https://other.example/sol/"}}])await h.event("message",extra);
  assert.deepEqual(h.actions,[]);
  h.shared.set("sol-legacy",new Map());h.shared.set("unrelated",new Map());h.setClients([{url:origin+"/sol/"}]);await h.event("activate");assert.ok(h.shared.has("sol-legacy"));
  h.setClients([]);await h.event("activate");assert.ok(!h.shared.has("sol-legacy"));assert.ok(h.shared.has("unrelated"));
});
