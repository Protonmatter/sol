// Optional validator-only observations. No application/runtime imports execute in Node.
import assert from 'node:assert/strict';
import {captureDeviceMemory} from './texture_device_telemetry.mjs';
import {assertBrowserBackend,captureBrowserCapabilities} from './browser_backend.mjs';
import {preparePhysicalSpinEvidence,waitForPhysicalSpinReadiness} from './physical_spin_probe.mjs';
import {collectSubmittedEarthSpin} from './earth_spin_probe.mjs';
import {prepareMarsTerrainEvidence} from './mars_terrain_probe.mjs';
import {assertMarsOpticalTerrainSpin} from './mars_spin_assertions.mjs';
import {requestContextRestoration} from './context_restore.mjs';

export function memoryRequested(args){
  const options=args.filter(value=>value==='--memory'||value.startsWith('--memory='));
  assert.ok(options.length<=1&&options.every(value=>value==='--memory'),'--memory is a single flag without a value');
  return options.length===1;
}

/** Sampling is impossible before original acceptance, or during protected work.
 * The explicit lock also rejects reentrant/parallel sampling or preparation.
 */
export function createMemoryCheckpointRecorder({browser,save=()=>{},capture=captureDeviceMemory,now=()=>performance.now()}){
  const evidence={schema_version:'full-feature-memory.v1',status:'running',original_gates:null,windows:[],checkpoints:[],
    basis:'OS process and WDDM observations from owned browser PIDs; not attributable texture VRAM or physical residency.',
    limitations:['Missing counters remain unavailable, never zero. Working-set sums may share pages.',
      'Actual draw proof precedes sampling; feature states bracket sampling. This does not prove every frame in the sampling interval.',
      'Memory sampling is excluded from the original performance gates and adds measurement overhead.']};
  let active=null,completed=false,cancelled=false;
  const originalGatesCompleted=receipt=>{
    assert.equal(active,null,'Cannot finish original gates during observation');
    assert.equal(completed,false,'Original gates already completed');
    assert.equal(receipt?.passed,true,'Memory follow-up requires all original gates to pass');
    completed=true;evidence.original_gates={...receipt,completed_monotonic_ms:now()};save(evidence);
  };
  const protectedWork=async(label,work)=>{
    assert.equal(cancelled,false,'Memory follow-up cancelled');
    assert.ok(completed,'Original gates have not completed');assert.equal(active,null,'Memory/protected work overlaps');
    active=label;const window={label,started_monotonic_ms:now(),passed:false};evidence.windows.push(window);
    try{const value=await work();assert.equal(cancelled,false,'Memory follow-up cancelled');window.passed=true;return value;}
    finally{window.ended_monotonic_ms=now();active=null;save(evidence);}
  };
  const checkpoint=async(label,{page,scope=null,before=null,after=null,proof=null}={})=>{
    assert.equal(cancelled,false,'Memory follow-up cancelled');
    assert.ok(completed,'Original gates have not completed');assert.equal(active,null,'Memory/protected work overlaps');
    active='memory';const item={label,scope,proof,started_monotonic_ms:now()};evidence.checkpoints.push(item);
    try{
      if(before)item.before=await before();
      assert.equal(cancelled,false,'Memory follow-up cancelled');
      item.observation=await capture(browser,{label,page,includeDevices:evidence.checkpoints.length===1});
      assert.equal(cancelled,false,'Memory follow-up cancelled');
      if(after)item.after=await after();
      return item;
    }finally{item.finished_monotonic_ms=now();active=null;save(evidence);}
  };
  return {evidence,originalGatesCompleted,protectedWork,checkpoint,cancel:()=>{cancelled=true;}};
}

export async function readMemoryFeatureState(){
  const entry=document.querySelector('script[type="module"][src^="app.js"]');
  const {store}=await import(`./js/store.js${entry?new URL(entry.src).search:''}`),s=store.orrery;
  const gl=document.getElementById('orreryCanvas').getContext('webgl2');
  return JSON.parse(JSON.stringify({sampled_ms:performance.now(),active:s.active,anchor:s.anchor,selected:s.selected,
    animate:s.animate,textures:s.useTextures,terrain:s.terrainEnabled,optics:s.opticsEnabled,hdr:s.hdrEnabled,
    context_lost:gl.isContextLost(),hidden:document.hidden,engine_error:s.engineError,
    hdr_status:s.hdrStatus,optics_status:s.opticsStatus,terrain_status:s.terrainStatus,
    terrain_rendered:s.terrainRendered,scattering_frame:s.scatteringFrame,scattering_status:s.scatteringStatus,
    program_status:s.programStatus,program_diagnostics:s.programDiagnostics,epoch:s.renderUnix,
    canvas:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight}}));
}

