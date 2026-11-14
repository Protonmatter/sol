/** Image-gate preconditions only. No GL queries, renderer changes or pixel tolerances. */
export async function readRenderPairState(){
  const entry=document.querySelector('script[type="module"][src^="app.js"]');
  if(!entry)throw new Error('Application module missing from round-trip capture');
  const token=new URL(entry.src).search;
  const [{store},{appearanceReference,earthCloudRole}]=await Promise.all([
    import(`./js/store.js${token}`),import(`./js/planetAppearance.js${token}`),
  ]);
  const s=store.orrery,canvas=document.getElementById('orreryCanvas'),rect=canvas?.getBoundingClientRect();
  const roles=s.useTextures?['surface',...(s.earthNight?['night-lights']:[]),...(s.earthWeather?[earthCloudRole(s)]:[]),...(s.earthIce?['sea-ice']:[])]:[];
  const maps=Object.fromEntries(roles.map(role=>{const asset=appearanceReference('Earth',role);return asset?[asset.id,s.appearanceStatus[asset.id]??'deferred']:['missing:'+role,'unavailable'];}));
  const body=s.bodies.find(body=>body.name==='Earth');
  const value={schema:'render-pair-state.v1',body:'Earth',active:s.active,animate:s.animate,epoch:s.renderUnix,
    camera:{anchor:s.anchor,az:s.az,el:s.el,radius:s.radius,freeFly:s.freeFly,galaxy:s.galaxy,topDown:s.topDown},
    quality:{planetLook:s.planetLook,useTextures:s.useTextures,opticsEnabled:s.opticsEnabled,terrainEnabled:s.terrainEnabled,
      earthNight:s.earthNight,earthWeather:s.earthWeather,earthIce:s.earthIce,hdrEnabled:s.hdrEnabled,exaggeration:s.exaggeration},
    geometry:canvas&&rect?[canvas.width,canvas.height,rect.width,rect.height]:null,
    earthPosition:body?[body.x_au,body.y_au,body.z_au]:null,maps,base:s.programStatus?.base,physical:s.programStatus?.physical,
    optics:s.opticsStatus?.Earth,scattering:s.scatteringStatus?.Earth,frame:s.scatteringFrame,
    terrainRendered:s.terrainRendered?.Earth,engineError:s.engineError||null};
  return JSON.parse(JSON.stringify(value));
}

export function inspectRenderPairState(value,{requirePhysical=false}={}){
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const integer=value=>Number.isSafeInteger(value)&&value>=0;
  const loading=reason=>({state:'loading',reason}),unavailable=reason=>({state:'unavailable',reason});
  if(value?.schema!=='render-pair-state.v1'||value.body!=='Earth')return unavailable('Unknown round-trip state schema/body');
  if(value.engineError)return unavailable('System engine error: '+value.engineError);
  if(value.active!==true||value.animate!==false||value.camera?.anchor!=='Earth'
    ||value.camera.freeFly!==false||value.camera.galaxy!==false||value.camera.topDown!==false)
    return unavailable('Round-trip requires the paused Earth orbit camera');
  if(!finite(value.epoch)||!['az','el','radius'].every(key=>finite(value.camera[key]))||value.camera.radius<=0)
    return unavailable('Unknown clock or camera');
  const q=value.quality;
  if(!q||q.planetLook!=='source-qualified'||!finite(q.exaggeration)||q.exaggeration<=0
    ||!['useTextures','opticsEnabled','terrainEnabled','earthNight','earthWeather','earthIce','hdrEnabled'].every(key=>typeof q[key]==='boolean'))
    return unavailable('Unknown source-qualified material settings');
  if(!Array.isArray(value.geometry)||value.geometry.length!==4||!value.geometry.every(x=>finite(x)&&x>0)
    ||!value.geometry.slice(0,2).every(Number.isSafeInteger)||!Array.isArray(value.earthPosition)||value.earthPosition.length!==3
    ||!value.earthPosition.every(finite))return unavailable('Unknown canvas or Earth position');
  if(value.base==='unavailable')return unavailable('Base program unavailable');
  if(value.base!=='ready')return loading('Base program not ready');
  if(!value.maps||typeof value.maps!=='object'||Array.isArray(value.maps))return unavailable('Unknown image-map state');
  if(q.useTextures&&Object.keys(value.maps).length===0)return unavailable('Demanded image maps missing');
  if(Object.values(value.maps).includes('unavailable'))return unavailable('Reference image unavailable');
  if(Object.values(value.maps).some(state=>state!=='ready'))return loading('Reference images not ready');
  const frame=value.frame;
  if(!frame||!integer(frame.contextGeneration)||!integer(frame.sceneSerial)||!Object.is(frame.epoch,value.epoch))
    return loading('Current scene frame not published');
  if(typeof value.terrainRendered!=='boolean')return loading('Earth material has not submitted');
  if(!q.opticsEnabled){return requirePhysical?unavailable('Required physical optics disabled'):{state:'ready',path:'base'};}
  if(value.physical==='unavailable'||value.optics==='unavailable'||value.scattering?.state==='unavailable')
    return requirePhysical?unavailable('Required Earth optics unavailable'):{state:'ready',path:'degraded'};
  if(value.physical!=='ready'||value.optics!=='ready')return loading('Earth optical programs/fields not ready');
  const scattering=value.scattering,submission=scattering?.submission;
  if(Array.isArray(scattering?.glErrors)&&scattering.glErrors.length)return unavailable('Earth scattering reported GL errors');
  if(scattering?.state!=='submitted'||!integer(scattering.programGeneration)
    ||scattering.contextGeneration!==frame.contextGeneration||submission?.contextGeneration!==frame.contextGeneration
    ||submission?.sceneSerial!==frame.sceneSerial||!Object.is(submission?.epoch,value.epoch))
    return loading('Earth scattering submission does not match the current scene');
  return {state:'ready',path:'physical'};
}

