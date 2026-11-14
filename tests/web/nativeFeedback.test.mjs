import test from 'node:test';
import assert from 'node:assert/strict';
import {assessedFeedbackLatency} from '../../tools/native_feedback.mjs';
function fixture(){return {trusted:true,inputTimeMs:100,captureTimeMs:105,paintTimeMs:160,durationMs:60,domReadyInDispatch:true,feedbackVisible:true,domReadyAtMs:109,geometryConfirmedAtMs:120,
  nativeTiming:{supported:true,thresholdMs:16,source:'entry',matchCount:1,targetMatched:true,entry:{name:'click',startTime:100,duration:56,processingStart:105,processingEnd:110,interactionId:1}}};}
test('native rounding is bounded upward and cannot select a faster endpoint than the frame probe',()=>{
  const row=fixture();assert.equal(assessedFeedbackLatency(row),60);row.nativeTiming.entry.duration=112;assert.equal(assessedFeedbackLatency(row),116);
  row.paintTimeMs=300;row.durationMs=200;assert.equal(assessedFeedbackLatency(row),200);
});
test('a slow native rendering update cannot be hidden by a fast frame callback',()=>{
  const row=fixture();row.nativeTiming.entry.duration=424;assert.equal(assessedFeedbackLatency(row),428);assert.ok(assessedFeedbackLatency(row)>200);
});
test('an absent native entry cannot be inferred to be fast from aggregate click counts or a settled flag',()=>{
  const row=fixture();row.nativeTiming={supported:true,thresholdMs:16,source:'below-threshold',matchCount:0,entry:null,observationSettled:true,clickObserved:true};
  assert.throws(()=>assessedFeedbackLatency(row),/missing native|Unknown native/);
});
for(const [name,mutate]of [
  ['missing observer',x=>delete x.nativeTiming],['unsupported observer',x=>x.nativeTiming.supported=false],['wrong threshold',x=>x.nativeTiming.thresholdMs=104],
  ['asynchronous feedback',x=>x.domReadyInDispatch=false],['missing DOM checkpoint',x=>delete x.domReadyAtMs],['missing geometry',x=>delete x.geometryConfirmedAtMs],
  ['missing visible feedback',x=>delete x.feedbackVisible],
  ['duplicate native entry',x=>x.nativeTiming.matchCount=2],['wrong target',x=>x.nativeTiming.targetMatched=false],['wrong input timestamp',x=>x.nativeTiming.entry.startTime=200],
  ['wrong event',x=>x.nativeTiming.entry.name='pointerdown'],['invalid duration',x=>x.nativeTiming.entry.duration=NaN],['unrounded duration',x=>x.nativeTiming.entry.duration=57],
  ['no interaction',x=>x.nativeTiming.entry.interactionId=0],['invalid processing order',x=>x.nativeTiming.entry.processingEnd=90],['checkpoint after processing',x=>x.domReadyAtMs=150],
])test(`native admission rejects ${name}`,()=>{const row=fixture();mutate(row);assert.throws(()=>assessedFeedbackLatency(row));});
