// Immutable illustrative appearance products. These never acquire remote solar
// data or convert browse-image brightness into measured plasma quantities.
const MAX_RESOURCE_BYTES=32*1024*1024;
const finite=(v)=>typeof v==='number'&&Number.isFinite(v);
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(finite);
const fail=message=>{throw new Error(`Dynamic Sun: ${message}`);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const rotation=v=>vector(v?.coefficients_deg_per_day,3)&&v.coefficients_deg_per_day.every((n,i)=>n===[14.713,-2.396,-1.787][i])&&v.frame_rate_deg_per_day===14.1844;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unitVector=v=>vector(v,3)&&Math.abs(Math.hypot(...v)-1)<1e-4;
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const identifier=v=>Number.isSafeInteger(v)&&v>=0;

export function validateEmissionHierarchy(packet){
  const expected={kind:'hierarchical_euv_v1',hole_scale:.14,hole_epoch_s:21600,hole_thresholds:[.08,.38],hole_suppression:.92,
    medium_mix:[.7,.3],ridge_scale:1.8,ridge_power:3,quiet_floor:.012,network_gain:.11,fine_modulation:[.9,.2],
    lane_warp:.2,lane_width:.10,lane_suppression:.9,core_radius_R:.0035,background_peak:.002,background_scale_height_R:.045,
    group_core_budget:1.4,group_structure_budget:.22,cores_per_group:2,attachment_support_radius_R:.015,
    sparse_ridge_threshold:.65,structured_fine_modulation:[.4,.6],quiet_meso_kind:'r3_fbm_squared',quiet_meso_weights:[.55,.3,.15]};
  const model=packet.emission_model;
  if(!model||Object.keys(model).length!==Object.keys(expected).length||Object.entries(expected).some(([key,value])=>!same(model[key],value)))fail('unsupported emission hierarchy');
  const regions=packet.emission_regions,groups=packet.attachment_groups;
  if(!Array.isArray(regions)||regions.length>10||!Array.isArray(groups)||groups.length>20)fail('emission hierarchy capacity');
  const full=packet.field!==null;
  if(full&&(!regions.length||groups.length!==regions.length*2||!packet.strands?.length))fail('full attachment hierarchy required');
  if(!full&&(regions.length||groups.length||packet.strands?.length))fail('compact packet cannot carry partial geometry');
  const regionIds=new Set(),coreIds=new Set(),groupIds=new Set();
  for(const r of regions){
    if(!identifier(r.id)||regionIds.has(r.id)||!unitVector(r.center)||!unitVector(r.axis_u)||!unitVector(r.axis_v)
      ||Math.abs(dot(r.center,r.axis_u))>1e-4||Math.abs(dot(r.center,r.axis_v))>1e-4||Math.abs(dot(r.axis_u,r.axis_v))>1e-4
      ||!vector(r.extent_rad,2)||r.extent_rad.some(n=>n<.005||n>.5)||!Array.isArray(r.cores)||r.cores.length>4)fail('emission region geometry');
    regionIds.add(r.id);
    if(!packet.regions?.some(source=>source.id===r.id)||r.cores.length!==4)fail('emission source region or core count');
    for(const c of r.cores){
      if(!identifier(c.id)||coreIds.has(c.id)||!unitVector(c.center)||c.radius_R!==model.core_radius_R||!unitVector(c.axis_u)
        ||!finite(c.emission_relative)||c.emission_relative<0||c.emission_relative>4||!identifier(c.attachment_group_id)
        ||!finite(c.structure_relative)||c.structure_relative<0||c.structure_relative>1||!identifier(c.strand_id)||![0,1].includes(c.endpoint))fail('compact core definition');
      coreIds.add(c.id);
      const anchor=c.strand_id-r.id*8;
      if(![0,2].includes(anchor)||c.attachment_group_id!==r.id*2+c.endpoint
        ||c.id!==r.id*4+c.endpoint*2+(anchor===2?1:0)
        ||c.emission_relative!==.7||c.structure_relative!==.11)fail('fixed attachment identity or amplitude');
    }
  }
  for(const g of groups){
    if(!identifier(g.id)||groupIds.has(g.id)||!regionIds.has(g.region_id)||!unitVector(g.center)||!unitVector(g.axis_u)
      ||Math.abs(dot(g.center,g.axis_u))>1e-4||g.core_emission_budget!==model.group_core_budget||g.structure_emission_budget!==model.group_structure_budget
      ||!Array.isArray(g.strand_ids)||g.strand_ids.length>64||g.strand_ids.some(id=>!identifier(id)))fail('attachment group definition');
    groupIds.add(g.id);
    if(![g.region_id*2,g.region_id*2+1].includes(g.id))fail('stable attachment group identity');
  }
  const strandMap=new Map((packet.strands??[]).map(s=>[s.id,s]));
  for(const g of groups){
    if(new Set(g.strand_ids).size!==g.strand_ids.length)fail('duplicate attachment member');
    for(const id of g.strand_ids){const s=strandMap.get(id);if(!s||s.region_id!==g.region_id||s.family_id!==g.region_id||s.role==='long_arc')fail('attachment membership mismatch');}
    const sum=[0,0,0];
    for(const anchor of [0,2]){
      const s=strandMap.get(g.region_id*8+anchor),p=g.id%2===0?s?.points?.[0]:s?.points?.at(-1);
      if(!vector(p,4)||s.role!=='individual'||!g.strand_ids.includes(s.id))fail('group anchor absent');
      const radius=Math.hypot(...p.slice(0,3));
      if(Math.abs(radius-1)>1e-6)fail('group anchor is not on surface');
      for(let i=0;i<3;i++)sum[i]+=p[i]/radius;
    }
    const length=Math.hypot(...sum);
    if(length<1e-10||Math.hypot(...sum.map((n,i)=>n/length-g.center[i]))>1e-7)fail('group endpoint centroid');
    const members=regions.flatMap(r=>r.cores).filter(c=>c.attachment_group_id===g.id);
    if(members.length!==model.cores_per_group||Math.abs(members.reduce((sum,c)=>sum+c.emission_relative,0)-g.core_emission_budget)>1e-8
      ||Math.abs(members.reduce((sum,c)=>sum+c.structure_relative,0)-g.structure_emission_budget)>1e-8)fail('attachment emission budget mismatch');
  }
  for(const r of regions){
    const a=groups.find(g=>g.id===r.id*2),b=groups.find(g=>g.id===r.id*2+1);
    if(!a||!b)fail('missing attachment pair');
    const bipolar=b.center.map((n,i)=>n-a.center[i]);
    for(const g of [a,b]){
      const projection=dot(bipolar,g.center),axis=bipolar.map((n,i)=>n-projection*g.center[i]),length=Math.hypot(...axis);
      if(length<1e-10||Math.hypot(...axis.map((n,i)=>n/length-g.axis_u[i]))>1e-8)fail('group axis bipolar binding');
    }
  }
  for(const r of regions)for(const c of r.cores){
    const group=groups.find(g=>g.id===c.attachment_group_id),strand=strandMap.get(c.strand_id);
    if(!groupIds.has(c.attachment_group_id)||group?.region_id!==r.id||!group.strand_ids.includes(c.strand_id)
      ||strand?.role!=='individual'||strand.classification!=='closed'||!same(strand.termination,['surface','surface'])
      ||Math.hypot(...c.axis_u.map((n,i)=>n-group.axis_u[i]))>1e-6)fail('core attachment is absent');
    const point=c.endpoint===0?strand.points?.[0]:strand.points?.at(-1);
    if(!vector(point,4))fail('core attachment geometry absent');
    const radius=Math.hypot(...point.slice(0,3));
    if(Math.abs(radius-1)>1e-6||Math.hypot(...c.center.map((n,i)=>n-point[i]/radius))>1e-6)fail('core position differs from its loop endpoint');
  }
}

export function parseDynamicJson(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>1048576)fail('JSON byte budget');
  const value=JSON.parse(text),stack=[];
  for(const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]]/g)){
    const token=match[0];
    if(token==='{')stack.push(new Set());else if(token==='[')stack.push(null);
    else if(token==='}'||token===']')stack.pop();
    else if(text.slice(match.index+token.length).trimStart().startsWith(':')){
      const key=JSON.parse(token),keys=stack.at(-1);
      if(keys.has(key))fail('duplicate JSON key');keys.add(key);
    }
    if(stack.length>32)fail('JSON depth budget');
  }
  return value;
}

