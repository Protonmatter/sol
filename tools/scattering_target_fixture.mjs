// Qualification-only synchronous setup. Production uses the bounded program owner.
export function createValidationTargetFactory(scattering,optics){
const {SCATTERING_MAX_EVALUATIONS,SCATTERING_GENERATOR_VS,SCATTERING_GENERATOR_FS,SCATTERING_UNIFORMS,setScatteringUniforms}=scattering;
const {ATMOSPHERE_UNIFORMS,setAtmosphereUniforms}=optics;
const unavailable=reason=>({status:'unavailable',reason});
/** @param {WebGL2RenderingContext} gl @param {number} type @param {string} source */
function shader(gl,type,source){
  const value=gl.createShader(type);if(!value)throw new Error('Scattering shader allocation failed');
  try{gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(value)||'Scattering shader compilation failed');return value;}
  catch(error){gl.deleteShader(value);throw error;}
}

/** Recompute the complete allocation budget instead of trusting summary fields.
 * @param {ScatteringPlan} plan */
function validPlanBudget(plan){
  if(!plan||plan.status!=='ready'||!Array.isArray(plan.surfaceSize)||!Array.isArray(plan.limbSize)
    ||plan.surfaceSize.length!==3||plan.limbSize.length!==2
    ||![...plan.surfaceSize,...plan.limbSize].every(v=>Number.isInteger(v)&&v>=1)
    ||![1,9,17].includes(plan.surfaceSize[2])||plan.surfaceSize[0]<2||plan.surfaceSize[1]<2||plan.limbSize.some(v=>v<2))return false;
  const count=plan.surfaceSize.reduce((a,b)=>a*b,1)+plan.limbSize[0]*plan.limbSize[1];
  return count<=SCATTERING_MAX_EVALUATIONS&&count===plan.evaluations&&count*16===plan.bytes;
}

/** Bounded resources; creation checks are never repeated by generate/bind.
 * The caller owns the maximum two resident targets and final material rebinding.
 * @param {WebGL2RenderingContext} gl @param {ScatteringPlan} initialPlan */
