import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {MOON_ALBEDO,moonAlbedoGain} from '../../apps/web/js/moonAppearance.js';

test('moon calibration reference exposes physical disk sums separately from display gains',()=>{
  const output=spawnSync('python',['tools/moon_photometry_reference.py','--fixtures'],{encoding:'utf8'});
  assert.equal(output.status,0,output.stderr);
  const fixtures=JSON.parse(output.stdout);assert.equal(fixtures.length,21);
  for(const row of fixtures){
    assert.ok(Math.abs(row.integrated.disk_ratio-row.analytic)<=1e-4);
    assert.equal(row.integrated.unresolved_projected_fraction,0);
  }
  const zero=fixtures.find(x=>x.rho===1&&x.phase_degrees===0);
  assert.ok(Math.abs(zero.integrated.disk_ratio-2/3)<=1e-4);
  assert.ok(Math.abs(zero.integrated.disk_ratio-1)>.3,'map-mean negative control must fail');
  assert.equal(MOON_ALBEDO.Enceladus,1.04,'catalogue context remains distinct from Lambert rho');
  assert.equal(moonAlbedoGain('Enceladus'),1,'legacy relative display recipe remains intact');
});