export function validateDynamicResource(value) {
  if(!value||typeof value.path!=='string'||value.path.length>200
    ||!/^solar-dynamic\/[A-Za-z0-9_./-]+$/.test(value.path)
    ||value.path.split('/').some(part=>!part||part==='.'||part==='..')
    ||!Number.isSafeInteger(value.bytes)||value.bytes<=0||value.bytes>MAX_RESOURCE_BYTES
    ||!(/^[a-f0-9]{64}$/).test(value.sha256??''))fail('invalid resource identity, path or byte budget');
  return value;
}

function field(value,axes,maxEdge) {
  validateDynamicResource(value);
  if(value.dtype!=='float32-le'||!vector(value.dimensions,axes)
    ||value.dimensions.some(v=>!Number.isInteger(v)||v<4||v>maxEdge)
    ||value.dimensions.reduce((a,b)=>a*b,4)!==value.bytes)fail('field dimensions/encoding/size mismatch');
}

export function validateDynamicManifest(value) {
  if(value?.schema_version!=='solar-dynamic-appearance.v1'||value.authority!=='illustrative'
    ||!['quiet-v1','active-v1'].includes(value.id)||!Number.isInteger(value.seed)||value.seed<0||value.seed>0xffffffff
    ||value.frame!=='carrington_z_north_west_positive'||value.radius_km!==695700
    ||value.duration_seconds!==21600)
    fail('unsupported manifest or scientific authority');
  if(!rotation(value.rotation)||!hash(value.recipe_hash)||!hash(value.generator_source_sha256))fail('missing rotation or recipe authority');
  validateDynamicResource(value.packet);field(value.surface,2,2048);
  if(value.surface.longitude_positive!=='west'||value.surface.latitude_row_zero!=='south'||value.surface.texel_centers!==true
    ||value.surface.units!=='relative_emission'||value.surface.time_s!==0
    ||!same(value.surface.dimensions,[2048,1024])||value.surface.transfer_id!=='hierarchical-euv-linear-v1')fail('surface coordinate or unit semantics');
  if(!Array.isArray(value.volumes)||value.volumes.length<1||value.volumes.length>3)fail('volume variant budget');
  const ids=new Set();
  for(const volume of value.volumes){
    field(volume,3,128);
    if(typeof volume.id!=='string'||ids.has(volume.id)||!vector(volume.bounds,2)
      ||volume.bounds[0]!==-2.5||volume.bounds[1]!==2.5)fail('volume identity or domain');
    ids.add(volume.id);
    const grid=v=>v.dtype==='float32-le'&&v.layout==='x-fastest-y-next-z-slowest'&&v.voxel_centers===true
      &&v.units==='relative_emission_per_solar_radius'&&v.time_s===0&&same(v.dimensions,volume.dimensions)&&same(v.bounds,volume.bounds);
    if(!grid(volume))fail('volume layout, units or epoch');
    if(!volume.background)fail('analytic production requires diffuse-only background');
    field(volume.background,3,128);if(!grid(volume.background)||volume.background.contains_strands!==false)fail('background layout or ownership');
    if(volume.pulse){
      const p=volume.pulse;validateDynamicResource(p);
      if(p.bytes!==volume.bytes*4||!same(p.dimensions,volume.dimensions)||p.components!==4||p.dtype!=='float32-le'
        ||p.layout!=='x-fastest-y-next-z-slowest-RGBA'||!same(p.channels,['arc_length_R','onset_s','duration_s','support_relative'])
        ||p.width_R!==.04||p.speed_R_per_s!==.0002||p.amplitude!==.3||p.window!=='sin_squared_nonrepeating')fail('pulse semantics');
    }
  }
  if(!Array.isArray(value.keyframes)||value.keyframes.length>1500)fail('keyframe budget');
  let previous=-1;
  for(const key of value.keyframes){
    if(!finite(key.time_s)||key.time_s<0||key.time_s>value.duration_seconds||key.time_s<=previous)fail('keyframe ordering');
    previous=key.time_s;validateDynamicResource(key.packet);
  }
  const note=v=>typeof v==='string'||Array.isArray(v)&&v.length>0&&v.length<40&&v.every(x=>typeof x==='string');
  if(!note(value.credits)||!note(value.limits))fail('missing interpretation');
  return value;
}