export function assertRenderPairStable(before,after,options={}){
  const first=inspectRenderPairState(before,options),last=inspectRenderPairState(after,options);
  if(first.state!=='ready'||last.state!=='ready')throw new Error(`Round-trip state not settled: ${first.reason||first.path}; ${last.reason||last.path}`);
  const ordered=value=>Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]]));
  const identity=value=>({epoch:value.epoch,camera:{anchor:value.camera.anchor,el:value.camera.el,radius:value.camera.radius,
    freeFly:value.camera.freeFly,galaxy:value.camera.galaxy,topDown:value.camera.topDown},quality:ordered(value.quality),
    geometry:value.geometry,earthPosition:value.earthPosition,maps:ordered(value.maps),base:value.base,physical:value.physical,
    optics:value.optics,terrainRendered:value.terrainRendered,contextGeneration:value.frame.contextGeneration,
    ...(first.path==='physical'?{programGeneration:value.scattering.programGeneration}:{}),path:inspectRenderPairState(value,options).path});
  if(JSON.stringify(identity(before))!==JSON.stringify(identity(after)))throw new Error('Round-trip clock, camera, material or rendering identity changed');
  const delta=after.camera.az-before.camera.az;
  const wrapped=Math.atan2(Math.sin(delta),Math.cos(delta));
  // This allowance covers only binary64 arithmetic in the synthetic 2π gesture.
  const rounding=32*Number.EPSILON;
  if(!Number.isFinite(delta)||!Number.isFinite(wrapped)||Math.abs(wrapped)>rounding)throw new Error('Round-trip azimuth did not return within binary64 gesture precision');
  return {schema:'render-pair-state-comparison.v1',settled:true,path:first.path,wrappedAzimuthDelta:wrapped,
    scope:'Matched recorded state and current submission identities; not GPU completion or physical-content qualification.'};
}

export async function waitForRenderPairState(page,{deadlineMs,requirePhysical=false}={}){
  if(!Number.isFinite(deadlineMs))throw new Error('Original System deadline required for image baseline');
  const sample=new (Object.getPrototypeOf(async function(){}).constructor)('options',`
    if(performance.now()>=options.deadlineMs)return {expired:true,state:null,assessment:null,pageTimeMs:performance.now()};
    const state=await (${readRenderPairState.toString()})();
    return {expired:performance.now()>=options.deadlineMs,state,
      assessment:(${inspectRenderPairState.toString()})(state,options),pageTimeMs:performance.now()};
  `);
  const options={deadlineMs,requirePhysical};let initial=null,terminal=null,handle,primaryFailure=null;
  try{
    initial=await page.evaluate(sample,options);terminal=initial;
    if(initial.expired)throw new Error('Original System deadline elapsed before image baseline');
    if(initial.assessment.state==='loading'){
      terminal=null;
      const predicate=new (Object.getPrototypeOf(async function(){}).constructor)('options',`
        const value=await (${sample.toString()})(options);
        return value.expired||value.assessment.state!=='loading'?value:false;
      `);
      handle=await page.waitForFunction(predicate,{timeout:Math.min(75000,Math.max(1,deadlineMs-initial.pageTimeMs)),polling:50},options);
      terminal=await handle.jsonValue();
    }
    if(terminal.expired)throw new Error('Original System deadline elapsed settling image baseline');
    if(terminal.assessment.state!=='ready')throw new Error('Round-trip baseline unavailable: '+terminal.assessment.reason);
    const stillWithin=await page.evaluate(deadline=>performance.now()<deadline,deadlineMs);
    if(!stillWithin)throw new Error('Original System deadline elapsed settling image baseline');
    return terminal.state;
  }catch(error){
    const failure=error instanceof Error?error:new Error(String(error));
    primaryFailure=failure;
    try{failure.renderPairReadiness={initial,terminal,scope:'Initial and terminal samples when available; a timed-out loading poll has no terminal sample.'};}catch{}
    throw failure;
  }finally{
    if(handle)try{await handle.dispose();}catch(cleanupError){
      if(primaryFailure){
        try{primaryFailure.renderPairCleanupError=String(cleanupError);}catch{}
      }else{
        const failure=cleanupError instanceof Error?cleanupError:new Error(String(cleanupError));
        try{failure.renderPairReadiness={initial,terminal,cleanupError:String(cleanupError)};}catch{}
        throw failure;
      }
    }
  }
}
