/** Separate post-failure attribution, never an acceptance or renderer fallback.
 * Self-contained for page.evaluate. The optional environment is a CPU test seam.
 */
export async function collectFrameCostDiagnostic(options={},environment=null){
  const limits={frames:2,samplingMs:15000,drainMs:3000,draws:160,programs:20};
  for(const key of Object.keys(options))if(!(key in limits))throw new Error('Unknown frame diagnostic option');
  for(const [key,value] of Object.entries(options)){
    if(!Number.isInteger(value)||value<1||value>limits[key])throw new Error('Frame diagnostic limit exceeded');
    limits[key]=value;
  }
  let env=environment;
  if(!env){
    const tag=document.querySelector('script[type="module"][src^="app.js"]'),token=tag?new URL(tag.src).search:'';
    const [{store},sphere,scattering]=await Promise.all([import(`./js/store.js${token}`),
      import(`./js/orreryShaders.js${token}`),import(`./js/atmosphereScattering.js${token}`)]);
    const canvas=document.getElementById('orreryCanvas');
    env={gl:canvas?.getContext('webgl2'),observer:globalThis.__solProgramSourceEvidence,
      now:()=>performance.now(),raf:fn=>requestAnimationFrame(fn),cancelRaf:id=>cancelAnimationFrame(id),
      later:(fn,ms)=>setTimeout(fn,ms),cancelLater:id=>clearTimeout(id),
      hash:async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join(''),
      expected:{generator:scattering.SCATTERING_GENERATOR_FS,'physical-surface':sphere.SCATTERING_SPHERE_FS,
        'physical-shell':scattering.ATMOSPHERE_SCATTERING_FS},
      readState:()=>JSON.parse(JSON.stringify({active:store.orrery.active,animate:store.orrery.animate,
        epoch:store.orrery.renderUnix,frame:store.orrery.scatteringFrame,scattering:store.orrery.scatteringStatus,
        optics:store.orrery.opticsStatus,programs:store.orrery.programStatus,terrain:store.orrery.terrainRendered,
        hdrEnabled:store.orrery.hdrEnabled,hdr:store.orrery.hdrStatus,canvas:[canvas.width,canvas.height]}))};
  }
  const gl=env.gl;
  const report={schema:'frame-cost-diagnostic.v1',status:'incomplete',limits,
    scope:'Post-failure instrumented replay; original failure/deadlines remain authoritative. API elapsed is not GPU time.',
    timer:{status:'unavailable',disjoint:false},api:{},draws:[],programs:[],heartbeats:[],errors:[],
    diagnosticQueriesMs:0,startedMs:env.now()};
  if(!gl||gl.isContextLost()){report.reason='No live application WebGL2 context';return report;}
  const names=['drawArrays','drawElements','useProgram','getParameter','isEnabled','getError','getUniform',
    'getUniformLocation','readPixels','clientWaitSync','checkFramebufferStatus','texImage2D','texSubImage2D',
    'bufferData','bufferSubData','bindFramebuffer','framebufferTexture2D','clear','clearBufferfv'];
  const originals=new Map(),descriptors=new Map(),installed=new Map(),stack=[];
  for(const name of names)if(typeof gl[name]==='function'){
    originals.set(name,gl[name]);descriptors.set(name,Object.getOwnPropertyDescriptor(gl,name));
  }
  const call=(name,...args)=>(originals.get(name)||gl[name]).apply(gl,args);
  let internal=0,active=true,rafId,timeoutId,pollId,resolveCapture,stopReason='';
  let programHint=null,ext=null,timerActive=null,frameNumber=0;
  const pending=[],programs=new Map(),sourceRecords=[],framebuffers=new Map(),uniformSnapshots=new Set();
  const ownQuery=fn=>{const started=env.now();internal++;try{return fn();}
    finally{internal--;report.diagnosticQueriesMs+=env.now()-started;}};
  const errorText=error=>error instanceof Error?error.message:String(error);
  const fail=error=>{if(report.errors.length<20)report.errors.push(errorText(error));};
  const snapshotState=()=>{try{return env.readState();}catch(error){fail(error);return null;}};
  const fbId=value=>{if(value===null)return 'default';if(!framebuffers.has(value))framebuffers.set(value,`fbo-${framebuffers.size+1}`);return framebuffers.get(value);};
  const getProgram=program=>{
    const observed=env.observer?.snapshot(gl,program),old=programs.get(program);
    if(old&&old.sequence===(observed?.sequence??null))return old;
    if(sourceRecords.length>=limits.programs)return {id:'program-limit',role:'unknown'};
    const sources=observed?.sources||[],fragment=sources.find(x=>x?.type===gl.FRAGMENT_SHADER)?.source;
    const role=Object.entries(env.expected||{}).find(([,source])=>typeof source==='string'&&fragment===source)?.[0]||'other';
    const record={id:`program-${sourceRecords.length+1}`,role,sequence:observed?.sequence??null,
      sourceIdentity:observed?'observed-link-source':'unavailable',sources};
    programs.set(program,record);sourceRecords.push(record);return record;
  };
  const readUniforms=(program,record,pass)=>{
    const key=`${record.id}:${frameNumber}:${pass}`;
    if(uniformSnapshots.has(key)||record.role==='other')return null;
    uniformSnapshots.add(key);
    const values={};
    for(const name of ['u_scatteringPass','u_scatteringReady','u_scatteringSurfaceSize','u_scatteringLimbSize',
      'u_scatteringHeightRange','u_atmosphereEnabled','u_atmosphereCameraKm','u_atmosphereSunDirection',
      'u_atmosphereRadiusKm','u_atmosphereTopKm','u_atmospherePolarRatio','u_atmosphereSolarScale','u_atmosphereExposure']){
      const location=call('getUniformLocation',program,name);
      if(location!==null){const value=call('getUniform',program,location);values[name]=ArrayBuffer.isView(value)?Array.from(value):value;}
    }
    return values;
  };
  const deleteQuery=query=>{try{gl.deleteQuery(query);}catch(error){fail(error);}};
  const pollQueries=()=>{
    if(!ext)return;
    try{
      if(call('getParameter',ext.GPU_DISJOINT_EXT))report.timer.disjoint=true;
      for(const item of pending){
        if(item.done)continue;
        if(gl.getQueryParameter(item.query,gl.QUERY_RESULT_AVAILABLE)){
          const value=gl.getQueryParameter(item.query,gl.QUERY_RESULT);
          if(Number.isFinite(value)&&value>=0)item.record.gpuElapsedNs=value;
          else item.record.timerError='Invalid timer result';
          item.done=true;deleteQuery(item.query);
        }
      }
    }catch(error){fail(error);report.timer.status='error';}
  };
  const stop=reason=>{if(!active)return;active=false;stopReason=reason;
    env.cancelRaf(rafId);env.cancelLater(timeoutId);resolveCapture?.();};
  try{
    report.initialState=snapshotState();
    ownQuery(()=>{
      programHint=call('getParameter',gl.CURRENT_PROGRAM);
      ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if(ext&&gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){
        report.timer.status='occupied';ext=null;
      }else if(ext)report.timer.status='available';
    });
    for(const [name,original] of originals){
      const wrapper=function(...args){
        if(this!==gl||internal||!active)return original.apply(this,args);
        const frame={childMs:0};stack.push(frame);let callElapsed=0;
        const stats=report.api[name]??={calls:0,inclusiveMs:0,exclusiveMs:0,maxMs:0,thrown:0};stats.calls++;
        const draw=name==='drawArrays'||name==='drawElements';let record=null,query=null;
        try{
          if(draw&&report.draws.length<limits.draws){
            try{ownQuery(()=>{
              const actual=call('getParameter',gl.CURRENT_PROGRAM),source=getProgram(actual);
              let pass=null;
              if(source.role==='generator'){
                const location=call('getUniformLocation',actual,'u_scatteringPass');
                pass=location===null?null:call('getUniform',actual,location);
              }
              record={index:report.draws.length,frame:frameNumber,method:name,count:args[name==='drawArrays'?2:1],
                program:source.id,role:source.role,pass,hintMatched:actual===programHint,
                framebuffer:fbId(call('getParameter',gl.DRAW_FRAMEBUFFER_BINDING)),viewport:Array.from(call('getParameter',gl.VIEWPORT)),
                uniforms:readUniforms(actual,source,pass),state:source.role==='generator'?snapshotState():null,startedMs:env.now()};
              report.draws.push(record);
              if(ext&&!timerActive&&!gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){
                query=gl.createQuery();
                if(query){try{gl.beginQuery(ext.TIME_ELAPSED_EXT,query);timerActive=query;}
                  catch(error){deleteQuery(query);query=null;fail(error);}}
              }
            });}catch(error){fail(error);}
          }
          const submittedAt=env.now();
          try{return original.apply(this,args);}
          finally{
            callElapsed=env.now()-submittedAt;if(record)record.apiElapsedMs=callElapsed;
            if(query){ownQuery(()=>{
              try{gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query,record,done:false});}
              catch(error){deleteQuery(query);record.timerError=errorText(error);fail(error);}
              finally{timerActive=null;}
            });}
            if(name==='useProgram')programHint=args[0];
          }
        }catch(error){stats.thrown++;throw error;}
        finally{
          stack.pop();stats.inclusiveMs+=callElapsed;
          stats.exclusiveMs+=callElapsed-frame.childMs;stats.maxMs=Math.max(stats.maxMs,callElapsed);
          if(stack.length)stack[stack.length-1].childMs+=callElapsed;
        }
      };
      gl[name]=wrapper;installed.set(name,wrapper);
    }
    await new Promise(resolve=>{
      resolveCapture=resolve;
      const heartbeat=timestamp=>{
        if(!active)return;
        report.heartbeats.push({timestamp,sampledMs:env.now()});frameNumber++;
        if(frameNumber>=limits.frames){stop('frame-limit');return;}
        rafId=env.raf(heartbeat);
      };
      timeoutId=env.later(()=>stop('sampling-deadline'),limits.samplingMs);rafId=env.raf(heartbeat);
    });
  }catch(error){fail(error);active=false;stopReason='diagnostic-error';}
  finally{
    active=false;env.cancelRaf(rafId);env.cancelLater(timeoutId);
    for(const [name,wrapper] of installed){
      if(gl[name]!==wrapper){fail(`Wrapper changed during diagnostic: ${name}`);continue;}
      try{const descriptor=descriptors.get(name);if(descriptor)Object.defineProperty(gl,name,descriptor);else delete gl[name];}
      catch(error){fail(error);}
    }
    if(timerActive){try{gl.endQuery(ext.TIME_ELAPSED_EXT);}catch(error){fail(error);}deleteQuery(timerActive);timerActive=null;}
  }
  // No timer polling while application draw wrappers are installed. No finish,
  // synchronous result request or waiting beyond this independent drain budget.
  const drainStart=env.now();
  try{
    if(ext){
      await new Promise(resolve=>{
        const poll=()=>{ownQuery(pollQueries);
          if(pending.every(item=>item.done)||env.now()-drainStart>=limits.drainMs){resolve();return;}
          pollId=env.later(poll,25);
        };poll();
      });
    }
  }finally{env.cancelLater(pollId);for(const item of pending)if(!item.done){item.record.timerPending=true;deleteQuery(item.query);}}
  if(ext)ownQuery(()=>{try{if(call('getParameter',ext.GPU_DISJOINT_EXT))report.timer.disjoint=true;}
    catch(error){fail(error);report.timer.status='error';report.timer.disjoint=true;}});
  if(report.timer.disjoint)for(const draw of report.draws){delete draw.gpuElapsedNs;draw.timerDisjoint=true;}
  report.timer.completed=pending.filter(x=>x.done).length;report.timer.pending=pending.filter(x=>!x.done).length;
  for(const record of sourceRecords){
    const sources=[];for(const source of record.sources){if(!source)continue;
      sources.push({type:source.type,sha256:typeof source.source==='string'?await env.hash(source.source):null});}
    report.programs.push({id:record.id,role:record.role,sequence:record.sequence,sourceIdentity:record.sourceIdentity,sources});
  }
  report.finalState=snapshotState();report.endedMs=env.now();report.elapsedMs=report.endedMs-report.startedMs;
  report.stopReason=stopReason;report.status=report.errors.length?'incomplete':'captured';
  return report;
}
