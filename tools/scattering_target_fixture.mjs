// Qualification-only setup. Generic sources retain the complete oracle; live
// profile sources opt into the two-stage adapter. Not a production resource owner.
export function createValidationTargetFactory(scattering,optics){
  const paired=scattering.SCATTERING_TWO_STAGE===true;
  const {SCATTERING_MAX_EVALUATIONS,SCATTERING_GENERATOR_VS,SCATTERING_GENERATOR_FS,SCATTERING_NUMERATOR_FS,SCATTERING_RESOLVE_FS,
    SCATTERING_UNIFORMS,setScatteringUniforms}=scattering;
  const {ATMOSPHERE_UNIFORMS,setAtmosphereUniforms}=optics;
  const valid=plan=>{
    if(!plan||plan.status!=='ready'||!Array.isArray(plan.surfaceSize)||!Array.isArray(plan.limbSize)
      ||plan.surfaceSize.length!==3||plan.limbSize.length!==2||![1,9,17].includes(plan.surfaceSize[2])
      ||![...plan.surfaceSize,...plan.limbSize].every(v=>Number.isSafeInteger(v)&&v>=1)
      ||plan.surfaceSize[0]<2||plan.surfaceSize[1]<2||plan.limbSize.some(v=>v<2))return false;
    const count=plan.surfaceSize.reduce((a,b)=>a*b,1)+plan.limbSize[0]*plan.limbSize[1];
    return Number.isSafeInteger(count)&&count<=SCATTERING_MAX_EVALUATIONS&&count===plan.evaluations&&count*16===plan.bytes&&2*plan.bytes<=2097152;
  };
  return function createTarget(gl,initialPlan){
    const owned=[],cleanupErrors=[];let disposed=false,target=null,framebuffer=null,surface=null,limb=null,scratchSurface=null,scratchLimb=null;
    const take=(method,object)=>{if(!object)throw Error('Scattering '+method+' allocation failed');owned.push([method,object]);return object;};
    const release=()=>{if(disposed)return;disposed=true;
      for(const [method,object]of owned.splice(0).reverse())try{gl[method](object);}catch(error){cleanupErrors.push(String(error));}
    };
    const fail=error=>{release();return {status:'unavailable',reason:String(error?.message??error),cleanupErrors,bytes:0,scratchBytes:0,generation:0,
      generate:()=>false,bind:()=>false,dispose:release};};
    const check=phase=>{const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Scattering ${phase} GL error ${error}`);};
    try{
      if(!valid(initialPlan))throw Error('Scattering plan budget is not admitted');
      if(!(paired?[SCATTERING_GENERATOR_VS,SCATTERING_NUMERATOR_FS,SCATTERING_RESOLVE_FS]:[SCATTERING_GENERATOR_VS,SCATTERING_GENERATOR_FS]).every(s=>typeof s==='string'&&s.length>0))throw Error('Two-stage shader sources required');
      if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Float scattering targets unavailable');
      const maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE),units=gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      if(!Number.isSafeInteger(maxSize)||maxSize<2||!Number.isSafeInteger(units)||units<11
        ||initialPlan.surfaceSize[0]>maxSize||initialPlan.surfaceSize[1]*initialPlan.surfaceSize[2]>maxSize||Math.max(...initialPlan.limbSize)>maxSize)throw Error('Scattering target exceeds device limits');
      const program=fragment=>{
        const p=take('deleteProgram',gl.createProgram());
        for(const [type,source]of [[gl.VERTEX_SHADER,SCATTERING_GENERATOR_VS],[gl.FRAGMENT_SHADER,fragment]]){
          const s=take('deleteShader',gl.createShader(type));gl.shaderSource(s,source);gl.compileShader(s);
          if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Scattering shader compilation failed');gl.attachShader(p,s);
        }
        gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)||'Scattering link failed');
        const locations={};
        for(const name of [...ATMOSPHERE_UNIFORMS,...SCATTERING_UNIFORMS,'u_atmosphereColumnField','u_atmosphereOzoneField','u_scatteringPass','u_scatteringNumerator'])locations[name]=gl.getUniformLocation(p,name);
        return {p,locations};
      };
      const numerator=paired?program(SCATTERING_NUMERATOR_FS):null,resolve=program(paired?SCATTERING_RESOLVE_FS:SCATTERING_GENERATOR_FS);
      framebuffer=take('deleteFramebuffer',gl.createFramebuffer());gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      const allocate=(width,height)=>{
        const t=take('deleteTexture',gl.createTexture());gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,width,height,0,gl.RGBA,gl.FLOAT,null);
        for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
        for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Scattering float framebuffer incomplete');check('allocation');return t;
      };
      const sizes=[[initialPlan.surfaceSize[0],initialPlan.surfaceSize[1]*initialPlan.surfaceSize[2]],[...initialPlan.limbSize]];
      surface=allocate(...sizes[0]);limb=allocate(...sizes[1]);if(paired){scratchSurface=allocate(...sizes[0]);scratchLimb=allocate(...sizes[1]);}
      if(new Set([surface,limb,...(paired?[scratchSurface,scratchLimb]:[])]).size!==(paired?4:2))throw Error('Scattering textures must have distinct ownership');
      target={status:'ready',reason:'',surfaceTexture:surface,limbTexture:limb,framebuffer,program:resolve.p,
        plan:initialPlan,generation:0,submittedDraws:0,bytes:(paired?2:1)*initialPlan.bytes,scratchBytes:paired?initialPlan.bytes:0,cleanupErrors,
        generate({plan=target.plan,profile,opticalOptions,columnTexture,ozoneTexture,restoreViewport}){
          if(disposed||target.status!=='ready')return false;
          try{
            if(!valid(plan)||plan.body!==initialPlan.body||plan.surfaceSize.join(',')!==initialPlan.surfaceSize.join(',')||plan.limbSize.join(',')!==initialPlan.limbSize.join(',')
              ||!columnTexture||!ozoneTexture||!Array.isArray(restoreViewport)||restoreViewport.length!==2||!restoreViewport.every(x=>Number.isFinite(x)&&x>0))throw Error('Scattering generation identity or optical companion changed');
            if(profile.body!==plan.body||profile.radiusKm!==plan.radiusKm||profile.topKm!==plan.topKm||opticalOptions.polarRatio!==plan.polarRatio||opticalOptions.cameraBodyKm.some((v,i)=>v!==plan.cameraBodyKm[i]))throw Error('Scattering generation camera/profile mismatch');
            check('entry');gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.depthMask(false);
            const configure=record=>{
              gl.useProgram(record.p);setAtmosphereUniforms(gl,record.locations,profile,opticalOptions);setScatteringUniforms(gl,record.locations,plan);
              gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,columnTexture);gl.uniform1i(record.locations.u_atmosphereColumnField,7);
              gl.activeTexture(gl.TEXTURE0+10);gl.bindTexture(gl.TEXTURE_2D,ozoneTexture);gl.uniform1i(record.locations.u_atmosphereOzoneField,10);
            };
            for(const [pass,final,scratch]of [[0,surface,scratchSurface],[1,limb,scratchLimb]]){
              if(disposed)throw Error('Scattering generation disposed');
              gl.viewport(0,0,...sizes[pass]);
              if(paired){
                gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,null);
                gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,scratch,0);
                configure(numerator);gl.uniform1i(numerator.locations.u_scatteringPass,pass);gl.drawArrays(gl.TRIANGLES,0,3);target.submittedDraws++;check('numerator submission');
                if(disposed)throw Error('Scattering generation disposed');
              }
              gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,final,0);
              configure(resolve);if(paired){gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,scratch);gl.uniform1i(resolve.locations.u_scatteringNumerator,6);}
              gl.uniform1i(resolve.locations.u_scatteringPass,pass);gl.drawArrays(gl.TRIANGLES,0,3);target.submittedDraws++;check('resolve submission');
            }
            if(disposed)throw Error('Scattering generation disposed');target.plan=plan;target.generation++;return true;
          }catch(error){target.status='unavailable';target.reason=String(error?.message??error);release();return false;}
          finally{
            gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(Array.isArray(restoreViewport)&&restoreViewport.length===2&&restoreViewport.every(x=>Number.isFinite(x)&&x>0))gl.viewport(0,0,...restoreViewport);
            if(paired){gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,null);}gl.activeTexture(gl.TEXTURE0);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
          }
        },
        bind(locations){
          if(disposed||target.status!=='ready'||target.generation===0){gl.uniform1i(locations.u_scatteringReady,0);return false;}
          setScatteringUniforms(gl,locations,target.plan);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,surface);gl.activeTexture(gl.TEXTURE0+9);gl.bindTexture(gl.TEXTURE_2D,limb);gl.activeTexture(gl.TEXTURE0);return true;
        },
        dispose:release,
      };
      return target;
    }catch(error){return fail(error);}
    finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);}
  };
}
