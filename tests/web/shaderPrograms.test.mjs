import assert from 'node:assert/strict';
import test from 'node:test';

async function harness(options={}){
  const {parallel=true,failure='',capacity=2,throwNotification=false}=options;
  const notificationValue=Object.hasOwn(options,'notificationValue')?options.notificationValue:Error('observer failed');
  const {createShaderPrograms}=await import('../../apps/web/js/shaderPrograms.js');
  const programs=[],shaders=[],deletedPrograms=[],deletedShaders=[],detachedShaders=[],queries=[],frames=new Map(),events=[];
  let frameId=0,clock=0,lost=false;
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
    getExtension:()=>parallel?{COMPLETION_STATUS_KHR:5}:null,isContextLost:()=>lost,
    createProgram:()=>{if(failure==='program-allocation')return null;const p={done:false};programs.push(p);return p;},
    createShader:()=>{if(failure==='shader-allocation')return null;const s={};shaders.push(s);return s;},
    shaderSource:(s,source)=>{s.source=source;},compileShader:()=>{},attachShader:(p,s)=>{s.owner=p;},linkProgram:()=>{},
    getProgramParameter:(p,parameter)=>{queries.push(parameter);if(parameter===5)return p.done;
      assert.ok(!parallel||p.done,'early LINK_STATUS');return failure!=='link';},
    getShaderParameter:s=>{queries.push(3);assert.ok(!parallel||s.owner.done,'early COMPILE_STATUS');return failure!=='shader';},
    getProgramInfoLog:()=>failure,getShaderInfoLog:()=>failure,
    detachShader:(p,s)=>{assert.equal(s.owner,p);detachedShaders.push(s);},
    deleteProgram:p=>deletedPrograms.push(p),deleteShader:s=>deletedShaders.push(s),
  };
  const manager=createShaderPrograms(gl,{generation:7,capacity,timeoutMs:30000,now:()=>clock,
    schedule:fn=>{frames.set(++frameId,fn);return frameId;},cancel:id=>frames.delete(id),onChange:(key,status)=>{
      events.push([key,status]);if(throwNotification&&status==='cancelled')throw notificationValue;
    }});
  return {manager,programs,shaders,deletedPrograms,deletedShaders,detachedShaders,queries,events,frames,
    complete:()=>programs.forEach(p=>{p.done=true;}),time:value=>{clock=value;},lose:()=>{lost=true;},
    tick:()=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn();}};
}

test('parallel programs poll completion before compile/link queries and release shader objects on readiness',async()=>{
  const h=await harness(),entry=h.manager.request('base','vertex','fragment');
  assert.equal(h.manager.status('base'),'loading');assert.equal(h.manager.get('base'),null);assert.deepEqual(h.queries,[]);
  h.tick();assert.deepEqual(h.queries,[5]);assert.equal(h.frames.size,1);
  h.complete();h.tick();assert.equal((await entry.done).status,'ready');assert.equal(h.manager.get('base'),h.programs[0]);
  assert.equal(h.deletedShaders.length,2);assert.equal(h.detachedShaders.length,2);
  assert.equal(h.deletedPrograms.length,0);assert.equal(h.frames.size,0);
  h.manager.dispose();h.manager.dispose();assert.equal(h.deletedPrograms.length,1);assert.equal(h.deletedShaders.length,2);
  assert.equal(h.manager.diagnostic('base').status,'cancelled');assert.equal(h.manager.diagnostic('never-requested').status,'cancelled');
});

test('resource/source identity is bounded and cancelled entries can be explicitly re-requested',async()=>{
  const h=await harness({capacity:1}),entry=h.manager.request('base','v','f');
  assert.equal(h.manager.request('base','v','f'),entry);
  assert.throws(()=>h.manager.request('base','v','changed'),/identity/i);
  assert.throws(()=>h.manager.request('other','v','f'),/capacity/i);
  const late=h.frames.values().next().value;h.manager.cancelPending();
  assert.equal((await entry.done).status,'cancelled');assert.equal(h.deletedPrograms.length,1);assert.equal(h.frames.size,0);
  late();assert.deepEqual(h.queries,[]);
  const next=h.manager.request('base','v','f');assert.notEqual(next,entry);h.complete();h.tick();
  assert.equal((await next.done).status,'ready');h.manager.dispose();
});

for(const failure of ['shader','link','program-allocation','shader-allocation'])test(`program ${failure} failure is disclosed and owns no leaked resources`,async()=>{
  const h=await harness({parallel:false,failure}),entry=h.manager.request('base','v','f');
  assert.equal((await entry.done).status,'unavailable');assert.match(h.manager.diagnostic('base').error,/shader|link|allocation/i);
  assert.equal(h.manager.get('base'),null);assert.equal(h.deletedPrograms.length,h.programs.length);
  assert.equal(h.deletedShaders.length,h.shaders.length);assert.equal(h.manager.request('base','v','f'),entry);
  h.manager.retry('base');assert.equal(h.manager.status('base'),'deferred');
  assert.throws(()=>h.manager.request('base','v','replacement'),/identity/i,'retry cannot substitute different source bytes');
  h.manager.dispose();
});

test('parallel timeout and context loss never publish ready programs or leave scheduled work',async()=>{
  for(const failure of ['timeout','context']){
    const h=await harness(),entry=h.manager.request('base','v','f');
    if(failure==='timeout')h.time(30000);else h.lose();h.tick();
    assert.notEqual((await entry.done).status,'ready');assert.equal(h.manager.get('base'),null);assert.equal(h.frames.size,0);
    assert.equal(h.deletedPrograms.length,1);assert.equal(h.deletedShaders.length,2);h.manager.dispose();
  }
});

test('no-KHR completion is synchronous and input/budget validation precedes allocation',async()=>{
  const h=await harness({parallel:false});
  assert.throws(()=>h.manager.request('','v','f'),/identity/i);
  assert.throws(()=>h.manager.request('base','','f'),/source/i);assert.equal(h.programs.length,0);
  h.manager.request('base','v','f');assert.equal(h.manager.status('base'),'ready');assert.equal(h.frames.size,0);
  h.manager.dispose();assert.throws(()=>h.manager.request('other','v','f'),/disposed/i);
});

test('a cancelled poll delivered after a new request cannot poll it or duplicate the scheduled callback',async()=>{
  const h=await harness();h.manager.request('base','v','f');const stale=h.frames.values().next().value;
  h.manager.cancelPending();h.manager.request('base','v','f');assert.equal(h.frames.size,1);
  stale();assert.deepEqual(h.queries,[]);assert.equal(h.frames.size,1);
  h.complete();h.tick();h.manager.dispose();
});

test('a throwing status observer cannot interrupt cancellation or leave disposed requests unresolved',async()=>{
  for(const action of ['cancelPending','dispose'])for(const notificationValue of [Error('observer failed'),null,undefined]){
    const h=await harness({throwNotification:true,notificationValue}),first=h.manager.request('first','v','f'),second=h.manager.request('second','v','f');
    assert.doesNotThrow(()=>h.manager[action]());
    assert.deepEqual((await Promise.all([first.done,second.done])).map(result=>result.status),['cancelled','cancelled']);
    assert.match(h.manager.diagnostic('first').notificationError,/observer failed|null|undefined/);
    assert.equal(h.deletedPrograms.length,2);assert.equal(h.deletedShaders.length,4);assert.equal(h.frames.size,0);h.manager.dispose();
  }
});
