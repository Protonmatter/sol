// Sequence contract generated from docs/solar-observation-sequence-v1.schema.json.
const SCHEMA = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"solar-observation-sequence-v1.schema.json","type":"object","additionalProperties":false,"required":["schema_version","id","recipe_version","source_manifest_sha256","mission","instrument","channel_id","wavelength_angstrom","intensity_kind","intensity_units","display_transfer_id","calibration_id","observer","coordinate_system","registration_recipe","valid_time_range","expected_cadence_seconds","frames","credits","source_urls","limitations","original_time_scale"],"properties":{"schema_version":{"type":"string","const":"solar-observation-sequence.v1"},"id":{"type":"string","pattern":"^sdo-aia171-[a-f0-9]{16}$"},"recipe_version":{"type":"string","const":"helioviewer-jp2-reduce3-jpeg88-v1"},"source_manifest_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"mission":{"type":"string","const":"SDO"},"instrument":{"type":"string","const":"AIA"},"channel_id":{"type":"string","const":"aia-171"},"wavelength_angstrom":{"type":"integer","const":171},"intensity_kind":{"type":"string","const":"provider_display"},"intensity_units":{"type":"string","const":"provider-stretched display values"},"display_transfer_id":{"type":"string","const":"provider-jp2-transfer-unqualified"},"calibration_id":{"const":null},"observer":{"type":"string","const":"SDO"},"coordinate_system":{"type":"string","const":"source-image-plane"},"registration_recipe":{"type":"string","const":"none-source-facing-only"},"valid_time_range":{"type":"array","minItems":2,"maxItems":2,"items":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?Z$"}},"expected_cadence_seconds":{"type":"number","minimum":36,"maximum":3600},"frames":{"type":"array","minItems":2,"maxItems":121,"items":{"$ref":"#/$defs/frame"}},"credits":{"type":"string","minLength":1},"source_urls":{"type":"array","minItems":1,"maxItems":8,"items":{"type":"string","pattern":"^https://api\\.helioviewer\\.org/"}},"limitations":{"type":"array","minItems":1,"maxItems":12,"items":{"type":"string","minLength":1}},"original_time_scale":{"type":"string","const":"UTC"}},"$defs":{"frame":{"type":"object","additionalProperties":false,"required":["id","observed_at","exposure_seconds","quality_raw","quality_interpretation","source_sha256","metadata_sha256","asset_path","bytes","sha256","width","height","coverage_mask_path","wcs","gap_before_seconds","permitted_interpolation","source_url","metadata_url"],"properties":{"id":{"type":"string","pattern":"^hv-[0-9]+$"},"observed_at":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?Z$"},"exposure_seconds":{"type":["number","null"],"minimum":0},"quality_raw":{"type":["integer","null"],"minimum":0},"quality_interpretation":{"type":"string","const":"unqualified-provider-quality"},"source_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"metadata_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"asset_path":{"type":"string","pattern":"^textures/solar/sequence/sdo-aia171-[a-f0-9]{16}/frame-[0-9]{3}\\.jpg$"},"bytes":{"type":"integer","minimum":1,"maximum":262144},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"width":{"type":"integer","const":512},"height":{"type":"integer","const":512},"coverage_mask_path":{"const":null},"wcs":{"type":"object","additionalProperties":{"type":"number"}},"gap_before_seconds":{"type":"number","minimum":0,"maximum":7200},"permitted_interpolation":{"type":"string","const":"none"},"source_url":{"type":"string","pattern":"^https://api\\.helioviewer\\.org/"},"metadata_url":{"type":"string","pattern":"^https://api\\.helioviewer\\.org/"}}}}};

/** @param {any} value @param {any} rule @param {string} name */
function check(value, rule, name) {
  if (rule.$ref) return check(value, SCHEMA.$defs[rule.$ref.split('/').at(-1)], name);
  if ('const' in rule && value !== rule.const) throw Error(`${name}: constant mismatch`);
  if (rule.enum && !rule.enum.includes(value)) throw Error(`${name}: enum mismatch`);
  let kind = rule.type;
  if (Array.isArray(kind)) {
    if (value === null && kind.includes('null')) return;
    kind = kind.find(item => item !== 'null');
  }
  if (kind === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${name}: object required`);
    if ((rule.required || []).some(key => !Object.hasOwn(value,key))) throw Error(`${name}: missing key`);
    for (const [key, member] of Object.entries(value)) {
      const declared=Object.hasOwn(rule.properties || {},key);
      if (rule.additionalProperties === false && !declared) throw Error(`${name}: unknown key`);
      check(member, declared ? rule.properties[key] : rule.additionalProperties || {}, `${name}.${key}`);
    }
  } else if (kind === 'array') {
    if (!Array.isArray(value) || value.length < (rule.minItems || 0) || value.length > (rule.maxItems || 10000)) throw Error(`${name}: array budget`);
    for (const member of value) check(member, rule.items || {}, name);
  } else if (kind === 'number' || kind === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (kind === 'integer' && !Number.isInteger(value)) || value < (rule.minimum ?? -Infinity) || value > (rule.maximum ?? Infinity)) throw Error(`${name}: numeric range`);
  } else if (kind === 'string') {
    if (typeof value !== 'string' || value.length < (rule.minLength || 0) || (rule.pattern && !new RegExp(rule.pattern).test(value))) throw Error(`${name}: invalid string`);
  }
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const member of Object.values(value)) freeze(member); Object.freeze(value); }
  return value;
}
/** Parse bounded manifest text without allowing JSON duplicate-key overwrite. */
export function parseSolarSequenceManifest(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 1048576) throw Error('manifest byte budget');
  const value=JSON.parse(text);
  const tokens=/"(?:\\.|[^"\\])*"|[{}\[\]]/g;
  const stack=[];
  for (const match of text.matchAll(tokens)) {
    const token=match[0];
    if(token==='{')stack.push(new Set());
    else if(token==='[')stack.push(null);
    else if(token==='}' || token===']')stack.pop();
    else if(text.slice(match.index+token.length).trimStart().startsWith(':')) {
      const key=JSON.parse(token),keys=stack.at(-1);
      if(keys.has(key))throw Error('duplicate manifest key');
      keys.add(key);
    }
  }
  return validateSolarSequence(value);
}
/** Validate and clone before ownership transfer. No caller-owned object is mutated. */
export function validateSolarSequence(input) {
  if(new TextEncoder().encode(JSON.stringify(input)).byteLength>1048576)throw Error('manifest byte budget');
  const manifest = structuredClone(input);
  check(manifest, SCHEMA, 'sequence');
  const ids = new Set(); let previous = null;
  for (const frame of manifest.frames) {
    const time = Date.parse(frame.observed_at);
    // Round-trip calendar fields rejects Date.parse's permissive day normalization.
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,19) !== frame.observed_at.slice(0,19) || ids.has(frame.id) || (previous !== null && time <= previous)) throw Error('unordered or invalid observation time / ID');
    const gap = previous === null ? 0 : (time - previous) / 1000;
    if (Math.abs(gap - frame.gap_before_seconds) > .001) throw Error('incorrect source gap');
    previous = time; ids.add(frame.id);
  }
  const frames = manifest.frames;
  if (manifest.valid_time_range[0] !== frames[0].observed_at || manifest.valid_time_range[1] !== frames.at(-1).observed_at || (previous - Date.parse(frames[0].observed_at)) / 1000 > 7260) throw Error('sequence time range');
  return freeze(manifest);
}

async function readBounded(response, limit, signal) {
  if (!response.ok || response.redirected || !response.body) throw Error('asset response unavailable or redirected');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw Error('asset byte budget');
  const reader = response.body.getReader();
  let size = 0; const chunks = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, {once:true});
  try {
    while (true) {
      if (signal.aborted) throw Error('cancelled');
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error('asset byte budget');
      chunks.push(value);
    }
    if (signal.aborted) throw Error('cancelled');
    const bytes = new Uint8Array(size); let offset=0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    return bytes;
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function digestDefault(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
}

/**
 * Owner drives advance(deltaArchiveSeconds); no timers, autoplay, or hidden looping.
 * onFrame must draw synchronously. Bitmap ownership remains with the player.
 * Keep at most three verified decoded frames; stale pending frames are closed.
 * @param {any} input
 * @param {{onFrame?:(value:any)=>void,onState?:(value:any)=>void,fetchImpl?:any,decode?:any,digest?:any,baseUrl?:string,timeoutMs?:number}} options
 */
export function createSolarSequencePlayer(input, options = {}) {
  const manifest = validateSolarSequence(input);
  const {onFrame=()=>{},onState=()=>{},fetchImpl=globalThis.fetch,
    decode=async bytes=>createImageBitmap(new Blob([bytes],{type:'image/jpeg'})),
    digest=digestDefault,baseUrl=globalThis.location?.href || 'http://localhost/',timeoutMs=15000} = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw Error('timeout budget');
  const base = new URL(baseUrl);
  if (!['http:','https:'].includes(base.protocol)) throw Error('same-origin HTTP base required');
  let serial=0,controller=null,disposed=false,clock=0;
  let activeLoad=Promise.resolve();
  let state={status:'deferred',index:-1,observedAt:null,gapSeconds:0,error:null,playing:false};
  const ring=new Map();
  const emit=(patch)=>{state={...state,...patch};onState(Object.freeze({...state}));};
  const invalidate=()=>{serial++;controller?.abort();controller=null;};
  const getState=()=>Object.freeze({...state});
  async function seek(index, keepPlaying=false) {
    if (disposed) return false;
    if (!Number.isInteger(index) || index<0 || index>=manifest.frames.length) throw Error('frame index outside archive');
    invalidate(); const owner=serial;
    // One active pipeline and only the latest waiting intent enters it. Native
    // ImageBitmap decode has no abort API, so drain and close it before restart.
    const previousLoad=activeLoad;
    await previousLoad;
    if(disposed || owner!==serial)return false;
    let complete=()=>{};
    activeLoad=new Promise(resolve=>{complete=resolve;});
    controller=new AbortController();const localController=controller;const signal=controller.signal;
    let timer=null,bitmap=null,response=null;
    const frame=manifest.frames[index];
    emit({status:'loading',playing:keepPlaying && state.playing,error:null,gapSeconds:0});
    try {
      bitmap=ring.get(index);
      if (!bitmap) {
        // Make room BEFORE decoding: retained display plus two neighbors maximum,
        // including an in-flight decoded frame.
        while(ring.size>=3) {
          const victim=[...ring.keys()].find(key=>key!==state.index);
          ring.get(victim).close();ring.delete(victim);
        }
        timer=setTimeout(()=>localController.abort(),timeoutMs);
        const url=new URL(frame.asset_path,base);
        if(url.origin!==base.origin)throw Error('cross-origin asset');
        response=await fetchImpl(url.href,{signal,redirect:'error',credentials:'same-origin',cache:'force-cache'});
        if(response.url && new URL(response.url).origin!==base.origin)throw Error('cross-origin response');
        if(response.headers.get('content-type')?.split(';')[0].trim()!=='image/jpeg')throw Error('asset MIME mismatch');
        const bytes=await readBounded(response,frame.bytes,signal);
        if(bytes.byteLength!==frame.bytes || await digest(bytes,frame)!==frame.sha256)throw Error('asset integrity mismatch');
        if(owner!==serial || disposed)return false;
        if(signal.aborted)throw Error('asset timed out');
        bitmap=await decode(bytes,frame);
        if(owner!==serial || disposed){bitmap.close();return false;}
        if(signal.aborted){bitmap.close();bitmap=null;throw Error('asset timed out');}
        if(bitmap.width!==frame.width || bitmap.height!==frame.height){bitmap.close();bitmap=null;throw Error('decoded geometry mismatch');}
        ring.set(index,bitmap);
      }
      if(signal.aborted || owner!==serial || disposed)return false;
      onFrame({frame,bitmap,index});
      clock=Date.parse(frame.observed_at);
      emit({status:keepPlaying && state.playing?'playing':'paused',index,observedAt:frame.observed_at,error:null});
      return true;
    } catch(error) {
      if(owner===serial && !disposed)emit({status:'failed',playing:false,error:String(error?.message||error)});
      return false;
    } finally {
      // This request's lifetime belongs to its local controller, even when a
      // later seek owns the current slot. Header rejection must close unread bodies.
      localController.abort();
      if(response?.body && !response.body.locked)await response.body.cancel().catch(()=>{});
      if(timer!==null)clearTimeout(timer);if(owner===serial)controller=null;complete();
    }
  }
  function pause(reason='paused') {
    if(disposed)return;
    invalidate();emit({status:state.index<0?'deferred':'paused',playing:false,error:reason==='paused'?null:reason});
  }
  function play() {
    if(disposed || state.index<0 || state.status==='loading' || state.status==='gap' || state.status==='failed')return false;
    if(state.index===manifest.frames.length-1){emit({status:'ended',playing:false});return false;}
    emit({status:'playing',playing:true,error:null});return true;
  }
  async function advance(deltaSeconds) {
    if(!Number.isFinite(deltaSeconds) || deltaSeconds<0)throw Error('nonnegative finite archive delta required');
    if(disposed || !state.playing || state.status==='loading')return;
    clock+=deltaSeconds*1000;
    let target=state.index;
    for(let next=state.index+1;next<manifest.frames.length;next++) {
      const frame=manifest.frames[next];
      if(Date.parse(frame.observed_at)>clock)break;
      if(frame.gap_before_seconds>2*manifest.expected_cadence_seconds) {
        if(target!==state.index && !await seek(target,true))return;
        clock=Date.parse(manifest.frames[state.index].observed_at);
        emit({status:'gap',playing:false,gapSeconds:frame.gap_before_seconds});return;
      }
      target=next;
    }
    const requestedClock=clock;
    if(target!==state.index){if(!await seek(target,true))return;clock=requestedClock;}
    if(state.index===manifest.frames.length-1)emit({status:'ended',playing:false});
  }
  async function replay() {if(await seek(0))play();}
  function dispose() {
    if(disposed)return;disposed=true;invalidate();
    for(const bitmap of ring.values())bitmap.close();ring.clear();
    emit({status:'disposed',playing:false});
  }
  return Object.freeze({manifest,seek,play,pause,advance,replay,dispose,getState});
}
