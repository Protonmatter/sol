// Synthetic protocol observations; actual examples are retained in diagnostic02.
import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCompleteReadCancellations} from '../../tools/completed_fetch_reports.mjs';
function fixture(){
  const url='http://127.0.0.1:1234/release/data/snapshot.json';
  return {failures:[{url,errorText:'net::ERR_ABORTED',status:200}],fetches:[{url,status:200,eof:true,bytesRead:100,signalAborted:false,cancelled:false}],
    network:[{url,status:200,error:'net::ERR_ABORTED',cancelled:true,receivedBytes:100}],expectedAssets:{[url]:{size:100,sha256:'a'.repeat(64)}},
    identity:{bundle_id:'fixture',source_bundle_id:'source',manifest_sha256:'b'.repeat(64)},expectedIdentity:{bundle_id:'fixture',source_bundle_id:'source',manifest_sha256:'b'.repeat(64)}};
}
test('a complete unique validated read explains only its original cancellation report',()=>{
  const input=fixture(),result=classifyCompleteReadCancellations(input);assert.deepEqual(result.expected,input.failures);assert.deepEqual(result.unexpected,[]);assert.equal(input.failures.length,1,'raw report retained');
});
for(const [name,mutate]of [
  ['partial reader',x=>x.fetches[0].bytesRead--],['partial network',x=>x.network[0].receivedBytes--],
  ['missing EOF',x=>x.fetches[0].eof=false],['signal abort',x=>x.fetches[0].signalAborted=true],['reader cancellation',x=>x.fetches[0].cancelled=true],
  ['read failure',x=>x.fetches[0].error='failed'],['non-200',x=>x.failures[0].status=500],['wrong report',x=>x.failures[0].errorText='net::ERR_FAILED'],
  ['different network failure',x=>x.network[0].error='net::ERR_FAILED'],['unconfirmed cancellation',x=>x.network[0].cancelled=false],
  ['duplicate fetch',x=>x.fetches.push({...x.fetches[0]})],['retry request',x=>x.network.push({...x.network[0]})],['duplicate report',x=>x.failures.push({...x.failures[0]})],
  ['unknown resource',x=>x.expectedAssets={}],['bad asset pin',x=>Object.values(x.expectedAssets)[0].sha256='invalid'],
  ['unvalidated bundle',x=>x.identity=null],['wrong bundle',x=>x.identity.bundle_id='other'],['wrong source',x=>x.identity.source_bundle_id='other'],['wrong manifest',x=>x.identity.manifest_sha256='c'.repeat(64)],
  ['missing network correlation',x=>x.network=[]],['missing fetch observation',x=>x.fetches=[]],
])test(`cancellation remains unexpected for ${name}`,()=>{
  const input=fixture();mutate(input);const result=classifyCompleteReadCancellations(input);assert.equal(result.expected.length,0);assert.equal(result.unexpected.length,input.failures.length);
});
