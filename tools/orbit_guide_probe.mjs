import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PNG} from 'pngjs';
import {ellipse3d,perspective,lookAt,mul} from '../apps/web/js/orreryMath.js';
import {orbitNearPlane} from '../apps/web/js/orbitCamera.js';
import {BODY,AU_KM} from '../apps/web/js/bodyData.js';

const FIXED_UNIX=-2209075197.2963734; // Retained model JD2415019.5 / public UTC numeric mapping.
const CONTROLS=['orreryAnimate','orreryShowSky','orreryShowLabels','orreryShowMoons','orreryShowSmall',
  'orreryShowSunEq','orreryTextures','orreryTrueScale','orreryTopDown','orreryFreeFly','orreryShowOrbits'];

export function assertOrbitGuidePair(offBytes,onBytes,plan) {
  const off=PNG.sync.read(offBytes),on=PNG.sync.read(onBytes);
  assert.ok(off.width>=32&&off.height>=32,'Orbit capture is too small');
  assert.equal(on.width,off.width);assert.equal(on.height,off.height);
  const {width,height,center,coreRadius,samples}=plan;
  assert.equal(width,off.width);assert.equal(height,off.height);
  assert.ok(Array.isArray(center)&&center.length===2&&center.every(Number.isFinite));
  assert.ok(Number.isFinite(coreRadius)&&coreRadius>0&&coreRadius<Math.min(width,height)*.4);
  assert.ok(center[0]>coreRadius&&center[0]<width-coreRadius&&center[1]>coreRadius&&center[1]<height-coreRadius);
  assert.ok(Array.isArray(samples)&&samples.length>=8,'Not enough expected visible orbit samples');
  for(const point of samples)assert.ok(Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)
    &&point[0]>=3&&point[0]<width-3&&point[1]>=3&&point[1]<height-3
    &&Math.hypot(point[0]-center[0],point[1]-center[1])>coreRadius+2,'Invalid expected orbit sample');
  const changed=new Uint8Array(width*height);
  let changedPixels=0,corePixels=0,coreVisiblePixels=0,coreChangedPixels=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const pixel=y*width+x,i=pixel*4;
    const delta=Math.max(...[0,1,2].map(c=>Math.abs(on.data[i+c]-off.data[i+c])));
    if(delta>=8){changed[pixel]=1;changedPixels++;}
    if(Math.hypot(x-center[0],y-center[1])<=coreRadius){
      corePixels++;if(Math.max(off.data[i],off.data[i+1],off.data[i+2])>12)coreVisiblePixels++;
      if(delta>=8)coreChangedPixels++;
    }
  }
  assert.ok(coreVisiblePixels/corePixels>=.1,'Opaque planet is absent from orbit capture');
  assert.equal(coreChangedPixels,0,'Planet changed between orbit captures');
  assert.ok(changedPixels>=Math.max(12,Math.ceil(Math.min(width,height)*.1)),'Orbit guide is missing from the physical-scale view');
  assert.ok(changedPixels/(width*height)<=.03,'Orbit toggle changed too much of the scene');
  let matched=0;
  for(const [x,y] of samples){
    let hit=false;
    for(let yy=Math.floor(y)-2;yy<=Math.ceil(y)+2;yy++)for(let xx=Math.floor(x)-2;xx<=Math.ceil(x)+2;xx++)
      if(xx>=0&&xx<width&&yy>=0&&yy<height&&changed[yy*width+xx])hit=true;
    if(hit)matched++;
  }
  const sampleCoverage=matched/samples.length;
  assert.ok(sampleCoverage>=.8,'Visible guide does not follow the expected ellipse');
  return {changedPixels,corePixels,coreVisiblePixels,coreChangedPixels,expectedSamples:samples.length,matchedSamples:matched,sampleCoverage};
}

