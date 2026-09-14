/** Validation-only source observation. Install before any application shader work.
 * Linked source identity survives the renderer detaching/deleting shader objects.
 * Native calls and arguments are preserved; no GL query or hashing runs here.
 */
export function installProgramSourceEvidence() {
  if(globalThis.__solProgramSourceEvidence)return;
  const prototype=WebGL2RenderingContext.prototype,shaders=new WeakMap(),attached=new WeakMap(),linked=new WeakMap();
  let sequence=0;
  const wrap=(name,observe)=>{const original=prototype[name];prototype[name]=function(...args){
    const result=original.apply(this,args);observe(this,args,result);return result;
  };};
  wrap('createShader',(context,[type],shader)=>{if(shader)shaders.set(shader,{context,type,source:null});});
  wrap('shaderSource',(context,[shader,source])=>{
    const record=shaders.get(shader);if(record?.context===context)record.source=typeof source==='string'?source:null;
  });
  wrap('attachShader',(_context,[program,shader])=>{
    if(program&&shader){if(!attached.has(program))attached.set(program,new Set());attached.get(program).add(shader);}
  });
  wrap('detachShader',(_context,[program,shader])=>{attached.get(program)?.delete(shader);});
  wrap('linkProgram',(context,[program])=>{
    if(!program)return;
    const sources=[...(attached.get(program)||[])].map(shader=>shaders.get(shader));
    linked.set(program,{context,sequence:++sequence,sources:sources.map(source=>source?.context===context?
      {type:source.type,source:source.source}:null)});
  });
  wrap('deleteProgram',(_context,[program])=>{linked.delete(program);attached.delete(program);});
  Object.defineProperty(globalThis,'__solProgramSourceEvidence',{value:Object.freeze({
    snapshot(context,program){const record=linked.get(program);return record?.context===context?
      {sequence:record.sequence,sources:record.sources.map(source=>source&&{...source})}:null;},
  })});
}

/** Prepare a separate physical draw gate before its five-second collection window.
 * Actual linked source, actual uniform values and actual current texture bindings
 * must agree with admitted immutable inputs. Metadata readiness alone cannot pass.
 */
