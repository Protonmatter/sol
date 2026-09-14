import { HDR_PRESENT_VS, HDR_PRESENT_FS } from './hdrPresentationShaders.js';

const DEFAULT_MAX_BYTES=64*1024*1024,MAX_EDGE=2048;
const validExposure=value=>Number.isFinite(value)&&value>=0&&value<=65504;

/** Independent CPU-facing reference for the declared SDR display operator. */
export function presentationColor(scene,exposure=1){
  if(!Array.isArray(scene)||scene.length!==3||!scene.every(Number.isFinite)||!validExposure(exposure))
    throw new RangeError('Presentation requires finite RGB and finite nonnegative exposure.');
  return scene.map(value=>{
    const x=Math.max(0,value)*exposure,mapped=x===Infinity?1:x/(1+x);
    return mapped<=.0031308?12.92*mapped:1.055*mapped**(1/2.4)-.055;
  });
}

/** One full-size RGBA16F/depth group; no history, MSAA, downsampling or retry loop. */
export function createHdrPresentation(gl,{generation,maxBytes=DEFAULT_MAX_BYTES}={generation:1}){
  if(!Number.isSafeInteger(generation)||generation<1||generation>2147483647
    ||!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw new RangeError('Invalid HDR resource budget or context generation.');
  let group=null,pending=null,lastSerial=0,attempt='',disposed=false;
  let report={state:'deferred',reason:'No visible frame.',generation,width:0,height:0,estimatedBytes:0,presented:null};
  const release=()=>{
    pending=null;
    if(group){
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      if(group.color)gl.deleteTexture(group.color);
      if(group.depth)gl.deleteRenderbuffer(group.depth);
      if(group.framebuffer)gl.deleteFramebuffer(group.framebuffer);
      if(group.program)gl.deleteProgram(group.program);
      if(group.vao)gl.deleteVertexArray(group.vao);
      for(const shader of group.shaders)gl.deleteShader(shader);
      group=null;
    }
  };
  const unavailable=reason=>{
    release();report={...report,state:'unavailable',reason,estimatedBytes:0,presented:null};return status();
  };
  const status=()=>({...report,presented:report.presented?{...report.presented}:null});
  const requireResource=(value,label)=>{if(!value)throw new Error(`HDR ${label} allocation failed.`);return value;};
  const identity=value=>value&&value.generation===generation&&Number.isFinite(value.epoch)&&Number.isFinite(Math.fround(value.epoch))
    &&Number.isInteger(value.serial)&&value.serial>lastSerial&&value.serial<=2147483647;
  const same=(a,b)=>a&&b&&a.generation===b.generation&&a.epoch===b.epoch&&a.serial===b.serial;
  function resize(width,height){
    const key=`${width}x${height}`;
    if(disposed)return status();
    if(attempt===key)return status(); // failed allocations require a new size or explicit new owner
    attempt=key;release();
    report={...report,width,height,estimatedBytes:0,presented:null};
    if(width===0||height===0){report={...report,state:'deferred',reason:'No visible frame.'};return status();}
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<0||height<0||width>MAX_EDGE||height>MAX_EDGE
      ||width*height*12>maxBytes)return unavailable('Full-resolution HDR target exceeds its allocation budget.');
    if(gl.isContextLost())return unavailable('Graphics context lost.');
    if(!gl.getExtension('EXT_color_buffer_float'))return unavailable('Floating-point scene attachments unavailable.');
    if(width>gl.getParameter(gl.MAX_TEXTURE_SIZE)||height>gl.getParameter(gl.MAX_TEXTURE_SIZE)
      ||width>gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||height>gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))
      return unavailable('Full-resolution HDR target exceeds device dimensions.');
    group={color:null,depth:null,framebuffer:null,program:null,vao:null,shaders:[],uniforms:{}};
    try{
      group.color=requireResource(gl.createTexture(),'color');
      gl.bindTexture(gl.TEXTURE_2D,group.color);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,width,height,0,gl.RGBA,gl.HALF_FLOAT,null);
      for(const [key,value] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],
        [gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,value);
      group.depth=requireResource(gl.createRenderbuffer(),'depth');gl.bindRenderbuffer(gl.RENDERBUFFER,group.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,width,height);
      group.framebuffer=requireResource(gl.createFramebuffer(),'framebuffer');gl.bindFramebuffer(gl.FRAMEBUFFER,group.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,group.color,0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,group.depth);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('HDR framebuffer incomplete.');
      // Capability presence is insufficient: prove unclamped binary16 storage.
      gl.enable(gl.SCISSOR_TEST);gl.scissor(0,0,1,1);gl.colorMask(true,true,true,true);
      for(const value of [0,.18,1,4,16]){
        gl.clearBufferfv(gl.COLOR,0,new Float32Array([value,value,value,1]));
        const pixel=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);
        if(!pixel.every(Number.isFinite)||pixel.slice(0,3).some(x=>Math.abs(x-value)>Math.max(1e-7,Math.abs(value)/1024)))
          throw new Error('HDR write/read qualification failed.');
      }
      gl.disable(gl.SCISSOR_TEST);
      for(const [type,source] of [[gl.VERTEX_SHADER,HDR_PRESENT_VS],[gl.FRAGMENT_SHADER,HDR_PRESENT_FS]]){
        const shader=requireResource(gl.createShader(type),'shader');group.shaders.push(shader);
        gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('HDR presentation shader unavailable.');
      }
      group.program=requireResource(gl.createProgram(),'program');
      for(const shader of group.shaders)gl.attachShader(group.program,shader);
      gl.linkProgram(group.program);
      if(!gl.getProgramParameter(group.program,gl.LINK_STATUS))throw new Error('HDR presentation link failed.');
      for(const name of ['u_scene','u_exposure','u_frameSerial','u_frameGeneration','u_frameEpochHigh','u_frameEpochLow'])
        group.uniforms[name]=gl.getUniformLocation(group.program,name);
      group.vao=requireResource(gl.createVertexArray(),'vertex array');
      if(gl.getError()!==gl.NO_ERROR)throw new Error('GPU rejected HDR resources.');
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      report={...report,state:'ready',reason:'Linear display composition; fixed exposure; SDR output.',estimatedBytes:width*height*12};
      return status();
    }catch(error){gl.disable(gl.SCISSOR_TEST);return unavailable(error.message);}
  }
  function beginFrame(frameIdentity){
    if(disposed||!group||report.state!=='ready'||gl.isContextLost()||!identity(frameIdentity))return false;
    pending={generation,epoch:frameIdentity.epoch,serial:frameIdentity.serial};
    lastSerial=frameIdentity.serial; // Consume even if resize/cancellation prevents presentation.
    gl.bindFramebuffer(gl.FRAMEBUFFER,group.framebuffer);
    gl.viewport(0,0,report.width,report.height);return true;
  }
  function present({exposure=1,frameIdentity}){
    if(disposed||!group||gl.isContextLost()||!validExposure(exposure)||!same(pending,frameIdentity))return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,report.width,report.height);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);gl.disable(gl.RASTERIZER_DISCARD);
    gl.colorMask(true,true,true,true);gl.depthMask(false);gl.bindVertexArray(group.vao);gl.useProgram(group.program);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,group.color);
    gl.uniform1i(group.uniforms.u_scene,0);gl.uniform1f(group.uniforms.u_exposure,exposure);
    gl.uniform1i(group.uniforms.u_frameSerial,pending.serial);gl.uniform1i(group.uniforms.u_frameGeneration,generation);
    const high=Math.fround(pending.epoch);
    gl.uniform1f(group.uniforms.u_frameEpochHigh,high);gl.uniform1f(group.uniforms.u_frameEpochLow,pending.epoch-high);
    gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);gl.depthMask(true);
    if(gl.getError()!==gl.NO_ERROR){unavailable('GPU rejected HDR presentation.');return false;}
    lastSerial=pending.serial;report={...report,presented:{...pending}};pending=null;return true;
  }
  function dispose(){release();disposed=true;report={...report,state:'deferred',reason:'Presentation released.',estimatedBytes:0,presented:null};}
  return {resize,beginFrame,present,status,dispose};
}