// Independent geometry oracle: evaluate points from the original ellipse3d
// element rotation. Do not call the new adaptive projectOrbitLines renderer.
export function orbitGuidePlan(body,camera,width,height) {
  assert.equal(body.name,'Neptune');
  const center=[body.x_au,body.y_au,body.z_au],{radius,az}=camera,fov=42*Math.PI/180;
  const extent=Math.max(BODY.Neptune.radiusKm,BODY.Neptune.rings.outerKm)/AU_KM;
  const vp=mul(perspective(fov,width/height,orbitNearPlane(radius,extent),800),
    lookAt([center[0],center[1],center[2]+radius],center,[Math.sin(az),Math.cos(az),0]));
  const project=p=>{
    const clip=[0,1,2,3].map(r=>vp[r]*p[0]+vp[4+r]*p[1]+vp[8+r]*p[2]+vp[12+r]);
    return clip.slice(0,3).map(v=>v/clip[3]);
  };
  const points=ellipse3d(body),a=body.a_au,e=body.ecc,b=a*Math.sqrt(1-e*e);
  const x=points[0].map(v=>v/(a*(1-e))),y=points[40].map((v,j)=>(v+a*e*x[j])/b);
  const dot=(u,v)=>u.reduce((sum,n,j)=>sum+n*v[j],0);
  const phase=Math.atan2(dot(center,y)/b,(dot(center,x)+a*e)/a);
  const bodyRadius=BODY.Neptune.radiusKm/AU_KM*height/(2*Math.tan(fov/2)*radius);
  const coreRadius=.45*BODY.Neptune.polarKm/AU_KM*height/(2*Math.tan(fov/2)*radius);
  const samples=[];
  for(let k=-96;k<=96;k++){
    const angle=phase+k/96*1.3*radius/a;
    const ndc=project(x.map((v,j)=>a*(Math.cos(angle)-e)*v+b*Math.sin(angle)*y[j]));
    const px=(ndc[0]+1)*width/2,py=(1-ndc[1])*height/2;
    if(Math.abs(ndc[2])<1&&px>=3&&px<width-3&&py>=3&&py<height-3
      &&Math.hypot(px-width/2,py-height/2)>1.35*bodyRadius+6)samples.push([px,py]);
  }
  return {width,height,center:[width/2,height/2],coreRadius,bodyRadius,samples};
}

export function orbitGuideCapturePlan(drawing,geometry,width,height) {
  const {before,after}=geometry;
  assert.deepEqual(before,after,'Canvas geometry changed during orbit capture');
  assert.ok(Array.isArray(before)&&before.length===8&&before.every(Number.isFinite));
  const [x,y,cssWidth,cssHeight,pageX,pageY,backingWidth,backingHeight]=before;
  assert.ok(cssWidth>0&&cssHeight>0&&backingWidth>0&&backingHeight>0);
  assert.equal(drawing.width,backingWidth);assert.equal(drawing.height,backingHeight);
  // canvasScreenshot uses a rounded CSS page clip at the harness's DPR1.
  // Projection uses backing-buffer aspect; map its points through the actual
  // CSS extent and then subtract the crop's origin offset. These can differ by
  // one pixel even when the scene and screenshot are both correctly sized.
  const cropX=Math.round(x+pageX)-(x+pageX),cropY=Math.round(y+pageY)-(y+pageY);
  assert.equal(width,Math.round(cssWidth-cropX));assert.equal(height,Math.round(cssHeight-cropY));
  const scaleX=cssWidth/backingWidth,scaleY=cssHeight/backingHeight;
  const map=([px,py])=>[px*scaleX-cropX,py*scaleY-cropY];
  const center=map(drawing.center),coreRadius=drawing.coreRadius*Math.min(scaleX,scaleY);
  const samples=drawing.samples.map(map).filter(([px,py])=>px>=3&&px<width-3&&py>=3&&py<height-3
    &&Math.hypot(px-center[0],py-center[1])>coreRadius+2);
  return {...drawing,width,height,center,coreRadius,bodyRadius:drawing.bodyRadius*Math.max(scaleX,scaleY),samples,
    captureTransform:{cropX,cropY,scaleX,scaleY}};
}

async function scene(page) {
  return page.evaluate(async()=>{
    const entry=document.querySelector('script[type="module"][src^="app.js"]');
    const {store}=await import(`./js/store.js${new URL(entry.src).search}`),s=store.orrery;
    const canvas=document.getElementById('orreryCanvas'),gl=canvas.getContext('webgl2');
    return {epoch:s.renderUnix,metadataEpoch:s.metadataUnix,camera:{radius:s.radius,az:s.az,el:s.el},
      anchor:s.anchor,offsetYears:s.offsetYears,simElapsed:s.simElapsed,selected:s.selected,
      trueScale:s.trueScale,topDown:s.topDown,freeFly:s.freeFly,animate:s.animate,galaxy:s.galaxy,
      bodies:s.bodies.map(b=>({...b})),width:canvas.width,height:canvas.height,glError:gl.getError(),
      curveStatus:s.orbitCurveStatus??null,pinnedUnixMs:globalThis.__solPinnedUnixMs};
  });
}
async function metadataReady(page,unix) {
  await page.waitForFunction(async expected=>{
    const entry=document.querySelector('script[type="module"][src^="app.js"]');
    const {store}=await import(`./js/store.js${new URL(entry.src).search}`),s=store.orrery;
    return Math.abs(s.renderUnix-expected)<.001&&s.metadataUnix===s.renderUnix&&s.bodies.length===9&&!s.engineError;
  },{timeout:20000},unix);
}
const comparable=s=>({epoch:s.epoch,metadataEpoch:s.metadataEpoch,camera:s.camera,anchor:s.anchor,
  trueScale:s.trueScale,topDown:s.topDown,freeFly:s.freeFly,animate:s.animate,galaxy:s.galaxy,
  bodies:s.bodies,width:s.width,height:s.height,glError:s.glError});

