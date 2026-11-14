import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installFeedbackProbe} from '../../tools/startup_feedback.mjs';
import {interactionLatency} from '../../tools/startup_acceptance.mjs';
function fixture({style={},ancestorStyle={},rect={left:10,top:10,right:110,bottom:40,width:100,height:30}}={}){
  let clock=500;const listeners=new Map(),frames=[],state={feedback:[]};
  const defaults={display:'block',visibility:'visible',opacity:'1',overflowX:'visible',overflowY:'visible'};
  const ancestor={style:{...defaults,...ancestorStyle},parentElement:null},node={id:'viewTitle',textContent:'Solar research',parentElement:ancestor,style:{...defaults,...style},getClientRects:()=>[rect],getBoundingClientRect:()=>rect};
  const context=vm.createContext({task:{task:'research',selector:'#research',condition:'research'},window:{__solStartupProfile:state,innerWidth:1440,innerHeight:900},
    getComputedStyle:node=>node.style,performance:{now:()=>clock},requestAnimationFrame:fn=>frames.push(fn),document:{hidden:false,body:{dataset:{experience:'research'}},
      getElementById:()=>node,addEventListener:(_,fn,capture)=>{listeners.set(capture,fn);},removeEventListener(_,fn,capture){if(listeners.get(capture)===fn)listeners.delete(capture);}}});
  vm.runInContext(`(${installFeedbackProbe.toString()})(task)`,context);
  return {state,click(timeStamp){const event={timeStamp,isTrusted:true,target:{closest:()=>true}};listeners.get(true)(event);listeners.get(false)?.(event);},frame(ms=16){clock+=ms;frames.shift()?.();}};
}
test('trusted click queueing delay remains in interaction-to-visible-feedback latency',()=>{
  const f=fixture();f.click(0);f.frame();f.frame();const observation=f.state.feedback[0];
  assert.equal(observation.inputDelayMs,500);assert.equal(observation.paintTimeMs-observation.captureTimeMs,32);
  assert.equal(observation.durationMs,532);assert.equal(interactionLatency(observation),532);
  assert.ok(interactionLatency(observation)>200,'32ms handler-to-paint cannot conceal a500ms delivery delay');
});
test('an epoch timestamp cannot silently fall back to handler-delivery timing',()=>{
  const f=fixture();f.click(1700000000000);assert.equal(f.state.feedback[0].durationMs,null);assert.match(f.state.feedback[0].error,/clock domain/);
  assert.throws(()=>interactionLatency(f.state.feedback[0]));
});
test('a narrow claimed duration cannot override recorded input and paint timestamps',()=>{
  assert.throws(()=>interactionLatency({inputTimeMs:0,captureTimeMs:500,paintTimeMs:532,durationMs:32}),/duration/);
});
for(const [name,options] of [
  ['hidden visibility',{style:{visibility:'hidden'}}],['zero opacity',{style:{opacity:'0'}}],
  ['ancestor zero opacity',{ancestorStyle:{opacity:'0'}}],['ancestor display none',{ancestorStyle:{display:'none'}}],
  ['outside viewport',{rect:{left:1500,top:10,right:1600,bottom:40,width:100,height:30}}],
])test(`nonempty client rects do not certify ${name} feedback`,()=>{
  const f=fixture(options);f.click(0);f.frame(6000);f.frame();
  assert.equal(f.state.feedback[0].durationMs,null);assert.match(f.state.feedback[0].error,/visible feedback/);
});
