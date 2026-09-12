import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createSkyWorkerClient } from "../../apps/web/js/skyWorkerClient.js";
const input={operation:"track",bodyIndex:0,lat:0,lon:0,elev:0,unix:1700000000,dtSeconds:1,samples:2};
function setup(){let worker;const client=createSkyWorkerClient({createWorker:()=>worker={postMessage(value){this.sent=value;},terminate(){this.terminated=true;}}});return{client,reply(value,identity={}){worker.onmessage({data:{...worker.sent,type:"result",value,...identity}});},worker:()=>worker};}
test("worker trajectory requires exact count and finite consistent samples",async()=>{
 const sparse=setup();const pending=sparse.client.request(input);sparse.reply({operation:"track",samples:new Array(2)});await assert.rejects(pending);sparse.client.dispose();
 for(const samples of [[{alt:1,az:1,up:true}],[{alt:NaN,az:1,up:false},{alt:1,az:1,up:true}],[{alt:-1,az:1,up:true},{alt:1,az:1,up:true}]]){
  const {client,reply}=setup();const result=client.request(input);reply({operation:"track",samples});await assert.rejects(result);client.dispose();
 }
 const {client,reply}=setup();const result=client.request(input);const samples=[{alt:-1,az:1,up:false},{alt:1,az:1,up:true}];reply({operation:"track",samples});assert.deepEqual(await result,samples);client.dispose();
});
test("invalid inputs do not allocate and protocol mismatch cannot publish",async()=>{
 const {client,reply,worker}=setup();await assert.rejects(client.request({...input,samples:258}));assert.equal(worker(),undefined);
 const result=client.request(input);reply({operation:"track",samples:[]},{abi:2});await assert.rejects(result,e=>e.code==="protocol");client.dispose();
});
test("worker snapshot publication is bound to the captured original request",async()=>{
 const snapshot=JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json",import.meta.url),"utf8")).snapshot;
 const request={operation:"snapshot",lat:0,lon:0,elev:0,unix:(snapshot.time.jd_utc-2440587.5)*86400};
 for(const changed of [{...request,unix:request.unix+10800},{...request,lat:1}]) {
  const {client,reply}=setup();const result=client.request(changed);reply({operation:"snapshot",snapshot});await assert.rejects(result,/epoch|observer/);client.dispose();
 }
 const {client,reply}=setup();const result=client.request(request);request.unix+=10800;
 reply({operation:"snapshot",snapshot});assert.equal((await result).time.jd_utc,snapshot.time.jd_utc);client.dispose();
});
