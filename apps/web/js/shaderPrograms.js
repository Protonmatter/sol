// Bounded context-owned WebGL programs. Completion polling never asks the driver
// for compile/link status until KHR_parallel_shader_compile reports completion.
export function createShaderPrograms(gl, {
  generation=0,capacity=8,timeoutMs=30000,now=()=>performance.now(),
  schedule=callback=>requestAnimationFrame(callback),cancel=handle=>cancelAnimationFrame(handle),
  onChange=(_key,_status)=>{},
}={}) {
  if(!Number.isSafeInteger(generation)||generation<0||!Number.isInteger(capacity)||capacity<1||capacity>16
    ||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>30000)throw new Error('Invalid shader program resource budget');
  const extension=gl.getExtension('KHR_parallel_shader_compile');
  const parallel=extension&&Number.isFinite(extension.COMPLETION_STATUS_KHR)?extension:null;
  const entries=new Map();let frame=null,pollGeneration=0,disposed=false;
  const snapshot=entry=>({key:entry.key,generation,status:disposed?'cancelled':entry.status,error:entry.error,
    notificationError:entry.notificationError,parallel:!!parallel});
  function describeError(error){
    try{return String(error?.message??error).slice(0,400);}
    catch{return 'Shader error diagnostic unavailable';}
  }
  function notify(entry){
    try{onChange(entry.key,entry.status);}
    catch(error){entry.notificationError=describeError(error);}
  }
  function releaseShaders(entry,detach=false){
    for(const shader of entry.shaders){
      // deleteShader alone retains attached objects until their program dies.
      if(detach)gl.detachShader(entry.program,shader);
      gl.deleteShader(shader);
    }
    entry.shaders=[];
  }
  function release(entry){
    releaseShaders(entry);if(entry.program)gl.deleteProgram(entry.program);entry.program=null;
  }
  function finish(entry,status,error=''){
    if(entry.status!=='loading')return;
    entry.status=status;entry.error=error;
    if(status==='ready')releaseShaders(entry,true);else release(entry);
    notify(entry);entry.resolve(snapshot(entry));
  }
  function validateCompletion(entry){
    try{
      for(const shader of entry.shaders)if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))
        throw new Error(`Shader compile failure: ${gl.getShaderInfoLog(shader)||'no driver diagnostic'}`);
      if(!gl.getProgramParameter(entry.program,gl.LINK_STATUS))
        throw new Error(`Shader link failure: ${gl.getProgramInfoLog(entry.program)||'no driver diagnostic'}`);
      finish(entry,'ready');
    }catch(error){finish(entry,'unavailable',describeError(error));}
  }
  function arm(){
    if(!disposed&&frame===null&&[...entries.values()].some(entry=>entry.status==='loading')){
      const current=++pollGeneration;
      frame=schedule(()=>{if(current===pollGeneration)poll();});
    }
  }
  function poll(){
    frame=null;if(disposed)return;
    if(gl.isContextLost()){dispose();return;}
    for(const entry of entries.values())if(entry.status==='loading'){
      if(now()-entry.started>=timeoutMs){finish(entry,'unavailable',`Shader completion exceeded ${timeoutMs} ms`);continue;}
      try{if(gl.getProgramParameter(entry.program,parallel.COMPLETION_STATUS_KHR))validateCompletion(entry);}
      catch(error){finish(entry,'unavailable',describeError(error));}
    }
    arm();
  }
  function request(key,vertexSource,fragmentSource){
    if(disposed)throw new Error('Shader program context is disposed');
    if(typeof key!=='string'||!key||key.length>80)throw new Error('Invalid shader program identity');
    if([vertexSource,fragmentSource].some(source=>typeof source!=='string'||!source||source.length>1000000))
      throw new Error('Invalid shader program source');
    const prior=entries.get(key);
    // Key reuse cannot silently substitute source bytes within a live context.
    if(prior&&(prior.vertexSource!==vertexSource||prior.fragmentSource!==fragmentSource))throw new Error('Shader source identity changed');
    if(prior&&!['cancelled','deferred'].includes(prior.status))return prior.ticket;
    if(!prior&&entries.size>=capacity)throw new Error('Shader program capacity exceeded');
    let resolve;
    const done=new Promise(finishRequest=>{resolve=finishRequest;});
    const entry={key,vertexSource,fragmentSource,program:null,shaders:[],status:'loading',error:'',notificationError:'',started:now(),resolve,
      ticket:Object.freeze({key,generation,done})};
    entries.set(key,entry);
    try{
      if(gl.isContextLost())throw new Error('Shader graphics context lost');
      entry.program=gl.createProgram();if(!entry.program)throw new Error('Shader program allocation failed');
      for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]){
        const shader=gl.createShader(type);if(!shader)throw new Error('Shader allocation failed');
        entry.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);gl.attachShader(entry.program,shader);
      }
      gl.linkProgram(entry.program);
      if(parallel){notify(entry);arm();}else validateCompletion(entry);
    }catch(error){finish(entry,'unavailable',describeError(error));}
    return entry.ticket;
  }
  function cancelPending(){
    pollGeneration++;
    if(frame!==null){cancel(frame);frame=null;}
    for(const entry of entries.values())if(entry.status==='loading')finish(entry,'cancelled','Shader demand cancelled');
  }
  function dispose(){
    if(disposed)return;disposed=true;cancelPending();
    for(const entry of entries.values())release(entry);
  }
  return {
    parallel:!!parallel,generation,request,cancelPending,dispose,
    status:key=>disposed?'cancelled':entries.get(key)?.status||'deferred',
    get:key=>!disposed&&entries.get(key)?.status==='ready'?entries.get(key).program:null,
    diagnostic:key=>entries.has(key)?snapshot(entries.get(key)):{key,generation,status:disposed?'cancelled':'deferred',error:'',notificationError:'',parallel:!!parallel},
    retry(key){const entry=entries.get(key);if(entry?.status==='unavailable'){
      release(entry);entry.status='deferred';entry.error='';entry.notificationError='';
    }},
  };
}
