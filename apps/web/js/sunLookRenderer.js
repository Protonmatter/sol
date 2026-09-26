import {createShaderPrograms} from './shaderPrograms.js';
import {SUN_LOOK_REGIONS,SUN_LOOK_MAX_BYTES} from './sunLook.js';
import {SUN_LOOK_VS,SUN_LOOK_SCENE_FS,SUN_LOOK_BLUR_FS,SUN_LOOK_COMPOSITE_VS,SUN_LOOK_COMPOSITE_FS} from './sunLookShaders.js';

const DEFINITIONS=[['scene',SUN_LOOK_VS,SUN_LOOK_SCENE_FS],['blur',SUN_LOOK_VS,SUN_LOOK_BLUR_FS],
  ['composite',SUN_LOOK_COMPOSITE_VS,SUN_LOOK_COMPOSITE_FS]];
const COMMON=['u_rect','u_camera','u_rayX','u_rayY','u_rayZ'];
const UNIFORMS={scene:[...COMMON,'u_res','u_viewBasis','u_radiusPx','u_time','u_flow','u_net','u_dark',
  'u_fans','u_corona','u_prom','u_detail','u_wisps','u_pal','u_direct','u_ar[0]','u_arAmp[0]'],
blur:['u_src','u_texel','u_dir','u_threshold'],
composite:[...COMMON,'u_scene','u_blur','u_mvp','u_pass','u_linearOutput']};

