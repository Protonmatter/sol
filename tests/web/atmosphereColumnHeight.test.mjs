import test from 'node:test';
import assert from 'node:assert/strict';
import {ATMOSPHERE_RENDER_GLSL} from '../../apps/web/js/atmosphereColumnField.js';
import {geometryInterpreter} from './fixtures/glslFloat32Geometry.mjs';

const tail=ATMOSPHERE_RENDER_GLSL.slice(ATMOSPHERE_RENDER_GLSL.indexOf('vec2 atmosphereColumnTail('));
const declaration=tail.match(/float radius=([^;]+);/)[0];
// Execute the actual tail's radius/height declaration with stepwise binary32
// arithmetic. The oracle below independently uses binary64 Euclidean geometry.
const source=`float actualTailHeight(float impact,float x){${declaration}return height;}`;
const interpreter=geometryInterpreter(source),f=Math.fround;
const height=(impact,x,R)=>interpreter.run('actualTailHeight',[f(impact),f(x)],{u_atmosphereRadiusKm:f(R)}).value;

test('actual tail height preserves the recorded native short-interval radial increment',()=>{
  const R=3396.18994140625,impact=3396.1904296875,x=[120.0654296875,120.081298828125];
  const expected=x.map(v=>Math.hypot(impact,v)-R),actual=x.map(v=>height(impact,v,R));
  for(let i=0;i<2;i++)assert.ok(Math.abs(actual[i]-expected[i])<1e-6);
  assert.ok(Math.abs((actual[1]-actual[0])-(expected[1]-expected[0]))<1e-6);
});

test('rationalized height retains tiny positive altitude and signed below-datum support',()=>{
  const R=3396.18994140625;
  for(const x of [-(2**-10),2**-10])assert.ok(height(R,x,R)>0);
  for(const [impact,x]of [[R-.25,40],[R-.25,41.20718765258789],[0,0],[R+100,0],[R+2,3]]){
    const expected=Math.hypot(f(impact),f(x))-R,actual=height(impact,x,R);
    assert.equal(Math.sign(actual),Math.sign(expected));
    assert.ok(Math.abs(actual-expected)<2e-5,`${actual} vs ${expected}`);
  }
});

test('same altitude identity covers terrestrial, Martian and small-radius columns',()=>{
  for(const radius of [2,3396.19,6378.137])for(const fraction of [0,.25,.75,.999,1,1.00001,1.1])
    for(const xFraction of [0,.001,.01,.1,.7,1]){
      const R=f(radius),impact=f(R*fraction),x=f(R*xFraction),actual=height(impact,x,R);
      const expected=Math.hypot(impact,x)-R;
      assert.ok(Number.isFinite(actual));
      assert.ok(Math.abs(actual-expected)<Math.max(1e-6,R*3e-7));
    }
});
