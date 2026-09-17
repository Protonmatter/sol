#!/usr/bin/env node
// Offline comparison only. Failed overall receipts remain failed in the comparison.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {summarizeTextureSamples} from './texture_pipeline_validation.mjs';

export function compareTextureReceipts(native, software) {
  for(const receipt of [native,software]){
    assert.equal(receipt.schema_version,'texture-pipeline-validation.v1','Unsupported receipt schema');
    assert.ok(['passed','failed'].includes(receipt.status),'Comparison requires a terminal receipt');
  }
  const identities=['release_manifest_sha256','renderer_sha256','upload_sha256','visual_inventory_sha256',
    'demand_sha256','harness_sha256','telemetry_module_sha256','windows_collector_sha256','browser_version','iterations','memory_requested'];
  for(const name of identities) {
    assert.ok(native[name]!==undefined,`Missing comparison identity: ${name}`);
    assert.deepEqual(native[name],software[name],`Different comparison identity: ${name}`);
  }
  assert.equal(native.observed_backend?.kind,'native-device');assert.equal(software.observed_backend?.kind,'software');
  assert.ok(native.iterations>=3&&native.iterations<=5,'Repeated comparison requires three through five pairs');
  assert.deepEqual(native.assets.map(a=>[a.id,a.sha256,a.dimensions]),software.assets.map(a=>[a.id,a.sha256,a.dimensions]));
  const validate=receipt=>{
    const ids=new Set(receipt.assets.map(a=>a.id)),seen=new Set();
    assert.equal(ids.size,receipt.assets.length,'Duplicate source identity');
    assert.equal(receipt.samples.length,ids.size*receipt.iterations*2,'Incomplete source replay');
    for(const sample of receipt.samples){
      assert.ok(ids.has(sample.id)&&['cold-browser-cache','warm-browser-cache'].includes(sample.phase),'Unexpected source or cache phase');
      assert.ok(Number.isInteger(sample.iteration)&&sample.iteration>=0&&sample.iteration<receipt.iterations,'Invalid repetition identity');
      const key=`${sample.id}:${sample.phase}:${sample.iteration}`;
      assert.ok(!seen.has(key),'Duplicate sample');seen.add(key);
      assert.ok(!sample.error&&sample.completion?.status==='signaled','Failed source replay');
      const asset=receipt.assets.find(a=>a.id===sample.id);
      assert.equal(sample.observed_sha256,asset.sha256,'Sample source mismatch');
      assert.deepEqual(sample.uploaded_dimensions,asset.dimensions,'Comparison includes resized source grids');
    }
    assert.equal(receipt.filter_checks.length,9,'Incomplete filter controls');
    assert.ok(receipt.filter_checks.every(c=>c.passed),'Failed filter control');
    return summarizeTextureSamples(receipt.samples);
  };
  const nativeSummary=validate(native),softwareSummary=validate(software);
  const metrics=['decode_api_ms','upload_api_ms','mipmap_api_ms','completion_wait_wall_ms',
    'first_readback_completion_wall_ms','driver_make_texture_ms'];
  return {
    schema_version:'texture-backend-comparison.v1',scope:'Same-source per-cache-phase diagnostic comparison; no format candidate is evaluated',
    identities:Object.fromEntries(identities.map(name=>[name,native[name]])),
    overall_run_status:{native:native.status,software:software.status},
    native_startup_gate:native.application?.startup_gate??null,software_startup_gate:software.application?.startup_gate??null,
    limitations:['A source replay comparison does not promote a failed application startup gate.',
      'Five or fewer sequential observations describe spread, not stable tail latency or a fleet performance guarantee.',
      'Phase timings overlap driver work and scheduling; their sum is not GPU execution time.',
      'No compared derivative, image-error qualification or texture-attributable memory measurement exists.'],
    rows:nativeSummary.map(n=>{
      const s=softwareSummary.find(row=>row.id===n.id&&row.phase===n.phase);
      assert.ok(s,'Missing comparison sample group');
      return {id:n.id,phase:n.phase,native:n,software:s,software_to_native_median_ratio:Object.fromEntries(metrics.map(name=>[
        name,n[name]?.median>0&&s[name]?.median>=0?s[name].median/n[name].median:null]))};
    }),
    memory:{native:native.memory_checkpoints??[],software:software.memory_checkpoints??[]},
  };
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    const entries=process.argv.slice(2).map(value=>{
      const match=value.match(/^--(native|software|out)=(.+)$/);assert.ok(match,'Expected --native=FILE --software=FILE --out=NEW_FILE');return [match[1],match[2]];
    });
    assert.equal(entries.length,3);const options=Object.fromEntries(entries);assert.equal(Object.keys(options).length,3);
    const nativeBytes=fs.readFileSync(options.native),softwareBytes=fs.readFileSync(options.software);
    const result=compareTextureReceipts(JSON.parse(nativeBytes),JSON.parse(softwareBytes));
    result.comparator_sha256=createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
    result.receipts={native:{path:path.resolve(options.native),sha256:createHash('sha256').update(nativeBytes).digest('hex')},
      software:{path:path.resolve(options.software),sha256:createHash('sha256').update(softwareBytes).digest('hex')}};
    fs.writeFileSync(options.out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:'compared',source_phase_groups:result.rows.length,overall_run_status:result.overall_run_status}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