export function validateDynamicPacket(value,{requireGeometry=false}={}) {
  if(value?.schema_version!=='solar-render-packet.v1'||!['quiet-v1','active-v1'].includes(value.recipe_id)
    ||!Number.isInteger(value.seed)||value.seed<0||value.seed>0xffffffff||!finite(value.time_s)||value.time_s<0||value.time_s>1209600
    ||value.frame!=='carrington_z_north_west_positive'||value.radius_km!==695700||value.relative_emission!==true)
    fail('invalid packet identity or authority');
  if(value.abi!==1||!hash(value.recipe_hash)||!rotation(value.rotation_law)||value.rotation_law.id!=='engine-magnetic-tracer-v1'
    ||!same(value.valid_time_range_seconds,[0,21600])||value.time_s>21600||value.source_mode!=='synthetic_statistical_pfss'
    ||value.field_units!=='normalized'||typeof value.field_provenance!=='string')fail('packet recipe, time or field authority');
  const s=value.surface;
  if(!s||![s.quiet_temperature_k,s.limb_u,s.granule_km,s.lifetime_s,s.amplitude_k].every(finite)
    ||s.quiet_temperature_k<3000||s.quiet_temperature_k>10000||s.limb_u<0||s.limb_u>1
    ||s.granule_km<100||s.granule_km>10000||s.lifetime_s<60||s.lifetime_s>10000||s.amplitude_k<0||s.amplitude_k>1000)
    fail('invalid surface descriptor');
  const e=s.euv_texture,w=e?.domain_warp;
  if(s.wavelength_nm!==550||!e||e.cell_km!==10000||e.lifetime_s!==1200||e.amplitude!==.65
    ||(w&&(w.kind!=='quintic_hashed_vector_v1'||w.frequency_per_cell!==.18||w.amplitude_cells!==1.25)))fail('unsupported surface transfer recipe');
  if(e.kind!=='correlated_value_noise_v1'||e.spatial_scale_factor!==.35
    ||!same(e.octave_weights,[.55,.3,.15])||e.epoch_law!=='quintic_crossfade_of_hashed_fields'||!w)fail('unsupported EUV morphology recipe');
  validateEmissionHierarchy(value);
  if(requireGeometry&&value.field===null)fail('full scene geometry required');
  if(!Array.isArray(value.regions)||value.regions.length>128||!Array.isArray(value.strands)||value.strands.length>4096)fail('geometry capacity');
  const ids=new Set();
  for(const r of value.regions){
    if(!Number.isSafeInteger(r.id)||ids.has(r.id)||!vector(r.center,3)||Math.abs(Math.hypot(...r.center)-1)>1e-4
      ||!finite(r.radius_rad)||r.radius_rad<=0||r.radius_rad>.5||!finite(r.temperature_k)||r.temperature_k<2000||r.temperature_k>10000)
      fail('invalid surface region');
    ids.add(r.id);
  }
  ids.clear();let pointCount=0;
  for(const strand of value.strands){
    if(!Number.isSafeInteger(strand.id)||ids.has(strand.id)||!['closed','open','incomplete'].includes(strand.classification)
      ||!finite(strand.emission_relative)||strand.emission_relative<0||strand.emission_relative>1e5
      ||!Array.isArray(strand.points)||strand.points.length<2||strand.points.length>8193)fail('invalid field line');
    ids.add(strand.id);pointCount+=strand.points.length;if(pointCount>300000)fail('field line point budget');
    if(!identifier(strand.family_id)||!identifier(strand.region_id)
      ||!['individual','bundle_envelope','long_arc'].includes(strand.role)||!Array.isArray(strand.emissivity_gain)
      ||strand.emissivity_gain.length!==strand.points.length||strand.emissivity_gain.some(g=>!finite(g)||g<0||g>1))fail('strand family or emission profile');
    for(const p of strand.points)if(!vector(p,4)||Math.hypot(p[0],p[1],p[2])>2.501||p[3]<=0||p[3]>.25)fail('invalid field line point');
  }
  return value;
}

