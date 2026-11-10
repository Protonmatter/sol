import assert from 'node:assert/strict';
import test from 'node:test';
import * as checks from '../../tools/system_label_layout.mjs';

function fixture(count=17,width=900) {
  return {canvas:{x:100,y:200,width,clientWidth:Math.round(width),height:600},labels:Array.from({length:count},(_,i)=>({
    id:`body-${i}`,x:104+(i%4)*100,y:204+Math.floor(i/4)*30,width:60,height:16,
  }))};
}

test('System browser geometry accepts 17 through 24 desktop labels with the existing clearance',()=>{
  for(const count of [17,24]) assert.deepEqual(checks.assertSystemLabelLayout(fixture(count)),{count,limit:24,clearancePx:3.9});
  assert.throws(()=>checks.assertSystemLabelLayout(fixture(25)),/label count/);
  assert.throws(()=>checks.assertSystemLabelLayout(fixture(0)),/label count/);
});
test('System label caps follow the actual canvas width at the 600px breakpoint',()=>{
  for(const width of [320,599]) {
    const state=fixture(14,width);
    state.labels.forEach((label,i)=>{label.x=104+(i%2)*100;label.y=204+Math.floor(i/2)*30;});
    assert.equal(checks.assertSystemLabelLayout(state).limit,14);
    state.labels.push({...state.labels[0],id:'extra'});
    assert.throws(()=>checks.assertSystemLabelLayout(state),/label count/);
  }
  assert.equal(checks.assertSystemLabelLayout(fixture(24,600)).limit,24);
  assert.equal(checks.assertSystemLabelLayout(fixture(24,599.6)).limit,24,'599.6px DOMRect rounds to the renderer clientWidth of 600');
});
test('System label check rejects overlap, insufficient clearance and clipped labels',()=>{
  const state=fixture(2);
  for(const gap of [0,3.8]) {
    state.labels[1].x=state.labels[0].x+state.labels[0].width+gap;
    assert.throws(()=>checks.assertSystemLabelLayout(state),/label clearance/);
  }
  for(const edit of [{x:99},{y:199},{x:980},{y:790}]) {
    const clipped=fixture(1);Object.assign(clipped.labels[0],edit);
    assert.throws(()=>checks.assertSystemLabelLayout(clipped),/label bounds/);
  }
});
test('System label check rejects invalid dimensions, duplicate identities and nonfinite geometry',()=>{
  for(const edit of [{width:0},{height:-1},{x:NaN},{id:''}]) {
    const state=fixture(1);Object.assign(state.labels[0],edit);
    assert.throws(()=>checks.assertSystemLabelLayout(state));
  }
  const duplicate=fixture(2);duplicate.labels[1].id=duplicate.labels[0].id;
  assert.throws(()=>checks.assertSystemLabelLayout(duplicate),/duplicate label/);
  for(const edit of [{width:0},{height:Infinity},{x:NaN},{clientWidth:599.6},{clientWidth:0}]) {
    const state=fixture(1);Object.assign(state.canvas,edit);
    assert.throws(()=>checks.assertSystemLabelLayout(state),/canvas geometry/);
  }
});
