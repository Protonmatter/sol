import assert from 'node:assert/strict';
import test from 'node:test';
import {compareTextureReceipts} from '../../tools/compare_texture_qualification.mjs';

function receipts(){
  const baseline={schema_version:'texture-pipeline-validation.v1',status:'passed',iterations:3,memory_requested:true,
    browser_version:'Chrome fixture',assets:[{id:'a',sha256:'a'.repeat(64),dimensions:[2,1]}],
    filter_checks:Array.from({length:9},()=>({passed:true})),memory_checkpoints:[],application:{startup_gate:{status:'passed'}}};
  for(const name of ['release_manifest_sha256','renderer_sha256','upload_sha256','visual_inventory_sha256',
    'demand_sha256','harness_sha256','telemetry_module_sha256','windows_collector_sha256'])baseline[name]='b'.repeat(64);
  baseline.samples=Array.from({length:3},(_,iteration)=>['cold-browser-cache','warm-browser-cache'].map(phase=>({
    id:'a',phase,iteration,observed_sha256:'a'.repeat(64),uploaded_dimensions:[2,1],error:null,
    decode_api_ms:2,upload_api_ms:4,mipmap_api_ms:0,completion:{status:'signaled',wait_wall_ms:5},
  }))).flat();
  return [{...structuredClone(baseline),observed_backend:{kind:'native-device'}},{...structuredClone(baseline),observed_backend:{kind:'software'}}];
}

test('same-source backend comparison retains original failed startup and separates phase summaries',()=>{
  const [native,software]=receipts();native.status='failed';native.application.startup_gate.status='failed';
  const result=compareTextureReceipts(native,software);
  assert.equal(result.overall_run_status.native,'failed');assert.equal(result.native_startup_gate.status,'failed');
  assert.equal(result.rows.length,2);assert.equal(result.rows[0].native.successful_samples,3);
  assert.equal(result.rows[0].software_to_native_median_ratio.mipmap_api_ms,null);
});

test('comparison rejects drift, partial replay, duplicate samples and changed source grid',()=>{
  for(const mutate of [
    value=>{value.harness_sha256='c'.repeat(64);},
    value=>{value.samples.pop();},
    value=>{value.samples[1]=structuredClone(value.samples[0]);},
    value=>{value.samples[0].uploaded_dimensions=[1,1];},
    value=>{value.filter_checks[0].passed=false;},
    value=>{value.samples[0].completion.status='timeout';},
    value=>{value.status='running';},
    value=>{value.memory_requested=false;},
  ]){const [native,software]=receipts();mutate(software);assert.throws(()=>compareTextureReceipts(native,software));}
});
