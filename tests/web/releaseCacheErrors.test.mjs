import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReleaseCacheErrors} from '../../tools/release_cache_errors.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
const target='http://127.0.0.1:1234/sw.js?v=A';
const event={message:'Error: Critical asset hash mismatch\n    at verifyResponse (fixture)',target,active:2,corrupt:true};
const options={faultConfirmed:true,faultDelivered:true,workerURLs:[target]};
test('a confirmed and delivered critical fault has one explicit expected exception',()=>{
  const result=classifyReleaseCacheErrors([event],options);assert.deepEqual(result,{expected:[event],unexpected:[]});
});
for(const [name,change,configuration]of [
  ['unconfirmed',{}, {faultConfirmed:false}],['not delivered',{}, {faultDelivered:false}],
  ['wrong phase',{active:1},{}],['outside corruption',{corrupt:false},{}],['unknown worker',{target:target+'&other=1'},{}],
  ['other failure',{message:'Error: a different failure\n at verifyResponse '},{}],
  ['other code',{message:'Error: Critical asset hash mismatch\n at unknown '},{}],
  ['missing details',{message:null},{}],
])test(`worker error remains unexpected when ${name}`,()=>{
  const altered={...event,...change},result=classifyReleaseCacheErrors([altered],{...options,...configuration});assert.deepEqual(result.expected,[]);assert.deepEqual(result.unexpected,[altered]);
});
test('a duplicate integrity exception remains unexpected',()=>{
  const result=classifyReleaseCacheErrors([event,event],options);assert.equal(result.expected.length,1);assert.equal(result.unexpected.length,1);
});
for(const [name,mutate]of [
  ['unsettled observer',e=>e.workerObservationSettled=false],['observer setup failure',e=>e.workerObservationErrors.push('setup failed')],
])test(`actual cache verdict rejects ${name} even when the one critical fault is expected`,()=>{
  const source=fs.readFileSync(new URL('../../tools/release_cache_validation.mjs',import.meta.url),'utf8');
  const verdict=source.match(/  evidence\.result=completed[^;]+;/)?.[0];assert.ok(verdict);
  const evidence={workerObservationSettled:true,workerObservationErrors:[],pageErrors:[],unexpectedWorkerErrors:[],cleanupErrors:[]};mutate(evidence);
  vm.runInNewContext(verdict,{completed:true,evidence});assert.equal(evidence.result,'failed');
});
