import {createShaderPrograms} from './shaderPrograms.js';

export function solarTransferColor(surface,emission,channel='euv') {
  if(![surface,emission].every(v=>Number.isFinite(v)&&v>=0)||!['euv','visible'].includes(channel))throw new RangeError('Invalid solar transfer intensity');
  if(channel==='visible')return Array(3).fill(surface*3+emission*2);
  const intensity=surface*3.2+emission*40;
  const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
  const t=smooth(.08,1.3,intensity),w=smooth(2,8,intensity);
  return [1,.24,.012].map((v,i)=>intensity*((v*(1-t)+[1,.72,.2][i]*t)*(1-w)+[1,.94,.67][i]*w));
}

/** Transfer-target size for a viewport. HiDPI canvases can exceed the byte budget
 * (1440x900 CSS at DPR 2 needs about 62 MB); render at a uniform reduced scale
 * instead of failing, and let the composite map display pixels onto it. */
export function transferTargetSize(width,height,maxBytes=48*1024*1024,maxDimension=4096) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new RangeError('Invalid solar transfer viewport');
  if(!Number.isFinite(maxBytes)||maxBytes<12)throw new RangeError('Invalid solar transfer budget');
  const scale=Math.min(1,Math.sqrt(maxBytes/(width*height*12)),maxDimension/width,maxDimension/height);
  const w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
  return {width:w,height:h,scaleX:w/width,scaleY:h/height};
}

const VS=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
const FS=`#version 300 es
precision highp float;
uniform sampler2D u_transfer,u_depth;
uniform int u_pass,u_linearOutput,u_channel;
uniform float u_exposure;
uniform vec2 u_origin,u_scale;
out vec4 o;
vec3 palette(float intensity){vec3 hue=mix(vec3(1.,.24,.012),vec3(1.,.72,.20),smoothstep(.08,1.3,intensity));hue=mix(hue,vec3(1.,.94,.67),smoothstep(2.,8.,intensity));return max(intensity,0.)*hue;}
vec3 encode(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){
  ivec2 size=textureSize(u_transfer,0);
  ivec2 xy=clamp(ivec2((gl_FragCoord.xy-u_origin)*u_scale),ivec2(0),size-1);vec3 fields=texelFetch(u_transfer,xy,0).rgb;
  bool disk=fields.b>.5;
  if((u_pass==1&&!disk)||(u_pass==2&&disk))discard;
  float intensity=u_channel==1?fields.g*3.+fields.r*2.:fields.g*3.2+fields.r*40.;
  if(intensity<1e-7)discard;
  vec3 color=u_channel==1?vec3(intensity):palette(intensity);
  if(u_linearOutput==0){color*=u_exposure;color=encode(color/(vec3(1)+color));}
  o=vec4(color,disk?1.:0.);
  gl_FragDepth=disk?texelFetch(u_depth,xy,0).r:0.;
}`;

/** Scalar intensity accumulation, followed by exactly one palette/tone map.
 * This target is used only by isolated Sun inspection, so no other opaque body
 * occupies its volume. The caller owns scene blending and the final HDR target. */
