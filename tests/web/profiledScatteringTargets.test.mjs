import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfiledScatteringTargets} from '../../apps/web/js/profiledScatteringTargets.js';

function harness(){
  const calls=[],groups=new Map();
  const targets=createProfiledScatteringTargets((body,capacity)=>{
    calls.push(['create',body,capacity]);
    const group=Object.fromEntries(['beginFrame','generate','bind','cancel','retry','dispose','status'].map(name=>[name,(...args)=>{
      calls.push([name,body,...args]);return name==='status'?{state:'submitted',body}:true;
    }]));groups.set(body,group);return group;
  });
  return {targets,calls,groups};
}

test('each supported profile owns one target, with no third owner or replacement',()=>{
  const h=harness();h.targets.register('Earth');h.targets.register('Mars');h.targets.register('Earth');
  assert.deepEqual(h.calls,[['create','Earth',1],['create','Mars',1]]);
  assert.throws(()=>h.targets.register('Venus'),/profile|body/i);
  assert.throws(()=>h.targets.register('__proto__'),/profile|body/i);
});

test('generation and binding dispatch only to their exact registered profile',()=>{
  const h=harness();h.targets.register('Earth');h.targets.register('Mars');
  h.targets.beginFrame({contextGeneration:3,sceneSerial:1,epoch:5});h.calls.length=0;
  const mars={epoch:5,profile:{body:'Mars'}},earth={epoch:5,profile:{body:'Earth'}},consumer={program:8};
  assert.equal(h.targets.generate('Mars',mars,'restore'),true);
  assert.equal(h.targets.bind('Earth',earth,consumer),true);
  assert.deepEqual(h.calls,[['generate','Mars','Mars',mars,'restore'],['bind','Earth','Earth',earth,consumer]]);
  assert.equal(h.targets.generate('Venus',mars),false);assert.equal(h.targets.bind('Venus',earth,consumer),false);
  h.calls.length=0;
  assert.equal(h.targets.generate('Earth',mars),false,'a body key cannot send another profile to its specialized generator');
  assert.equal(h.targets.bind('Mars',earth,consumer),false);
  assert.deepEqual(h.calls,[]);
});

test('a stale or substituted frame cannot seed a newly registered profile or retain a prior submission',()=>{
  for(const next of [{contextGeneration:3,sceneSerial:8,epoch:5},{contextGeneration:3,sceneSerial:9,epoch:6},
    {contextGeneration:4,sceneSerial:10,epoch:5}]){
    const h=harness();h.targets.register('Earth');
    assert.equal(h.targets.beginFrame({contextGeneration:3,sceneSerial:9,epoch:5}),true);h.calls.length=0;
    assert.equal(h.targets.beginFrame(next),false);h.targets.register('Mars');
    assert.equal(h.calls.some(call=>call[0]==='beginFrame'&&call[1]==='Mars'),false);
    assert.equal(h.targets.generate('Earth',{profile:{body:'Earth'}}),false);
    assert.equal(h.targets.bind('Mars',{profile:{body:'Mars'}},{}),false);
    assert.equal(h.targets.beginFrame({contextGeneration:3,sceneSerial:10,epoch:7}),true);
  }
});

test('frame identity reaches both owners and late registration receives the current frame',()=>{
  const h=harness(),frame={contextGeneration:3,sceneSerial:9,epoch:5};
  h.targets.register('Earth');h.calls.length=0;assert.equal(h.targets.beginFrame(frame),true);
  h.targets.register('Mars');
  assert.deepEqual(h.calls,[['beginFrame','Earth',frame],['create','Mars',1],['beginFrame','Mars',frame]]);
  assert.throws(()=>h.targets.beginFrame({...frame,epoch:NaN}),/frame/i);
});

test('same-serial epoch identity preserves the underlying owner signed-zero distinction',()=>{
  const h=harness();h.targets.register('Earth');
  assert.equal(h.targets.beginFrame({contextGeneration:3,sceneSerial:1,epoch:-0}),true);
  assert.equal(h.targets.beginFrame({contextGeneration:3,sceneSerial:1,epoch:0}),false);
  assert.equal(h.targets.bind('Earth',{profile:{body:'Earth'}},{}),false);
  assert.equal(h.targets.beginFrame({contextGeneration:3,sceneSerial:2,epoch:0}),true);
});

test('retry/cancel are profile-specific and global cancellation/disposal includes both groups',()=>{
  const h=harness();h.targets.register('Earth');h.targets.register('Mars');h.calls.length=0;
  h.targets.cancel('Earth');h.targets.retry('Mars');h.targets.cancel();h.targets.dispose();h.targets.dispose();
  assert.deepEqual(h.calls,[['cancel','Earth','Earth'],['retry','Mars','Mars'],['cancel','Earth'],['cancel','Mars'],['dispose','Earth'],['dispose','Mars']]);
  assert.equal(h.targets.generate('Earth',{}),false);assert.equal(h.targets.bind('Mars',{},{}),false);
  assert.equal(h.targets.status('Earth').state,'disposed');assert.throws(()=>h.targets.register('Earth'),/disposed/i);
});