/** Bounded exact-byte read with cancellation even when a response stream stalls. */
export async function loadDynamicResource(record,{
  signal=null,timeoutMs=15000,fetcher=globalThis.fetch,
  digest=bytes=>globalThis.crypto.subtle.digest('SHA-256',bytes),
}={}) {
  validateDynamicResource(record);
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>30000)fail('invalid timeout');
  if(signal?.aborted)throw signal.reason??new Error('Resource aborted');
  const abort=new AbortController();
  /** @type {ReadableStreamDefaultReader<Uint8Array>|null} */ let reader=null;
  /** @type {Response|null} */ let response=null;
  const stop=()=>abort.abort(signal?.reason??new Error('Resource aborted'));
  signal?.addEventListener('abort',stop,{once:true});
  let rejectAbort;
  const interrupted=new Promise((_,reject)=>{rejectAbort=reject;});
  const cancelled=()=>{reader?.cancel().catch(()=>{});rejectAbort(abort.signal.reason??new Error('Resource aborted'));};
  abort.signal.addEventListener('abort',cancelled,{once:true});
  const timer=setTimeout(()=>abort.abort(new Error('Dynamic Sun resource timeout')),timeoutMs);
  const work=async()=>{
    response=await fetcher(new URL('../'+record.path,import.meta.url),{signal:abort.signal,redirect:'error'});
    if(abort.signal.aborted)throw abort.signal.reason;
    if(!response.ok||response.redirected)fail('resource HTTP failure or redirect');
    const length=response.headers.get('content-length');
    if(length!==null&&!response.headers.get('content-encoding')&&Number(length)!==record.bytes)fail('declared resource size mismatch');
    reader=response.body?.getReader();if(!reader)fail('resource stream missing');
    const result=new Uint8Array(record.bytes);let offset=0;
    try{
      while(true){
        const {done,value}=await reader.read();if(abort.signal.aborted)throw abort.signal.reason;
        if(done)break;if(offset+value.byteLength>result.length)fail('resource size exceeds budget');
        result.set(value,offset);offset+=value.byteLength;
      }
      if(offset!==result.length)fail('resource truncated');
    }catch(error){await reader.cancel().catch(()=>{});throw error;}
    finally{reader.releaseLock();reader=null;}
    const hashed=new Uint8Array(await digest(result.buffer));
    if(abort.signal.aborted)throw abort.signal.reason;
    const actual=Array.from(hashed,x=>x.toString(16).padStart(2,'0')).join('');
    if(actual!==record.sha256)fail('resource SHA-256 mismatch');
    return result.buffer;
  };
  try{return await Promise.race([work(),interrupted]);}
  catch(error){
    abort.abort(error);
    if(reader)await reader.cancel().catch(()=>{});
    else if(response?.body&&!response.body.locked)await response.body.cancel().catch(()=>{});
    throw error;
  }
  finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);abort.signal.removeEventListener('abort',cancelled);}
}

