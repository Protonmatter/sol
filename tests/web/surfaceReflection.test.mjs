import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {evaluateReflection} from '../../apps/web/js/surfaceReflection.js';

test('GGX runtime matches independent float64 directional reference',()=>{
  const run=spawnSync('python',['tools/reflection_reference.py','--fixtures'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const cases=JSON.parse(run.stdout);
  assert.equal(cases.length,400);
  for(const row of cases){
    const actual=evaluateReflection({normal:[0,0,1],...row.input});
    assert.ok(Math.abs(actual.brdf-row.brdf)<=1e-12+1e-10*Math.abs(row.brdf));
    assert.equal(actual.incidentCosine,Math.max(0,row.input.incident[2]));
  }
});

test('reflection never normalizes invalid vectors or accepts unqualified slope widths',()=>{
  const input={normal:[0,0,1],incident:[0,0,1],view:[0,0,1],alpha:.2,nIncident:1,nMaterial:1.5};
  for(const change of [{alpha:.01},{normal:[0,0,2]},{incident:[NaN,0,1]},{nMaterial:0}])
    assert.throws(()=>evaluateReflection({...input,...change}),/finite|unit|index|alpha/i);
  assert.equal(evaluateReflection({...input,nMaterial:1}).brdf,0);
  assert.equal(evaluateReflection({...input,view:[0,0,-1]}).brdf,0);
});
