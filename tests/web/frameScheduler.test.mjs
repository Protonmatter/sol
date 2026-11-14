import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameScheduler} from '../../apps/web/js/frameScheduler.js';

function fixture(options={}) {
  const callbacks=new Map(),calls=[];let id=0,clock=0,enabled=true,continuous=false;
  const scheduler=createFrameScheduler({
    schedule:fn=>{callbacks.set(++id,fn);return id;},cancel:id=>callbacks.delete(id),now:()=>clock,
    enabled:()=>enabled,continuous:()=>continuous,
    render:timestamp=>{calls.push(timestamp);clock+=3;return options.render?.(scheduler);},sampleLimit:3,
    onSample:sample=>options.onSample?.(sample,scheduler),
  });
  return {scheduler,callbacks,calls,setTime:value=>{clock=value;},setEnabled:value=>{enabled=value;},setContinuous:value=>{continuous=value;},
    frame:()=>{const [handle,callback]=callbacks.entries().next().value;callbacks.delete(handle);callback(clock);}};
}

test('an input burst owns one pending frame and records earliest input latency separately from CPU work',()=>{
  const f=fixture();f.scheduler.invalidate({input:true});f.setTime(2);f.scheduler.invalidate({input:true});
  f.setTime(5);f.scheduler.invalidate();assert.equal(f.callbacks.size,1);assert.equal(f.calls.length,0);
  f.setTime(10);f.frame();assert.deepEqual(f.calls,[10]);assert.equal(f.callbacks.size,0);
  assert.deepEqual(f.scheduler.timings(),[{timestamp:10,frameMs:3,inputToFrameMs:10,inputToSubmitMs:13,completed:true,rendered:true,continuous:false,continuation:false,intervalMs:null}]);
});

test('continuous animation and invalidations share one owner and stop when idle',()=>{
  const f=fixture();f.setContinuous(true);f.scheduler.invalidate();f.frame();
  f.scheduler.invalidate();f.scheduler.invalidate();assert.equal(f.callbacks.size,1);
  f.setContinuous(false);f.frame();assert.equal(f.calls.length,2);assert.equal(f.callbacks.size,0);
});

test('invalidation during render is retained for exactly one subsequent frame',()=>{
  let first=true;const f=fixture({render:s=>{if(first){first=false;s.invalidate();s.invalidate();}}});
  f.scheduler.invalidate();f.frame();assert.equal(f.callbacks.size,1);f.frame();assert.equal(f.callbacks.size,0);
});

test('suspension cancels a pending callback, rejects stale delivery and drops hidden input latency',()=>{
  const f=fixture();f.scheduler.invalidate({input:true});const stale=[...f.callbacks.values()][0];
  f.setEnabled(false);f.scheduler.cancel();assert.equal(f.callbacks.size,0);stale(10);f.scheduler.invalidate({input:true});
  assert.equal(f.calls.length,0);assert.equal(f.callbacks.size,0);f.setEnabled(true);f.scheduler.invalidate();f.frame();
  assert.equal(f.scheduler.timings()[0].inputToFrameMs,null);
});

test('cancellation inside a frame does not rearm continuous animation',()=>{
  const f=fixture({render:s=>s.cancel()});f.setContinuous(true);f.scheduler.invalidate();f.frame();assert.equal(f.callbacks.size,0);
});

test('instrumentation is bounded and callers cannot mutate retained samples',()=>{
  const f=fixture();for(let i=0;i<7;i++){f.scheduler.invalidate();f.frame();}
  const samples=f.scheduler.timings();assert.equal(samples.length,3);samples[0].frameMs=99;
  assert.equal(f.scheduler.timings()[0].frameMs,3);
});

test('a new invalidation after in-frame cancellation belongs to the new generation',()=>{
  let first=true;const f=fixture({render:s=>{if(first){first=false;s.cancel();s.invalidate();}}});
  f.scheduler.invalidate();f.frame();assert.equal(f.callbacks.size,1);f.frame();assert.equal(f.calls.length,2);
  assert.equal(f.callbacks.size,0);
});

test('a failed render stops continuous scheduling until a later explicit invalidation',()=>{
  let fail=true;
  const f=fixture({render:s=>{if(fail){s.invalidate();throw Error('draw failed');}}});
  f.setContinuous(true);f.scheduler.invalidate({input:true});
  assert.throws(()=>f.frame(),/draw failed/);
  assert.equal(f.callbacks.size,0,'a persistent draw failure must not run every frame');
  assert.deepEqual(f.scheduler.timings(),[{timestamp:0,frameMs:3,inputToFrameMs:0,inputToSubmitMs:null,completed:false,rendered:false,continuous:true,continuation:false,intervalMs:null}]);
  fail=false;f.scheduler.invalidate();assert.equal(f.callbacks.size,1);f.frame();
  assert.equal(f.calls.length,2);assert.equal(f.callbacks.size,1,'successful explicit retry can resume continuous work');
});


test('sample hook observes consecutive delivery intervals and resets after idle, cancellation and long gaps',()=>{
  const observed=[],f=fixture({onSample:sample=>observed.push(sample)});
  f.setContinuous(true);f.scheduler.invalidate();f.frame();f.setTime(16);f.frame();
  assert.equal(observed[0].intervalMs,null);assert.equal(observed[1].intervalMs,16);
  assert.equal(observed[1].continuous,true);assert.equal(observed[1].rendered,true);
  f.scheduler.cancel();f.setTime(100);f.scheduler.invalidate();f.frame();assert.equal(observed.at(-1).intervalMs,null);
  f.setTime(1000);f.frame();assert.equal(observed.at(-1).intervalMs,null,'suspended delivery is not overload evidence');
  assert.equal(observed.at(-1).continuation,true,'CPU work can still be assessed in a delayed continuous chain');
  f.setContinuous(false);f.setTime(1016);f.frame();f.setTime(5000);f.scheduler.invalidate();f.frame();
  assert.equal(observed.at(-1).continuous,false);assert.equal(observed.at(-1).intervalMs,null);
});

test('sample-driven redraws coalesce and sample callbacks cannot mutate retained diagnostics',()=>{
  let first=true;const f=fixture({onSample:(sample,scheduler)=>{
    sample.frameMs=999;
    if(first){first=false;scheduler.invalidate();scheduler.invalidate();}
  }});
  f.scheduler.invalidate();f.frame();assert.equal(f.callbacks.size,1);assert.equal(f.scheduler.timings()[0].frameMs,3);
  f.frame();assert.equal(f.callbacks.size,0);
});

test('skipped frames are marked ineligible and do not establish continuous delivery history',()=>{
  const observed=[],f=fixture({render:()=>false,onSample:sample=>observed.push(sample)});
  f.setContinuous(true);f.scheduler.invalidate();f.frame();f.setTime(16);f.frame();
  assert.equal(observed.length,2);assert.equal(observed[0].completed,true);assert.equal(observed[0].rendered,false);
  assert.equal(observed[1].intervalMs,null);
});

test('cancellation in a sample observer cannot resurrect continuous scheduling',()=>{
  const f=fixture({onSample:(_sample,scheduler)=>scheduler.cancel()});f.setContinuous(true);f.scheduler.invalidate();f.frame();
  assert.equal(f.callbacks.size,0);
});
