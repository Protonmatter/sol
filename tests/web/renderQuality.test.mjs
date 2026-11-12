import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderQuality,effectiveRenderDpr} from '../../apps/web/js/renderQuality.js';

const STARTUP_GRACE_MS=3000;
const healthy=timestamp=>({timestamp,intervalMs:16,frameMs:5,inputToSubmitMs:null,continuous:true,rendered:true,completed:true});
// A controller whose start-up window has already passed: one frame opens the window,
// then an idle gap longer than the window leaves the usual two-frame warm-up in force.
function settled(){
  const policy=createRenderQuality();policy.observe(healthy(16));
  return {policy,timestamp:16+STARTUP_GRACE_MS+2000};
}
function fixture(){
  const start=settled(),policy=start.policy;let timestamp=start.timestamp;
  function feed(count,overrides={}){for(let i=0;i<count;i++){
    timestamp+=overrides.step??16;
    policy.observe({...healthy(timestamp),...overrides});
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

test('an upgrade the device cannot sustain backs off instead of oscillating',()=>{
  // Too slow at High (34 ms delivery), comfortable below it (16 ms).
  const start=settled(),policy=start.policy;let timestamp=start.timestamp;const changes=[];
  for(let i=0;i<120000/16;i++){
    const interval=policy.current.tier==='high'?34:16;timestamp+=interval;
    if(policy.observe({timestamp,intervalMs:interval,frameMs:5,inputToSubmitMs:null,continuous:true,continuation:true,rendered:true,completed:true}))changes.push(timestamp);
  }
  assert.ok(changes.length<=10,`${changes.length} tier changes in two minutes`);
  // Each failed upgrade at least doubles the wait before the next attempt.
  const upgrades=changes.filter((_,i)=>i%2===1),downgrades=changes.filter((_,i)=>i%2===0);
  for(let i=1;i<upgrades.length;i++){
    assert.ok(upgrades[i]-downgrades[i]>=2*(upgrades[i-1]-downgrades[i-1])-50,'upgrade hold grows after each reversal');
  }
});

test('a paused scene lowered during slow interaction recovers on fast input-driven frames',()=>{
  const start=settled(),policy=start.policy;let timestamp=start.timestamp;
  const frame=(frameMs,inputToSubmitMs,step)=>{timestamp+=step;
    policy.observe({timestamp,intervalMs:null,frameMs,inputToSubmitMs,continuous:false,continuation:false,rendered:true,completed:true});};
  for(let i=0;i<12;i++)frame(30,30,30);
  assert.equal(policy.current.tier,'balanced');
  for(let i=0;i<600;i++)frame(4,8,16);
  assert.equal(policy.current.tier,'high');
});

test('returning to Auto clears the upgrade backoff',()=>{
  const start=settled(),policy=start.policy;let timestamp=start.timestamp;
  for(let i=0;i<60000/16;i++){const interval=policy.current.tier==='high'?34:16;timestamp+=interval;
    policy.observe({timestamp,intervalMs:interval,frameMs:5,inputToSubmitMs:null,continuous:true,continuation:true,rendered:true,completed:true});}
  policy.setMode('auto');assert.equal(policy.current.tier,'high');
  for(let i=0;i<12;i++){timestamp+=34;policy.observe({timestamp,intervalMs:34,frameMs:5,inputToSubmitMs:null,continuous:true,continuation:true,rendered:true,completed:true});}
  assert.equal(policy.current.tier,'balanced');
  const droppedAt=timestamp;
  while(policy.current.tier!=='high'&&timestamp-droppedAt<20000){timestamp+=16;
    policy.observe({timestamp,intervalMs:16,frameMs:5,inputToSubmitMs:null,continuous:true,continuation:true,rendered:true,completed:true});}
  assert.ok(timestamp-droppedAt<=6100,`fresh Auto restored the 6 s hold, took ${timestamp-droppedAt} ms`);
});

test('slow frames inside the start-up window cannot lower resolution',()=>{
  const policy=createRenderQuality();let timestamp=0;
  const slow=()=>{timestamp+=30;return policy.observe({...healthy(timestamp),intervalMs:30,frameMs:30});};
  // 2.4 s of load-time hitches: far more than the eight slow frames that lower a settled view.
  for(let i=0;i<80;i++)assert.equal(slow(),false);
  assert.equal(policy.current.tier,'high');
  // The window bounds the exemption. A device that stays slow is still lowered just after it.
  while(timestamp<STARTUP_GRACE_MS+30*9)slow();
  assert.equal(policy.current.tier,'balanced');
  assert.ok(timestamp>=STARTUP_GRACE_MS&&timestamp<=STARTUP_GRACE_MS+30*9,`lowered at ${timestamp} ms`);
});

test('the start-up window opens with the first rendered Auto frame, not at construction',()=>{
  const policy=createRenderQuality();
  // Failed, skipped and manual-mode frames do not open it.
  policy.observe({...healthy(100),rendered:false});
  policy.setMode('low');policy.observe(healthy(200));policy.setMode('auto');
  let timestamp=60000;
  for(let i=0;i<60;i++){timestamp+=30;policy.observe({...healthy(timestamp),intervalMs:30,frameMs:30});}
  assert.equal(policy.current.tier,'high','a view first drawn a minute after load still gets its window');
});

test('a paused scene recovers from short drag bursts separated by idle gaps',()=>{
  const start=settled(),policy=start.policy;let timestamp=start.timestamp;
  const frame=(frameMs,inputToSubmitMs,step)=>{timestamp+=step;
    return policy.observe({timestamp,intervalMs:null,frameMs,inputToSubmitMs,continuous:false,continuation:false,rendered:true,completed:true});};
  for(let i=0;i<12;i++)frame(30,30,30);
  assert.equal(policy.current.tier,'balanced');
  // Four one-second drags, each followed by two idle seconds. No single burst holds 180 fast frames.
  let bursts=0;
  while(policy.current.tier!=='high'&&bursts<4){bursts++;for(let i=0;i<60;i++)frame(4,8,16);timestamp+=2000;}
  assert.equal(policy.current.tier,'high');assert.equal(bursts,4);
});

test('one slow frame between bursts discards the headroom a paused scene had gathered',()=>{
  const start=settled(),policy=start.policy;let timestamp=start.timestamp;
  const frame=(frameMs,inputToSubmitMs,step)=>{timestamp+=step;
    policy.observe({timestamp,intervalMs:null,frameMs,inputToSubmitMs,continuous:false,continuation:false,rendered:true,completed:true});};
  for(let i=0;i<12;i++)frame(30,30,30);
  assert.equal(policy.current.tier,'balanced');
  for(let burst=0;burst<12;burst++){for(let i=0;i<50;i++)frame(4,8,16);frame(30,8,16);timestamp+=2000;}
  assert.equal(policy.current.tier,'balanced');
});

test('headroom from a paused scene does not carry into a resumed animation',()=>{
  const start=settled(),policy=start.policy;let timestamp=start.timestamp;
  const paused=(frameMs,inputToSubmitMs,step)=>{timestamp+=step;
    policy.observe({timestamp,intervalMs:null,frameMs,inputToSubmitMs,continuous:false,continuation:false,rendered:true,completed:true});};
  for(let i=0;i<12;i++)paused(30,30,30);
  for(let i=0;i<170;i++)paused(4,8,16);
  assert.equal(policy.current.tier,'balanced');
  // Animate is switched on: the first continuous frame has no interval and restarts the assessment.
  timestamp+=2000;policy.observe({...healthy(timestamp),intervalMs:null});
  for(let i=0;i<30;i++){timestamp+=16;policy.observe(healthy(timestamp));}
  assert.equal(policy.current.tier,'balanced','thirty animated frames are not sustained headroom');
});
