// Synthetic acceptance fixtures; these are not observed product measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import {maximumSessionShift,nearestRank,assessStartupProfile} from '../../tools/startup_acceptance.mjs';
const shift=(startTime,value,hadRecentInput=false)=>({startTime,value,hadRecentInput});
test('CLS uses its largest session, ignores recent input and preserves window boundaries',()=>{
  assert.ok(Math.abs(maximumSessionShift([shift(0,.04),shift(900,.03),shift(1800,.02),shift(7000,.05)])-.09)<1e-12);
  assert.equal(maximumSessionShift([shift(0,.04),shift(1000,.05)]),.05);
  assert.ok(Math.abs(maximumSessionShift([0,900,1800,2700,3600,4500].map(time=>shift(time,.01)).concat(shift(5000,.05)))-.06)<1e-12);
  assert.equal(maximumSessionShift([shift(0,.02),shift(500,1,true),shift(1900,.03)]),.03);
  assert.equal(maximumSessionShift([shift(0,.02),shift(900,0),shift(1800,.03)]),.05);
});
test('nearest-rank percentiles and malformed metric inputs are explicit',()=>{
  assert.equal(nearestRank([10,9,8,7,6,5,4,3,2,1],.75),8);assert.equal(nearestRank([1,2,3],.95),3);
  for(const values of [[],[NaN],[Infinity],[1,,3]])assert.throws(()=>nearestRank(values,.75));
  assert.throws(()=>nearestRank([1],1.1));assert.throws(()=>maximumSessionShift([shift(0,NaN)]));assert.throws(()=>maximumSessionShift([{startTime:0,value:0}]));
});
function fixture(){
  const expected={origin:'http://127.0.0.1:1234',imagePath:'/sol/releases/fixed/textures/sun.jpg',imageSha256:'a'.repeat(64),width:1024,height:1024,tasks:['summary','sky']};
  const runs=[];
  for(let pair=1;pair<=10;pair++)for(const kind of ['cold','warm'])runs.push({pair,kind,lcp:{id:'observationImage',tag:'IMG',url:'http://127.0.0.1:1234'+expected.imagePath,startTime:kind==='cold'?2000:300,size:500000},
    gpu:{renderer:'ANGLE (Google, SwiftShader Device, Vulkan)'},
    image:{src:'http://127.0.0.1:1234'+expected.imagePath,width:1024,height:1024,sha256:expected.imageSha256},
    clsSupported:true,shifts:[],install:{terminal:true,coreComplete:true},initialRequests:[],
    feedback:expected.tasks.map(task=>({task,trusted:true,inputTimeMs:100,captureTimeMs:105,paintTimeMs:160,durationMs:60,domReadyInDispatch:true,feedbackVisible:true,domReadyAtMs:109,geometryConfirmedAtMs:120,
      nativeTiming:{supported:true,thresholdMs:16,source:'entry',matchCount:1,targetMatched:true,entry:{name:'click',startTime:100,duration:56,processingStart:105,processingEnd:110,interactionId:1}}})),errors:[],cleanupErrors:[]});
  return {expected,runs,workerObservationSettled:true,browser:'Chrome/156.0.8078.80',protocol:{expectedBrowser:'Chrome/156.0.8078.80',pairs:10,backend:'swiftshader',viewport:{width:1440,height:900},pageCpuSlowdown:4,workerCpu:'native',rateBytesPerSecond:200000,latencyMs:150,burstBytes:4096,compression:'none'},
    calibration:{passed:true,errors:[],rateBytesPerSecond:200000,latencyMs:150,burstBytes:4096,clients:['page','service_worker']},sourceUnchanged:true,artifactUnchanged:true,errors:[],cleanupErrors:[]};
}
test('complete declared samples retain separate cold and warm percentiles',()=>{
  const result=assessStartupProfile(fixture());assert.equal(result.passed,true);assert.equal(result.statistics.cold.lcpP75Ms,2000);assert.equal(result.statistics.warm.lcpP75Ms,300);assert.equal(result.statistics.cold.feedbackP95Ms,60);
});
for(const [name,mutate]of [
  ['missing run',value=>value.runs.pop()],['duplicate pair',value=>value.runs[0].pair=2],
  ['wrong LCP element',value=>value.runs[0].lcp.id='heading'],['wrong image URL',value=>value.runs[0].lcp.url+='?alternate'],
  ['reduced quality',value=>value.runs[0].image.width=512],['wrong source hash',value=>value.runs[0].image.sha256='b'.repeat(64)],
  ['nonfinite timing',value=>value.runs[0].lcp.startTime=NaN],['unsupported CLS',value=>value.runs[0].clsSupported=false],
  ['layout shift',value=>value.runs[0].shifts=[shift(0,.2)]],['missing task',value=>value.runs[0].feedback.pop()],
  ['duplicate task',value=>value.runs[0].feedback[1].task='summary'],['untrusted input',value=>value.runs[0].feedback[0].trusted=false],
  ['late page error',value=>value.runs[0].errors.push('late exception')],['failed cleanup',value=>value.cleanupErrors.push('close failed')],
  ['source drift',value=>value.sourceUnchanged=false],['artifact drift',value=>value.artifactUnchanged=false],
  ['missing error capture',value=>delete value.runs[0].errors],['missing campaign error capture',value=>delete value.errors],
  ['different origin',value=>{value.runs[0].image.src=value.runs[0].image.src.replace(':1234',':9999');value.runs[0].lcp.url=value.runs[0].image.src;}],
  ['image URL fragment',value=>{value.runs[0].image.src+='#alternative';value.runs[0].lcp.url=value.runs[0].image.src;}],
  ['invalid task declaration',value=>value.expected.tasks=['summary','summary']],
  ['incomplete install',value=>value.runs[0].install.coreComplete=false],['bad calibration',value=>value.calibration.passed=false],
  ['wrong network model',value=>value.calibration.rateBytesPerSecond=1000000],['no SW calibration',value=>value.calibration.clients=['page']],
  ['late calibration error',value=>value.calibration.errors.push('late worker failure')],
  ['eager full catalogue',value=>value.runs[0].initialRequests.push('/sol/releases/fixed/js/moonelements.js')],
  ['eager planetary texture',value=>value.runs[0].initialRequests.push('/sol/releases/fixed/textures/earth.jpg')],
])test(`acceptance rejects ${name}`,()=>{const value=fixture();mutate(value);assert.equal(assessStartupProfile(value).passed,false);});
for(const [name,mutate]of [
  ['missing protocol',v=>delete v.protocol],['wrong browser',v=>v.browser='Chrome/another'],['missing browser pin',v=>delete v.protocol.expectedBrowser],
  ['different CPU rate',v=>v.protocol.pageCpuSlowdown=1],['different viewport',v=>v.protocol.viewport.width=800],['different worker policy',v=>v.protocol.workerCpu='4x'],
  ['different body network rate',v=>v.protocol.rateBytesPerSecond=1e6],['unknown graphics backend',v=>v.protocol.backend='auto'],
  ['missing actual GPU',v=>delete v.runs[0].gpu],['software substituted for requested native',v=>{v.protocol.backend='native';v.protocol.expectedRenderer=v.runs[0].gpu.renderer;}],
  ['unjoined worker observation',v=>delete v.workerObservationSettled],
  ['native substituted for requested software',v=>v.runs[0].gpu.renderer='ANGLE (Qualcomm, Adreno D3D11)'],
])test(`profile identity rejects ${name}`,()=>{const value=fixture();mutate(value);assert.equal(assessStartupProfile(value).passed,false);});
test('an exact native renderer cohort remains separately identified',()=>{
  const value=fixture();value.protocol.backend='native';value.protocol.expectedRenderer='ANGLE (Qualcomm, Adreno D3D11)';
  for(const run of value.runs)run.gpu.renderer=value.protocol.expectedRenderer;
  assert.equal(assessStartupProfile(value).passed,true);
  value.protocol.expectedRenderer='ANGLE (Intel, different GPU)';assert.equal(assessStartupProfile(value).passed,false);
});
test('warm timing cannot conceal a failed cold percentile or cold feedback',()=>{
  const value=fixture();for(const run of value.runs)if(run.kind==='cold'){run.lcp.startTime=2700;run.feedback[0].durationMs=230;run.feedback[0].paintTimeMs=330;}
  const result=assessStartupProfile(value);assert.equal(result.passed,false);assert.equal(result.statistics.warm.lcpP75Ms,300);assert.ok(result.reasons.some(reason=>reason.includes('cold LCP')));assert.ok(result.reasons.some(reason=>reason.includes('cold feedback')));
});
test('inconclusive feedback fails while retaining independently valid image and layout statistics',()=>{
  const value=fixture();value.runs[0].feedback[0].nativeTiming.source='missing';
  const result=assessStartupProfile(value);assert.equal(result.passed,false);
  assert.equal(result.statistics.cold.lcpP75Ms,2000);assert.equal(result.statistics.cold.maxCls,0);
  assert.equal(result.statistics.cold.feedbackP95Ms,null);assert.equal(result.statistics.warm.feedbackP95Ms,60);
});


