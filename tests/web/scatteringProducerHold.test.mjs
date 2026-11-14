import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {beginScatteringProducerHold,endScatteringProducerHold} from '../../tools/scattering_producer_probe.mjs';

async function fixture({paired=false}={}){
  const calls=[],program={},numerator={},legacy={},wrong={},ignored={invalid:true},sources=new Map();
  const pair={sources:[{type:1,source:'generator vertex'},{type:2,source:'generator fragment'}]};
  sources.set(program,pair);sources.set(ignored,pair);
  sources.set(numerator,{sources:[{type:1,source:'generator vertex'},{type:2,source:'numerator fragment'}]});sources.set(legacy,{sources:[{type:1,source:'generator vertex'},{type:2,source:'legacy fragment'}]});
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,TRIANGLES:3,CURRENT_PROGRAM:4,current:null,isContextLost:()=>false,
    useProgram(value){calls.push(['use',this,value]);if(!value?.invalid)this.current=value;return 'native-use';},
    drawArrays(...args){calls.push(['draw',this,...args]);if(this.throwDraw)throw Error('native draw failure');return 'native-draw';},
    getParameter(name){assert.equal(name,4);return this.current;}};
  const originalDraw=gl.drawArrays,originalUse=gl.useProgram;
  const context=vm.createContext({URL,document:{querySelector:()=>({src:'https://sol.invalid/app.js?v=stage'}),getElementById:()=>({getContext:()=>gl})},
    __solProgramSourceEvidence:{snapshot:(actual,value)=>actual===gl?sources.get(value):null}});
  const module=new vm.SourceTextModule(`export const begin=${beginScatteringProducerHold.toString()};export const end=${endScatteringProducerHold.toString()};`,{context,
    importModuleDynamically:async specifier=>{
      assert.equal(specifier,'./js/physicalProgramSources.js?v=stage');
      const result=new vm.SyntheticModule(['physicalProgramSources'],function(){
        this.setExport('physicalProgramSources',body=>({scatteringGenerator:{vertex:'generator vertex',fragment:paired?'legacy fragment':body==='Earth'?'generator fragment':'Mars generator fragment'},...(paired?{scatteringNumerator:{vertex:'generator vertex',fragment:body==='Earth'?'numerator fragment':'Mars numerator fragment'},scatteringResolve:{vertex:'generator vertex',fragment:body==='Earth'?'generator fragment':'Mars resolve fragment'}}:{})}));},{context});
      await result.link(()=>{});await result.evaluate();return result;
    }});
  await module.link(()=>{});await module.evaluate();
  return {gl,calls,program,numerator,legacy,wrong,ignored,sources,context,originalDraw,originalUse,begin:module.namespace.begin,end:module.namespace.end};
}

test('real hold control skips only exact-source actual generator triangles and restores native functions',async()=>{
  const f=await fixture();await f.begin();assert.equal(f.gl.useProgram(f.program),'native-use');
  assert.equal(f.gl.drawArrays(3,0,3),undefined);assert.equal(f.calls.filter(c=>c[0]==='draw').length,0);
  assert.equal(f.gl.drawArrays(3,0,6),'native-draw','other primitive ranges remain native');
  f.gl.useProgram(f.wrong);assert.equal(f.gl.drawArrays(3,0,3),'native-draw','consumer presentation is not held');
  const result=f.end();assert.equal(result.restored,true);assert.equal(result.held,1);assert.equal(result.sourceFiltered,1);
  assert.equal(f.gl.drawArrays,f.originalDraw);assert.equal(f.gl.useProgram,f.originalUse);
  assert.equal(f.gl.drawArrays(3,0,3),'native-draw','recovery returns to actual native draw path');
  assert.ok(f.calls.every(call=>call[1]===f.gl));
});

test('matching stale hints, relinks and foreign contexts cannot be counted as held generator draws',async()=>{
  const f=await fixture();await f.begin();f.gl.useProgram(f.wrong);f.gl.useProgram(f.ignored);
  assert.equal(f.gl.drawArrays(3,0,3),'native-draw');
  f.gl.useProgram(f.program);f.sources.set(f.program,{sources:[{type:1,source:'generator vertex'},{type:2,source:'changed fragment'}]});
  assert.equal(f.gl.drawArrays(3,0,3),'native-draw');
  const other={};assert.equal(f.gl.drawArrays.call(other,3,0,3),'native-draw');
  const result=f.end();assert.equal(result.held,0);assert.equal(result.currentProgramMismatch,1);assert.equal(result.candidateQueries,1);
  assert.equal(f.calls.at(-1)[1],other);
});

test('hold lifecycle rejects double installation and preserves native exceptions through cleanup',async()=>{
  const f=await fixture();assert.throws(()=>f.end(),/not active/);await f.begin();await assert.rejects(()=>f.begin(),/already active/);
  f.gl.useProgram(f.wrong);f.gl.throwDraw=true;assert.throws(()=>f.gl.drawArrays(3,0,3),/native draw failure/);
  assert.equal(f.end().restored,true);assert.equal(f.gl.drawArrays,f.originalDraw);
});

for(const stage of ['all','numerator','resolve'])test(`paired hold selects only its requested live stages: ${stage}`,async()=>{
  const f=await fixture({paired:true});await f.begin({stage});
  f.gl.useProgram(f.numerator);assert.equal(f.gl.drawArrays(3,0,3),stage==='resolve'?'native-draw':undefined);
  f.gl.useProgram(f.program);assert.equal(f.gl.drawArrays(3,0,3),stage==='numerator'?'native-draw':undefined);
  f.gl.useProgram(f.legacy);assert.equal(f.gl.drawArrays(3,0,3),'native-draw','unused legacy oracle is not a live producer');
  const r=f.end();assert.equal(r.held,stage==='all'?2:1);assert.equal(r.restored,true);
});
