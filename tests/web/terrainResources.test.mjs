import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainPreparationQueue,terrainResourceEstimate,uploadTerrainMesh} from '../../apps/web/js/terrainResources.js';

test('finer terrain accounts for encoded overlap, decoded data, mesh and two GPU entries',()=>{
  const estimate=terrainResourceEstimate({width:2880,height:1440,bytes:8294400},4);
  assert.ok(estimate.cpuBytes<48*1024*1024);
  assert.ok(estimate.gpuBytes*2<64*1024*1024);
  assert.throws(()=>terrainResourceEstimate({width:5760,height:2880,bytes:33177600},4),/budget|dimension/);
});

test('only one terrain source and worker can occupy the CPU budget; cancelled queued work never starts',async()=>{
  const queue=createTerrainPreparationQueue();
  let release;let started=0;
  const first=queue.run(new AbortController().signal,()=>new Promise(resolve=>{started++;release=resolve;}));
  const abort=new AbortController();
  const second=queue.run(abort.signal,async()=>{started++;return 2;});
  const rejected=assert.rejects(second,/aborted/);abort.abort();await rejected;
  assert.equal(started,1);release(1);assert.equal(await first,1);
  assert.equal(await queue.run(new AbortController().signal,async()=>3),3);
});

test('failed companion GPU allocation releases every terrain object already created',()=>{
  const deleted=[];let count=0;
  const context={createBuffer(){return ++count===1?'positions':null;},createTexture(){return 'height';},
    deleteBuffer(value){deleted.push(value);},deleteTexture(value){deleted.push(value);}};
  assert.throws(()=>uploadTerrainMesh(context,{}),/allocation/);
  assert.deepEqual(deleted.sort(),['height','positions']);
});
