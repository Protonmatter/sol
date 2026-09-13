// Historical mission observations remain separate from the 3-D globe and engine.
import {planetPhenomenaManifest} from './planetPhenomenaManifest.js';

/** @template T @param {T} value @returns {Readonly<T>} */
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
export const PLANET_PHENOMENA=freeze(planetPhenomenaManifest);
export const PHENOMENON_TIMEOUT_MS=20000;
const IMAGE_BYTE_CAP=400000;

/** @param {string} body */
export function phenomenaForBody(body){
  return PLANET_PHENOMENA.observations.filter(item=>item.body===body);
}

/**
 * Fetch only an admitted same-origin observation. Published bytes are hash bound;
 * no live mission request, texture registration, or scientific state is involved.
 * @param {string} id
 * @param {{signal?:AbortSignal,fetcher?:typeof fetch}} [options]
 * @returns {Promise<Blob>}
 */
export async function loadPhenomenonImage(id,{signal,fetcher=globalThis.fetch}={}){
  const item=PLANET_PHENOMENA.observations.find(value=>value.id===id);
  if(!item)throw new Error('Unknown mission observation');
  const asset=item.asset;
  if(!Number.isSafeInteger(asset.bytes)||asset.bytes<=0||asset.bytes>IMAGE_BYTE_CAP
      ||!/^textures\/phenomena\/[a-z0-9-]+\.(png|jpg)$/.test(asset.path)
      ||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('Invalid mission image admission');
  if(signal?.aborted)throw new DOMException('Observation request aborted','AbortError');
  if(!globalThis.crypto?.subtle||typeof fetcher!=='function')throw new Error('Verified image loading unavailable');
  const controller=new AbortController();
  /** @type {ReadableStreamDefaultReader<Uint8Array>|null} */
  let reader=null;
  const reason=()=>controller.signal.reason instanceof Error?controller.signal.reason:new DOMException('Observation request aborted','AbortError');
  const active=()=>{if(controller.signal.aborted)throw reason();};
  const cancel=()=>controller.abort(new DOMException('Observation request aborted','AbortError'));
  signal?.addEventListener('abort',cancel,{once:true});
  let rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
  const interrupted=()=>{reader?.cancel().catch(()=>{});rejectAbort(reason());};
  controller.signal.addEventListener('abort',interrupted,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Observation load timed out','TimeoutError')),PHENOMENON_TIMEOUT_MS);
  const work=async()=>{
    active();
    const response=await fetcher(new URL('../'+asset.path,import.meta.url),{signal:controller.signal,credentials:'same-origin'});
    active();
    if(!response.ok)throw new Error('Mission image unavailable (HTTP '+response.status+')');
    const declared=response.headers.get('content-length');
    if(declared!==null&&!response.headers.get('content-encoding')&&Number(declared)!==asset.bytes)throw new Error('Mission image declared size mismatch');
    reader=response.body?.getReader()||null;if(!reader)throw new Error('Mission image stream unavailable');
    const bytes=new Uint8Array(asset.bytes);let length=0;
    try{
      for(;;){
        active();const {done,value}=await reader.read();active();if(done)break;
        if(length+value.byteLength>bytes.byteLength)throw new Error('Mission image byte size exceeds budget');
        bytes.set(value,length);length+=value.byteLength;
      }
    }catch(error){await reader.cancel().catch(()=>{});throw error;}
    finally{reader.releaseLock();reader=null;}
    if(length!==asset.bytes)throw new Error('Mission image is truncated');
    active();const digest=await crypto.subtle.digest('SHA-256',bytes);active();
    const hash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
    if(hash!==asset.sha256)throw new Error('Mission image SHA-256 mismatch');
    return new Blob([bytes],{type:asset.mime});
  };
  try{const blob=await Promise.race([work(),aborted]);active();return blob;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',interrupted);}
}

/**
 * Render a compact selected-body gallery. Call the returned disposer before body
 * replacement or host removal. All state belongs to this invocation; no listeners,
 * timers or image references are installed on document/window.
 * @param {HTMLElement} container
 * @param {string} body
 * @param {{loadImage?:typeof loadPhenomenonImage,objectUrls?:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>}} [options]
 * @returns {()=>void}
 */
export function renderPlanetPhenomena(container,body,{loadImage=loadPhenomenonImage,objectUrls=URL}={}){
  const items=phenomenaForBody(body);
  container.replaceChildren();container.hidden=!items.length;
  if(!items.length)return ()=>{};
  const document=container.ownerDocument;
  /** @template {keyof HTMLElementTagNameMap} T @param {T} tag @param {string} className @param {string} [text] @returns {HTMLElementTagNameMap[T]} */
  const node=(tag,className,text)=>{const element=document.createElement(tag);element.className=className;if(text!==undefined)element.textContent=text;return element;};
  const panel=node('section','planet-phenomena');
  panel.setAttribute('aria-label',body+' mission observations');
  const title=node('h4','planet-phenomena__title','Atmosphere in detail');
  const intro=node('p','planet-phenomena__intro','Mission observations · historical references');
  const select=node('select','planet-phenomena__select');select.setAttribute('aria-label',body+' mission observation');
  for(const item of items){const option=node('option','',item.title);option.value=item.id;select.append(option);}
  select.value=items[0].id;
  const figure=node('figure','planet-phenomena__figure'),image=node('img','planet-phenomena__image');
  image.hidden=true;image.decoding='async';image.referrerPolicy='no-referrer';
  const caption=node('figcaption','planet-phenomena__caption');
  const heading=node('strong','planet-phenomena__heading'),summary=node('p','planet-phenomena__summary');
  const epoch=node('p','planet-phenomena__epoch'),band=node('p','planet-phenomena__band');
  const status=node('p','planet-phenomena__status');status.setAttribute('role','status');
  const retry=node('button','planet-phenomena__retry','Retry image');retry.type='button';retry.hidden=true;retry.disabled=true;
  const detail=node('details','planet-phenomena__detail'),detailTitle=node('summary','','Source and coverage');
  const coverage=node('p',''),color=node('p',''),credit=node('p','planet-phenomena__credit');
  const limitation=node('p','planet-phenomena__limit','Shown in the source view. Globe coordinates are not qualified for this observation.');
  const source=node('a','planet-phenomena__source','View NASA / JPL source ↗');source.target='_blank';source.rel='noopener noreferrer';
  detail.append(detailTitle,coverage,color,credit,limitation);caption.append(heading,epoch,band,summary,detail,source);
  figure.append(image,status,retry,caption);panel.append(title,intro,select,figure);container.append(panel);
  let disposed=false,generation=0,url='',failed=false;
  /** @type {AbortController|null} */
  let controller=null;
  function release(){if(url){objectUrls.revokeObjectURL(url);url='';}image.removeAttribute('src');image.hidden=true;}
  function unavailable(message){
    release();failed=true;retry.hidden=false;retry.disabled=false;status.textContent=message;
  }
  async function show(){
    const item=items.find(value=>value.id===select.value);if(!item||disposed)return;
    const version=++generation;controller?.abort();controller=new AbortController();release();
    failed=false;retry.hidden=true;retry.disabled=true;
    heading.textContent=item.title;summary.textContent=item.description;
    epoch.textContent=item.observation.label+' · '+item.mission;
    band.textContent=item.instrument+' · '+item.band;
    coverage.textContent=item.coverage;color.textContent=item.color_interpretation;credit.textContent=item.credits;
    source.href=item.source_page;image.alt=item.alt;image.width=item.asset.dimensions[0];image.height=item.asset.dimensions[1];
    status.textContent='Loading verified mission image…';
    image.onload=()=>{
      if(version!==generation||disposed)return;
      if(image.naturalWidth!==item.asset.dimensions[0]||image.naturalHeight!==item.asset.dimensions[1]){unavailable('Mission image unavailable: unexpected dimensions.');return;}
      image.hidden=false;status.textContent='Source image verified · historical observation';
    };
    image.onerror=()=>{if(version===generation&&!disposed)unavailable('Mission image unavailable. The source and observation details remain below.');};
    try{
      const blob=await loadImage(item.id,{signal:controller.signal});
      if(version!==generation||disposed)return;
      url=objectUrls.createObjectURL(blob);image.src=url;
    }catch(error){
      if(version!==generation||disposed)return;
      unavailable('Mission image unavailable. The source and observation details remain below.');
    }
  }
  retry.addEventListener('click',()=>{if(failed&&!disposed)void show();});
  select.addEventListener('change',()=>{void show();});void show();
  return ()=>{if(disposed)return;disposed=true;generation++;controller?.abort();image.onload=null;image.onerror=null;release();container.replaceChildren();};
}
