import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {decodePng} from './visual_assertions.mjs';

export function countSaturnPolarPixels(png){
  const image=decodePng(png);
  let count=0;
  for(let i=0;i<image.data.length;i+=4){
    const r=image.data[i],g=image.data[i+1],b=image.data[i+2];
    if(g>65&&g>r+2&&b>r*.88)count++;
  }
  return count;
}

// Literal RGB targets evaluated from the recovered Sites v7 Saturn recipe.
// These exercise the real compiled sphere fragment shader, not a JS substitute.
export async function verifySaturnMaterial(page){
  const samples=await page.evaluate(async()=>{
    const token=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {BASE_SPHERE_FS,SCATTERING_SPHERE_FS}=await import(`./js/orreryShaders.js${token}`);
    const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;
    const gl=canvas.getContext('webgl2',{antialias:false,alpha:false});
    if(!gl)throw Error('Saturn material probe requires WebGL2');
    const vertex=`#version 300 es
      precision highp float;
      out vec3 v_obj,v_world,v_nrm,v_incidentSunBody,v_incidentSunWorld,v_incidentTransmission;
      out float v_surfaceScale;
      void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
        gl_Position=vec4(p*2.-1.,0,1);v_obj=vec3(.1,0,.995);v_world=vec3(0);
        v_nrm=vec3(0,0,1);v_surfaceScale=1.;v_incidentSunBody=vec3(0,0,1);
        v_incidentSunWorld=vec3(0,0,1);v_incidentTransmission=vec3(1);}`;
    const shaders=[];let program,physicalProgram,texture;
    try{
      const compile=(type,source)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));
      gl.attachShader(program,compile(gl.FRAGMENT_SHADER,BASE_SPHERE_FS));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
      const i=(name,value)=>gl.uniform1i(gl.getUniformLocation(program,name),value);
      const v=(name,value)=>gl.uniform3fv(gl.getUniformLocation(program,name),value);
      i('u_style',-1);i('u_useTex',1);i('u_texMode',0);i('u_illustrativeLinear',1);i('u_tex',0);
      v('u_cam',[0,0,4]);v('u_base',[.7,.7,.6]);
      texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      const cases=[{name:'lit-polar-color',rgb:[112,132,128],mu:1,look:1},
        {name:'unlit-pole',rgb:[112,132,128],mu:0,look:1},
        {name:'ochre-band',rgb:[224,208,164],mu:.35,look:1},
        {name:'ordinary-material',rgb:[112,132,128],mu:1,look:0},
        {name:'linear-composition',rgb:[112,132,128],mu:1,look:1,linear:1}];
      const colors=cases.map(c=>{
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([...c.rgb,255]));
        i('u_saturnLook',c.look);i('u_linearOutput',c.linear||0);v('u_light',[Math.sqrt(1-c.mu*c.mu),0,c.mu]);
        gl.drawArrays(gl.TRIANGLES,0,3);const pixels=new Uint8Array(4);gl.readPixels(1,1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        return {name:c.name,rgb:Array.from(pixels.slice(0,3)),error:gl.getError()};
      });
      physicalProgram=gl.createProgram();gl.attachShader(physicalProgram,compile(gl.VERTEX_SHADER,vertex));
      gl.attachShader(physicalProgram,compile(gl.FRAGMENT_SHADER,SCATTERING_SPHERE_FS));gl.linkProgram(physicalProgram);
      if(!gl.getProgramParameter(physicalProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(physicalProgram));
      // Saturn never enters the admitted Earth/Mars transfer program. A dynamic
      // Saturn branch here increases work on software backends despite uploading 0.
      if(gl.getUniformLocation(physicalProgram,'u_saturnLook')!==null)
        throw Error('Physical Earth/Mars shader retains the unused Saturn material branch');
      return colors;
    }finally{if(texture)gl.deleteTexture(texture);if(program)gl.deleteProgram(program);if(physicalProgram)gl.deleteProgram(physicalProgram);shaders.forEach(s=>gl.deleteShader(s));gl.getExtension('WEBGL_lose_context')?.loseContext();}
  });
  const expected=[[131,157,152],[10,12,12],[167,155,118],[112,132,128],[58,85,80]];
  for(const [index,sample] of samples.entries()){
    assert.equal(sample.error,0,`${sample.name}: no GPU error`);
    assert.ok(sample.rgb.every((v,c)=>Math.abs(v-expected[index][c])<=2),
      `${sample.name}: expected ${expected[index]}, rendered ${sample.rgb}`);
  }
  return samples;
}