/** One context, three programs, one bounded scalar target and two quarter-size blurs. */
export function createSunLookRenderer(gl,{onChange=(_status,_reason)=>{},shaderOptions={}}={}){
  let disposed=false,wanted=false,targets=null,programs=null,vao=null,key='',status='deferred',reason='';
  const notify=(next,message='')=>{
    if(status===next&&reason===message)return;
    status=next;reason=message;if(!disposed)onChange(status,reason);
  };
  const manager=createShaderPrograms(gl,{capacity:3,...shaderOptions,onChange:()=>{
    // ANGLE/D3D11 can report delayed GL_INVALID_VALUE after a linked program is
    // deleted during KHR compilation. Retire a disposed owner's pending set only
    // after completion; production keeps a single reusable set per live context.
    if(disposed){if(DEFINITIONS.every(([id])=>manager.status(id)!=='loading'))manager.dispose();return;}
    if(!wanted)return;
    if(DEFINITIONS.some(([id])=>manager.status(id)==='unavailable'))notify('unavailable','Sun shader unavailable; select a mode or resolution to retry.');
    // Readiness must wake a paused scene even though its public state remains
    // loading until the first target has been populated.
    else if(DEFINITIONS.every(([id])=>manager.status(id)==='ready'))onChange('loading','');
  }});
  const regions=new Float32Array(SUN_LOOK_REGIONS.flatMap(a=>a.slice(0,4)));
  const amplitudes=new Float32Array(SUN_LOOK_REGIONS.map(a=>a[4]));
  function releaseTargets(){
    if(targets)for(const t of targets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);}
    targets=null;key='';
  }
  function target(size){
    const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();
    try{
      if(!texture||!framebuffer)throw new Error('Sun target allocation failed');
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,size,size,0,gl.RGBA,gl.HALF_FLOAT,null);
      for(const [p,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],
        [gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,p,v);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Sun framebuffer incomplete');
      return {size,texture,framebuffer};
    }catch(error){if(texture)gl.deleteTexture(texture);if(framebuffer)gl.deleteFramebuffer(framebuffer);throw error;}
  }
  function prepare(size){
    if(disposed||status==='unavailable')return false;
    try{
      if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Float Sun targets unavailable');
      const limit=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const viewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      if(![1024,2048,4096].includes(size)||size>limit||size*size*9>SUN_LOOK_MAX_BYTES
        ||(viewport&&size>Math.min(...viewport)))throw new Error('Requested Sun resolution exceeds device limits');
      for(const [id,vs,fs] of DEFINITIONS)manager.request(id,vs,fs);
      if(DEFINITIONS.some(([id])=>manager.status(id)!=='ready')){
        if(DEFINITIONS.some(([id])=>manager.status(id)==='unavailable'))notify('unavailable','Sun shader unavailable; select a mode or resolution to retry.');
        else if(status!=='unavailable')notify('loading');return false;
      }
      if(!programs){
        programs=Object.fromEntries(DEFINITIONS.map(([id])=>{
          const program=manager.get(id);
          return [id,{program,u:Object.fromEntries(UNIFORMS[id].map(name=>[name,gl.getUniformLocation(program,name)]))}];
        }));
        vao=gl.createVertexArray();if(!vao)throw new Error('Sun vertex array unavailable');
      }
      if(!targets||targets[0].size!==size){
        releaseTargets();const made=[];
        try{for(const n of [size,size/4,size/4])made.push(target(n));targets=made;}
        catch(error){for(const t of made){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);}throw error;}
      }
      return true;
    }catch(error){releaseTargets();notify('unavailable',String(error.message||error));return false;}
  }
  function uploadRays(u,plan){
    gl.uniform4fv(u.u_rect,plan.rect);
    for(const [name,value] of [['camera',plan.camera],['rayX',plan.rayX],['rayY',plan.rayY],['rayZ',plan.rayZ]])gl.uniform3fv(u['u_'+name],value);
  }
  // Caller-owned scene framebuffer and viewport are explicit. The caller establishes
  // this opaque-pass boundary before generation; no expensive driver state readbacks.
  function restore(framebuffer,viewport){
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(...viewport);
    gl.bindVertexArray(null);gl.useProgram(null);
    for(const unit of [0,1]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindSampler(unit,null);}
    gl.activeTexture(gl.TEXTURE0);gl.colorMask(true,true,true,true);gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);
    for(const cap of [gl.CULL_FACE,gl.SCISSOR_TEST,gl.STENCIL_TEST,gl.RASTERIZER_DISCARD,gl.SAMPLE_COVERAGE,gl.SAMPLE_ALPHA_TO_COVERAGE])gl.disable(cap);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  function render(plan,{seconds=0,prominences=false,framebuffer=null,viewport=[0,0,1,1]}={}){
    if(!plan||disposed)return false;
    wanted=true;
    const nextKey=JSON.stringify([plan,seconds,prominences]);
    if(key===nextKey&&status==='ready')return true;
    try{
      gl.activeTexture(gl.TEXTURE0);gl.bindSampler(0,null);gl.bindSampler(1,null);
      if(!prepare(plan.size))return false;
      gl.bindVertexArray(vao);gl.colorMask(true,true,true,true);gl.depthMask(false);
      for(const cap of [gl.BLEND,gl.DEPTH_TEST,gl.CULL_FACE,gl.SCISSOR_TEST,gl.STENCIL_TEST,gl.RASTERIZER_DISCARD,gl.SAMPLE_COVERAGE,gl.SAMPLE_ALPHA_TO_COVERAGE])gl.disable(cap);
      const s=programs.scene,u=s.u;
      gl.useProgram(s.program);uploadRays(u,plan);gl.uniform2fv(u.u_res,[plan.size,plan.size]);
      gl.uniformMatrix3fv(u.u_viewBasis,false,new Float32Array(plan.viewBasis));
      gl.uniform1f(u.u_radiusPx,plan.radiusPx);gl.uniform1f(u.u_time,seconds);gl.uniform1f(u.u_flow,seconds*.12);
      for(const name of ['net','dark','fans','corona'])gl.uniform1f(u['u_'+name],1);
      gl.uniform1f(u.u_prom,prominences?1:0);gl.uniform1f(u.u_detail,.75);gl.uniform1f(u.u_wisps,.65);
      gl.uniform1i(u.u_pal,0);gl.uniform1i(u.u_direct,0);gl.uniform4fv(u['u_ar[0]'],regions);gl.uniform1fv(u['u_arAmp[0]'],amplitudes);
      gl.bindFramebuffer(gl.FRAMEBUFFER,targets[0].framebuffer);gl.viewport(0,0,plan.size,plan.size);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);
      const blur=programs.blur,q=plan.size/4;
      gl.useProgram(blur.program);gl.uniform1i(blur.u.u_src,0);gl.uniform2fv(blur.u.u_texel,[1/q,1/q]);
      // Preserve the lab's blur width relative to the disk, independent of target size.
      const stride=(4/631)*(plan.radiusPx/plan.size)/.37351265;
      for(let i=1;i<=2;i++){
        gl.bindFramebuffer(gl.FRAMEBUFFER,targets[i].framebuffer);gl.viewport(0,0,q,q);
        gl.bindTexture(gl.TEXTURE_2D,targets[i-1].texture);
        gl.uniform2fv(blur.u.u_dir,i===1?[stride,0]:[0,stride]);gl.uniform1f(blur.u.u_threshold,i===1?.35:0);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
      key=nextKey;notify('ready');return true;
    }catch(error){releaseTargets();notify('unavailable',String(error.message||error));return false;}
    finally{restore(framebuffer,viewport);}
  }
  function draw(plan,pass,{linear=false}={}){
    if(disposed||status!=='ready'||!targets||!programs)return false;
    const {program,u}=programs.composite;
    gl.useProgram(program);gl.bindVertexArray(vao);uploadRays(u,plan);
    gl.uniformMatrix4fv(u.u_mvp,false,new Float32Array(plan.mvp));gl.uniform1i(u.u_pass,pass);gl.uniform1i(u.u_linearOutput,linear?1:0);
    for(let i=0;i<2;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindSampler(i,null);gl.bindTexture(gl.TEXTURE_2D,targets[i?2:0].texture);}
    gl.uniform1i(u.u_scene,0);gl.uniform1i(u.u_blur,1);
    gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);return true;
  }
  return {render,draw,status:()=>({state:status,reason,size:targets?.[0].size||0,bytes:targets?targets[0].size**2*9:0}),
    suspend({retry=false}={}){
      wanted=false;releaseTargets();
      if(retry){for(const [id] of DEFINITIONS)manager.retry(id);notify('deferred');}
      else if(status!=='unavailable')notify('deferred');
    },
    renewDeadlines:()=>manager.renewDeadlines(),
    dispose(){
      if(disposed)return;disposed=true;wanted=false;releaseTargets();
      if(gl.isContextLost()||DEFINITIONS.every(([id])=>manager.status(id)!=='loading'))manager.dispose();
      if(vao)gl.deleteVertexArray(vao);vao=null;programs=null;status='cancelled';
    },
  };
}