test('actual software fallback is separately identified and retains the 200ms acceptance gate',()=>{
  const value=fixture();value.protocol.backend='swiftshader-fallback';
  for(const run of value.runs)run.gpu.browser_feature_status={gpu_compositing:'disabled_software',rasterization:'disabled_software','2d_canvas':'unavailable_software'};
  assert.equal(assessStartupProfile(value).passed,true);
  delete value.runs[0].gpu.browser_feature_status;assert.equal(assessStartupProfile(value).passed,false);
  value.runs[0].gpu.browser_feature_status=value.runs[1].gpu.browser_feature_status;
  for(const run of value.runs){run.feedback[0].durationMs=250;run.feedback[0].paintTimeMs=350;}
  assert.equal(assessStartupProfile(value).passed,false);
});


test('a slow declared action cannot hide below a passing aggregate percentile',()=>{
  const value=fixture(),sample=value.runs.find(run=>run.kind==='warm').feedback[0];
  sample.durationMs=250;sample.paintTimeMs=350;
  const result=assessStartupProfile(value);
  assert.equal(result.statistics.warm.feedbackP95Ms,60,'the aggregate deliberately masks the one slow action');
  assert.equal(result.statistics.warm.feedbackByTask.summary.p95Ms,250);
  assert.equal(result.passed,false,'each declared action must meet the same 200ms target');
  assert.ok(result.reasons.includes('warm summary feedback p95 exceeds 200 ms'));
});
