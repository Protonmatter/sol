import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ATMOSPHERE_GLSL} from '../../apps/web/js/atmosphereShaders.js';
import {ATMOSPHERE_SCATTERING_GLSL} from '../../apps/web/js/atmosphereScattering.js';
import {geometryInterpreter} from './fixtures/glslFloat32Geometry.mjs';

function functionBody(source,name){
  const start=source.indexOf(name+'('),brace=source.indexOf('{',start);let end=brace+1,depth=1;
  assert.ok(start>=0,name);
  for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
  return source.slice(brace,end);
}
const shadowSource=ATMOSPHERE_GLSL.slice(ATMOSPHERE_GLSL.indexOf('vec2 atmosphereExactProduct('),
  ATMOSPHERE_GLSL.indexOf('float atmosphereHeight('));
// Include the original helper for the deliberately red regression before its
// production move; this does not replace any arithmetic in the executed source.
const oldLocation=ATMOSPHERE_GLSL.indexOf('vec2 atmosphereShadowInterval(')>ATMOSPHERE_GLSL.indexOf('float atmosphereHeight(');
const legacy=oldLocation?'vec2 atmosphereShadowInterval(vec3 origin,vec3 direction)'+functionBody(ATMOSPHERE_GLSL,'atmosphereShadowInterval'):'';
const interpreter=geometryInterpreter('vec3 atmosphereUnflatten(vec3 p){ return vec3(p.xy,p.z/u_atmospherePolarRatio); }'+shadowSource+legacy);
const globals=(radius=2,q=1,light=[1,0,0])=>({u_atmosphereRadiusKm:Math.fround(radius),
  u_atmosphereTopKm:1,u_atmospherePolarRatio:Math.fround(q),u_atmosphereSunDirection:light.map(Math.fround)});
const shadow=(origin,direction,g=globals())=>interpreter.run('atmosphereShadowInterval',
  [origin.map(Math.fround),direction.map(Math.fround)],g).value;
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('actual shadow helper preserves cylinder, plane, parallel and tangent geometry',()=>{
  for(const [o,d,expected]of [
    [[-6,0,0],[2,0,0],[-Infinity,3]],[[6,0,0],[-2,0,0],[3,Infinity]],
    [[-6,-3,0],[0,1,0],[1,5]],[[-6,-3,2],[0,1,0],[3,3]],
    [[-3,-3,0],[1,1,0],[1,3]],[[3,-3,0],[-1,1,0],[3,5]],
  ])for(const scale of [.5,1,2])for(const sunScale of [1,2,10]){
    const actual=shadow(o,d.map(x=>x*scale),globals(2,1,[sunScale,0,0]));
    expected.forEach((value,i)=>Number.isFinite(value)?close(actual[i],value/scale):assert.ok(Math.abs(actual[i])>1e19));
  }
  for(const [o,d]of [[[-6,3,0],[2,0,0]],[[6,-3,0],[0,1,0]],[[-6,-3,2+2**-12],[0,1,0]]])
    assert.deepEqual(shadow(o,d),[1,-1]);
  assert.ok(shadow([-6,-3,2-2**-12],[0,1,0])[1]>3);
  assert.deepEqual(shadow([-6,0,-1.5],[0,0,.5],globals(2,.5)),[1,5]);
});

test('exact recorded native path keeps its independently classified short lit suffix',()=>{
  // Actual native node31/23/12 MRT outputs, not a reconstructed CPU path.
  // Independent binary64 cylinder/antisolar-plane root: 948.133856813353 km.
  const origin=[1622.60693359375,-3057.303955078125,490.42803955078125];
  const direction=[-.78709477186203,-.0457281693816185,.6151347756385803];
  const light=[-.800136512302466,.022687333572781843,.5993887274347115];
  const interval=shadow(origin,direction,globals(3396.19,.9941,light));
  close(interval[1],948.133856813353,.0001);
  close((948.149658203125-interval[1])*1000,15.801389772,.1);
});

test('prepared source, normalization and exact-zero branches share one shadow interval',()=>{
  for(const [source,name]of [[ATMOSPHERE_GLSL,'integrateAtmospherePrepared'],
    [ATMOSPHERE_SCATTERING_GLSL,'scatteringReferenceWeightPrepared'],
    [ATMOSPHERE_SCATTERING_GLSL,'atmosphereScatteringIsZeroPrepared']]){
    const body=functionBody(source,name);assert.match(body,/path\.shadow/);
    assert.doesNotMatch(body,/atmosphereShadowInterval\(/);
  }
  for(const name of ['atmospherePrepareObserver','atmospherePrepareSurface']){
    const body=functionBody(ATMOSPHERE_GLSL,name);
    assert.equal((body.match(/atmosphereCompletePath\(path,complete\)/g)||[]).length,1);
  }
  const complete=functionBody(ATMOSPHERE_GLSL,'atmosphereCompletePath');
  assert.equal((complete.match(/path\.shadow=atmosphereShadowInterval\(path\.entry,path\.ray\)/g)||[]).length,1);
});

test('public complete paths preserve every pre-factor field including early-return shadow sentinels',()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/shadowCompletePaths.json',import.meta.url),'utf8'),
    (_key,value)=>value==='-0'?-0:value);
  assert.equal(fixture.source_sha256,'8c94a8fda4d3efcdd063b550a5c2d73bfc63f10f9a67b990a8b2e9dda7e9c7a0');
  assert.equal(fixture.cases.length,28);
  for(const entry of fixture.cases){
    const suffix=entry.name==='surface'?'Surface':'Observer';
    assert.deepEqual(interpreter.run('atmospherePrepare'+suffix,entry.args,entry.uniforms).value,entry.expected);
  }
});

test('GLSL interpreter copies out parameters through completion and early return',()=>{
  const model=geometryInterpreter('float select(float value,out bool complete){complete=false;if(value<=0.0)return 0.0;complete=true;return value;} float caller(float value){bool complete;float result=select(value,complete);if(complete)return result;return -1.0;}');
  assert.equal(model.run('caller',[-1]).value,-1);assert.equal(model.run('caller',[0]).value,-1);
  assert.equal(model.run('caller',[2]).value,2);
});
