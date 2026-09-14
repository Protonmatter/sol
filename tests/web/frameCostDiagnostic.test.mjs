import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {collectFrameCostDiagnostic} from '../../tools/frame_cost_diagnostic.mjs';

function fixture({timer=true,pending=false,disjoint=false,occupied=false,queryThrow=false,drawThrow=false,readThrow=false}={}){
  let now=0,nextId=0,current=null,activeQuery=occupied?{borrowed:true}:null,nextQuery=0,pass=0;
  const tasks=new Map(),deleted=[],ended=[],nativeDraws=[],errors=[];
  const programs=[{name:'generator'},{name:'surface'},{name:'shell'}],ext={TIME_ELAPSED_EXT:20,GPU_DISJOINT_EXT:21};
  const gl={CURRENT_PROGRAM:1,DRAW_FRAMEBUFFER_BINDING:2,VIEWPORT:3,FRAGMENT_SHADER:4,VERTEX_SHADER:5,
    CURRENT_QUERY:6,QUERY_RESULT_AVAILABLE:7,QUERY_RESULT:8,TRIANGLES:9,
    isContextLost:()=>false,getExtension:()=>timer?ext:null,
    getParameter(value){now+=.1;if(value===ext.GPU_DISJOINT_EXT)return typeof disjoint==='function'?disjoint():disjoint;
      if(value===1){if(readThrow&&nativeDraws.length)throw new Error('diagnostic read rejected');return current;}
      if(value===2)return current===programs[0]?programs[0]:null;if(value===3)return [0,0,128,193];return 0;},
    getUniformLocation(_program,name){return name;},getUniform(_program,name){
      if(name==='u_scatteringPass')return pass;
      if(name==='u_scatteringSurfaceSize')return new Int32Array([128,193,1]);
      if(name==='u_scatteringLimbSize')return new Int32Array([128,64]);return 1;},
    useProgram(program){current=program;return 11;},getError(){now+=2;return 0;},
    drawArrays(_mode,_first,count){nativeDraws.push(count);now+=12;if(drawThrow)throw new Error('original draw failed');return 17;},
    drawElements(_mode,count){nativeDraws.push(count);now+=16;return 19;},
    getQuery(){return activeQuery;},createQuery(){return {id:++nextQuery};},
    beginQuery(_target,query){assert.equal(activeQuery,null);if(queryThrow)throw new Error('timer begin rejected');activeQuery=query;},
    endQuery(){assert.ok(activeQuery);ended.push(activeQuery);activeQuery=null;},
    deleteQuery(query){assert.notEqual(query?.borrowed,true);deleted.push(query);},
    getQueryParameter(query,name){if(name===7)return !pending;assert.equal(pending,false,'must not request unavailable result');return query.id*1000;}};
  const originals={...gl};
  const schedule=(fn,ms)=>{const id=++nextId;tasks.set(id,{at:now+ms,fn});return id;};
  const env={gl,now:()=>now,expected:{generator:'gen','physical-surface':'surface','physical-shell':'shell'},
    observer:{snapshot:(_gl,p)=>p?{sequence:1,sources:[{type:4,source:p===programs[0]?'gen':p===programs[1]?'surface':'shell'},{type:5,source:'vertex'}]}:null},
    hash:async value=>createHash('sha256').update(value).digest('hex'),readState:()=>({frame:{sceneSerial:1},hdrEnabled:false}),
    later:schedule,cancelLater:id=>tasks.delete(id),cancelRaf:id=>tasks.delete(id),
    raf:fn=>schedule(()=>{
      try{
        assert.equal(gl.useProgram(programs[0]),11);pass=0;assert.equal(gl.drawArrays(9,0,3),17);
        pass=1;gl.drawArrays(9,0,3);gl.getError();gl.useProgram(programs[1]);gl.drawElements(9,600);
        gl.useProgram(programs[2]);gl.drawElements(9,120);
      }catch(error){errors.push(error);}
      fn(now);
    },16)};
  async function run(options={}){
    const promise=collectFrameCostDiagnostic(options,env);let settled=false,result;
    promise.then(value=>{settled=true;result=value;});
    for(let i=0;i<1000&&!settled;i++){
      await Promise.resolve();
      if(tasks.size){const [id,task]=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];tasks.delete(id);now=Math.max(now,task.at);task.fn();}
    }
    assert.ok(settled,'bounded diagnostic must settle');
    for(const [name,method] of Object.entries(originals))assert.equal(gl[name],method,`${name} restored`);
    assert.equal(tasks.size,0);return result;
  }
  return {env,run,deleted,ended,nativeDraws,errors,get activeQuery(){return activeQuery;}};
}

test('attributes generator surface/limb and consumers with source hashes and actual single-plane grid',async()=>{
  const f=fixture(),r=await f.run();
  assert.equal(r.status,'captured');assert.equal(r.heartbeats.length,2);assert.equal(r.draws.length,8);
  assert.deepEqual(r.draws.slice(0,4).map(x=>[x.role,x.pass,x.framebuffer]),[
    ['generator',0,'fbo-1'],['generator',1,'fbo-1'],['physical-surface',null,'default'],['physical-shell',null,'default']]);
  assert.deepEqual(r.draws[0].uniforms.u_scatteringSurfaceSize,[128,193,1]);
  assert.equal(r.programs[0].sources[0].sha256,createHash('sha256').update('gen').digest('hex'));
  assert.equal(r.api.getError.calls,2);assert.equal(r.api.getError.inclusiveMs,4);
  assert.equal(r.draws[0].apiElapsedMs,12);assert.ok(r.diagnosticQueriesMs>0);
  assert.equal(r.timer.completed,8);assert.equal(r.draws[0].gpuElapsedNs,1000);
  assert.equal(f.deleted.length,8);assert.equal(f.activeQuery,null);
});

