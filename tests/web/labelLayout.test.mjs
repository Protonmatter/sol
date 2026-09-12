import assert from "node:assert/strict";
import test from "node:test";
import {layoutLabels} from "../../apps/web/js/labelLayout.js";
test("deterministic labels prioritize selection, preserve clearance and never move physics",()=>{
  const rows=Array.from({length:30},(_,i)=>({id:String(i).padStart(2,"0"),x:40+i%5*70,y:50+Math.floor(i/5)*45,width:60,height:18,priority:i===20?0:2}));
  const before=JSON.stringify(rows),a=layoutLabels(rows,{width:390,height:300}),b=layoutLabels([...rows].reverse(),{width:390,height:300});
  assert.deepEqual(a,b);assert.equal(a[0].id,"20");assert.ok(a.length<=8);assert.equal(JSON.stringify(rows),before);
  for(const r of a){assert.ok(r.x>=4&&r.y>=4&&r.x+r.width<=386&&r.y+r.height<=296);for(const other of a.filter(x=>x!==r))assert.ok(r.x+r.width+4<=other.x||other.x+other.width+4<=r.x||r.y+r.height+4<=other.y||other.y+other.height+4<=r.y);}
});
test("selected edge object gets a readable callout and offscreen objects are culled",()=>{
  const result=layoutLabels([{id:"selected",priority:0,x:2,y:2,width:500,height:20},{id:"off",priority:1,x:-1,y:20,width:20,height:20}],{width:320,height:180});
  assert.equal(result.length,1);assert.equal(result[0].id,"selected");assert.equal(result[0].callout,true);assert.ok(result[0].width<=312);
  assert.deepEqual(layoutLabels([],{width:1440,height:900}),[]);
});
