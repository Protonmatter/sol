// Bounded context-owned WebGL programs. Completion polling never asks the driver
// for compile/link status until KHR_parallel_shader_compile reports completion.
// ANGLE/D3D11 can leave delayed GL errors when a linked, unfinished program is
// deleted. Keep such allocations reusable until completion or context loss.
// This ledger includes active and retired allocations across owners, so repeated
// disposal/re-entry cannot accumulate driver jobs. Idle work schedules no polls.
const contexts=new WeakMap();
const CONTEXT_PROGRAM_CAPACITY=32;
export function createShaderPrograms(gl, {
  generation=0,capacity=8,timeoutMs=30000,now=()=>performance.now(),
  schedule=callback=>requestAnimationFrame(callback),cancel=handle=>cancelAnimationFrame(handle),
  onChange=(_key,_status)=>{},
}={}) {
  if(!Number.isSafeInteger(generation)||generation<0||!Number.isInteger(capacity)||capacity<1||capacity>16
    ||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>30000)throw new Error('Invalid shader program resource budget');
  const extension=gl.getExtension('KHR_parallel_shader_compile');
  const parallel=extension&&Number.isFinite(extension.COMPLETION_STATUS_KHR)?extension:null;
  let resources=contexts.get(gl);
  if(!resources){resources=new Set();contexts.set(gl,resources);}
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
    const resource=entry.resource;
    if(resource?.pending&&!gl.isContextLost())return;
    releaseShaders(entry);if(entry.program)gl.deleteProgram(entry.program);entry.program=null;
    if(resource)resources.delete(resource);entry.resource=null;
  }
  function acquire(vertexSource,fragmentSource){
    // Only disposed owners enter this pool; cancelled requests retain ownership.
    for(const resource of resources)if(resource.retired){
      if(resource.vertexSource===vertexSource&&resource.fragmentSource===fragmentSource){
        resource.retired=false;return resource;
      }
      if(gl.getProgramParameter(resource.program,parallel.COMPLETION_STATUS_KHR)){
        for(const shader of resource.shaders)gl.deleteShader(shader);
        gl.deleteProgram(resource.program);resources.delete(resource);
      }
    }
    if(resources.size>=CONTEXT_PROGRAM_CAPACITY)throw new Error('Shader context resource capacity exceeded');
    const program=gl.createProgram();if(!program)throw new Error('Shader program allocation failed');
    const resource={program,shaders:[],vertexSource,fragmentSource,pending:false,retired:false};
    resources.add(resource);return resource;
  }
  function finish(entry,status,error=''){
    if(entry.status!=='loading')return;
    entry.status=status;entry.error=error;
    if(status==='ready')releaseShaders(entry,true);else release(entry);
    notify(entry);entry.resolve(snapshot(entry));
  }
  function validateCompletion(entry){
    entry.resource.pending=false;
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
    const entry={key,vertexSource,fragmentSource,program:null,shaders:[],resource:null,status:'loading',error:'',notificationError:'',started:now(),resolve,
      ticket:Object.freeze({key,generation,done})};
    entries.set(key,entry);
    try{
      if(gl.isContextLost())throw new Error('Shader graphics context lost');
      entry.resource=prior?.resource||acquire(vertexSource,fragmentSource);
      entry.program=entry.resource.program;entry.shaders=entry.resource.shaders;
      if(!entry.resource.pending){
        for(const [type,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]){
          const shader=gl.createShader(type);if(!shader)throw new Error('Shader allocation failed');
          entry.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);gl.attachShader(entry.program,shader);
        }
        gl.linkProgram(entry.program);entry.resource.pending=!!parallel;
      }
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
    // WebGL invalidates every object on loss, including other retired owners.
    if(gl.isContextLost())resources.clear();
    for(const entry of entries.values()){
      release(entry);
      if(entry.resource){entry.resource.retired=true;entry.resource=null;entry.program=null;entry.shaders=[];}
    }
  }
  return {
    parallel:!!parallel,generation,request,cancelPending,dispose,
    // Completion is polled from requestAnimationFrame, which does not run while the
    // document is hidden. The owner renews the deadline when polling can resume so a
    // suspended period is not charged against a compile that was never observed.
    renewDeadlines(){
      if(disposed)return 0;
      const stamp=now();let renewed=0;
      for(const entry of entries.values())if(entry.status==='loading'){entry.started=stamp;renewed++;}
      return renewed;
    },
    status:key=>disposed?'cancelled':entries.get(key)?.status||'deferred',
    get:key=>!disposed&&entries.get(key)?.status==='ready'?entries.get(key).program:null,
    diagnostic:key=>entries.has(key)?snapshot(entries.get(key)):{key,generation,status:disposed?'cancelled':'deferred',error:'',notificationError:'',parallel:!!parallel},
    retry(key){const entry=entries.get(key);if(entry?.status==='unavailable'){
      release(entry);entry.status='deferred';entry.error='';entry.notificationError='';
    }},
  };
}
