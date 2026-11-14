// Lab quantities only. CLS session definition: https://web.dev/articles/cls
import {interactionLatency,assessedFeedbackLatency} from './native_feedback.mjs';
import {assertBrowserBackend} from './browser_backend.mjs';
export {interactionLatency} from './native_feedback.mjs';
export function nearestRank(values,quantile){
  if(!Array.isArray(values)||!values.length||Array.from(values).some(value=>!Number.isFinite(value))||!Number.isFinite(quantile)||quantile<0||quantile>1)throw new RangeError('Finite nonempty percentile sample required');
  const ordered=[...values].sort((a,b)=>a-b);return ordered[Math.max(0,Math.ceil(quantile*ordered.length)-1)];
}
export function maximumSessionShift(shifts){
  if(!Array.isArray(shifts))throw new TypeError('Layout-shift observations required');
  for(const item of shifts)if(!item||!Number.isFinite(item.startTime)||item.startTime<0||!Number.isFinite(item.value)||item.value<0||typeof item.hadRecentInput!=='boolean')throw new TypeError('Invalid layout-shift observation');
  let beginning=0,previous=0,total=0,maximum=0;
  for(const item of [...shifts].sort((a,b)=>a.startTime-b.startTime)){
    if(item.hadRecentInput)continue;
    if(total===0||item.startTime>=previous+1000||item.startTime>=beginning+5000){beginning=item.startTime;total=0;}
    total+=item.value;previous=item.startTime;maximum=Math.max(maximum,total);
  }
  return maximum;
}
export function assessStartupProfile(input){
  const reasons=[],statistics={};
  if(!input||typeof input!=='object')return {passed:false,reasons:['missing declared profile'],statistics};
  const {expected,runs,calibration,protocol}=input;
  const check=(condition,reason)=>{if(!condition)reasons.push(reason);};
  check(typeof protocol?.expectedBrowser==='string'&&/^Chrome\/\d+\.\d+\.\d+\.\d+$/.test(protocol.expectedBrowser)
    &&input.browser===protocol.expectedBrowser&&protocol.pairs===10&&protocol.pageCpuSlowdown===4&&protocol.workerCpu==='native'
    &&protocol.viewport?.width===1440&&protocol.viewport?.height===900&&protocol.rateBytesPerSecond===200000&&protocol.latencyMs===150
    &&protocol.burstBytes===4096&&protocol.compression==='none'&&['swiftshader','swiftshader-fallback','native'].includes(protocol.backend)
    &&(protocol.backend!=='native'||typeof protocol.expectedRenderer==='string'&&protocol.expectedRenderer.length>0),'declared browser, graphics or lab protocol differs');
  check(input.sourceUnchanged===true,'source drift or missing source readback');check(input.artifactUnchanged===true,'artifact drift or missing artifact readback');
  check(input.workerObservationSettled===true,'worker observation setup did not settle before admission');
  check(Array.isArray(input.errors)&&!input.errors.length&&Array.isArray(input.cleanupErrors)&&!input.cleanupErrors.length,'campaign error, missing error capture or cleanup failure');
  check(calibration?.passed===true&&Array.isArray(calibration.errors)&&!calibration.errors.length&&calibration.rateBytesPerSecond===200000&&calibration.latencyMs===150&&calibration.burstBytes===4096
    &&JSON.stringify(calibration.clients)===JSON.stringify(['page','service_worker']),'aggregate page/SW calibration is invalid');
  if(!expected||!Array.isArray(runs)||!Array.isArray(expected.tasks)||!expected.tasks.length
    ||new Set(expected.tasks).size!==expected.tasks.length||!expected.tasks.every(task=>typeof task==='string'&&task.length>0)
    ||typeof expected.origin!=='string'||!Number.isSafeInteger(expected.width)||expected.width<=0||!Number.isSafeInteger(expected.height)||expected.height<=0
    ||!/^\/[A-Za-z0-9._/-]+$/.test(expected.imagePath)||!/^[0-9a-f]{64}$/.test(expected.imageSha256))return {passed:false,reasons:[...reasons,'missing or invalid declared profile'],statistics};
  check(runs.length===20,'exactly ten cold and ten warm runs required');
  for(const run of runs){
    if(!run||typeof run!=='object'){reasons.push('invalid run observation');continue;}
    const label=`${run.kind} ${run.pair}`;
    try{assertBrowserBackend(protocol?.backend,run.gpu);
      check(protocol.backend!=='native'||run.gpu.renderer===protocol.expectedRenderer,`${label}: native renderer differs from exact pin`);
    }catch{reasons.push(`${label}: actual application graphics backend missing or mismatched`);}
    let imagePath=null,imageOrigin=null,canonical=false;
    try{const imageURL=new URL(run.image?.src);imagePath=imageURL.pathname;imageOrigin=imageURL.origin;canonical=!imageURL.search&&!imageURL.hash;}catch{}
    check(run.lcp?.id==='observationImage'&&run.lcp.tag==='IMG'&&run.lcp.url===run.image?.src&&imagePath===expected.imagePath&&imageOrigin===expected.origin&&canonical
      &&Number.isFinite(run.lcp.startTime)&&run.lcp.startTime>0&&Number.isFinite(run.lcp.size)&&run.lcp.size>0,`${label}: wrong or absent meaningful IMG LCP`);
    check(run.image?.sha256===expected.imageSha256&&run.image.width===expected.width&&run.image.height===expected.height,`${label}: source or image quality differs`);
    check(run.install?.terminal===true&&run.install.coreComplete===true,`${label}: offline installation did not reach verified terminal state`);
    check(run.clsSupported===true,`${label}: CLS observer unsupported`);
    try{check(maximumSessionShift(run.shifts)<=.1,`${label}: CLS exceeds 0.1`);}catch{reasons.push(`${label}: invalid CLS observations`);}
    check(Array.isArray(run.errors)&&!run.errors.length&&Array.isArray(run.cleanupErrors)&&!run.cleanupErrors.length,`${label}: runtime/cleanup error or missing error capture`);
    check(Array.isArray(run.initialRequests)&&!run.initialRequests.some(url=>/\/(?:moonelements|starcatalog)\.js(?:[?#]|$)/.test(url)
      ||(url.includes('/textures/')&&!url.split('?')[0].endsWith(expected.imagePath))),`${label}: eager catalogue or planetary texture`);
    const feedback=run.feedback;
    check(Array.isArray(feedback)&&feedback.length===expected.tasks.length&&expected.tasks.every(task=>feedback.filter(item=>item.task===task).length===1)
      &&feedback.every(item=>item.trusted===true&&Number.isFinite(item.durationMs)&&item.durationMs>=0),`${label}: incomplete or untrusted feedback tasks`);
    try{for(const item of feedback)assessedFeedbackLatency(item);}catch(error){reasons.push(`${label}: invalid feedback evidence: ${String(error)}`);}
  }
  for(const kind of ['cold','warm']){
    const group=runs.filter(run=>run&&run.kind===kind),pairs=group.map(run=>run.pair).sort((a,b)=>a-b);
    check(JSON.stringify(pairs)===JSON.stringify([1,2,3,4,5,6,7,8,9,10]),`${kind}: missing or duplicate pair`);
    statistics[kind]={count:group.length,lcpP75Ms:null,feedbackP95Ms:null,maxCls:null,feedbackByTask:null};
    try{
      const lcpP75Ms=nearestRank(group.map(run=>run.lcp.startTime),.75);
      statistics[kind].lcpP75Ms=lcpP75Ms;check(lcpP75Ms<=2500,`${kind} LCP p75 exceeds 2500 ms`);
    }catch{reasons.push(`${kind}: incomplete image statistics`);}
    try{
      const maxCls=Math.max(...group.map(run=>maximumSessionShift(run.shifts)));
      if(!group.length)throw new Error('empty layout group');statistics[kind].maxCls=maxCls;
    }catch{reasons.push(`${kind}: incomplete layout statistics`);}
    try{
      const feedbackP95Ms=nearestRank(group.flatMap(run=>run.feedback.map(assessedFeedbackLatency)),.95);
      const feedbackByTask=Object.fromEntries(expected.tasks.map(task=>[task,{count:group.length,p95Ms:nearestRank(group.map(run=>assessedFeedbackLatency(run.feedback.find(item=>item.task===task))),.95)}]));
      Object.assign(statistics[kind],{feedbackP95Ms,feedbackByTask});check(feedbackP95Ms<=200,`${kind} feedback p95 exceeds 200 ms`);
      for(const task of expected.tasks)check(feedbackByTask[task].p95Ms<=200,`${kind} ${task} feedback p95 exceeds 200 ms`);
    }catch{reasons.push(`${kind}: incomplete feedback statistics`);}
  }
  check(runs.every(run=>run&&['cold','warm'].includes(run.kind)),'unknown run group');
  return {passed:reasons.length===0,reasons,statistics};
}