function createAtmosphereScatteringTarget(gl,initialPlan){
  let program=null,vs=null,fs=null,framebuffer=null,surfaceTexture=null,limbTexture=null,disposed=false;
  const release=()=>{if(disposed)return;disposed=true;
    if(surfaceTexture)gl.deleteTexture(surfaceTexture);if(limbTexture)gl.deleteTexture(limbTexture);
    if(framebuffer)gl.deleteFramebuffer(framebuffer);if(program)gl.deleteProgram(program);
    if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);
  };
  try{
    if(!validPlanBudget(initialPlan))throw new Error('Scattering plan is not admitted');
    if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float scattering render targets unavailable');
    const maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE),maxUnits=gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    if(maxUnits<10||initialPlan.surfaceSize[0]>maxSize||initialPlan.surfaceSize[1]*initialPlan.surfaceSize[2]>maxSize||Math.max(...initialPlan.limbSize)>maxSize)throw new Error('Scattering target exceeds device limits');
    vs=shader(gl,gl.VERTEX_SHADER,SCATTERING_GENERATOR_VS);fs=shader(gl,gl.FRAGMENT_SHADER,SCATTERING_GENERATOR_FS);
    program=gl.createProgram();if(!program)throw new Error('Scattering program allocation failed');
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Scattering program linking failed');
    const locations=/** @type {Record<string,WebGLUniformLocation|null>} */ ({});
    for(const name of [...ATMOSPHERE_UNIFORMS,...SCATTERING_UNIFORMS,'u_atmosphereColumnField','u_scatteringPass'])locations[name]=gl.getUniformLocation(program,name);
    framebuffer=gl.createFramebuffer();if(!framebuffer)throw new Error('Scattering framebuffer allocation failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    const allocate=(width,height)=>{
      const texture=gl.createTexture();if(!texture)throw new Error('Scattering texture allocation failed');
      try{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,width,height,0,gl.RGBA,gl.FLOAT,null);
        for(const parameter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.NEAREST);
        for(const parameter of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE||gl.getError()!==gl.NO_ERROR)throw new Error('Scattering float framebuffer rejected');
        return texture;
      }catch(error){gl.deleteTexture(texture);throw error;}
    };
    surfaceTexture=allocate(initialPlan.surfaceSize[0],initialPlan.surfaceSize[1]*initialPlan.surfaceSize[2]);
    limbTexture=allocate(initialPlan.limbSize[0],initialPlan.limbSize[1]);
    const target={status:/** @type {'ready'|'unavailable'} */ ('ready'),reason:'',surfaceTexture,limbTexture,framebuffer,program,plan:initialPlan,generation:0,bytes:initialPlan.bytes,
      /** Submit exactly the two bounded passes. No GPU completion claim or readback.
       * @param {{plan?:ScatteringPlan,profile:AtmosphereProfile,opticalOptions:import('./atmosphereOptics.js').AtmosphereOptions,columnTexture:WebGLTexture,restoreViewport:readonly number[]}} args */
      generate({plan=target.plan,profile,opticalOptions,columnTexture,restoreViewport}){
        if(disposed||target.status!=='ready')return false;
        try{
          if(!validPlanBudget(plan)||plan.body!==initialPlan.body||plan.surfaceSize.join(',')!==initialPlan.surfaceSize.join(',')||plan.limbSize.join(',')!==initialPlan.limbSize.join(',')||!columnTexture||!Array.isArray(restoreViewport)||restoreViewport.length!==2||!restoreViewport.every(x=>Number.isFinite(x)&&x>0))throw new Error('Scattering generation identity changed');
          if(profile.body!==plan.body||profile.radiusKm!==plan.radiusKm||profile.topKm!==plan.topKm||opticalOptions.polarRatio!==plan.polarRatio||opticalOptions.cameraBodyKm.some((v,i)=>v!==plan.cameraBodyKm[i]))throw new Error('Scattering generation camera/profile mismatch');
          gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.depthMask(false);
          gl.useProgram(program);setAtmosphereUniforms(gl,locations,profile,opticalOptions);setScatteringUniforms(gl,locations,plan);
          gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,columnTexture);gl.uniform1i(locations.u_atmosphereColumnField,7);
          for(const [pass,texture,width,height]of [[0,surfaceTexture,plan.surfaceSize[0],plan.surfaceSize[1]*plan.surfaceSize[2]],[1,limbTexture,...plan.limbSize]]){
            gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.viewport(0,0,width,height);gl.uniform1i(locations.u_scatteringPass,pass);gl.drawArrays(gl.TRIANGLES,0,3);
          }
          target.plan=plan;target.generation++;return true;
        }catch(error){target.status='unavailable';target.reason=error instanceof Error?error.message:String(error);release();return false;}
        finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(Array.isArray(restoreViewport)&&restoreViewport.length===2&&restoreViewport.every(x=>Number.isFinite(x)&&x>0))gl.viewport(0,0,restoreViewport[0],restoreViewport[1]);gl.activeTexture(gl.TEXTURE0);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}
      },
      /** @param {Record<string,WebGLUniformLocation|null>} consumerLocations */
      bind(consumerLocations){
        if(disposed||target.status!=='ready'||target.generation===0){gl.uniform1i(consumerLocations.u_scatteringReady,0);return false;}
        setScatteringUniforms(gl,consumerLocations,target.plan);
        gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,surfaceTexture);gl.activeTexture(gl.TEXTURE0+9);gl.bindTexture(gl.TEXTURE_2D,limbTexture);gl.activeTexture(gl.TEXTURE0);return true;
      },
      dispose:release,
    };
    return target;
  }catch(error){release();return {...unavailable(error instanceof Error?error.message:String(error)),dispose:release};}
  finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);}
}

return createAtmosphereScatteringTarget;
}
