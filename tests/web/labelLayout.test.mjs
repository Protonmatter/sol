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
test("crowded inner-planet labels still place beside the Sun instead of disappearing",()=>{
  const rows=["Sun","Mercury","Venus","Earth"].map((id,i)=>({id,priority:id==="Sun"?0:2,x:160+i,y:90+i,width:70,height:16}));
  rows.push({id:"Iapetus",priority:3,x:162,y:92,width:70,height:16});
  const result=layoutLabels(rows,{width:320,height:180,limit:4});
  const ids=result.map(r=>r.id);
  assert.ok(ids.includes("Mercury"));
  assert.ok(ids.includes("Venus"));
  assert.ok(!ids.includes("Iapetus"),"an outer moon must not take a planet's last slot");
});
test("overflow planet callouts stay below a reserved top inset",()=>{
  const rows=["Sun","Mercury","Venus"].map((id,i)=>({id,priority:id==="Sun"?0:2,x:160+i,y:20+i,width:70,height:16}));
  const result=layoutLabels(rows,{width:320,height:220,limit:3,topInset:72});
  const venus=result.find(r=>r.id==="Venus");
  const mercury=result.find(r=>r.id==="Mercury");
  assert.ok(venus&&venus.y>=76,"Venus must sit below the system-jump chips");
  assert.ok(mercury&&mercury.y>=76,"Mercury must sit below the system-jump chips");
});
test("focused-system moons keep callouts so a crowded Saturn system stays named",()=>{
  const rows=["Saturn","Mimas","Enceladus","Tethys","Dione","Rhea","Titan","Iapetus"]
    .map((id,i)=>({id,priority:1,x:160+i,y:90+i,width:70,height:16}));
  const result=layoutLabels(rows,{width:320,height:220,limit:8});
  assert.equal(result.length,8);
  for (const id of rows.map(r=>r.id)) assert.ok(result.some(r=>r.id===id),id);
});
