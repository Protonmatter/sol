import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {decodePng} from './visual_assertions.mjs';
function changedPixels(a,b){
  const x=decodePng(a),y=decodePng(b);assert.equal(x.width,y.width);assert.equal(x.height,y.height);
  let changed=0;
  for(let i=0;i<x.data.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(x.data[i+c]-y.data[i+c]);if(delta>6)changed++;}
  assert(changed>50,`Sun control did not visibly change the render: ${changed} pixels`);
  return {changedPixels:changed,totalPixels:x.width*x.height};
}

// Run against the actual staged SOL page. CI uses 1K; native qualification may
// request all three resolutions without changing the scene's output dimensions.
export async function verifySunLook(page,directory,capture,{resolutions=[1024],restore=true}={}){
  await page.evaluate(async()=>{
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import('./js/store.js'+q);window.__sunLookStore=store;
    const state=store.orrery;
    window.__sunLookPrior={mode:state.solarMode,resolution:state.sunLookResolution,prom:state.sunLookProminences,playing:state.sunLookPlaying,hdr:state.hdrEnabled};
    const node=document.getElementById('orreryAnimate');node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));
    state.hdrEnabled=false;state.sunLookPlaying=false;
    const gl=document.getElementById('orreryCanvas').getContext('webgl2'),draw=gl.drawArrays;
    window.__sunLookDraws=[];window.__sunLookScene=null;
    gl.drawArrays=function(...args){
      const result=Reflect.apply(draw,this,args),p=gl.getParameter(gl.CURRENT_PROGRAM);
      const detail=gl.getUniformLocation(p,'u_detail'),composite=gl.getUniformLocation(p,'u_scene');
      if(detail||composite){
        const value=name=>{const loc=gl.getUniformLocation(p,name);const v=loc?gl.getUniform(p,loc):null;return ArrayBuffer.isView(v)?Array.from(v):v;};
        const record={kind:detail?'scene':'composite',resolution:value('u_res'),detail:value('u_detail'),time:value('u_time'),prom:value('u_prom'),pass:value('u_pass'),linear:value('u_linearOutput'),error:gl.getError()};
        window.__sunLookDraws.push(record);if(detail)window.__sunLookScene=record;
        if(window.__sunLookDraws.length>80)window.__sunLookDraws.shift();
      }
      return result;
    };
    window.__sunLookCleanup=()=>{gl.drawArrays=draw;};
  });
  const evidence={schema_version:'sun-look-browser.v1',scope:'Staged SOL render, actual target size, pixels, controls and unchanged physical state',resolutions:{}};
  const read=()=>page.evaluate(()=>{
    const s=window.__sunLookStore.orrery;
    return {status:s.sunLookStatus,reason:s.sunLookReason,resolution:s.sunLookResolution,prom:s.sunLookProminences,
      mode:s.solarMode,epoch:s.renderUnix,positions:s.bodies.map(({name,x_au,y_au,z_au})=>({name,x_au,y_au,z_au})),camera:[s.az,s.el,s.radius],sceneDraw:window.__sunLookScene,draws:window.__sunLookDraws.slice(-6)};
  });
  const wait=()=>page.waitForFunction(()=>['ready','unavailable'].includes(window.__sunLookStore.orrery.sunLookStatus),{timeout:30000});
  try{
    await page.click('#orreryInspectSun');await page.select('#orrerySolarMode','illustrative');
    let initial=null,previous=null;
    for(const resolution of resolutions){
      await page.select('#orrerySunResolution',String(resolution));await wait();
      await page.evaluate(()=>{window.dispatchEvent(new Event('resize'));document.getElementById('orreryCanvas').getContext('webgl2').finish();});
      const state=await read();assert.equal(state.status,'ready',state.reason);
      const scene=state.sceneDraw;assert(scene);assert.deepEqual(scene.resolution,[resolution,resolution]);
      assert.equal(scene.detail,.75);assert(state.draws.every(d=>d.error===0));
      if(!initial)initial=state;
      for(const k of ['epoch','positions','camera'])assert.deepEqual(state[k],initial[k],`resolution changed ${k}`);
      const image=await capture(page,path.join(directory,`sun-approved-${resolution}.png`));
      // Capture is a canvas screenshot. The independently read uniform establishes
      // actual target resolution; browser CSS size is deliberately kept unchanged.
      if(previous)evidence.resolutions[resolution]={state,pixelChange:changedPixels(previous,image)};
      else evidence.resolutions[resolution]={state};
      previous=image;
    }
    await page.$eval('#orrerySunProminences',n=>{n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));});
    const withProm=await capture(page,path.join(directory,'sun-approved-prominences.png'));
    evidence.prominences={state:await read(),pixelChange:changedPixels(previous,withProm)};
    assert.equal(evidence.prominences.state.sceneDraw.prom,1);
    await page.$eval('#orrerySunProminences',n=>{n.checked=false;n.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.select('#orrerySolarMode','visible');evidence.visible=await read();assert.equal(evidence.visible.status,'deferred');
    evidence.depth=await verifySunDepth(page);
    evidence.result='passed';fs.writeFileSync(path.join(directory,'sun-approved.json'),JSON.stringify(evidence,null,2)+'\n');
    return evidence;
  }finally{
    await page.evaluate(restore=>{
      window.__sunLookCleanup?.();
      if(restore){const s=window.__sunLookStore.orrery,p=window.__sunLookPrior;s.hdrEnabled=p.hdr;s.sunLookPlaying=p.playing;
        const select=(id,value)=>{const n=document.getElementById(id);n.value=String(value);n.dispatchEvent(new Event('change',{bubbles:true}));};
        select('orrerySolarMode',p.mode);select('orrerySunResolution',p.resolution);
        const n=document.getElementById('orrerySunProminences');n.checked=p.prom;n.dispatchEvent(new Event('change',{bubbles:true}));}
      delete window.__sunLookCleanup;delete window.__sunLookPrior;delete window.__sunLookStore;delete window.__sunLookDraws;delete window.__sunLookScene;
    },restore);
  }
}