export async function verifyOrbitGuide(page,directory,{capture}) {
  const initial=await scene(page);await metadataReady(page,initial.epoch);
  const before=await scene(page);
  assert.equal(before.animate,false);assert.equal(before.galaxy,false);assert.equal(before.freeFly,false);
  assert.equal(before.offsetYears,0);assert.equal(before.simElapsed,0);assert.equal(before.glError,0);
  assert.ok(Number.isFinite(before.pinnedUnixMs));
  const controls=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id).checked])),CONTROLS);
  const record={schema:'orbit-guide-render-regression.v1',qualification_granted:false,passed:false,
    scope:'Fixed supported physical-scale scene, original ellipse oracle, saved pixel pair and model/camera restoration.',before};
  let failure;
  try{
    await page.evaluate(({unix,ids})=>{
      globalThis.__solPinnedUnixMs=unix*1000;
      for(const id of ids){const node=document.getElementById(id);node.checked=['orreryTrueScale','orreryTopDown'].includes(id);node.dispatchEvent(new Event('change',{bubbles:true}));}
      document.getElementById('orreryNow').click();
    },{unix:FIXED_UNIX,ids:CONTROLS});
    await metadataReady(page,FIXED_UNIX);
    await page.select('#orreryAnchor','Neptune');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const offPath=path.join(directory,'neptune-orbit-guide-off.png'),onPath=path.join(directory,'neptune-orbit-guide-on.png');
    const off=await capture(page,offPath);
    const offState=await scene(page),image=PNG.sync.read(off);
    record.off=offState;
    const offGeometry=JSON.parse(fs.readFileSync(offPath.replace(/\.png$/,'.geometry.json'),'utf8'));
    assert.deepEqual(offGeometry.before.slice(6),[offState.width,offState.height]);
    const body=offState.bodies.find(b=>b.name==='Neptune');
    const drawing=orbitGuidePlan(body,offState.camera,offState.width,offState.height);
    const plan=orbitGuideCapturePlan(drawing,offGeometry,image.width,image.height);
    plan.samples=await page.$eval('#orreryCanvas',(canvas,{samples,captureTransform})=>{
      const rect=canvas.getBoundingClientRect();
      return samples.filter(([x,y])=>document.elementFromPoint(rect.left+x+captureTransform.cropX,rect.top+y+captureTransform.cropY)===canvas);
    },plan);
    await page.$eval('#orreryShowOrbits',node=>{node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));});
    const on=await capture(page,onPath);
    const onState=await scene(page);
    const onGeometry=JSON.parse(fs.readFileSync(onPath.replace(/\.png$/,'.geometry.json'),'utf8'));
    record.geometry={off:offGeometry,on:onGeometry};
    assert.deepEqual(onGeometry,offGeometry,'Orbit pair changed its capture geometry');
    assert.deepEqual(comparable(onState),comparable(offState),'Orbit toggle changed the fixed model or camera');
    assert.equal(onState.glError,0);assert.notEqual(onState.curveStatus?.capped,true);
    record.on=onState;record.plan=plan;
    record.pixels=assertOrbitGuidePair(off,on,plan);record.passed=true;
  }catch(error){failure=error;record.error=error.message;}
  finally{
    try{
      await page.evaluate(async({clock,controls,anchor,camera})=>{
        globalThis.__solPinnedUnixMs=clock;
        for(const [id,value]of Object.entries(controls)){const node=document.getElementById(id);node.checked=value;node.dispatchEvent(new Event('change',{bubbles:true}));}
        document.getElementById('orreryNow').click();
        const focus=document.getElementById('orreryAnchor');focus.value=anchor;focus.dispatchEvent(new Event('change',{bubbles:true}));
        const entry=document.querySelector('script[type="module"][src^="app.js"]');
        const {store}=await import(`./js/store.js${new URL(entry.src).search}`);Object.assign(store.orrery,camera);
        const orbits=document.getElementById('orreryShowOrbits');orbits.dispatchEvent(new Event('change',{bubbles:true}));
      },{clock:before.pinnedUnixMs,controls,anchor:before.anchor,camera:before.camera});
      await metadataReady(page,before.epoch);
      record.restored=await scene(page);
      assert.deepEqual(comparable(record.restored),comparable(before),'Orbit fixture did not restore original model/camera');
      const restoredControls=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,document.getElementById(id).checked])),CONTROLS);
      assert.deepEqual(restoredControls,controls);
    }catch(error){record.restoreError=error.message;if(!failure)failure=error;record.passed=false;}
    fs.writeFileSync(path.join(directory,'orbit-guide-regression.json'),JSON.stringify(record,null,2)+'\n');
  }
  if(failure)throw failure;
  return record;
}