export function createSolarEmissionComposition(gl,{generation=1,maxBytes=48*1024*1024}={}) {
  const programs=createShaderPrograms(gl,{generation,capacity:1});let target=null,uniforms=null,disposed=false,saved=null;
  const release=()=>{if(!target)return;gl.deleteFramebuffer(target.framebuffer);gl.deleteTexture(target.color);gl.deleteTexture(target.depth);gl.deleteVertexArray(target.vao);target=null;};
  const resource=(value,label)=>{if(!value)throw new Error('Solar transfer '+label+' allocation failed');return value;};
  async function ready(){
    const status=await programs.request('compose',VS,FS).done;
    if(disposed||status.status!=='ready')throw new Error(status.error||'Solar composition cancelled');
    const program=programs.get('compose');uniforms=Object.fromEntries(['u_transfer','u_depth','u_pass','u_linearOutput','u_channel','u_origin','u_scale','u_exposure'].map(name=>[name,gl.getUniformLocation(program,name)]));
  }
  function resize(width,height){
    if(target?.width===width&&target?.height===height)return;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||width*height*12>maxBytes)
      throw new Error('Solar transfer framebuffer budget exceeded');
    if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Solar transfer floating-point target unavailable');
    release();const next={width,height,framebuffer:null,color:null,depth:null,vao:null};
    try{
      next.color=resource(gl.createTexture(),'color');gl.bindTexture(gl.TEXTURE_2D,next.color);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,width,height,0,gl.RGBA,gl.HALF_FLOAT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      next.depth=resource(gl.createTexture(),'depth');gl.bindTexture(gl.TEXTURE_2D,next.depth);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,width,height,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      next.framebuffer=resource(gl.createFramebuffer(),'framebuffer');gl.bindFramebuffer(gl.FRAMEBUFFER,next.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,next.color,0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,next.depth,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Solar transfer framebuffer incomplete');
      next.vao=resource(gl.createVertexArray(),'vertex array');target=next;
    }catch(error){if(next.framebuffer)gl.deleteFramebuffer(next.framebuffer);if(next.color)gl.deleteTexture(next.color);if(next.depth)gl.deleteTexture(next.depth);if(next.vao)gl.deleteVertexArray(next.vao);throw error;}
  }
  function begin(){
    if(disposed||!uniforms)throw new Error('Solar composition is not ready');
    saved={draw:gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read:gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),viewport:Array.from(gl.getParameter(gl.VIEWPORT)),
      unit:gl.getParameter(gl.ACTIVE_TEXTURE),vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),depthWrite:gl.getParameter(gl.DEPTH_WRITEMASK),depth:gl.isEnabled(gl.DEPTH_TEST),blend:gl.isEnabled(gl.BLEND),scissor:gl.isEnabled(gl.SCISSOR_TEST),
      blendSourceRGB:gl.getParameter(gl.BLEND_SRC_RGB),blendDestRGB:gl.getParameter(gl.BLEND_DST_RGB),blendSourceAlpha:gl.getParameter(gl.BLEND_SRC_ALPHA),blendDestAlpha:gl.getParameter(gl.BLEND_DST_ALPHA)};
    try{
      gl.activeTexture(gl.TEXTURE0);const size=transferTargetSize(saved.viewport[2],saved.viewport[3],maxBytes);resize(size.width,size.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.viewport(0,0,target.width,target.height);
      gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
      gl.clearBufferfv(gl.COLOR,0,new Float32Array([0,0,0,0]));gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));
    }catch(error){finish();throw error;}
  }
  function finish(){
    if(!saved)return;
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,saved.draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,saved.read);
    gl.viewport(...saved.viewport);gl.depthMask(saved.depthWrite);
    gl.blendFuncSeparate(saved.blendSourceRGB,saved.blendDestRGB,saved.blendSourceAlpha,saved.blendDestAlpha);
    saved.depth?gl.enable(gl.DEPTH_TEST):gl.disable(gl.DEPTH_TEST);
    saved.blend?gl.enable(gl.BLEND):gl.disable(gl.BLEND);saved.scissor?gl.enable(gl.SCISSOR_TEST):gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(saved.vao);gl.activeTexture(saved.unit);
  }
  function composite({pass,linearOutput=false,channel='euv',exposure=1}){
    if(!target||!uniforms||!saved||disposed)return false;
    if(!Number.isFinite(exposure)||exposure<=0||exposure>16)return false;
    gl.useProgram(programs.get('compose'));gl.bindVertexArray(target.vao);
    gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,target.color);gl.uniform1i(uniforms.u_transfer,6);
    gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,target.depth);gl.uniform1i(uniforms.u_depth,7);
    gl.uniform1i(uniforms.u_pass,pass);gl.uniform1i(uniforms.u_linearOutput,linearOutput?1:0);gl.uniform1i(uniforms.u_channel,channel==='visible'?1:0);
    gl.uniform1f(uniforms.u_exposure,exposure);
    gl.uniform2fv(uniforms.u_origin,new Float32Array(saved.viewport.slice(0,2)));
    gl.uniform2f(uniforms.u_scale,target.width/saved.viewport[2],target.height/saved.viewport[3]);
    gl.disable(gl.CULL_FACE);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(saved.vao);gl.activeTexture(saved.unit);return true;
  }
  return {ready,begin,finish,composite,bytes:()=>target?target.width*target.height*12:0,
    dispose(){if(disposed)return;disposed=true;release();programs.dispose();saved=null;}};
}