export async function preparePhysicalSpinEvidence({body='Earth'}={}) {
  if(!globalThis.__solProgramSourceEvidence||!globalThis.__solPhysicalTextureEvidence)
    throw new Error('Physical draw observers must be installed before application startup');
  const entry=document.querySelector('script[type="module"][src^="app.js"]'),token=entry?new URL(entry.src).search:'';
  const [{SPHERE_VS,SPHERE_FS},{getAtmosphereProfile,serializeAtmosphereProfile},{BODY},
    {INCIDENT_FIELDS},{ATMOSPHERE_COLUMN_FIELDS},{store}]=await Promise.all([
      import(`./js/orreryShaders.js${token}`),import(`./js/atmosphereOptics.js${token}`),import(`./js/bodyData.js${token}`),
      import(`./js/atmosphereIncidentManifest.js${token}`),import(`./js/atmosphereColumnManifest.js${token}`),import(`./js/store.js${token}`),
    ]);
  const profile=getAtmosphereProfile(body),catalogue=BODY[body],incident=INCIDENT_FIELDS[body],columns=ATMOSPHERE_COLUMN_FIELDS[body];
  if(!profile||!catalogue||!incident||!columns)throw new Error('Physical spin body is not admitted');
  const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const [vertexHash,fragmentHash,profileHash]=await Promise.all([hash(SPHERE_VS),hash(SPHERE_FS),hash(serializeAtmosphereProfile(profile))]);
  if(profileHash!==incident.profile_sha256||profileHash!==columns.profile_sha256)throw new Error('Physical spin source profile identity mismatch');
  await globalThis.__solPhysicalTextureEvidence.settle();
  const summary={body,shader_sha256:{vertex:vertexHash,fragment:fragmentHash},profile_sha256:profileHash,
    fields:{incident:{sha256:incident.sha256,dimensions:incident.dimensions},columns:{sha256:columns.sha256,dimensions:columns.dimensions}}};
  const knownPrograms=new WeakMap(),locations=new WeakMap();
  const matchesSources=(gl,observed)=>observed?.sources.length===2
    &&observed.sources.some(s=>s?.type===gl.VERTEX_SHADER&&s.source===SPHERE_VS)
    &&observed.sources.some(s=>s?.type===gl.FRAGMENT_SHADER&&s.source===SPHERE_FS);
  const matchesProgram=(gl,program)=>!!program&&matchesSources(gl,globalThis.__solProgramSourceEvidence.snapshot(gl,program));
  const scalar={u_atmosphereEnabled:1,u_atmosphereRefractionEnabled:1,u_incidentFieldReady:1,
    u_atmosphereRadiusKm:profile.radiusKm,u_bodyRadiusKm:catalogue.radiusKm,u_atmosphereTopKm:profile.topKm,
    u_atmospherePolarRatio:catalogue.polarKm/catalogue.radiusKm,u_atmosphereG:profile.aerosolG,u_atmosphereRefractivity:profile.surfaceRefractivity};
  const vectors={u_atmosphereDensityScaleKm:[profile.rayleighScaleHeightKm,profile.aerosolScaleHeightKm],
    u_atmosphereRayleighKm:profile.betaRayleighKm,u_atmosphereAerosolKm:profile.betaAerosolExtinctionKm,
    u_atmosphereAerosolSSA:profile.aerosolSingleScatteringAlbedo,
    u_incidentFieldHeight:[incident.domain.minHeightKm,incident.domain.maxHeightKm,Number(incident.domain.quadratic)]};
  // Independently uploaded matrices, world camera and optical geometry are each
  // rounded to binary32. Propagate their rounding bins instead of comparing a
  // reconstruction with an arbitrary km/angle tolerance. The tiny outward pad
  // bounds the intervening binary64 arithmetic; this does not change optics limits.
  const outward=([lo,hi])=>{const e=8*Number.EPSILON*Math.max(Math.abs(lo),Math.abs(hi),Number.MIN_VALUE);return [lo-e,hi+e];};
  const rounded=value=>{const a=Math.abs(value),half=a<2**-126?2**-150:2**(Math.floor(Math.log2(a))-24);
    return outward([value-half,value+half]);};
  const add=(a,b)=>outward([a[0]+b[0],a[1]+b[1]]);
  const multiply=(a,b)=>{const v=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return outward([Math.min(...v),Math.max(...v)]);};
  const dividePositive=(a,b)=>multiply(a,outward([1/b[1],1/b[0]]));
  const length=vector=>{const squares=vector.map(a=>outward([a[0]<=0&&a[1]>=0?0:Math.min(a[0]**2,a[1]**2),Math.max(a[0]**2,a[1]**2)]));
    const sum=squares.reduce(add,[0,0]);return outward([Math.sqrt(Math.max(0,sum[0])),Math.sqrt(sum[1])]);};
  const dot=(a,b)=>a.map((v,i)=>multiply(v,b[i])).reduce(add,[0,0]);
  const overlaps=(a,b)=>a[0]<=b[1]&&b[0]<=a[1];
  const geometryEvidence=(uniforms,position)=>{
    const model=uniforms.u_model,camera=uniforms.u_cam;
    if(!Array.isArray(model)||model.length!==16||!model.every(Number.isFinite)
      ||!Array.isArray(camera)||camera.length!==3||!camera.every(Number.isFinite)
      ||model[3]!==0||model[7]!==0||model[11]!==0||model[15]!==1)return null;
    const columns=[0,4,8].map(i=>model.slice(i,i+3).map(rounded)),radii=columns.map(length);
    if(radii.some(radius=>!(radius[0]>0)||!Number.isFinite(radius[1])))return null;
    const rotation=columns.map((column,i)=>column.map(value=>dividePositive(value,radii[i])));
    const offset=camera.map((value,i)=>add(rounded(value),multiply(rounded(model[12+i]),[-1,-1])));
    const expectedCamera=rotation.map(column=>dividePositive(multiply(dot(column,offset),[catalogue.radiusKm,catalogue.radiusKm]),radii[0]));
    const world=[-position.x_au,-position.y_au,-position.z_au],distance=Math.hypot(...world);
    if(!(distance>0)||!Number.isFinite(distance))return null;
    const worldSun=world.map(value=>outward([value/distance,value/distance]));
    const localSun=rotation.map(column=>dot(column,worldSun)),sunLength=length(localSun);
    if(!(sunLength[0]>0))return null;
    const expectedSun=localSun.map(value=>dividePositive(value,sunLength));
    if(expectedCamera.some((interval,i)=>!overlaps(interval,rounded(uniforms.u_atmosphereCameraKm[i])))
      ||expectedSun.some((interval,i)=>!overlaps(interval,rounded(uniforms.u_atmosphereSunDirection[i]))))return null;
    return {cameraKmIntervals:expectedCamera,sunDirectionIntervals:expectedSun};
  };
  const capture=(gl,program)=>{
    const rejected=reason=>({passed:false,body,reason});
    if(!program)return rejected('No actual current program');
    const observed=globalThis.__solProgramSourceEvidence.snapshot(gl,program);
    if(!observed)return rejected('Actual linked program was not observed in this context');
    if(knownPrograms.get(program)?.sequence!==observed.sequence){
      if(!matchesSources(gl,observed))return rejected('Actual linked program differs from the immutable physical sphere');
      knownPrograms.set(program,observed);
      locations.delete(program); // Uniform locations belong to one completed link.
    }
    if(!locations.has(program))locations.set(program,Object.fromEntries([
      ...Object.keys(scalar),...Object.keys(vectors),'u_atmosphereSolarScale','u_atmosphereExposure',
      'u_incidentField','u_atmosphereColumnField','u_atmosphereCameraKm','u_atmosphereSunDirection','u_model','u_cam',
    ].map(name=>[name,gl.getUniformLocation(program,name)])));
    const names=locations.get(program),uniforms={};
    for(const [name,location]of Object.entries(names)){
      if(location===null)return rejected(`Physical uniform absent: ${name}`);
      const value=gl.getUniform(program,location);uniforms[name]=ArrayBuffer.isView(value)?Array.from(value):value;
    }
    for(const [name,value]of Object.entries(scalar))if(uniforms[name]!==Math.fround(value))return rejected(`Physical scalar mismatch: ${name}`);
    for(const [name,values]of Object.entries(vectors))if(!Array.isArray(uniforms[name])||uniforms[name].length!==values.length
      ||values.some((value,i)=>uniforms[name][i]!==Math.fround(value)))return rejected(`Physical vector mismatch: ${name}`);
    const state=store.orrery,position=state.bodies.find(item=>item.name===body);
    if(!state.opticsEnabled||state.opticsStatus[body]!=='ready'||!position)return rejected('Physical source not currently admitted');
    const distance=Math.hypot(position.x_au,position.y_au,position.z_au),exposure=state.hdrFrame?1:distance*distance;
    if(uniforms.u_atmosphereSolarScale!==Math.fround(1/(distance*distance))||uniforms.u_atmosphereExposure!==Math.fround(exposure))return rejected('Physical flux or exposure does not match the current frame');
    for(const name of ['u_atmosphereCameraKm','u_atmosphereSunDirection'])
      if(!Array.isArray(uniforms[name])||uniforms[name].length!==3||!uniforms[name].every(Number.isFinite))return rejected(`Physical geometry is not finite: ${name}`);
    const geometry=geometryEvidence(uniforms,position);
    if(!geometry)return rejected('Optical camera or Sun does not match the actual current GPU model/camera');
    const originalUnit=gl.getParameter(gl.ACTIVE_TEXTURE),fields={};
    try{
      for(const [name,sampler,reference,width,height,format]of [
        ['incident','u_incidentField',incident,incident.dimensions[0],incident.dimensions[1]*incident.dimensions[2],gl.RGBA32F],
        ['columns','u_atmosphereColumnField',columns,columns.dimensions[0],columns.dimensions[1],gl.RG32F],
      ]){
        const unit=uniforms[sampler];if(!Number.isInteger(unit)||unit<0||unit>31)return rejected(`Invalid ${name} sampler`);
        gl.activeTexture(gl.TEXTURE0+unit);const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);
        const upload=globalThis.__solPhysicalTextureEvidence.snapshot(gl,texture);
        if(!upload||upload.status!=='ready'||upload.sha256!==reference.sha256||upload.width!==width||upload.height!==height
          ||upload.internalFormat!==format||upload.type!==gl.FLOAT||upload.byteLength!==reference.bytes
          ||upload.unpack.flipY||upload.unpack.premultiplyAlpha)
          return rejected(`Current ${name} texture does not match its observed immutable upload`);
        fields[name]={sha256:upload.sha256,width,height,internalFormat:format,unit,uploadSequence:upload.sequence,
          byteLength:upload.byteLength,unpack:upload.unpack};
      }
    }finally{gl.activeTexture(originalUnit);}
    return {passed:true,...summary,programSequence:observed.sequence,uniforms,fields,geometry};
  };
  Object.defineProperty(globalThis,'__solPhysicalSpinEvidence',{configurable:true,value:Object.freeze({body,summary,capture,matchesProgram})});
  return summary;
}

