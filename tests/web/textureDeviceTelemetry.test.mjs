import assert from 'node:assert/strict';
import test from 'node:test';

const subject = () => import('../../tools/texture_device_telemetry.mjs');

test('backend classification observes renderer rather than trusting requested native mode', async () => {
  const {classifyTextureBackend} = await subject();
  assert.equal(classifyTextureBackend('ANGLE (Qualcomm, Adreno X1-85, D3D11)').kind, 'native-device');
  for (const name of ['ANGLE (Google, SwiftShader Device)', 'Microsoft Basic Render Driver', 'llvmpipe', 'ANGLE (WARP)'])
    assert.equal(classifyTextureBackend(name).kind, 'software');
  assert.equal(classifyTextureBackend('WebGL Renderer').kind, 'unverified');
  assert.equal(classifyTextureBackend(null).kind, 'unverified');
});

test('GPU counters retain PID and adapter attribution and never relabel committed bytes as VRAM', async () => {
  const {summarizeDeviceMemory} = await subject();
  const result = summarizeDeviceMemory({status:'available',processes:[{pid:10,type:'GPU',working_set_bytes:90,private_bytes:80}],
    gpu_counters_status:'available',gpu_counters:[
      {pid:10,adapter:'luid_a_phys_0',counter:'shared usage',bytes:40,status:0},
      {pid:10,adapter:'luid_a_phys_0',counter:'dedicated usage',bytes:0,status:0},
      {pid:10,adapter:'luid_a_phys_0',counter:'total committed',bytes:50,status:0},
      {pid:10,adapter:'luid_b_phys_0',counter:'shared usage',bytes:5,status:0},
    ]});
  assert.equal(result.owned_process_private_bytes,80);
  assert.equal(result.gpu_process_private_bytes,80);
  assert.equal(result.gpu_process_counters['shared usage'],45);
  assert.equal(result.gpu_process_counters['dedicated usage'],0);
  assert.equal(result.gpu_process_counters['total committed'],50);
  assert.match(result.basis,/not.*texture.*VRAM/i);
});

test('missing, invalid and failed memory counters stay unavailable rather than zero', async () => {
  const {summarizeDeviceMemory} = await subject();
  assert.equal(summarizeDeviceMemory({status:'unavailable'}).owned_process_private_bytes,null);
  const result = summarizeDeviceMemory({status:'available',processes:[{pid:10,type:'GPU',working_set_bytes:1,private_bytes:2}],
    gpu_counters_status:'available',gpu_counters:[
      {pid:10,counter:'shared usage',bytes:40,status:5},
      {pid:10,counter:'total committed',bytes:NaN,status:0},
    ]});
  assert.equal(result.gpu_process_counters['shared usage'],null);
  assert.equal(result.gpu_process_counters['total committed'],null);
});

test('process identity admission excludes unexpected PIDs and duplicate counters', async () => {
  const {summarizeDeviceMemory} = await subject();
  const base={status:'available',processes:[{pid:10,type:'GPU',working_set_bytes:1,private_bytes:2}],gpu_counters_status:'available'};
  assert.throws(()=>summarizeDeviceMemory({...base,gpu_counters:[{pid:11,adapter:'a',counter:'shared usage',bytes:1,status:0}]}),/PID/i);
  const counter={pid:10,adapter:'a',counter:'shared usage',bytes:1,status:0};
  assert.throws(()=>summarizeDeviceMemory({...base,gpu_counters:[counter,counter]}),/duplicate/i);
});
