import assert from "node:assert/strict";
import test from "node:test";
import {layoutLabels} from "../../apps/web/js/labelLayout.js";
test("deterministic labels prioritize selection, preserve clearance and never move physics",()=>{
  const rows=Array.from({length:30},(_,i)=>({id:String(i).padStart(2,"0"),x:40+i%5*70,y:50+Math.floor(i/5)*45,width:60,height:18,priority:i===20?0:2}));
  const before=JSON.stringify(rows),a=layoutLabels(rows,{width:390,height:300}),b=layoutLabels([...rows].reverse(),{width:390,height:300});
  assert.deepEqual(a,b);assert.equal(a[0].id,"20");assert.ok(a.length<=8);assert.equal(JSON.stringify(rows),before);
  for(const r of a){assert.ok(r.x>=4&&r.y>=4&&r.x+r.width<=386&&r.y+r.height<=296);for(const other of a.filter(x=>x!==r))assert.ok(r.x+r.width+4<=other.x||other.x+other.width+4<=r.x||r.y+r.height+4<=other.y||other.y+other.height+4<=r.y);}
});
test("offscreen anchors are suppressed regardless of selection priority",()=>{
  for (const priority of [0,1,2,3,4]) {
    for (const [x,y] of [[-1,90],[321,90],[160,-1],[160,181]]) {
      assert.deepEqual(layoutLabels([{id:"body",priority,x,y,width:50,height:16}],{width:320,height:180}),[]);
    }
  }
});
test("visible edge anchors retain adjacent labels when there is room",()=>{
  for (const [x,y] of [[2,90],[318,90],[160,2],[160,178]]) {
    const result=layoutLabels([{id:"selected",priority:0,x,y,width:60,height:16}],{width:320,height:180});
    assert.equal(result.length,1);
    assert.equal(result[0].callout,false);
  }
});
test("crowded names are suppressed instead of detached into a corner list",()=>{
  const rows=Array.from({length:12},(_,i)=>({id:String(i),priority:i===0?0:1,x:160,y:90,width:70,height:16}));
  const result=layoutLabels(rows,{width:320,height:220,limit:12});
  assert.equal(result.length,2);
  assert.equal(result[0].id,"0");
  assert.ok(result.every(r=>!r.callout));
});
test("anchors behind jump controls do not produce detached overflow labels",()=>{
  const rows=["Sun","Mercury","Venus"].map((id,i)=>({id,priority:i,x:160+i,y:20+i,width:70,height:16}));
  assert.deepEqual(layoutLabels(rows,{width:320,height:220,topInset:72}),[]);
});
test("oversized text and invalid anchors cannot fabricate a placement",()=>{
  for(const edit of [{width:500},{x:NaN},{y:Infinity}]) {
    assert.deepEqual(layoutLabels([{id:"body",priority:0,x:160,y:90,width:60,height:16,...edit}],{width:320,height:180}),[]);
  }
});
test("the selected label stays beside a target near a canvas corner",()=>{
  const opts={width:956,height:612,topInset:72};
  for(const [x,y] of [[6,80],[950,80],[6,606],[950,606]]){
    const [box]=layoutLabels([{id:"Venus",priority:0,x,y,width:52,height:16}],opts);
    assert.ok(box,`selected label kept at ${x},${y}`);
    assert.ok(box.x>=4&&box.y>=76&&box.x+box.width<=952&&box.y+box.height<=608,"inside the canvas, below the jump bar");
    const gap=Math.hypot(Math.max(box.x-x,0,x-box.x-box.width),Math.max(box.y-y,0,y-box.y-box.height));
    assert.ok(gap<=16,`beside its target (${gap.toFixed(1)} px)`);
    assert.equal(box.callout,false);
  }
  // Unselected names near a corner stay suppressed rather than nudged.
  assert.deepEqual(layoutLabels([{id:"Mercury",priority:2,x:6,y:80,width:52,height:16}],opts),[]);
});