/** Additional physical preparation, inside the original absolute System budget.
 * A ready status cannot pass: require an actual current physical draw and all
 * prepared shader/profile/field/geometry checks before the separate 3-in-5 gate.
 */
export async function waitForPhysicalSpinReadiness({body='Earth',systemStartedMs,deadlineMs}={}){
  if(!Number.isFinite(systemStartedMs)||deadlineMs!==systemStartedMs+75000)
    throw new Error('Physical preparation requires the original absolute 75s System budget');
  const physical=globalThis.__solPhysicalSpinEvidence;
  if(physical?.body!==body||typeof physical.matchesProgram!=='function')throw new Error('Physical evidence must be prepared before readiness observation');
  const entry=document.querySelector('script[type="module"][src^="app.js"]');
  const {store}=await import(`./js/store.js${entry?new URL(entry.src).search:''}`);
  const gl=document.getElementById('orreryCanvas').getContext('webgl2'),native=gl.drawElements,nativeUseProgram=gl.useProgram;
  let hintedProgram=null;
  const startedMs=performance.now(),counts={submitted:0,physicalRejected:0,lateDraws:0,sourceFilteredDraws:0,
    candidateDraws:0,gpuProgramQueries:0,gpuProgramMismatch:0},rejections={};
  const diagnostics=()=>JSON.parse(JSON.stringify({programStatus:store.orrery.programStatus??null,programDiagnostics:store.orrery.programDiagnostics??null,
    opticsStatus:store.orrery.opticsStatus??null,engineError:store.orrery.engineError??''}));
  let settled=false,timer,poll,finish;
  const pending=new Promise(resolve=>{finish=(passed,reason,draw)=>{
    if(settled)return;settled=true;const endedMs=performance.now();
    if(passed&&endedMs>deadlineMs){passed=false;reason='Physical readiness completed after the original System deadline';counts.lateDraws++;draw=undefined;}
    resolve({passed,reason,systemStartedMs,deadlineMs,startedMs,endedMs,elapsedMs:endedMs-startedMs,
      firstPhysicalReadyElapsedMs:passed?endedMs-systemStartedMs:null,counts,rejections,diagnostics:diagnostics(),draw});
  };});
  const check=()=>{
    if(performance.now()>deadlineMs)return finish(false,'Physical preparation exceeded the original System deadline');
    const state=store.orrery;
    if(gl.isContextLost()||state.engineError||state.programStatus?.physical==='unavailable'||state.opticsStatus?.[body]==='unavailable')
      finish(false,'Physical source/program preparation became unavailable');
  };
  gl.useProgram=function(...args){const result=nativeUseProgram.apply(this,args);if(this===gl)hintedProgram=args[0];return result;};
  gl.drawElements=function(...args){
    const result=native.apply(this,args);counts.submitted++;
    if(this!==gl||settled||args[0]!==gl.TRIANGLES||!Number.isInteger(args[1])||args[1]<=0)return result;
    if(performance.now()>deadlineMs){counts.lateDraws++;check();return result;}
    try{
      // CPU-observed source identity is only a filter. Every eligible draw still
      // reads the actual GPU program and all physical uniforms/bindings below.
      if(!physical.matchesProgram(gl,hintedProgram)){counts.sourceFilteredDraws++;return result;}
      counts.candidateDraws++;counts.gpuProgramQueries++;
      const program=gl.getParameter(gl.CURRENT_PROGRAM);
      if(program!==hintedProgram){counts.gpuProgramMismatch++;return result;}
      const draw=physical.capture(gl,program);
      if(!draw.passed){counts.physicalRejected++;rejections[draw.reason]=(rejections[draw.reason]??0)+1;check();return result;}
      const mode=gl.getUniform(program,gl.getUniformLocation(program,'u_mode'));
      const position=store.orrery.bodies.find(item=>item.name===body),model=draw.uniforms.u_model;
      if(mode!==0||!position||Math.hypot(model[12]-position.x_au,model[13]-position.y_au,model[14]-position.z_au)>1e-5)
        return result;
      if(performance.now()>deadlineMs){counts.lateDraws++;check();return result;}
      finish(true,'Observed current physical draw before the original System deadline',draw);
    }catch(error){finish(false,`Physical readiness inspection failed: ${error.message}`);}
    return result;
  };
  try{
    check();
    if(!settled){timer=setTimeout(()=>finish(false,'Physical preparation exceeded the original System deadline'),Math.max(0,deadlineMs-performance.now()));
      poll=setInterval(check,100);}
    return await pending;
  }finally{gl.drawElements=native;gl.useProgram=nativeUseProgram;clearTimeout(timer);clearInterval(poll);}
}
