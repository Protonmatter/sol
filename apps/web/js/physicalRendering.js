// Pure display transforms and bounded resource lifetime. No engine state is owned here.

export function physicalCameraPosition(eye, center, rotation, displayRadius, physicalRadiusKm) {
  if (!Array.isArray(eye) || !Array.isArray(center) || eye.length!==3 || center.length!==3
      || ![...eye,...center,displayRadius,physicalRadiusKm].every(Number.isFinite)
      || !(displayRadius>0) || !(physicalRadiusKm>0) || rotation.length!==16
      || !Array.from(rotation).every(Number.isFinite)) throw new Error('Invalid physical camera transform');
  const d=eye.map((x,i)=>(x-center[i])*physicalRadiusKm/displayRadius);
  return [0,4,8].map(i=>rotation[i]*d[0]+rotation[i+1]*d[1]+rotation[i+2]*d[2]);
}

export function terrainDetailLevel(pixelDiameter) {
  if (!Number.isFinite(pixelDiameter) || pixelDiameter<64) return 0;
  return pixelDiameter<320 ? 1 : pixelDiameter<900 ? 2 : 3;
}

export function advanceReferencePlayback(state, dt, {active=true,reducedMotion=false}={}) {
  if (![state.seconds,state.duration,dt].every(Number.isFinite) || state.duration<=0
      || state.seconds<0 || state.seconds>state.duration || dt<0) throw new Error('Invalid reference playback time');
  if (!active) return {...state};
  if (reducedMotion) return {...state,playing:false};
  const seconds=state.playing ? Math.min(state.duration,state.seconds+dt) : state.seconds;
  return {...state,seconds,playing:state.playing && seconds<state.duration};
}

/**
 * @param {{capacity?:number,load:(key:string,signal:AbortSignal)=>Promise<any>,release?:(value:any)=>void,onChange?:(key:string,status:string)=>void}} options
 */
export function createDetailCache({capacity=2,load,release=()=>{},onChange=()=>{}}) {
  if (!Number.isInteger(capacity) || capacity<1 || capacity>8) throw new Error('Invalid detail cache capacity');
  const entries=new Map();let serial=0;
  function remove(key) {
    const entry=entries.get(key);if(!entry)return;
    entries.delete(key);entry.abort.abort();
    if(entry.status==='ready')release(entry.value);
    onChange(key,'deferred');
  }
  function request(key) {
    if(typeof key!=='string'||!key||key.length>100)throw new Error('Invalid detail key');
    const prior=entries.get(key);
    if(prior){prior.used=++serial;return prior.promise;}
    if(entries.size>=capacity){
      const victim=[...entries.entries()].sort((a,b)=>a[1].used-b[1].used)[0];remove(victim[0]);
    }
    const entry={abort:new AbortController(),status:'loading',value:null,error:'',used:++serial,promise:null};
    entries.set(key,entry);onChange(key,'loading');
    let task;
    try{task=load(key,entry.abort.signal);}catch(error){task=Promise.reject(error);}
    entry.promise=Promise.resolve(task).then(value=>{
      if(entries.get(key)!==entry||entry.abort.signal.aborted){release(value);return null;}
      entry.value=value;entry.status='ready';onChange(key,'ready');return value;
    },error=>{
      if(entries.get(key)!==entry||entry.abort.signal.aborted)return null;
      entry.status='unavailable';entry.error=String(error?.message||error).slice(0,180);
      onChange(key,'unavailable');return null;
    });
    return entry.promise;
  }
  return {
    get size(){return entries.size;},
    get(key){const e=entries.get(key);if(e?.status==='ready'){e.used=++serial;return e.value;}return null;},
    status(key){return entries.get(key)?.status||'deferred';},
    error(key){return entries.get(key)?.error||'';},
    request,
    retry(key){remove(key);return request(key);},
    abortPending(){for(const [key,entry] of [...entries])if(entry.status==='loading')remove(key);},
    dispose(){for(const key of [...entries.keys()])remove(key);},
  };
}
