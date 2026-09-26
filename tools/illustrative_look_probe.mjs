import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {assertFrameChanged} from './visual_assertions.mjs';

// Observe the actual app draws after the existing scientific scene assertions.
export async function verifyIllustrativeLooks(page,directory,capture){
  const evidence={status:'failed'};
  await page.evaluate(async()=>{
    const token=new URL(document.querySelector('script[type="module"][src^="app.js"]').src).search;
    const {store}=await import(`./js/store.js${token}`);
    const state=store.orrery,gl=document.getElementById('orreryCanvas').getContext('webgl2');
    const original=gl.drawElements,priorHdr=state.hdrEnabled,priorRadar=state.venusRadar;
    const textures=new WeakMap();let nextTexture=0;
    state.hdrEnabled=false;
    const probe={state,body:'Mercury',draws:[],errors:[]};
    globalThis.__solIllustrativeProbe=probe;
    gl.drawElements=function(...args){
      const priorError=this.getError();if(priorError!==this.NO_ERROR)probe.errors.push({stage:'before-draw',error:priorError});
      const result=Reflect.apply(original,this,args),program=this.getParameter(this.CURRENT_PROGRAM);
      const drawError=this.getError();if(drawError!==this.NO_ERROR)probe.errors.push({stage:'draw',error:drawError});
      const uniform=name=>{const location=this.getUniformLocation(program,name);return location?this.getUniform(program,location):null;};
      // The base shader can optimize out physical-radius uniforms. Its submitted
      // model translation still identifies the actual planet in SOL's AU frame.
      const model=uniform('u_model'),body=state.bodies.find(item=>item.name===probe.body);
      if(model&&body&&['x_au','y_au','z_au'].every((key,index)=>model[12+index]===Math.fround(body[key]))){
        const unit=uniform('u_tex'),active=this.getParameter(this.ACTIVE_TEXTURE);
        this.activeTexture(this.TEXTURE0+unit);const texture=this.getParameter(this.TEXTURE_BINDING_2D);this.activeTexture(active);
        if(texture&&!textures.has(texture))textures.set(texture,++nextTexture);
        probe.draws.push({body:probe.body,center:Array.from(model.slice(12,15)),mode:uniform('u_mode'),useTex:uniform('u_useTex'),texMode:uniform('u_texMode'),
          illustrativeLinear:uniform('u_illustrativeLinear'),texture:texture?textures.get(texture):null,
          depthWrites:this.getParameter(this.DEPTH_WRITEMASK)});
        if(probe.draws.length>128)probe.draws.shift();
        const error=this.getError();if(error!==this.NO_ERROR)probe.errors.push({stage:'probe',error});
      }
      return result;
    };
    probe.cleanup=()=>{gl.drawElements=original;state.hdrEnabled=priorHdr;
      const radar=document.getElementById('orreryVenusRadar');radar.checked=priorRadar;radar.dispatchEvent(new Event('change',{bubbles:true}));
      window.dispatchEvent(new Event('resize'));};
  });
  const read=()=>page.evaluate(()=>{
    const {state,draws,errors}=globalThis.__solIllustrativeProbe;
    return {epoch:state.renderUnix,positions:state.bodies.map(({name,x_au,y_au,z_au})=>({name,x_au,y_au,z_au})),
      camera:[state.az,state.el,state.radius],draws,errors};
  });
  // A synthetic window resize does not notify the canvas ResizeObserver. Submit
  // the unchanged size control through its real input handler to repaint paused scenes.
  const repaint=()=>page.evaluate(()=>{globalThis.__solIllustrativeProbe.draws=[];
    document.getElementById('orrerySize').dispatchEvent(new Event('input',{bubbles:true}));});
  try{
    await page.$eval('#orreryAnimate',node=>{node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.select('#orreryPlanetLook','illustrative');
    await page.select('#orreryAnchor','Mercury');
    await page.waitForFunction(()=>globalThis.__solIllustrativeProbe.state.illustrativeStatus.Mercury==='ready',{timeout:30000});
    await repaint();await capture(page,path.join(directory,'mercury-illustrative.png'));
    evidence.mercury=await read();
    assert.ok(evidence.mercury.draws.some(draw=>draw.mode===0&&draw.useTex===1&&draw.texMode===0&&draw.illustrativeLinear===1&&draw.texture),
      'Mercury must submit its illustrative map through the real shader');
    assert.deepEqual(evidence.mercury.errors,[],'Illustrative Mercury must draw without GL errors');

    await page.evaluate(()=>{const probe=globalThis.__solIllustrativeProbe;probe.body='Venus';probe.draws=[];});
    await page.select('#orreryAnchor','Venus');
    await page.$eval('#orreryVenusRadar',node=>{node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>globalThis.__solIllustrativeProbe.state.illustrativeStatus.Venus==='ready',{timeout:30000});
    await repaint();const layered=await capture(page,path.join(directory,'venus-radar-illustrative-shell.png'));
    evidence.venus=await read();
    const grounds=evidence.venus.draws.filter(draw=>draw.mode===0&&draw.useTex===1&&draw.texMode===3&&draw.illustrativeLinear===0);
    const shells=evidence.venus.draws.filter(draw=>draw.mode===4&&draw.useTex===1&&draw.texMode===0&&draw.illustrativeLinear===1);
    assert.ok(grounds.length&&shells.length,'Venus must draw both registered Magellan ground and the mode-4 illustrative shell');
    assert.ok(shells.every(draw=>!draw.depthWrites&&draw.texture&&draw.texture!==grounds.at(-1).texture),
      'The transparent shell must use a separate texture without writing depth');
    assert.deepEqual(evidence.venus.errors,[],'Layered Venus must draw without GL errors');

    await page.select('#orreryPlanetLook','source-qualified');await repaint();
    const reference=await capture(page,path.join(directory,'venus-radar-source-qualified.png'));
    evidence.reference=await read();
    assert.ok(evidence.reference.draws.some(draw=>draw.mode===0&&draw.texMode===3),'Reference comparison must retain Magellan ground');
    assert.ok(evidence.reference.draws.every(draw=>draw.mode!==4),'Source-qualified must remove the illustrative shell');
    for(const key of ['epoch','positions','camera'])assert.deepEqual(evidence.reference[key],evidence.venus[key],`Venus look toggle preserves ${key}`);
    assert.deepEqual(evidence.reference.errors,[]);
    evidence.venusPixelChange=assertFrameChanged(layered,reference);
    evidence.status='passed';
    return evidence;
  }finally{
    fs.writeFileSync(path.join(directory,'illustrative-looks.json'),JSON.stringify(evidence,null,2)+'\n');
    await page.evaluate(()=>{globalThis.__solIllustrativeProbe?.cleanup();delete globalThis.__solIllustrativeProbe;});
  }
}
