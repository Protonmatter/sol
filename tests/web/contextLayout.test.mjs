import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as context from '../../tools/context_layout.mjs';

function node(id,{intentional=false,cssHidden=false,left=10,right=100}={}){
  const rect={width:intentional||cssHidden?0:right-left,left,right};
  return{id,textContent:id,closest:()=>intentional?{id:'sunControls'}:null,
    getClientRects:()=>intentional||cssHidden?[]:[rect],getBoundingClientRect:()=>rect};
}
function read({controls=[],mandatory=[node('nav')],visible=true,scrollWidth=320}={}){
  assert.equal(typeof context.readContextLayout,'function');
  const sandbox={innerWidth:320,document:{documentElement:{scrollWidth},
    querySelectorAll:selector=>selector==='#destinationOverview button:not([hidden])'?controls:mandatory,
    getElementById:()=>({getClientRects:()=>visible?[{}]:[]})}};
  const result=vm.runInNewContext(`(${context.readContextLayout.toString()})({requiredControls:'.nav',visibleIds:['title']})`,sandbox);
  return JSON.parse(JSON.stringify(result));
}
test('intentional hidden Sun controls are excluded while visible context and navigation remain checked',()=>{
  const result=read({controls:[node('location'),node('sunPlay',{intentional:true})]});
  assert.deepEqual(result.layout,{overflow:false,clipped:[],visible:true});
  assert.deepEqual(result.hiddenContextControls,[{id:'sunPlay',hiddenAncestor:'sunControls'}]);
});
test('accidentally CSS-hidden context actions fail even when their client-rect population is empty',()=>{
  for(const id of ['destinationLocation','destinationTime','destinationDetails'])
    assert.deepEqual(read({controls:[node(id,{cssHidden:true})]}).layout.clipped,[id]);
});
test('hidden or overflowing required navigation and visible overflowing context actions fail',()=>{
  assert.deepEqual(read({mandatory:[node('nav',{intentional:true})]}).layout.clipped,['nav']);
  assert.deepEqual(read({mandatory:[node('jump',{cssHidden:true})]}).layout.clipped,['jump']);
  assert.deepEqual(read({controls:[node('details',{right:330})]}).layout.clipped,['details']);
  assert.deepEqual(read({mandatory:[node('nav',{left:-1})]}).layout.clipped,['nav']);
});
test('page overflow and absent required context evidence remain failures',()=>{
  assert.equal(read({scrollWidth:323}).layout.overflow,true);
  assert.equal(read({visible:false}).layout.visible,false);
});
