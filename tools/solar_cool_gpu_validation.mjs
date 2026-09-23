import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const root=process.cwd();
const server=http.createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+req.url);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type','text/javascript');res.end(await readFile(p));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle']});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/package.json`);
 const result=await page.evaluate(async()=>{
 const {DYNAMIC_SOLAR_FS}=await import('/apps/web/js/solarAtmosphereShaders.js');
 const {SOLAR_STRAND_FS}=await import('/apps/web/js/solarStrandShaders.js');
 const gl=document.createElement('canvas').getContext('webgl2');gl.getExtension('EXT_color_buffer_float');
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,null);
 const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);gl.viewport(0,0,1,1);
 const prefix='#version 300 es\nprecision highp float;\n';
 const triangle='gl_Position=vec4(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.,0.,1.);';
 function program(vs,fs){const p=gl.createProgram();for(const [type,source] of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);return p;}
 function f(p,n,v){gl.uniform1f(gl.getUniformLocation(p,n),v);}function i(p,n,v){gl.uniform1i(gl.getUniformLocation(p,n),v);}
 function v(p,n,a){gl.uniform3fv(gl.getUniformLocation(p,n),a);}
 function read(){gl.drawArrays(gl.TRIANGLES,0,3);const a=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,a);const error=gl.getError();if(error)throw Error('GL '+error);return [...a];}
 const atmo=program(prefix+'out vec3 v_obj;uniform vec3 u_testTarget;void main(){v_obj=u_testTarget;'+triangle+'}',DYNAMIC_SOLAR_FS);
 // Defined zero-volume texture. Surface is photospheric and needs no EUV texture.
 gl.activeTexture(gl.TEXTURE0);const volume=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,volume);gl.texImage3D(gl.TEXTURE_3D,0,gl.R32F,1,1,1,0,gl.RED,gl.FLOAT,new Float32Array([0]));gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 i(atmo,'u_volume',0);i(atmo,'u_pulse',0);i(atmo,'u_surface',1);v(atmo,'u_camObj',[5,0,0]);v(atmo,'u_rotation',[14.1844,0,0]);f(atmo,'u_extent',2.5);i(atmo,'u_samples',8);i(atmo,'u_channel',1);i(atmo,'u_debug',1);i(atmo,'u_showCorona',1);i(atmo,'u_showDiffuse',1);f(atmo,'u_eventSeconds',-1);
 gl.uniform4f(gl.getUniformLocation(atmo,'u_surfaceRecipe'),5772,.6,1000,0);
 i(atmo,'u_pass',0);const off=read();i(atmo,'u_coolEnabled',1);const cool=read();
 i(atmo,'u_pass',2);const sourceOnly=read();i(atmo,'u_coolEnabled',0);const disabledVolume=read();f(atmo,'u_eventSeconds',1800);const event=read();f(atmo,'u_eventSeconds',3600);const eventEnded=read();
 f(atmo,'u_eventSeconds',-1);i(atmo,'u_coolEnabled',1);
 gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,1,1,1,gl.RED,gl.FLOAT,new Float32Array([.1]));const mixedVolume=read();
 gl.texSubImage3D(gl.TEXTURE_3D,0,0,0,0,1,1,1,gl.RED,gl.FLOAT,new Float32Array([0]));
 v(atmo,'u_camObj',[0,5,0]);v(atmo,'u_testTarget',[1.1,0,0]);const offLimb=read();
 const results={off,cool,sourceOnly,disabledVolume,event,eventEnded,mixedVolume,offLimb,strands:{}};
 for(const [name,a,b] of [['foreground',1.2,1.3],['background',1.02,1.1],['crossing',1.04,1.2]]){
 const p=program(prefix+`out vec3 v_plane;flat out vec4 v_start,v_end,v_pulse,v_arc;void main(){v_plane=vec3(0);v_start=vec4(${a},0,0,.02);v_end=vec4(${b},0,0,1);v_pulse=vec4(0);v_arc=vec4(0,1,1,0);${triangle}}`,SOLAR_STRAND_FS);
 v(p,'u_camera',[5,0,0]);v(p,'u_rotation',[0,0,0]);i(p,'u_transfer',1);gl.uniformMatrix4fv(gl.getUniformLocation(p,'u_mvp'),false,new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
 const disabled=read()[0];i(p,'u_coolEnabled',1);const enabled=read()[0];results.strands[name]={disabled,enabled};
 }
 return results;
 });
 const T=Math.exp(-2),source=.004*(1-T);
 assert.ok(Math.abs(result.cool[1]/result.off[1]-T)<1e-5);
 assert.ok(Math.abs(result.sourceOnly[0]-source)<1e-7);assert.ok(Math.abs(result.cool[0]-source)<1e-7);
 assert.ok(Math.abs(result.mixedVolume[0]-(.1*(1.3125+.1875*T)+source))<1e-6);assert.ok(result.offLimb[0]>0);assert.equal(result.offLimb[1],0);
 assert.equal(result.disabledVolume[0],0);assert.ok(result.event[0]>0);assert.equal(result.eventEnded[0],0);
 assert.ok(Math.abs(result.strands.foreground.enabled-result.strands.foreground.disabled)<1e-6);
 assert.ok(Math.abs(result.strands.background.enabled/result.strands.background.disabled-T)<1e-5);
 assert.ok(Math.abs(result.strands.crossing.enabled-(.08+.08*T))<1e-6);
 console.log(JSON.stringify({passed:true,...result},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