export function assertMemoryFeatureState(state,body,generation){
  for(const key of ['active','animate','textures','terrain','optics','hdr'])assert.equal(state[key],true,`Memory scope requires ${key}`);
  assert.equal(state.anchor,body);assert.equal(state.context_lost,false);assert.equal(state.hidden,false);
  assert.ok(!state.engine_error);assert.equal(state.optics_status?.[body],'ready');
  assert.equal(state.hdr_status?.state,'ready');assert.ok(state.hdr_status?.presented);
  assert.equal(state.scattering_status?.[body]?.state,'submitted');
  assert.equal(state.scattering_frame?.contextGeneration,generation,'Memory scope changed graphics context');
  if(body==='Mars'){assert.equal(state.terrain_status?.Mars,'ready');assert.equal(state.terrain_rendered?.Mars,true);}
  return state;
}

export function assertMemoryDrawProof(probe,body){
  assert.equal(probe.subjectBody,body);assert.equal(probe.sampleError,'');
  assert.ok(probe.samples?.length>=3,'Memory scope needs three actual final physical draws');
  assert.ok(probe.initialState?.animate&&probe.initialState?.hdrEnabled);
  const epochs=new Set();
  for(const sample of probe.samples){
    assert.ok(sample.elapsedMs>=0&&sample.elapsedMs<=5000,'Memory proof accepted a late draw');
    assert.ok(Number.isFinite(sample.epoch)&&!epochs.has(sample.epoch),'Memory proof repeated an epoch');epochs.add(sample.epoch);
    assert.ok(sample.physical?.passed&&sample.physical.body===body&&sample.physical.scattering?.passed,'Missing actual current producer proof');
    assert.ok(sample.presentation&&sample.presentation.epoch===sample.epoch,'Missing matching final HDR draw');
    assert.equal(sample.presentation.generation,sample.physical.scattering.frame.contextGeneration);
  }
  for(const key of ['physicalRejected','presentationMismatch','gpuMismatch','lateReadbacks'])assert.equal(probe.drawCounts[key],0,`Memory proof ${key}`);
  assert.ok(probe.samples.some(sample=>sample.model.some((v,i)=>v!==probe.samples[0].model[i])),'Memory proof model is frozen');
  if(body==='Mars')assertMarsOpticalTerrainSpin(probe);
  return probe.samples.at(-1).physical.scattering.frame.contextGeneration;
}

async function prepareMemoryProof(page,body,{restored=false}={}){
  const budget=await page.evaluate(()=>{const systemStartedMs=performance.now();return {systemStartedMs,deadlineMs:systemStartedMs+75000};});
  await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  await page.evaluate(async({body,restored})=>{
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import('./js/store.js'+q),s=store.orrery;
    const toggle=(id,value)=>{const el=document.getElementById(id);if(el.checked!==value){el.checked=value;el.dispatchEvent(new Event('change'));}};
    toggle('orreryAnimate',false);toggle('orreryTextures',true);toggle('orreryTerrain',true);toggle('orreryOptics',true);
    s.hdrEnabled=true;
    if(!restored){const anchor=document.getElementById('orreryAnchor');anchor.value=body;anchor.dispatchEvent(new Event('change'));if(body==='Mars')s.radius*=.35;}
    document.getElementById('orrerySize').dispatchEvent(new Event('input'));
  },{body,restored});
  // Source/status wait is preparation only; actual current GPU proof below is mandatory.
  const remaining=await page.evaluate(deadline=>deadline-performance.now(),budget.deadlineMs);
  assert.ok(remaining>0,'Memory source preparation exceeded 75 seconds');
  await page.waitForFunction(async body=>{
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import('./js/store.js'+q),s=store.orrery;
    return s.opticsStatus?.[body]==='ready'&&s.hdrStatus?.state==='ready'&&(body!=='Mars'||s.terrainStatus?.Mars==='ready'&&s.terrainRendered?.Mars);
  },{timeout:Math.floor(remaining),polling:100},body);
  const preparation=await page.evaluate(preparePhysicalSpinEvidence,{body,terrain:body==='Mars'});
  const terrain=body==='Mars'?await page.evaluate(prepareMarsTerrainEvidence):null;
  await page.$eval('#orrerySpeedPresets button[data-dps="7"]',button=>button.click());
  await page.evaluate(()=>{const el=document.getElementById('orreryAnimate');el.checked=true;el.dispatchEvent(new Event('change'));});
  const readiness=await page.evaluate(waitForPhysicalSpinReadiness,{body,...budget});
  assert.ok(readiness.passed,`Memory physical readiness: ${readiness.reason}`);
  const probe=await page.evaluate(collectSubmittedEarthSpin,{body,physicalEvidence:true,requireTerrainEvidence:body==='Mars'});
  assertMemoryDrawProof(probe,body);
  return {scope:'Separate optional memory preparation, after all original gates; original readiness helper and five-second collector reused unchanged.',preparation,terrain,readiness,probe};
}

