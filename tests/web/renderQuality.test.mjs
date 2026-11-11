import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderQuality,effectiveRenderDpr} from '../../apps/web/js/renderQuality.js';

function fixture(){
  const policy=createRenderQuality();let timestamp=0;
  function feed(count,overrides={}){for(let i=0;i<count;i++){
    timestamp+=overrides.step??16;
    policy.observe({timestamp,intervalMs:16,frameMs:5,inputToSubmitMs:null,continuous:true,rendered:true,completed:true,...overrides});
  }}
  return {policy,feed,jump:ms=>{timestamp+=ms;}};
}

test('Auto begins at the original high resolution and snapshots remain stable until a change',()=>{
  const f=fixture(),initial=f.policy.current;assert.equal(initial.mode,'auto');assert.equal(initial.tier,'high');assert.equal(initial.scale,1);
  f.feed(20);assert.equal(f.policy.current,initial);assert.equal(effectiveRenderDpr(3,initial),2);
});

test('sustained CPU overload lowers one tier at a time with a cooldown and a bounded floor',()=>{
  const f=fixture();f.feed(9,{frameMs:30});assert.equal(f.policy.current.tier,'high');
  f.feed(1,{frameMs:30});assert.equal(f.policy.current.tier,'balanced');
  f.feed(50,{frameMs:30});assert.equal(f.policy.current.tier,'balanced','cooldown prevents a second immediate step');
  f.feed(60,{frameMs:30});assert.equal(f.policy.current.tier,'low');
  f.feed(300,{frameMs:30});assert.equal(f.policy.current.tier,'low');
});

test('continuous delivery overload can lower resolution even when CPU submission is short',()=>{
  const f=fixture();f.feed(10,{intervalMs:34,step:34});assert.equal(f.policy.current.tier,'balanced');
});

test('recovery requires sustained underload and a longer cooldown',()=>{
  const f=fixture();f.feed(10,{frameMs:30});f.feed(180);assert.equal(f.policy.current.tier,'balanced');
  f.feed(200);assert.equal(f.policy.current.tier,'high');f.feed(300);assert.equal(f.policy.current.tier,'high');
});

test('alternating and neutral samples cannot cause tier flapping or accumulate overload',()=>{
  const f=fixture();for(let i=0;i<50;i++){f.feed(7,{frameMs:30});f.feed(1,{frameMs:18,intervalMs:23});}
  assert.equal(f.policy.current.tier,'high');
});

test('manual modes ignore timings and returning to Auto starts a fresh high assessment',()=>{
  const f=fixture();for(const [tier,scale]of [['low',.6],['balanced',.8],['high',1]]){
    f.policy.setMode(tier);const snapshot=f.policy.current;f.feed(1000,{frameMs:50});assert.equal(f.policy.current,snapshot);
    assert.equal(snapshot.scale,scale);assert.equal(effectiveRenderDpr(2,snapshot),2*scale);
  }
  f.policy.setMode('auto');assert.equal(f.policy.current.tier,'high');f.feed(9,{frameMs:30});assert.equal(f.policy.current.tier,'high');
});

test('idle gaps and skipped or failed frames reset evidence instead of degrading the view',()=>{
  const f=fixture();f.feed(8,{frameMs:30});f.jump(10000);f.feed(2,{frameMs:30});assert.equal(f.policy.current.tier,'high');
  for(const invalid of [{rendered:false},{completed:false},{frameMs:NaN},{timestamp:NaN},{frameMs:-1}]){
    const g=fixture();g.feed(8,{frameMs:30});g.feed(1,invalid);g.feed(2,{frameMs:30});assert.equal(g.policy.current.tier,'high');
  }
});

test('isolated input latency and paused frames do not masquerade as a slow continuous display',()=>{
  const f=fixture();f.feed(100,{continuous:false,intervalMs:null,inputToSubmitMs:100});assert.equal(f.policy.current.tier,'high');
  f.policy.setMode('auto');f.feed(10,{frameMs:30});assert.equal(f.policy.current.tier,'balanced');
  f.feed(1000,{continuous:false,intervalMs:null});assert.equal(f.policy.current.tier,'balanced','idle observations cannot certify recovery');
});

test('invalid delivery intervals are excluded and invalid device ratios use a finite default',()=>{
  const f=fixture();for(const intervalMs of [NaN,-10,10000])f.feed(30,{intervalMs});assert.equal(f.policy.current.tier,'high');
  assert.equal(effectiveRenderDpr(NaN,f.policy.current),1);assert.equal(effectiveRenderDpr(0,f.policy.current),1);
});

test('very slow continuous CPU frames can still lower resolution when delivery intervals are excluded',()=>{
  const f=fixture();f.feed(10,{step:300,intervalMs:null,continuation:true,frameMs:290});
  assert.equal(f.policy.current.tier,'balanced','sustained measured CPU work is distinct from an idle delivery gap');
});
