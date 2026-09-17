import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ATMOSPHERE_SCATTERING_GLSL} from '../../apps/web/js/atmosphereScattering.js';
import {interpolationProgram} from './fixtures/glslFloat32Interpolation.mjs';

function declaration(source,name){
  const start=source.indexOf(`vec4 ${name}(`)>=0?source.indexOf(`vec4 ${name}(`)
    :source.indexOf(`${name==='scatteringSlope'?'float':'vec3'} ${name}(`);
  assert.ok(start>=0,name);const begin=source.indexOf('{',start);let end=begin+1,depth=1;
  for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
  return source.slice(start,end);
}
const common=['scatteringSurfaceTexel','scatteringResidualLinear','scatteringSlope','scatteringCubic']
  .map(name=>declaration(ATMOSPHERE_SCATTERING_GLSL,name)).join('\n');
const baseline=fs.readFileSync(new URL('./fixtures/scatteringResidualBaseline.glsl',import.meta.url),'utf8');
const programs={baseline:interpolationProgram(common+'\n'+baseline),
  candidate:interpolationProgram(common+'\n'+declaration(ATMOSPHERE_SCATTERING_GLSL,'scatteringResidual'))};
const f=Math.fround,bits=x=>new Uint32Array(new Float32Array(x).buffer);
function run(which,size,p,sample){
  const reads=[];const program=programs[which](size,(texture,coordinate,lod)=>{
    assert.equal(texture,'surface');assert.equal(lod,0);
    const [x,y]=coordinate;assert.ok(Number.isInteger(x)&&Number.isInteger(y));
    assert.ok(x>=0&&x<size[0]&&y>=0&&y<size[1]*size[2]);
    const key=[x,y%size[1],Math.floor(y/size[1])];reads.push(key);
    return sample(...key).map(f);
  });
  const value=program.scatteringResidual(p.map(f));assert.ok(value.every(Number.isFinite));
  return {value,reads};
}
function equal(size,p,sample){
  const old=run('baseline',size,p,sample),next=run('candidate',size,p,sample);
  assert.deepEqual(bits(next.value),bits(old.value),`binary32 value at ${p}, size ${size}`);
  return {old,next};
}
const positive=(x,y,z)=>[Math.exp(Math.sin(x*.9)*.7+y*.11+z*.15),.03+(x+1)*(y+2)*.011+z*.4,
  Math.exp(Math.cos(x*.4)-y*.08-z*.04),1];

test('actual one-layer helper retains every output bit with only the first 16 texture reads',()=>{
  for(const x of [-.125,0,2**-20,1.25,7-2**-20,7,7.75,8,16.125])
    for(const y of [0,2**-20,1.5,4-2**-20,4])for(const z of [0,.125,.999999]){
      const {old,next}=equal([8,5,1],[x,y,z],positive);
      assert.equal(old.reads.length,64);assert.equal(next.reads.length,16);
      assert.deepEqual(next.reads,old.reads.slice(0,16));
      for(let plane=1;plane<4;plane++)assert.deepEqual(old.reads.slice(plane*16,(plane+1)*16),next.reads);
      assert.equal(next.value[3],1);
    }
});

test('actual depth-nine and depth-seventeen paths preserve all reads and their order',()=>{
  for(const depth of [9,17])for(const p of [[-.125,0,0],[0,4,depth-1],[7.75,2.5,depth-1.125],[3.25,1.5,3.75]]){
    const {old,next}=equal([8,5,depth],p,positive);
    assert.equal(next.reads.length,64);assert.deepEqual(next.reads,old.reads);
  }
});

test('multilayer invalid and zero samples in the fourth plane retain their late fallback',()=>{
  for(const depth of [9,17])for(const failed of [[1,1,1,0],[0,0,0,1]]){
    const sample=(x,y,z)=>z===5&&x===2&&y===1?failed:positive(x,y,z);
    const {old,next}=equal([8,5,depth],[3.25,2.5,3.5],sample);
    assert.ok(old.reads.length>48);assert.deepEqual(next.reads,old.reads);
    assert.equal(next.value[3],failed[3]===0?0:1);
  }
});

test('invalid alpha and zero-source stencils keep the original early exit and linear fallback',()=>{
  const cases=[()=>[0,0,0,1],()=>[0,.5,1,1],()=>[-1,0,0,1],()=>[3,2,1,0],
    (x,y,z)=>x===2&&y===1?[0,0,0,1]:positive(x,y,z),
    (x,y,z)=>x===2&&y===1?[1,1,1,0]:positive(x,y,z)];
  for(const depth of [1,9,17])for(const sample of cases)for(const p of [[1.25,1.5,0],[7.875,4,depth-1]]){
    const {old,next}=equal([8,5,depth],p,sample);
    // First-plane failure/linear fallback has exactly the old texture call trace.
    if(old.reads.length!==64)assert.deepEqual(next.reads,old.reads);
  }
  assert.deepEqual(run('candidate',[8,5,1],[0,0,0],()=>[0,0,0,1]).value,[0,0,0,1]);
  assert.deepEqual(run('candidate',[8,5,1],[0,0,0],()=>[1,1,1,0]).value,[0,0,0,0]);
});

test('periodic seam and degenerate y boundaries execute finite original arithmetic',()=>{
  for(const size of [[1,1,1],[4,2,1],[8,5,1],[8,5,9]])for(const p of [[-.25,0,0],[0,0,0],[.25,size[1]-1,size[2]-1]]){
    const a=equal(size,p,positive).next;
    const b=equal(size,[p[0]+size[0],p[1],p[2]],positive).next;
    assert.deepEqual(bits(a.value),bits(b.value));
  }
});

test('constant fields retain cubic boundary rounding over the positive binary32 range',()=>{
  for(const value of [2**-100,1,2**100])for(const p of [[-.25,0,0],[.125,4,.375],[3.875,2.5,.999999]]){
    const {next}=equal([8,5,1],p,()=>[value,value,value,1]);
    assert.equal(next.reads.length,16);assert.ok(next.value.slice(0,3).every(x=>x>0));
  }
});

test('scoped adapter copies GLSL vectors, rounds each operation and rejects unsupported syntax',()=>{
  const program=interpolationProgram(`vec4 boundary(vec3 p){vec3 rows[4];rows[0]=p;rows[1]=rows[0];
    rows[1].x=2.0;p.yz=vec2(3,4);float a=(16777216.0+1.0)-16777216.0;
    return vec4(rows[0].x,rows[1].x,p.z,a);}`)([1,1,1],()=>{throw Error('Unexpected texture read');});
  const input=[7,8,9];assert.deepEqual(program.boundary(input),[7,2,4,0]);assert.deepEqual(input,[7,8,9]);
  assert.throws(()=>interpolationProgram('float unsupported(float x){while(x>0.0)x--;return x;}'),/Unsupported/);
  assert.throws(()=>interpolationProgram('float unsupported(float x){return mystery(x);}'),/Unsupported/);
  assert.throws(()=>interpolationProgram('vec3 unsupported(vec3 x){return x.foo;}'),/Unsupported/);
});