test('absence and borrowed active timer preserve CPU attribution without owning a query',async()=>{
  for(const config of [{timer:false},{occupied:true}]){
    const f=fixture(config),r=await f.run();assert.equal(r.status,'captured');assert.equal(r.draws.length,8);
    assert.equal(f.deleted.length,0);assert.equal(f.ended.length,0);assert.equal(r.timer.completed,0);
    assert.equal(r.timer.status,config.occupied?'occupied':'unavailable');
  }
});

test('unavailable timer results are never fetched, bounded drain releases all owned queries',async()=>{
  const f=fixture({pending:true}),r=await f.run({drainMs:75});
  assert.equal(r.timer.pending,8);assert.ok(r.draws.every(x=>x.timerPending&&!('gpuElapsedNs'in x)));
  assert.equal(f.deleted.length,8);assert.ok(r.elapsedMs<1000);
});

test('disjoint invalidates every recorded GPU duration',async()=>{
  let reads=0;
  for(const disjoint of [true,()=>++reads>1]){
    const f=fixture({disjoint}),r=await f.run();assert.equal(r.timer.disjoint,true);
    assert.ok(r.draws.every(x=>x.timerDisjoint&&!('gpuElapsedNs'in x)));assert.equal(f.deleted.length,8);
  }
});

test('diagnostic failures do not suppress renderer calls; native throws retain their original error',async()=>{
  for(const config of [{queryThrow:true},{readThrow:true}]){
    const f=fixture(config),r=await f.run();assert.equal(r.status,'incomplete');assert.equal(f.nativeDraws.length,8);
    assert.equal(f.errors.length,0);assert.ok(r.errors.length>0);assert.equal(f.activeQuery,null);
  }
  const f=fixture({drawThrow:true}),r=await f.run();
  assert.equal(f.errors.length,2);assert.ok(f.errors.every(e=>e.message==='original draw failed'));
  assert.equal(r.api.drawArrays.thrown,2);assert.equal(f.deleted.length,2);assert.equal(f.activeQuery,null);
});

test('independent draw, program and time limits cannot expand and preserve original rendering',async()=>{
  const f=fixture(),r=await f.run({draws:1,programs:1});assert.equal(r.draws.length,1);assert.equal(r.programs.length,1);
  assert.equal(f.nativeDraws.length,8);
  await assert.rejects(collectFrameCostDiagnostic({frames:3},f.env),/limit/);
  await assert.rejects(collectFrameCostDiagnostic({bogus:1},f.env),/Unknown/);
  const timed=await fixture().run({samplingMs:1});assert.equal(timed.stopReason,'sampling-deadline');assert.equal(timed.draws.length,0);
});

test('failure hook persists original failed result before replay and never promotes diagnostic completion',async()=>{
  const source=fs.readFileSync(new URL('../../tools/browser_validation.mjs',import.meta.url),'utf8');
  const start=source.indexOf("    evidence.status='failed';evidence.failure={phase,error:error.message};");
  const end=source.indexOf('    let timer, diagnostic, diagnosticError;',start);
  assert.ok(start>0&&end>start);
  const body=source.slice(start,end),events=[];
  const run=new (Object.getPrototypeOf(async function(){}).constructor)('error','evidence','phase','saveEvidence','path','outputDirectory',
    'createHash','fs','diagnosticPage','collectFrameCostDiagnostic',body.replace("new URL('./frame_cost_diagnostic.mjs',import.meta.url)","'helper'"));
  for(const failureMode of ['none','evaluate','write','timeout','physical']){
    events.length=0;const evidence={status:'running'},original=new Error('insufficient Earth sphere draws: 1');
    if(failureMode==='physical')original.message='Physical Earth preparation failed: Physical preparation exceeded the original System deadline';
    const nativeSetTimeout=globalThis.setTimeout,nativeClearTimeout=globalThis.clearTimeout;
    if(failureMode==='timeout')globalThis.setTimeout=(fn,ms)=>{assert.equal(ms,25000);queueMicrotask(fn);return 1;};
    if(failureMode==='timeout')globalThis.clearTimeout=()=>{};
    try{
    await run(original,evidence,'System/WebGL',()=>events.push(['save',evidence.status]),{join:(...x)=>x.join('/')},'out',createHash,
      {readFileSync:()=>Buffer.from('helper'),writeFileSync:(_p,value)=>{if(failureMode==='write')throw new Error('disk full');events.push(['write',JSON.parse(value)]);}},
      {evaluate:async()=>{events.push(['replay']);if(failureMode==='evaluate')throw new Error('diagnostic failed');
        if(failureMode==='timeout')return new Promise(()=>{});return {status:'captured'};}},()=>{});
    }finally{globalThis.setTimeout=nativeSetTimeout;globalThis.clearTimeout=nativeClearTimeout;}
    assert.deepEqual(events[0],['save','failed']);assert.deepEqual(events[1],['replay']);
    assert.equal(evidence.status,'failed');assert.equal(evidence.failure.error,original.message);
    if(failureMode==='write')assert.equal(evidence.frame_cost_diagnostic.error,'disk full');
    else{const record=events.find(x=>x[0]==='write')[1];assert.equal(record.original_status,'failed');assert.equal(record.outer_budget_ms,25000);
      if(failureMode==='timeout')assert.equal(record.error,'Separate frame-cost diagnostic deadline');}
  }
  assert.match(source.slice(end,end+2100),/throw error;/);
});
