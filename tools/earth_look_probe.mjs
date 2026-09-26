import fs from 'node:fs';
import path from 'node:path';
import {assertBlueEarth,assertFrameChanged} from './visual_assertions.mjs';

// Runs after the existing scientific scene gates, in the test-owned browser.
export async function verifyEarthLook(page,directory,capture){
  const evidence={source_site_version:7,source_commit:'12f633b27e435479f4b2322b613f8dd204847d2e'};
  await page.evaluate(async()=>{
    const token=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import(`./js/store.js${token}`);
    globalThis.__solEarthProbeStore=store;
    const state=store.orrery;
    const priorHdr=state.hdrEnabled;state.hdrEnabled=false;
    const checked=(id,value)=>{const node=document.getElementById(id);if(node.checked!==value){node.checked=value;node.dispatchEvent(new Event('change',{bubbles:true}));}};
    checked('orreryAnimate',false);checked('orreryTextures',true);checked('orreryEarthWeather',true);
    checked('orreryEarthNight',true);checked('orreryEarthIce',false);checked('orreryOptics',true);
    const select=(id,value)=>{const node=document.getElementById(id);node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));};
    select('orreryEarthCloudSource','composite');select('orreryPlanetLook','illustrative');
    select('orreryAnchor','Earth');state.radius=.5;
    const gl=document.getElementById('orreryCanvas').getContext('webgl2'),original=gl.drawElements;
    globalThis.__solEarthDraws=[];
    gl.drawElements=function(...args){
      const result=Reflect.apply(original,this,args),program=gl.getParameter(gl.CURRENT_PROGRAM);
      const exposure=gl.getUniformLocation(program,'u_earthLookExposure');
      if(exposure)globalThis.__solEarthDraws.push({exposure:gl.getUniform(program,exposure),
        pass:gl.getUniform(program,gl.getUniformLocation(program,'u_earthLookPass')),
        clouds:gl.getUniform(program,gl.getUniformLocation(program,'u_earthWeather')),
        phase:gl.getUniform(program,gl.getUniformLocation(program,'uCloudPhase')),error:gl.getError()});
      return result;
    };
    globalThis.__solEarthProbeCleanup=()=>{gl.drawElements=original;state.hdrEnabled=priorHdr;
      window.dispatchEvent(new Event('resize'));delete globalThis.__solEarthProbeStore;delete globalThis.__solEarthDraws;};
    window.dispatchEvent(new Event('resize'));
  });
  try{
    await page.waitForFunction(()=>globalThis.__solEarthProbeStore.orrery.earthLookStatus==='ready', {timeout:30000});
    const read=()=>page.evaluate(()=>{
      const state=globalThis.__solEarthProbeStore.orrery;
      return {epoch:state.renderUnix,positions:state.bodies.map(({name,x_au,y_au,z_au})=>({name,x_au,y_au,z_au})),
        camera:[state.az,state.el,state.radius],status:state.earthLookStatus,draws:globalThis.__solEarthDraws.slice(-2)};
    });
    const ready=await capture(page,path.join(directory,'earth-sites-v7.png'));
    evidence.ready=await read();evidence.color=assertBlueEarth(ready);
    if(evidence.ready.draws.length!==2||evidence.ready.draws.some(draw=>Math.abs(draw.exposure-1.6)>1e-6||draw.clouds!==1||draw.error!==0))
      throw Error(`Earth look GPU uniforms not established: ${JSON.stringify(evidence.ready)}`);
    await page.$eval('#orreryEarthWeather',node=>{node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
    const clear=await capture(page,path.join(directory,'earth-sites-v7-clouds-off.png'));
    evidence.cloudsOff=await read();evidence.cloudPixelChange=assertFrameChanged(ready,clear);
    if(evidence.cloudsOff.draws.some(draw=>draw.clouds!==0||draw.error!==0))throw Error('Cloud-off did not reach the actual Earth draw');
    for(const key of ['epoch','positions','camera'])if(JSON.stringify(evidence.ready[key])!==JSON.stringify(evidence.cloudsOff[key]))
      throw Error(`Cloud toggle changed ${key}`);
    await page.$eval('#orreryEarthWeather',node=>{node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.select('#orreryPlanetLook','source-qualified');
    await capture(page,path.join(directory,'earth-source-qualified.png'));
    evidence.restored=await read();
    if(evidence.restored.status!=='deferred')throw Error('Source-qualified failed to release Earth look demand');
    evidence.status='passed';
    fs.writeFileSync(path.join(directory,'earth-sites-v7.json'),JSON.stringify(evidence,null,2)+'\n');
    return evidence;
  }finally{
    await page.evaluate(()=>{globalThis.__solEarthProbeCleanup?.();delete globalThis.__solEarthProbeCleanup;});
  }
}
