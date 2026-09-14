import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {waitForPhysicalSpinReadiness} from '../../tools/physical_spin_probe.mjs';

async function readiness({start=74000,actions=[],capture,program='ready',optics='ready'}={}){
  let now=start,nextId=0,finished=false,result;
  const timers=new Map(),calls=[],actualProgram={},state={bodies:[{name:'Earth',x_au:1,y_au:0,z_au:0}],
    programStatus:{physical:program},programDiagnostics:{physicalSphere:{status:program,elapsed_ms:123}},opticsStatus:{Earth:optics}};
  const schedule=(fn,delay,interval=false)=>{const id=++nextId;timers.set(id,{fn,at:now+delay,delay,interval});return id;};
  const gl={TRIANGLES:4,CURRENT_PROGRAM:1,isContextLost:()=>false,getParameter:()=>actualProgram,
    getUniformLocation:()=>({}),getUniform:()=>0,drawElements(...args){calls.push({receiver:this,args});return 'native-result';}};
  const native=gl.drawElements,accepted={passed:true,uniforms:{u_model:[1,0,0,0,0,1,0,0,0,0,1,0,1,0,0,1]},geometry:{observed:true}};
  const env={gl,state,now:()=>now,advance:milliseconds=>now+=milliseconds,accepted};
  const context=vm.createContext({URL,document:{querySelector:()=>({src:'https://sol.invalid/app.js?v=immutable'}),getElementById:()=>({getContext:()=>gl})},
    performance:{now:()=>now},__solPhysicalSpinEvidence:{body:'Earth',capture:(actual,used)=>{
      assert.equal(actual,gl);assert.equal(used,actualProgram);return capture?capture(env):accepted;
    }},setTimeout:(fn,delay)=>schedule(fn,delay),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,delay)=>schedule(fn,delay,true),clearInterval:id=>timers.delete(id)});
  const module=new vm.SourceTextModule(`export default ${waitForPhysicalSpinReadiness.toString()}`,{context,
    importModuleDynamically:async()=>{const storeModule=new vm.SyntheticModule(['store'],function(){this.setExport('store',{orrery:state});},{context});
      await storeModule.link(()=>{});await storeModule.evaluate();return storeModule;}});
  await module.link(()=>{});await module.evaluate();
  const pending=module.namespace.default({body:'Earth',systemStartedMs:0,deadlineMs:75000}).then(value=>{finished=true;result=value;});
  await new Promise(setImmediate);
  for(const [at,run]of actions)schedule(()=>run(env),at-now);
  while(!finished){
    const [id,event]=[...timers].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0]??[];
    assert.ok(event,'readiness must remain bounded by a timer');now=Math.max(now,event.at);timers.delete(id);
    if(event.interval)timers.set(id,{...event,at:now+event.delay});event.fn();await new Promise(setImmediate);
  }
  await pending;assert.equal(gl.drawElements,native,'native draw restored');assert.equal(timers.size,0,'preparation timers cleared');
  return {result,calls,state};
}

test('ready metadata alone cannot pass or restart the absolute System budget',async()=>{
  const {result}=await readiness();assert.equal(result.passed,false);assert.equal(result.endedMs,75000);
  assert.equal(result.elapsedMs,1000);assert.equal(result.firstPhysicalReadyElapsedMs,null);
});

test('actual current physical evidence admits before the deadline and preserves native arguments',async()=>{
  const {result,calls}=await readiness({actions:[[74500,({gl})=>assert.equal(gl.drawElements(4,36,5123,0),'native-result')]]});
  assert.equal(result.passed,true);assert.equal(result.firstPhysicalReadyElapsedMs,74500);assert.equal(result.draw.geometry.observed,true);
  assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[4,36,5123,0]);
  assert.equal(result.diagnostics.programDiagnostics.physicalSphere.elapsed_ms,123);
});

test('fallback draws and physical readback completing late cannot establish preparation',async()=>{
  for(const capture of [()=>({passed:false,reason:'fallback'}),env=>{env.advance(600);return env.accepted;}]){
    const {result}=await readiness({capture,actions:[[74500,({gl})=>gl.drawElements(4,36,5123,0)]]});
    assert.equal(result.passed,false);assert.equal(result.firstPhysicalReadyElapsedMs,null);assert.equal(result.counts.submitted,1);
  }
});

test('existing shader or source admission failure is terminal without extending its timeout',async()=>{
  for(const options of [{program:'unavailable'},{optics:'unavailable'}]){
    const {result}=await readiness(options);assert.equal(result.passed,false);assert.equal(result.endedMs,74000);
    assert.match(result.reason,/unavailable/);
  }
});
