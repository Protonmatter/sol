/** Install before startup. Configuration selects immutable generator sources
 * after module/source admission; no hashes or full texture reads occur per frame.
 * Submitted producer evidence supplements the existing actual consumer readback.
 */
export function installScatteringProducerEvidence(){
  const prototype=globalThis.WebGL2RenderingContext?.prototype;
  if(!prototype||globalThis.__solScatteringProducerEvidence)return;
  const contexts=new WeakMap(),allocations=new WeakMap();let outputs=new WeakMap(),sequence=0,configuration=null;
  const counters={draws:0,sourceFiltered:0,candidateQueries:0,accepted:0,rejected:0};
  const atmosphereNames=['u_atmosphereEnabled','u_atmosphereRadiusKm','u_atmosphereTopKm','u_atmospherePolarRatio',
    'u_atmosphereDensityScaleKm','u_atmosphereRayleighKm','u_atmosphereAerosolKm','u_atmosphereAerosolSSA',
    'u_atmosphereG','u_atmosphereCameraKm','u_atmosphereSunDirection','u_atmosphereSolarScale','u_atmosphereExposure'];
  const gridNames=['u_scatteringAxis','u_scatteringU','u_scatteringV','u_scatteringCameraRadius',
    'u_scatteringHeightRange','u_scatteringSurfaceSize','u_scatteringLimbSize'];
  const consumerGridNames=gridNames.filter(name=>!['u_scatteringAxis','u_scatteringCameraRadius'].includes(name));
  const state=gl=>{if(!contexts.has(gl))contexts.set(gl,{program:null,unit:gl.TEXTURE0,textures:new Map(),framebuffer:null,attachments:new Map()});return contexts.get(gl);};
  const wrap=(name,after)=>{
    const native=prototype[name];if(typeof native!=='function')return;
    prototype[name]=function(...args){const result=native.apply(this,args);try{after(this,args);}catch{outputs=new WeakMap();counters.rejected++;}return result;};
  };
  const invalidateTexture=texture=>{if(texture)outputs.delete(texture);};
  wrap('useProgram',(gl,[program])=>{state(gl).program=program;});
  wrap('activeTexture',(gl,[unit])=>{state(gl).unit=unit;});
  wrap('bindTexture',(gl,[target,texture])=>{if(target===gl.TEXTURE_2D){
    const s=state(gl),prior=s.textures.get(s.unit);
    s.textures.set(s.unit,allocations.has(prior)||allocations.has(texture)?gl.getParameter(gl.TEXTURE_BINDING_2D):texture);
  }});
  wrap('bindFramebuffer',(gl,[target,framebuffer])=>{
    if(target===gl.DRAW_FRAMEBUFFER||target===gl.FRAMEBUFFER){
      const s=state(gl),known=value=>allocations.has(s.attachments.get(value));
      // Query only transitions involving a known output FBO. An invalid native
      // bind must not let a CPU hint hide later writes to an admitted texture.
      s.framebuffer=known(s.framebuffer)||known(framebuffer)?gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING):framebuffer;
    }
  });
  wrap('framebufferTexture2D',(gl,[target,attachment,_textureTarget,texture])=>{
    if((target===gl.DRAW_FRAMEBUFFER||target===gl.FRAMEBUFFER)&&attachment===gl.COLOR_ATTACHMENT0){
      const s=state(gl),prior=s.attachments.get(s.framebuffer);
      s.attachments.set(s.framebuffer,allocations.has(prior)||allocations.has(texture)?
        gl.getFramebufferAttachmentParameter(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME):texture);
    }
  });
  wrap('texStorage2D',(gl,[target,levels,internalFormat,width,height])=>{
    const s=state(gl),texture=s.textures.get(s.unit);invalidateTexture(texture);
    if(texture)allocations.delete(texture);
    if(target===gl.TEXTURE_2D&&texture&&gl.getParameter(gl.TEXTURE_BINDING_2D)===texture)
      allocations.set(texture,{gl,levels,internalFormat,width,height,sequence:++sequence});
  });
  for(const name of ['texImage2D','texSubImage2D','copyTexImage2D','copyTexSubImage2D','compressedTexImage2D',
    'compressedTexSubImage2D','generateMipmap'])wrap(name,gl=>{
      const s=state(gl),texture=s.textures.get(s.unit);invalidateTexture(texture);if(texture)allocations.delete(texture);
    });
  for(const name of ['texParameteri','texParameterf'])wrap(name,gl=>{const s=state(gl);invalidateTexture(s.textures.get(s.unit));});
  wrap('deleteTexture',(_gl,[texture])=>{invalidateTexture(texture);if(texture)allocations.delete(texture);});
  const matches=(gl,program)=>{
    const linked=configuration&&globalThis.__solProgramSourceEvidence?.snapshot(gl,program);
    return linked?.sources.length===2&&linked.sources.some(s=>s?.type===gl.VERTEX_SHADER&&s.source===configuration.vertexSource)
      &&linked.sources.some(s=>s?.type===gl.FRAGMENT_SHADER&&s.source===configuration.fragmentSource)?linked:null;
  };
  const sameFrame=(a,b)=>a&&b&&a.contextGeneration===b.contextGeneration&&a.sceneSerial===b.sceneSerial&&Object.is(a.epoch,b.epoch);
  const validFrame=frame=>frame&&Number.isSafeInteger(frame.contextGeneration)&&Number.isSafeInteger(frame.sceneSerial)
    &&frame.contextGeneration>=0&&frame.sceneSerial>=0&&Number.isFinite(frame.epoch);
  const values=(gl,program,names)=>{
    const result={};for(const name of names){
      const location=gl.getUniformLocation(program,name);if(location===null)throw Error(`Absent producer uniform: ${name}`);
      const raw=gl.getUniform(program,location),value=ArrayBuffer.isView(raw)?Array.from(raw):raw;
      if(!(Array.isArray(value)?value.length>0&&value.every(Number.isFinite):typeof value==='number'&&Number.isFinite(value)))
        throw Error(`Invalid producer uniform: ${name}`);
      result[name]=value;
    }return result;
  };
  // Actual camera, polar ratio, Sun and basis are independent binary32 uploads.
  // Propagate their rounding bins; no arbitrary physical km/angle tolerance.
  const outward=([lo,hi])=>{const e=8*Number.EPSILON*Math.max(Math.abs(lo),Math.abs(hi),Number.MIN_VALUE);return [lo-e,hi+e];};
  const bin=value=>{const a=Math.abs(value),half=a<2**-126?2**-150:2**(Math.floor(Math.log2(a))-24);return outward([value-half,value+half]);};
  const add=(a,b)=>outward([a[0]+b[0],a[1]+b[1]]);
  const mul=(a,b)=>{const v=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return outward([Math.min(...v),Math.max(...v)]);};
  const sub=(a,b)=>add(a,mul(b,[-1,-1]));
  const div=(a,b)=>mul(a,outward([1/b[1],1/b[0]]));
  const dot=(a,b)=>a.map((v,i)=>mul(v,b[i])).reduce(add,[0,0]);
  const cross=(a,b)=>[sub(mul(a[1],b[2]),mul(a[2],b[1])),sub(mul(a[2],b[0]),mul(a[0],b[2])),sub(mul(a[0],b[1]),mul(a[1],b[0]))];
  const norm=v=>{const squares=v.map(a=>outward([a[0]<=0&&a[1]>=0?0:Math.min(a[0]**2,a[1]**2),Math.max(a[0]**2,a[1]**2)]));
    const sum=squares.reduce(add,[0,0]);return outward([Math.sqrt(Math.max(0,sum[0])),Math.sqrt(sum[1])]);};
  const normalized=v=>{const n=norm(v);return n[0]>0?v.map(a=>div(a,n)):null;};
  const overlap=(a,b)=>a[0]<=b[1]&&b[0]<=a[1];
  const vectorMatches=(intervals,actual)=>Array.isArray(actual)&&actual.length===3&&intervals&&intervals.every((a,i)=>overlap(a,bin(actual[i])));
  const cameraBasisMatches=u=>{
    const q=bin(u.u_atmospherePolarRatio);if(q[0]<=0)return false;
    const camera=u.u_atmosphereCameraKm.map(bin);camera[2]=div(camera[2],q);
    const radius=norm(camera),axis=normalized(camera);if(!axis||!overlap(radius,bin(u.u_scatteringCameraRadius))||!vectorMatches(axis,u.u_scatteringAxis))return false;
    const sun=u.u_atmosphereSunDirection.map(bin);sun[2]=div(sun[2],q);
    const light=normalized(sun);if(!light)return false;
    const projection=light.map((a,i)=>sub(a,mul(axis[i],dot(light,axis)))),projectedLength=norm(projection),candidates=[];
    const singleScale=u.u_atmosphereDensityScaleKm[0]===u.u_atmosphereDensityScaleKm[1];
    if(singleScale&&projectedLength[1]>1e-8){const projected=normalized(projection);if(projected)candidates.push(projected);}
    if(!singleScale||projectedLength[0]<=1e-8){
      const z=axis[2],absMin=z[0]<=0&&z[1]>=0?0:Math.min(Math.abs(z[0]),Math.abs(z[1])),absMax=Math.max(Math.abs(z[0]),Math.abs(z[1]));
      if(absMin<.9)candidates.push(normalized(cross([[0,0],[0,0],[1,1]],axis)));
      if(absMax>=.9)candidates.push(normalized(cross([[1,1],[0,0],[0,0]],axis)));
    }
    return candidates.some(basis=>basis&&vectorMatches(basis,u.u_scatteringU)&&vectorMatches(cross(axis,basis),u.u_scatteringV));
  };
  const attachment=gl=>gl.getFramebufferAttachmentParameter(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
  const invalidateAttached=gl=>{
    // Only known target FBOs need a driver attachment query; otherwise an
    // unrelated clear cannot establish or refresh any producer evidence.
    const s=state(gl),hint=s.attachments.get(s.framebuffer);
    if(hint&&allocations.has(hint)){
      try{if(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING))invalidateTexture(attachment(gl));}
      catch{outputs=new WeakMap();}
    }
  };
  wrap('clear',(gl,[mask])=>{if(mask&gl.COLOR_BUFFER_BIT)invalidateAttached(gl);});
  for(const name of ['clearBufferfv','clearBufferiv','clearBufferuiv'])wrap(name,(gl,[buffer])=>{if(buffer===gl.COLOR)invalidateAttached(gl);});
  wrap('blitFramebuffer',gl=>invalidateAttached(gl));
  for(const name of ['drawElements','drawElementsInstanced','drawArraysInstanced','drawRangeElements'])wrap(name,gl=>invalidateAttached(gl));
  wrap('drawArrays',(gl,args)=>{
    if(!configuration)return;
    counters.draws++;const hinted=state(gl).program,linked=matches(gl,hinted);
    if(!linked){counters.sourceFiltered++;invalidateAttached(gl);return;}
    counters.candidateQueries++;
    let texture;
    try{
      if(gl.isContextLost()||gl.getParameter(gl.CURRENT_PROGRAM)!==hinted||args[0]!==gl.TRIANGLES||args[1]!==0||args[2]!==3)
        throw Error('Producer draw or current program mismatch');
      if(!gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)||gl.getParameter(gl.DRAW_BUFFER0)!==gl.COLOR_ATTACHMENT0)
        throw Error('Producer color framebuffer mismatch');
      texture=attachment(gl);invalidateTexture(texture);
      if(gl.getFramebufferAttachmentParameter(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE)!==gl.TEXTURE
        ||gl.getFramebufferAttachmentParameter(gl.DRAW_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL)!==0)
        throw Error('Producer attachment is not a level-zero texture');
      const storage=allocations.get(texture),viewport=Array.from(gl.getParameter(gl.VIEWPORT));
      if(!storage||storage.gl!==gl||storage.levels!==1||storage.internalFormat!==gl.RGBA32F
        ||viewport.join(',')!==[0,0,storage.width,storage.height].join(','))throw Error('Producer texture storage or viewport mismatch');
      if(!Array.from(gl.getParameter(gl.COLOR_WRITEMASK)).every(value=>value===true)||gl.getParameter(gl.DEPTH_WRITEMASK)!==false
        ||['BLEND','DEPTH_TEST','CULL_FACE','SCISSOR_TEST','STENCIL_TEST','RASTERIZER_DISCARD',
          'SAMPLE_COVERAGE','SAMPLE_ALPHA_TO_COVERAGE','DITHER'].some(name=>gl.isEnabled(gl[name])))throw Error('Producer write-state mismatch');
      const uniforms=values(gl,hinted,[...atmosphereNames,...gridNames,'u_scatteringPass','u_atmosphereColumnField']);
      if(uniforms.u_atmosphereEnabled!==1)throw Error('Producer atmosphere disabled');
      const pass=uniforms.u_scatteringPass,dimensions=pass===0?
        [uniforms.u_scatteringSurfaceSize[0],uniforms.u_scatteringSurfaceSize[1]*uniforms.u_scatteringSurfaceSize[2]]:
        uniforms.u_scatteringLimbSize;
      if(![0,1].includes(pass)||dimensions.join(',')!==[storage.width,storage.height].join(',')||uniforms.u_atmosphereColumnField!==7)
        throw Error('Producer pass or dimensions mismatch');
      const selector=gl.getParameter(gl.ACTIVE_TEXTURE);let columnTexture,column;
      try{
        gl.activeTexture(gl.TEXTURE0+7);columnTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);
        if(gl.getParameter(gl.SAMPLER_BINDING)!==null)throw Error('Producer column sampler override');
        column=globalThis.__solPhysicalTextureEvidence?.snapshot(gl,columnTexture);
      }finally{gl.activeTexture(selector);}
      if(!column||column.status!=='ready'||column.internalFormat!==gl.RG32F)throw Error('Producer column upload absent');
      const frame=configuration.getFrame();if(!validFrame(frame))throw Error('Producer scene identity absent');
      outputs.set(texture,{gl,texture,storageSequence:storage.sequence,sequence:++sequence,program:hinted,programSequence:linked.sequence,
        pass,uniforms,columnTexture,column:{sha256:column.sha256,sequence:column.sequence},frame:{...frame}});
      counters.accepted++;
    }catch{invalidateTexture(texture);counters.rejected++;}
  });
  Object.defineProperty(globalThis,'__solScatteringProducerEvidence',{value:Object.freeze({
    configure(value){
      if(!value||typeof value.vertexSource!=='string'||typeof value.fragmentSource!=='string'||typeof value.getFrame!=='function')
        throw Error('Immutable scattering generator configuration required');
      configuration={...value};outputs=new WeakMap();
    },
    capture(gl,program,consumerUniforms,{frame,columnTexture,published,heightRange}){
      const rejected=reason=>({passed:false,reason,counters:{...counters}});
      if(!configuration||gl.isContextLost()||gl.getParameter(gl.CURRENT_PROGRAM)!==program||!validFrame(frame)||!sameFrame(frame,configuration.getFrame())
        ||published?.state!=='submitted'||!sameFrame(frame,published.submission))return rejected('Current producer submission is not admitted');
      const selector=gl.getParameter(gl.ACTIVE_TEXTURE),records=[];
      try{
        const grid=values(gl,program,[...consumerGridNames,'u_scatteringReady','u_scatteringSurface','u_scatteringLimb']);
        if(grid.u_scatteringReady!==1||grid.u_scatteringSurface!==8||grid.u_scatteringLimb!==9)return rejected('Consumer scattering samplers are not ready');
        if(!Array.isArray(heightRange)||heightRange.length!==2
          ||heightRange.some((value,i)=>grid.u_scatteringHeightRange[i]!==Math.fround(value)))return rejected('Scattering height range differs from the admitted physical source bounds');
        for(const pass of [0,1]){
          gl.activeTexture(gl.TEXTURE0+8+pass);const texture=gl.getParameter(gl.TEXTURE_BINDING_2D),record=outputs.get(texture),storage=allocations.get(texture);
          if(gl.getParameter(gl.SAMPLER_BINDING)!==null||!record||record.gl!==gl||record.pass!==pass||storage?.sequence!==record.storageSequence
            ||!sameFrame(record.frame,frame)||record.columnTexture!==columnTexture||matches(gl,record.program)?.sequence!==record.programSequence)
            return rejected('Actual bound scattering texture lacks a matching current producer draw');
          if([...atmosphereNames,...consumerGridNames].some(name=>JSON.stringify(record.uniforms[name])!==JSON.stringify(consumerGridNames.includes(name)?grid[name]:consumerUniforms[name])))
            return rejected('Producer geometry, profile or grid does not match the actual consumer');
          if(!cameraBasisMatches(record.uniforms))return rejected('Producer grid basis or radius does not match current physical camera and Sun');
          const column=globalThis.__solPhysicalTextureEvidence?.snapshot(gl,columnTexture);
          if(column?.status!=='ready'||column.sha256!==record.column.sha256||column.sequence!==record.column.sequence)
            return rejected('Producer column upload changed');
          records.push(record);
        }
        if(records[0].sequence>=records[1].sequence||records[0].program!==records[1].program||records[0].programSequence!==records[1].programSequence)
          return rejected('Scattering pass pair is incomplete or mismatched');
        return {passed:true,frame:{...frame},programSequence:records[0].programSequence,counters:{...counters},
          passes:records.map(record=>({pass:record.pass,drawSequence:record.sequence,storageSequence:record.storageSequence,
            uniforms:record.uniforms,column:record.column}))};
      }catch(error){return rejected(`Scattering producer inspection failed: ${error.message}`);}
      finally{gl.activeTexture(selector);}
    },
  })});
}
