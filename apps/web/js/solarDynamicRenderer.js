import {createShaderPrograms} from './shaderPrograms.js';
import {loadDynamicScene} from './solarDynamicAssets.js';
import {createSolarAppearanceClient} from './solarDynamicWorkerClient.js';
import {DYNAMIC_SOLAR_VS,DYNAMIC_SOLAR_FS} from './solarAtmosphereShaders.js';
import {createSolarStrandRenderer} from './solarStrandRenderer.js';
import {createSolarEmissionComposition} from './solarEmissionComposition.js';
import {lookSettings} from './solarLookShaders.js';

const UNIFORMS=['u_mvp','u_camObj','u_extent','u_seconds','u_pixelDiameter','u_rate','u_eventSeconds','u_pass','u_channel','u_debug',
  'u_samples','u_hasPulse','u_linearOutput','u_regionCount','u_showCorona','u_volume','u_pulse','u_surface','u_seed','u_rotation',
  'u_surfaceRecipe','u_euvRecipe','u_regions[0]','u_regionTemperature[0]','u_domainWarp','u_coolEnabled','u_showDiffuse',
  'u_emissionRegionCount','u_emissionCenters[0]','u_emissionAxesU[0]','u_emissionAxesV[0]','u_emissionCores[0]','u_emissionCoreGains[0]','u_emissionCoreAxes[0]','u_look'];

/** Float field upload. WebGL2 rejects 3-D uploads from typed arrays while flip-Y
 * or premultiply is enabled, and planet maps elsewhere leave premultiply on after a
 * masked upload. Force both off here and restore the caller's unpack state. */
export function uploadFieldTexture(gl,data,dimensions,components=1) {
  const target=dimensions.length===3?gl.TEXTURE_3D:gl.TEXTURE_2D;
  const handle=gl.createTexture();if(!handle)throw new Error('Solar model texture allocation failed');
  const previous={flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),alignment:gl.getParameter(gl.UNPACK_ALIGNMENT)};
  try{
    // Clear stale errors so the check below only reports this upload.
    for(let i=0;i<8&&gl.getError()!==gl.NO_ERROR;i++);
    gl.bindTexture(target,handle);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    const internal=components===4?gl.RGBA16F:gl.R16F,format=components===4?gl.RGBA:gl.RED;
    if(dimensions.length===3)gl.texImage3D(target,0,internal,dimensions[0],dimensions[1],dimensions[2],0,format,gl.FLOAT,data);
    else gl.texImage2D(target,0,internal,dimensions[0],dimensions[1],0,format,gl.FLOAT,data);
    gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(target,gl.TEXTURE_WRAP_S,dimensions.length===2?gl.REPEAT:gl.CLAMP_TO_EDGE);
    gl.texParameteri(target,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(dimensions.length===3)gl.texParameteri(target,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
    if(gl.getError()!==gl.NO_ERROR)throw new Error('Solar model texture upload failed');
    return handle;
  }catch(error){gl.deleteTexture(handle);throw error;}
  finally{
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,!!previous.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!!previous.premultiply);
    if(Number.isInteger(previous.alignment))gl.pixelStorei(gl.UNPACK_ALIGNMENT,previous.alignment);
  }
}

/** Context-owned renderer: independent demand, atomic resources and no mutation
 * of the scientific engine. Inputs are immutable, source-hashed model products. */