async function verifySunDepth(page){
  return page.evaluate(async()=>{
    const q=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const [{createSunLookRenderer},{planSunLook},{perspective,lookAt,mul}]=await Promise.all([
      import('./js/sunLookRenderer.js'+q),import('./js/sunLook.js'+q),import('./js/orreryMath.js'+q)]);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const gl=canvas.getContext('webgl2',{antialias:false,depth:true,alpha:false});
    if(!gl)throw Error('Sun depth probe WebGL2 unavailable');
    const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],vp=mul(perspective(Math.PI/3,1,.1,100),lookAt([0,0,5],[0,0,0],[0,1,0]));
    const plan=planSunLook({vp,rotation:identity,position:[0,0,0],radius:1,eye:[0,0,5],pixels:300});
    const owner=createSunLookRenderer(gl);let flat=null;const shaders=[];
    try{
      await new Promise((resolve,reject)=>{
        const started=performance.now();
        const step=()=>{
          if(owner.render(plan,{viewport:[0,0,64,64]})){resolve(null);return;}
          if(owner.status().state==='unavailable'||performance.now()-started>20000){reject(Error(owner.status().reason||'Sun depth probe timed out'));return;}
          requestAnimationFrame(step);
        };step();
      });
      flat=gl.createProgram();
      for(const [type,source] of [[gl.VERTEX_SHADER,`#version 300 es
uniform float u_depth;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,u_depth*2.-1.,1.);}`],
        [gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;out vec4 o;void main(){o=vec4(0.,0.,1.,1.);}`]]){
        const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(flat,shader);
      }
      gl.linkProgram(flat);if(!gl.getProgramParameter(flat,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(flat));
      const render=depth=>{
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,64,64);gl.bindVertexArray(null);gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.clearDepth(1);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.useProgram(flat);gl.uniform1f(gl.getUniformLocation(flat,'u_depth'),depth);gl.drawArrays(gl.TRIANGLES,0,3);
        owner.draw(plan,1);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);owner.draw(plan,2);gl.depthMask(true);
        const pixels=new Uint8Array(64*64*4);gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        return pixels;
      };
      const center=p=>Array.from(p.slice((32*64+32)*4,(32*64+32)*4+4));
      const near=render(0),far=render(1),nearCenter=center(near),farCenter=center(far);
      if(nearCenter[0]>1||nearCenter[1]>1||nearCenter[2]<254||farCenter[0]<50)throw Error('Sun disk foreground/background occlusion failed');
      for(let i=0;i<near.length;i+=4)if(near[i]>1||near[i+1]>1||near[i+2]<254)throw Error('Sun corona painted over a foreground occluder');
      const halo=Array.from(far.slice((32*64+46)*4,(32*64+46)*4+4));
      if(halo[0]<2)throw Error('Off-limb emission missing from depth test');
      // Bracket the analytic central surface depth, beyond a whole-plane check.
      const ndc=1/64,r=[ndc/Math.sqrt(3),ndc/Math.sqrt(3),-1],len=Math.hypot(...r),d=r.map(x=>x/len);
      const t=-5*d[2]-Math.sqrt(1-25*(d[0]**2+d[1]**2)),p=[d[0]*t,d[1]*t,5+d[2]*t,1];
      const c=[0,1,2,3].map(i=>p.reduce((sum,v,j)=>sum+vp[j*4+i]*v,0)),expected=c[2]/c[3]*.5+.5;
      const justFront=center(render(expected-.001)),justBehind=center(render(expected+.001));
      if(justFront[0]>1||justBehind[0]<50)throw Error('Sun surface writes an incorrect perspective depth');
      const error=gl.getError();if(error)throw Error('Sun depth probe GL error '+error);
      return {nearCenter,farCenter,halo,expectedDepth:expected,justFront,justBehind,error};
    }finally{owner.dispose();if(flat)gl.deleteProgram(flat);for(const shader of shaders)gl.deleteShader(shader);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  });
}
