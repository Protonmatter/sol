// Same-origin, hash-bound solar image admission. The caller owns a returned bitmap.
import {SOLAR_APPEARANCE} from './solarAppearance.js';

export const SOLAR_ATLAS_TIMEOUT_MS=20000;
const MAX_ATLAS_BYTES=2*1024*1024;

/**
 * Load the qualified two-frame atlas without DOM images or external data requests.
 * The total deadline covers fetch, stream, digest and bitmap decode. A decoder may
 * not support cancellation; an image resolving after cancellation is always closed.
 * @param {{signal?:AbortSignal,fetcher?:typeof fetch,decode?:typeof createImageBitmap}} [options]
 * @returns {Promise<ImageBitmap>}
 */
export async function loadSolarAtlas({signal,fetcher=globalThis.fetch,decode=globalThis.createImageBitmap}={}) {
  if(signal?.aborted)throw new DOMException('Solar atlas request aborted','AbortError');
  if(typeof fetcher!=='function'||typeof decode!=='function')throw new Error('Solar atlas image loading is unavailable');
  const atlas=SOLAR_APPEARANCE.atlas;
  if(!Number.isSafeInteger(atlas.bytes)||atlas.bytes<=0||atlas.bytes>MAX_ATLAS_BYTES
      ||!/^textures\/solar\/[a-z0-9-]+\.png$/.test(atlas.path)||!/^[a-f0-9]{64}$/.test(atlas.sha256)
      ||atlas.dimensions[0]!==2048||atlas.dimensions[1]!==1024)throw new Error('Solar atlas descriptor exceeds the admitted dimensions or byte budget');
  if(!globalThis.crypto?.subtle)throw new Error('Solar atlas SHA-256 verification is unavailable');
  const controller=new AbortController();
  /** @type {ReadableStreamDefaultReader<Uint8Array>|null} */
  let reader=null;
  const abortReason=()=>controller.signal.reason instanceof Error?controller.signal.reason:new DOMException('Solar atlas request aborted','AbortError');
  const ensureActive=()=>{if(controller.signal.aborted)throw abortReason();};
  const externalAbort=()=>controller.abort(new DOMException('Solar atlas request aborted','AbortError'));
  signal?.addEventListener('abort',externalAbort,{once:true});
  let rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
  const interrupted=()=>{reader?.cancel().catch(()=>{});rejectAbort(abortReason());};
  controller.signal.addEventListener('abort',interrupted,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Solar atlas load timed out','TimeoutError')),SOLAR_ATLAS_TIMEOUT_MS);
  const work=async()=>{
    /** @type {ImageBitmap|null} */
    let bitmap=null;
    try{
      ensureActive();
      const response=await fetcher(new URL('../'+atlas.path,import.meta.url),{signal:controller.signal});
      ensureActive();
      if(!response.ok)throw new Error(`Solar atlas unavailable (HTTP ${response.status})`);
      const declared=response.headers.get('content-length');
      if(declared!==null&&!response.headers.get('content-encoding')&&Number(declared)!==atlas.bytes)throw new Error('Solar atlas declared byte size mismatch');
      reader=response.body?.getReader()||null;
      if(!reader)throw new Error('Solar atlas response has no byte stream');
      const bytes=new Uint8Array(atlas.bytes);let length=0;
      try{
        for(;;){
          ensureActive();
          const {done,value}=await reader.read();ensureActive();if(done)break;
          if(length+value.byteLength>bytes.byteLength)throw new Error('Solar atlas byte size exceeds budget');
          bytes.set(value,length);length+=value.byteLength;
        }
      }catch(error){await reader.cancel().catch(()=>{});throw error;}
      finally{reader.releaseLock();reader=null;}
      if(length!==bytes.byteLength)throw new Error('Solar atlas byte size is truncated');
      ensureActive();
      const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);ensureActive();
      const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      if(hash!==atlas.sha256)throw new Error('Solar atlas SHA-256 mismatch; reference image withheld');
      bitmap=await decode(new Blob([bytes],{type:'image/png'}),{imageOrientation:'none',colorSpaceConversion:'none',premultiplyAlpha:'none'});
      ensureActive();
      if(bitmap?.width!==atlas.dimensions[0]||bitmap?.height!==atlas.dimensions[1]||typeof bitmap.close!=='function')throw new Error('Solar atlas decoded dimensions differ from the admitted source');
      return bitmap;
    }catch(error){bitmap?.close?.();throw error;}
  };
  let published=null;
  try{
    published=await Promise.race([work(),aborted]);ensureActive();return published;
  }catch(error){published?.close?.();throw error;}
  finally{
    clearTimeout(timer);signal?.removeEventListener('abort',externalAbort);
    controller.signal.removeEventListener('abort',interrupted);
  }
}