async function restoreMemoryContext(page){
  await page.evaluate(()=>{
    globalThis.__solMarsTerrainEvidence?.dispose();
    const el=document.getElementById('orreryAnimate');el.checked=false;el.dispatchEvent(new Event('change'));
    const canvas=document.getElementById('orreryCanvas'),context=canvas.getContext('webgl2'),extension=context.getExtension('WEBGL_lose_context');
    if(!extension)throw new Error('Memory restoration extension unavailable');
    window.__physicalExpectedContextLoss=true;window.__physicalLoss={canvas,context,extension,observed:false,lossMs:null};
    canvas.addEventListener('webglcontextlost',()=>{window.__physicalLoss.observed=true;window.__physicalLoss.lossMs=performance.now();},{once:true});extension.loseContext();
  });
  await page.waitForFunction(()=>window.__physicalLoss.observed,{timeout:5000,polling:100});
  return page.evaluate(requestContextRestoration,{timeoutMs:10000});
}

/** Called only after the complete original tool acceptance (including its timer).
 * Each preparation has 75s, native restore has 10s, each draw collector has 5s;
 * each existing OS collector has 15s. The caller retains browser cleanup.
 */
export async function runFullFeatureMemoryCheckpoints({browser,page,body,backend,originalReceipt,save}){
  assert.ok(['Earth','Mars'].includes(body));
  const recorder=createMemoryCheckpointRecorder({browser,save});
  recorder.originalGatesCompleted(originalReceipt);
  const run=async()=>{
  await recorder.checkpoint('original-gates-complete',{page,scope:'Baseline after all original application gates; no full-feature assertion',before:()=>page.evaluate(readMemoryFeatureState)});
  let previousGeneration;
  try{
    for(const restored of [false,true]){
      const label=restored?'full-features-context-restored':'full-features-active';
      const proof=await recorder.protectedWork(label+'-preparation',async()=>{
        const restoration=restored?await restoreMemoryContext(page):null;
        const result=await prepareMemoryProof(page,body,{restored});
        if(restoration){
          assert.ok(restoration.event_ms-restoration.request_ms<=10000,'Memory native restore exceeded its unchanged limit');
          await page.evaluate(()=>{window.__physicalExpectedContextLoss=false;});
        }
        return {...result,restoration};
      });
      const generation=assertMemoryDrawProof(proof.probe,body);
      if(restored)assert.ok(generation>previousGeneration,'Restoration reused the old graphics generation');
      previousGeneration=generation;
      const capabilities=await page.evaluate(captureBrowserCapabilities);assertBrowserBackend(backend,capabilities);proof.capabilities=capabilities;
      const snapshot=async()=>assertMemoryFeatureState(await page.evaluate(readMemoryFeatureState),body,generation);
      await recorder.checkpoint(label,{page,scope:{body,terrain_actual:body==='Mars',earth_terrain_supported:false},proof,before:snapshot,after:snapshot});
    }
    await recorder.protectedWork('leave-system',async()=>{
      await page.click('[data-mode="sky"]');
      await page.waitForFunction(async()=>{const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;const {store}=await import('./js/store.js'+q);return !store.orrery.active;},{timeout:10000});
    });
    await recorder.checkpoint('system-exited',{page,before:()=>page.evaluate(readMemoryFeatureState)});
    await page.close();
    await recorder.checkpoint('application-page-closed',{scope:'Fresh owned PID discovery after page closure; browser process remains alive'});
    return recorder.evidence;
  }finally{if(!page.isClosed())await page.evaluate(()=>globalThis.__solMarsTerrainEvidence?.dispose());}
  };
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
    recorder.cancel();reject(new Error('Optional memory follow-up exceeded its separate 300 second deadline'));
  },300000);});
  try{const result=await Promise.race([run(),deadline]);recorder.evidence.status='passed';return result;}
  catch(error){recorder.evidence.status='failed';recorder.evidence.failure=error.message;throw error;}
  finally{clearTimeout(timer);recorder.cancel();save(recorder.evidence);}
}