export function decodeDynamicField(buffer,resource) {
  if(buffer.byteLength!==resource.bytes||buffer.byteLength%4)fail('numeric field size');
  const result=new Float32Array(buffer.byteLength/4),view=new DataView(buffer);
  for(let i=0;i<result.length;i++){
    const value=view.getFloat32(i*4,true);
    if(!finite(value)||value<0||value>65504)fail('numeric field range exceeds finite half-float emission');
    result[i]=value;
  }
  return result;
}

export async function loadDynamicScene(record,{signal=null,quality='low',...options}={}) {
  const read=r=>loadDynamicResource(r,{...options,signal});
  const manifest=validateDynamicManifest(parseDynamicJson(new TextDecoder('utf-8',{fatal:true}).decode(await read(record))));
  const packet=validateDynamicPacket(parseDynamicJson(new TextDecoder('utf-8',{fatal:true}).decode(await read(manifest.packet))),{requireGeometry:true});
  if(packet.seed!==manifest.seed||packet.recipe_id!==manifest.id||packet.recipe_hash!==manifest.recipe_hash||packet.time_s!==0)fail('manifest/packet identity mismatch');
  const volume=manifest.volumes.find(v=>v.id===quality)??manifest.volumes[0];
  const volumeField=volume.background??volume;
  if(volume.background){validateDynamicResource(volume.background);if(volume.background.bytes!==volume.bytes)fail('background field size mismatch');}
  const analyticSurface=packet.emission_model?.kind==='hierarchical_euv_v1';
  const [surfaceBytes,volumeBytes]=await Promise.all([analyticSurface?Promise.resolve(null):read(manifest.surface),read(volumeField)]);
  let pulseData=null;
  if(volume.pulse&&!volume.background){
    validateDynamicResource(volume.pulse);
    if(volume.pulse.bytes!==volume.bytes*4)fail('pulse field size mismatch');
    pulseData=decodeDynamicField(await read(volume.pulse),volume.pulse);
  }
  const selection={surface:{representation:analyticSurface?'analytic shared recipe from admitted attachment packet':'surface texture',
    packet:manifest.packet,reference:manifest.surface,referenceTextureUsed:!analyticSurface},
    corona:{representation:volume.background?'analytic Gaussian strands plus background-only field':'sampled complete emission volume',packet:manifest.packet,field:volumeField}};
  return {manifest,packet,volume,analyticSurface,analyticStrands:!!volume.background,selection,
    surfaceData:surfaceBytes?decodeDynamicField(surfaceBytes,manifest.surface):null,volumeData:decodeDynamicField(volumeBytes,volumeField),pulseData};
}