export async function verifySaturnScene(page,directory,capture){
  const evidence={status:'failed',cases:[]};
  await page.evaluate(async()=>{
    const token=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const state=(await import(`./js/store.js${token}`)).store.orrery;
    const gl=document.getElementById('orreryCanvas').getContext('webgl2');
    const originalElements=gl.drawElements,originalArrays=gl.drawArrays;
    const probe={state,draws:[],errors:[]};globalThis.__saturnLookProbe=probe;
    function observe(original,args){
      const result=Reflect.apply(original,gl,args),program=gl.getParameter(gl.CURRENT_PROGRAM);
      const uniform=name=>{const loc=gl.getUniformLocation(program,name),v=loc?gl.getUniform(program,loc):null;return ArrayBuffer.isView(v)?Array.from(v):v;};
      const body=state.bodies.find(b=>b.name==='Saturn'),model=uniform('u_model'),center=uniform('u_center');
      const matches=p=>body&&p&&['x_au','y_au','z_au'].every((key,i)=>Math.abs(p[i]-body[key])<1e-5);
      if(matches(model?.slice(12,15))&&uniform('u_mode')===0)
        probe.draws.push({kind:'surface',light:uniform('u_light'),material:uniform('u_saturnLook'),texture:uniform('u_useTex'),moonShadows:uniform('u_moonShadowCount')});
      if(matches(center)&&uniform('u_prad')!==null)probe.draws.push({kind:'ring',light:uniform('u_light')});
      const error=gl.getError();if(error)probe.errors.push(error);
      return result;
    }
    gl.drawElements=function(...args){return observe(originalElements,args);};
    gl.drawArrays=function(...args){return observe(originalArrays,args);};
    probe.cleanup=()=>{gl.drawElements=originalElements;gl.drawArrays=originalArrays;};
  });
  const read=()=>page.evaluate(()=>{
    const {state:s,draws,errors}=globalThis.__saturnLookProbe;
    return {texture:s.illustrativeStatus.Saturn,lighting:s.saturnLighting,epoch:s.renderUnix,
      positions:s.bodies.map(({name,x_au,y_au,z_au})=>({name,x_au,y_au,z_au})),draws,errors};
  });
  const repaint=()=>page.evaluate(()=>{globalThis.__saturnLookProbe.draws=[];document.getElementById('orrerySize').dispatchEvent(new Event('input',{bubbles:true}));});
  try{
    await page.$eval('#orreryAnimate',n=>{n.checked=false;n.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.select('#orreryPlanetLook','illustrative');await page.select('#orreryAnchor','Saturn');
    await page.waitForFunction(()=>globalThis.__saturnLookProbe.state.illustrativeStatus.Saturn==='ready',{timeout:30000});
    await page.select('#orrerySaturnLighting','look-lab');
    for(const [name,el] of [['north',1.4],['south',-1.35]]){
      for(let angle=0;angle<4;angle++){
        await page.evaluate(({el,angle})=>{const s=globalThis.__saturnLookProbe.state;s.az=-2.455+angle*Math.PI/2;s.el=el;s.radius=.64;},{el,angle});
        await repaint();const image=await capture(page,path.join(directory,`saturn-${name}-${angle}.png`));
        const result=await read();
        assert.equal(result.texture,'ready');assert.deepEqual(result.errors,[]);
        const surfaces=result.draws.filter(d=>d.kind==='surface'),rings=result.draws.filter(d=>d.kind==='ring');
        assert.ok(surfaces.length&&rings.length,'Saturn surface and rings must both be drawn');
        assert.ok(surfaces.every(d=>d.material===1&&d.texture===1&&d.moonShadows===0));
        assert.deepEqual(surfaces.at(-1).light,rings.at(-1).light,'sphere, ring illumination and shadows share one direction');
        // The source's polar color is muted teal/green, not saturated blue.
        // Its green-dominant pixels distinguish it from the ochre cloud bands.
        const polarPixels=countSaturnPolarPixels(image);
        if(name==='north')assert.ok(polarPixels>100,`north polar color must remain visible (${polarPixels} pixels)`);
        evidence.cases.push({name,angle,polarPixels,...result});
      }
    }
    const before=await read();await page.select('#orrerySaturnLighting','sun-directed');await repaint();
    await capture(page,path.join(directory,'saturn-sun-directed.png'));const solar=await read();
    for(const key of ['epoch','positions'])assert.deepEqual(solar[key],before[key]);
    const body=solar.positions.find(b=>b.name==='Saturn'),distance=Math.hypot(body.x_au,body.y_au,body.z_au);
    const light=solar.draws.find(d=>d.kind==='surface').light;
    for(const [i,key] of ['x_au','y_au','z_au'].entries())assert.ok(Math.abs(light[i]+body[key]/distance)<1e-6);
    assert.deepEqual(solar.errors,[]);evidence.sunDirected=solar;evidence.status='passed';return evidence;
  }finally{
    fs.writeFileSync(path.join(directory,'saturn-scene.json'),JSON.stringify(evidence,null,2)+'\n');
    await page.evaluate(()=>{globalThis.__saturnLookProbe.cleanup();delete globalThis.__saturnLookProbe;});
  }
}
