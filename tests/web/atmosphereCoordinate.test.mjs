import test from 'node:test';
import assert from 'node:assert/strict';
import {ATMOSPHERE_GLSL} from '../../apps/web/js/atmosphereShaders.js';
import {mesh287Scattering,mesh287Converged} from './fixtures/atmosphereCoordinateReference.mjs';

// Execute the actual scalar GLSL expressions in binary64 JavaScript. This proves
// their algebra/source join; the separate browser gate proves GLSL execution.
const start=ATMOSPHERE_GLSL.indexOf('float atmosphereOneMinusExp(');
const end=ATMOSPHERE_GLSL.indexOf('vec3 atmosphereScatteredMonotonic(',start);
assert.ok(start>=0&&end>start,'Optical coordinate helpers absent');
const scalarSource=ATMOSPHERE_GLSL.slice(start,end)
  .replace(/(?:float|vec2) (atmosphere\w+)\(/g,'function $1(')
  .replace(/float (\w+)(?=[,)])/g,'$1').replace(/float (\w+)=/g,'let $1=');
const coordinate=Function('exp','log','vec2',scalarSource+'\nreturn atmosphereOpticalCoordinate;')(Math.exp,Math.log,(...v)=>v);
const array=name=>ATMOSPHERE_GLSL.match(new RegExp(`const float ${name}\\[12\\]=float\\[12\\]\\(([^)]+)\\)`))[1].split(',').map(Number);
const nodes=array('ATM_X12'),weights=array('ATM_W12');
const exact=(u,width)=>width>0?[-Math.log1p(u*Math.expm1(-width))/width,
  -Math.expm1(-width)/(width*((1-u)+u*Math.exp(-width)))]:[u,1];

test('actual coordinate and Jacobian agree with independent elementary identities',()=>{
  for(const width of [1e-8,.01,.1249999,.125,.1250001,1,13.451,30,1000])for(const node of nodes){
    const u=(node+1)/2,actual=coordinate(u,width),expected=exact(u,width);
    actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<=2e-8*Math.max(1,Math.abs(expected[i]))));
  }
});
test('actual Jacobian reproduces the analytic constant-extinction integral',()=>{
  for(const width of [0,1e-8,.01,1,13.451,30,100]){
    const result=nodes.reduce((sum,node,i)=>{const [t,j]=coordinate((node+1)/2,width);return sum+weights[i]/2*j*Math.exp(-width*t);},0);
    const expected=width?-Math.expm1(-width)/width:1;
    assert.ok(Math.abs(result-expected)<2e-9);
  }
});
test('zero-extinction fallback preserves each original point and weight',()=>{
  for(const node of nodes){const u=(node+1)/2;assert.deepEqual(coordinate(u,0),[u,1]);}
});
test('interior quadrature stays ordered with finite positive Jacobians across optical widths',()=>{
  for(let exponent=-30;exponent<=3;exponent+=.25){
    const width=10**exponent,values=nodes.map(node=>coordinate((node+1)/2,width));
    values.forEach(([t,j],i)=>{assert.ok(Number.isFinite(t)&&t>0&&t<1);assert.ok(Number.isFinite(j)&&j>0);if(i)assert.ok(t>values[i-1][0]);});
  }
});
test('actual whole-datum admission rejects misses, tangencies and straddling intervals',()=>{
  const expression=ATMOSPHERE_GLSL.match(/bool belowDatum=([^;]+);/)[1];
  const eligible=Function('ground','interval',`return ${expression};`);
  for(const [roots,span,wanted]of [[[1,-1],[0,1],false],[[2,2],[2,2],false],[[2,5],[1,3],false],
    [[2,5],[4,6],false],[[2,5],[2,5],true],[[2,5],[3,4],true]]){
    assert.equal(eligible({x:roots[0],y:roots[1]},{x:span[0],y:span[1]}),wanted);
  }
});
test('retained mesh287 physical regression passes with the same48nodes',()=>{
  const old=mesh287Scattering(nodes,weights,u=>[u,1]);
  const mapped=mesh287Scattering(nodes,weights,coordinate);
  const errors=result=>result.scattering.map((v,i)=>Math.abs(v-mesh287Converged[i])/(1e-4+.002*mesh287Converged[i]));
  assert.ok(Math.max(...errors(old))>1,'Original underresolution must remain reproduced');
  assert.ok(Math.max(...errors(mapped))<1,'Coordinate proposal must meet unchanged physical tolerance');
  assert.equal(old.nodes,48);assert.equal(mapped.nodes,48);
});
