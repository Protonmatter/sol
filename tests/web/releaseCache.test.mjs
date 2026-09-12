import assert from "node:assert/strict";
import test from "node:test";
import { harness, release, origin } from "./helpers/releaseCacheHarness.mjs";

test("critical hashes install as a complete release and optional loss is harmless",async()=>{
  const data=await release("A"), h=harness("A",data);
  h.setCorrupt("releases/A/texture.jpg");await h.event("install");await h.event("activate");h.setOffline();
  assert.equal(await (await h.request("releases/A/app.js?v=A")).text(),"app A");
  assert.deepEqual(h.actions,[],"never claim or activate over an executing client automatically");
  assert.ok(!h.calls.some(url=>url.endsWith("texture.jpg")),"optional image not required for installation");
});
test("failed B critical hash never displaces complete A",async()=>{
  const a=harness("A",await release("A"));await a.event("install");
  const b=harness("B",await release("B"),a.shared);b.setCorrupt("releases/B/pkg/solar_wasm.wasm");
  await assert.rejects(b.event("install"),/hash|size/);a.setOffline();
  assert.equal(await(await a.request("releases/A/pkg/solar_wasm.wasm?v=unchanged")).text(),"solar A");
  assert.ok(!a.shared.has("sol-release-B"));
});
test("engine-only A/B upgrade stays namespace-bound online and offline",async()=>{
  const a=harness("A",await release("A"));await a.event("install");
  const b=harness("B",await release("B"),a.shared);await b.event("install");await b.event("activate");b.setOffline();
  assert.equal(await(await b.request("releases/A/pkg/solar_wasm.wasm?v=same")).text(),"solar A");
  assert.equal(await(await b.request("releases/B/pkg/solar_wasm.wasm?v=same")).text(),"solar B");
  assert.equal((await b.request("releases/missing/app.js")).status,409);
  await b.event("message",{data:{type:"ACTIVATE_RELEASE",release_id:"B"},source:{url:origin+"/sol/releases/A/index.html"}});
  assert.deepEqual(b.actions,["skipWaiting"]);
});
test("unknown schema and traversal fail before any asset fetching",async()=>{
  for(const mutate of [m=>m.schemas=["future.v999"],m=>m.assets[0].path="../wrong",m=>m.assets.push({...m.assets[0]}),m=>m.abi_versions.solar=999]){
    const data=await release("A");mutate(data.manifest);const h=harness("A",data);await assert.rejects(h.event("install"));assert.equal(h.calls.length,1);
  }
});
test("root install and protected client retain current, previous, and active namespaces",async()=>{
  const shared=new Map();for(const id of ["A","B","C"]){const h=harness(id,await release(id,"/"),shared,"/");await h.event("install");}
  const c=harness("C",await release("C","/"),shared,"/");c.setClients([{url:origin+"/releases/A/index.html"}]);await c.event("activate");
  assert.ok(shared.has("sol-release-A"));assert.ok(shared.has("sol-release-B"));assert.ok(shared.has("sol-release-C"));
  c.setClients([]);await c.event("activate");assert.ok(!shared.has("sol-release-A"));
  c.setOffline();const response=await c.request("","navigate");assert.equal(response.status,302);assert.equal(response.headers.get("Location"),origin+"/releases/C/index.html");
});