export function createSolarDynamicRenderer(gl,{generation=1,onChange=(_status)=>{}}={}) {
  let disposed=false,serial=0,controller=null,scene=null,resources=null,uniforms=null,pending=null;
  let poseClient=null,pose=null,lastPoseTime=-Infinity,posePending=false;
  let strands=null,composition=null;
  let report={state:'deferred',reason:'Select the illustrative Sun.',id:null,estimatedBytes:0,pose:'deferred',recipeHash:null,selection:null};
  const notify=()=>{if(!disposed)onChange({...report});};
  const manager=createShaderPrograms(gl,{generation,capacity:1});
  const release=()=>{
    if(resources)for(const value of Object.values(resources))if(value)gl.deleteTexture(value);
    resources=null;scene=null;pose=null;uniforms=null;
    strands?.dispose();strands=null;composition?.dispose();composition=null;
  };
  const assertLive=token=>{if(disposed||token!==serial||gl.isContextLost())throw new Error('Solar model demand superseded');};
  function ensure(record,{quality='low'}={}) {
    if(disposed)return Promise.resolve(false);
    if(report.id===record.path&&report.state==='ready')return Promise.resolve(true);
    if(report.id===record.path&&report.state==='unavailable')return Promise.resolve(false);
    if(report.id===record.path&&pending)return pending;
    controller?.abort();poseClient?.dispose();poseClient=null;posePending=false;lastPoseTime=-Infinity;
    release();controller=new AbortController();const token=++serial;
    report={state:'loading',reason:'Loading verified illustrative solar fields.',id:record.path,estimatedBytes:0,pose:'deferred',recipeHash:null,selection:null};notify();
    pending=(async()=>{
      const loaded=await loadDynamicScene(record,{signal:controller.signal,quality});assertLive(token);
      const max3D=gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
      if(!Number.isFinite(max3D)||loaded.volume.dimensions.some(n=>n>max3D))throw new Error('3-D solar textures exceed device capability');
      if(loaded.packet.regions.length>32)throw new Error('Solar region uniform budget exceeded');
      const total=(loaded.surfaceData?.byteLength||0)+loaded.volumeData.byteLength+(loaded.pulseData?.byteLength||0);
      if(total>48*1024*1024)throw new Error('Solar texture staging exceeds its 48 MiB budget');
      const ticket=manager.request('dynamic',DYNAMIC_SOLAR_VS,DYNAMIC_SOLAR_FS);
      const completed=await ticket.done;assertLive(token);
      if(completed.status!=='ready')throw new Error(completed.error||'Dynamic solar program unavailable');
      composition=createSolarEmissionComposition(gl,{generation});await composition.ready();assertLive(token);
      if(loaded.analyticStrands){
        strands=createSolarStrandRenderer(gl,{generation});
        if(!await strands.prepare(loaded.packet))throw new Error(strands.status().reason||'Analytic solar strands unavailable');
        assertLive(token);
      }
      const next={surface:null,volume:null,pulse:null};
      const previousAlignment=gl.getParameter(gl.UNPACK_ALIGNMENT),previousUnit=gl.getParameter(gl.ACTIVE_TEXTURE);
      try{
        gl.activeTexture(gl.TEXTURE0);
        next.surface=loaded.surfaceData?uploadFieldTexture(gl,loaded.surfaceData,loaded.manifest.surface.dimensions):uploadFieldTexture(gl,new Float32Array([0]),[1,1]);
        next.volume=uploadFieldTexture(gl,loaded.volumeData,loaded.volume.dimensions);
        next.pulse=loaded.pulseData?uploadFieldTexture(gl,loaded.pulseData,loaded.volume.dimensions,4):uploadFieldTexture(gl,new Float32Array(4),[1,1,1],4);
        assertLive(token);resources=next;
      }catch(error){for(const handle of Object.values(next))if(handle)gl.deleteTexture(handle);throw error;}
      finally{gl.pixelStorei(gl.UNPACK_ALIGNMENT,previousAlignment);gl.activeTexture(previousUnit);}
      const program=manager.get('dynamic');uniforms=Object.fromEntries(UNIFORMS.map(name=>[name,gl.getUniformLocation(program,name)]));
      // Typed arrays are upload staging only. Keep geometry/provenance, release
      // duplicate CPU voxel buffers once all uploads have succeeded.
      scene={manifest:loaded.manifest,packet:loaded.packet,volume:loaded.volume,hasPulse:!!loaded.pulseData&&!loaded.analyticStrands};
      if(typeof Worker!=='undefined')poseClient=createSolarAppearanceClient();
      report={...report,state:'ready',reason:'Illustrative full sphere; relative emission, no measured far side.',estimatedBytes:total/2,recipeHash:loaded.manifest.recipe_hash??null,selection:loaded.selection};notify();
      return true;
    })().catch(error=>{
      if(token===serial&&!disposed){release();report={...report,state:'unavailable',reason:error.message,estimatedBytes:0};notify();}
      return false;
    }).finally(()=>{if(token===serial)pending=null;});
    return pending;
  }
  function samplePose(seconds) {
    if(!poseClient||posePending||Math.abs(seconds-lastPoseTime)<60||!scene)return;
    const token=serial,identity=scene.manifest;posePending=true;lastPoseTime=seconds;
    poseClient.request({seed:identity.seed,time_s:seconds,recipe_id:identity.id,lod:0}).then(value=>{
      if(disposed||token!==serial)return;
      if(identity.recipe_hash&&value.recipe_hash!==identity.recipe_hash)throw new Error('Solar recipe/engine identity mismatch');
      pose=value;report={...report,pose:'ready'};
    }).catch(error=>{
      if(!disposed&&token===serial){poseClient?.dispose();poseClient=null;report={...report,pose:'unavailable',reason:`Verified precomputed model retained; live descriptor: ${error.message}`};notify();}
    }).finally(()=>{if(token===serial)posePending=false;});
  }
  function drawFields({mvp,camera,seconds,pass=1,channel='euv',pixelDiameter=300,rate=60,linearOutput=false,showCorona=true,showDiffuse=true,coolEnabled=false,look=false,eventSeconds=-1,bindMesh,count}) {
    if(disposed||report.state!=='ready'||!scene||!resources||!uniforms)return false;
    if(!Number.isFinite(seconds)||seconds<0||seconds>scene.manifest.duration_seconds)return false;
    samplePose(seconds);
    const program=manager.get('dynamic');if(!program)return false;
    const packet=scene.packet,surface=pose?.surface??packet.surface,euv=surface.euv_texture??{cell_km:10000,lifetime_s:1200,amplitude:.65};
    gl.useProgram(program);const u=uniforms;
    gl.uniformMatrix4fv(u.u_mvp,false,new Float32Array(mvp));gl.uniform3fv(u.u_camObj,new Float32Array(camera));
    gl.uniform1f(u.u_extent,2.5);gl.uniform1f(u.u_seconds,seconds);gl.uniform1f(u.u_pixelDiameter,pixelDiameter);gl.uniform1f(u.u_rate,rate);
    gl.uniform1f(u.u_eventSeconds,eventSeconds);gl.uniform1i(u.u_pass,pass);gl.uniform1i(u.u_channel,channel==='visible'?1:0);
    gl.uniform1i(u.u_debug,1);gl.uniform1i(u.u_samples,scene.volume.id==='standard'?64:48);gl.uniform1i(u.u_hasPulse,scene.hasPulse?1:0);
    gl.uniform1i(u.u_showCorona,showCorona?1:0);gl.uniform1i(u.u_linearOutput,linearOutput?1:0);gl.uniform1ui(u.u_seed,packet.seed);
    gl.uniform1i(u.u_showDiffuse,showDiffuse?1:0);
    gl.uniform3fv(u.u_rotation,new Float32Array(scene.manifest.rotation.coefficients_deg_per_day));
    gl.uniform4fv(u.u_surfaceRecipe,new Float32Array([surface.quiet_temperature_k,surface.limb_u,surface.granule_km,surface.amplitude_k]));
    gl.uniform4fv(u.u_euvRecipe,new Float32Array([euv.cell_km,euv.lifetime_s,euv.amplitude,packet.emission_model?.kind==='hierarchical_euv_v1'?2:euv.kind==='correlated_value_noise_v1'?1:0]));
    gl.uniform1i(u.u_domainWarp,euv.domain_warp?1:0);
    gl.uniform1i(u.u_coolEnabled,coolEnabled&&channel==='euv'?1:0);gl.uniform1i(u.u_look,lookSettings({look,channel}).look);
    const regions=new Float32Array(128),temperatures=new Float32Array(32);
    packet.regions.forEach((r,i)=>{regions.set([...r.center,r.radius_rad],i*4);temperatures[i]=r.temperature_k;});
    gl.uniform1i(u.u_regionCount,packet.regions.length);gl.uniform4fv(u['u_regions[0]'],regions);gl.uniform1fv(u['u_regionTemperature[0]'],temperatures);
    const emissionRegions=packet.emission_regions??[],centers=new Float32Array(30),axesU=new Float32Array(40),axesV=new Float32Array(40),cores=new Float32Array(160),coreGains=new Float32Array(40),coreAxes=new Float32Array(160);
    emissionRegions.forEach((r,i)=>{
      centers.set(r.center,i*3);axesU.set([...r.axis_u,r.extent_rad[0]],i*4);axesV.set([...r.axis_v,r.extent_rad[1]],i*4);
      r.cores.forEach((core,j)=>{cores.set([...core.center,core.radius_R],(4*i+j)*4);coreGains[4*i+j]=core.emission_relative;coreAxes.set([...core.axis_u,core.structure_relative],(4*i+j)*4);});
    });
    gl.uniform1i(u.u_emissionRegionCount,emissionRegions.length);gl.uniform3fv(u['u_emissionCenters[0]'],centers);gl.uniform4fv(u['u_emissionAxesU[0]'],axesU);gl.uniform4fv(u['u_emissionAxesV[0]'],axesV);gl.uniform4fv(u['u_emissionCores[0]'],cores);gl.uniform4fv(u['u_emissionCoreGains[0]'],coreGains);
    gl.uniform4fv(u['u_emissionCoreAxes[0]'],coreAxes);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,resources.volume);gl.uniform1i(u.u_volume,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,resources.surface);gl.uniform1i(u.u_surface,1);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,resources.pulse);gl.uniform1i(u.u_pulse,2);gl.activeTexture(gl.TEXTURE0);
    bindMesh();gl.enable(gl.CULL_FACE);gl.cullFace(Math.hypot(...camera)<2.5?gl.FRONT:gl.BACK);
    gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_SHORT,0);gl.disable(gl.CULL_FACE);return true;
  }
  function draw(args){
    if(disposed||report.state!=='ready'||!composition)return false;
    if(!scene||!Number.isFinite(args.seconds)||args.seconds<0||args.seconds>scene.manifest.duration_seconds)return false;
    try{
      if(args.pass===1){
        composition.begin();
        try{
          drawFields({...args,pass:1,linearOutput:true});
          gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);
          drawFields({...args,pass:2,linearOutput:true});
          if(args.showCorona!==false&&args.showBundles!==false)strands?.draw({...args,linearOutput:true,outputMode:'transfer',thin:lookSettings(args).strandWidthScale});
        }finally{composition.finish();}
      }
      return composition.composite(args);
    }catch(error){
      report={...report,state:'unavailable',reason:error.message};notify();return false;
    }
  }
  return {ensure,draw,status:()=>({...report,estimatedBytes:report.estimatedBytes+(composition?.bytes()??0)+(strands?.status().estimatedBytes??0)}),
    retry(){if(report.state==='unavailable'){report={...report,state:'deferred',id:null};manager.retry('dynamic');}},
    suspend(){poseClient?.cancel();manager.renewDeadlines();},
    dispose(){if(disposed)return;disposed=true;serial++;controller?.abort();poseClient?.dispose();release();manager.dispose();},
  };
}
