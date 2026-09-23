import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStrandInstances, gaussianIntegral} from '../../apps/web/js/solarStrandRenderer.js';
test('Gaussian integral agrees with independent midpoint quadrature including axial ray',()=>{
  for(const [a,b,c,l,h] of [[1,0,0,-4,4],[200,3,1,-.1,.2],[0,0,2,0,3],[.000001,.0001,2,-1,1]]){
    let expected=0; const n=100000,dt=(h-l)/n;
    for(let i=0;i<n;i++){const t=l+(i+.5)*dt;expected+=Math.exp(-a*t*t-2*b*t-c)*dt;}
    assert.ok(Math.abs(gaussianIntegral(a,b,c,l,h)-expected)<2e-6,`${a}: ${expected}`);
  }
});
const strand={classification:'closed',emission_relative:1,points:[[1,0,0,.008],[1,.1,0,.008],[1,.3,0,.008]],pulse:{onset_s:0,duration_s:1800,speed_R_per_s:.0002,amplitude:.3,width_R:.04}};
test('instances preserve ordered arc and pulse; incomplete omitted',()=>{
  const r=buildStrandInstances({strands:[strand,{...strand,classification:'incomplete'}]});
  assert.equal(r.length,32);assert.ok(Math.abs(r[28]-.1)<1e-7);assert.equal(r[9],1800);
});
test('invalid packet and budget fail closed',()=>{
  assert.throws(()=>buildStrandInstances({strands:[{...strand,points:[[1,0,0,0],[1,1,0,.008]]}]}));
  assert.throws(()=>buildStrandInstances({strands:Array(8193).fill(strand)}));
});
test('spatial emission profile modulates each segment without changing geometry or pulse coordinates',()=>{
  const base=buildStrandInstances({strands:[strand]});
  const varied=buildStrandInstances({strands:[{...strand,emissivity_gain:[0,.2,.8]}]});
  assert.ok(Math.abs(varied[7]/base[7]-.1)<1e-7);
  assert.ok(Math.abs(varied[23]/base[23]-.5)<1e-7);
  for(let i=0;i<base.length;i++)if(i!==7&&i!==23)assert.equal(varied[i],base[i]);
  for(const gains of [[1],[-.1,1,1],[1,NaN,1],[1,2,1]])assert.throws(()=>buildStrandInstances({strands:[{...strand,emissivity_gain:gains}]}),/profile/);
});
