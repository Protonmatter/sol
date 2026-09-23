import {createSolarSequencePlayer, parseSolarSequenceManifest} from './solarSequencePlayer.js';

const MANIFEST_SHA256 = '865d478cce97cef48eff729df81721c0e61336766d937d7101e6f672a6e26b31';
const MANIFEST_LIMIT = 1048576;

/** One owned, bounded same-origin manifest request; every exit cancels its body. */
async function loadManifest(win, baseUrl, controller) {
  let response=null,reader=null;
  const signal=controller.signal;
  const timer=setTimeout(()=>controller.abort(),15000);
  const cancel=()=>{if(reader)void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    const url=new URL('solar-observation-sequence.v1.json',baseUrl);
    response=await win.fetch(url.href,{signal,redirect:'error',credentials:'same-origin',cache:'force-cache'});
    if(!response.ok || response.redirected || (response.url && new URL(response.url).origin!==url.origin) || !response.body)throw Error('Archive manifest response unavailable');
    if(response.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw Error('Archive manifest MIME mismatch');
    const declared=response.headers.get('content-length');
    if(declared!==null && (!/^\d+$/.test(declared) || Number(declared)>MANIFEST_LIMIT))throw Error('Archive manifest byte budget');
    reader=response.body.getReader();const chunks=[];let size=0;
    while(true){
      if(signal.aborted)throw Error('Archive loading canceled');
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>MANIFEST_LIMIT)throw Error('Archive manifest byte budget');chunks.push(value);
    }
    if(signal.aborted)throw Error('Archive loading canceled');
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==MANIFEST_SHA256)throw Error('Archive manifest integrity mismatch');
    if(signal.aborted)throw Error('Archive loading canceled');
    return parseSolarSequenceManifest(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } finally {
    controller.abort();signal.removeEventListener('abort',cancel);clearTimeout(timer);
    if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}
    else if(response?.body && !response.body.locked)await response.body.cancel().catch(()=>{});
  }
}

/** Bind optional archive playback controls without touching engine/scenario state.
 * @param {{document:Document,onChange?:()=>void}} options
 */
export function createSolarSequenceControls({document:doc,onChange=()=>{}}) {
  const win=doc.defaultView;
  if(!win)throw Error('Archive controls require a document window');
  const element=id=>/** @type {any} */(doc.getElementById(id));
  const canvas=element('observationSequenceCanvas'),toggle=element('observationSequenceToggle');
  const play=element('observationSequencePlay'),restart=element('observationSequenceRestart');
  const time=element('observationSequenceTime'),timeLabel=element('observationSequenceTimeLabel');
  const container=element('observationSequenceControls'),rate=element('observationSequenceRate');
  const context=canvas?.getContext('2d');
  const motion=win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const base=new URL('.',doc.baseURI);
  if(!['http:','https:'].includes(base.protocol) || (win.location?.origin && base.origin!==win.location.origin))throw Error('Archive controls require same-origin HTTP resources');
  const baseUrl=base.href;
  let selected=false,visible=true,disposed=false,generation=0,loading=false,loadController=null;
  let player=null,frame=null,status='deferred',error=null,raf=null,lastTick=null,rateValue=60;
  const listeners=[];
  const allowed=()=>selected && visible && !doc.hidden && !motion?.matches && !disposed;
  const active=()=>selected && !disposed;
  function presentation() {
    if(!active())return null;
    const stale=Boolean(frame) && ['loading','failed','gap'].includes(status);
    const availability=frame?(stale?'last_valid':'ready'):(status==='failed'?'unavailable':'loading');
    const suffix=status==='gap'?`gap ${player?.getState().gapSeconds ?? 0}s — held`:status;
    return Object.freeze({sourceKind:'observed',providerLabel:'NASA · SDO / AIA 171 Å · Helioviewer',
      timeLabel:frame?`${frame.observed_at.replace('T',' ').replace('Z',' UTC')} · archival · ${suffix}`:status==='failed'?'Archive unavailable':'Loading archival sequence',
      availability,headline:status==='failed'?`Archive playback unavailable${error?`: ${error}`:''}`:status==='gap'?'Archive gap — previous observation held.':'Two hours of our star in extreme ultraviolet.',
      sourceUrl:frame?.source_url || 'https://api.helioviewer.org/docs/v2/',capturedAt:frame?.observed_at || null,
      interpretation:'Archival SDO/AIA 171 Å provider-display imagery in grayscale. Original source quality flags are unqualified; this is not calibrated radiance. No quantitative brightness comparison or temporal interpolation.',
      compositingPermitted:false,modelBundleIdentity:null,
      scope:`Source-facing archive only. No model regions are registered to these images.${frame?` Retained source QUALITY=${frame.quality_raw}.`:''}`});
  }
  function refresh(notify=true) {
    if(disposed)return;
    if(toggle){toggle.setAttribute('aria-pressed',String(selected));toggle.textContent=selected?'Show saved still image':'Show archival sequence';}
    if(container)container.hidden=!selected;
    if(canvas){canvas.hidden=!selected || !frame;canvas.setAttribute('aria-label',frame?`SDO AIA 171 angstrom archival observation at ${frame.observed_at}; grayscale provider display`:'Archival solar sequence');}
    const state=player?.getState();
    if(play){play.disabled=!player || !frame || loading || !visible || doc.hidden || Boolean(motion?.matches);play.textContent=state?.playing?'Pause':'Play';play.setAttribute('aria-pressed',String(Boolean(state?.playing)));}
    if(restart)restart.disabled=!player || loading;
    if(time){time.disabled=!player || loading;time.min='0';time.max=String(player?player.manifest.frames.length-1:120);time.step='1';if(state?.index>=0)time.value=String(state.index);}
    if(timeLabel)timeLabel.textContent=presentation()?.timeLabel || '';
    if(notify)onChange();
  }
  function stopClock() {if(raf!==null)win.cancelAnimationFrame(raf);raf=null;lastTick=null;}
  function enforcePlaybackPolicy() {
    if(allowed())return true;
    // MediaQueryList.matches / document.hidden can change before their queued
    // events run. Stopping RAF alone would strand a stale playing=true state.
    if(!disposed && player?.getState().playing)pause(motion?.matches?'reduced motion':doc.hidden?'background':'hidden');
    return false;
  }
  function schedule() {
    if(!enforcePlaybackPolicy() || !player?.getState().playing || raf!==null)return;
    raf=win.requestAnimationFrame(async now=>{
      raf=null;if(!enforcePlaybackPolicy())return;
      const delta=lastTick===null?0:Math.max(0,Math.min((now-lastTick)/1000,1));lastTick=now;
      await player.advance(delta*rateValue);
      if(enforcePlaybackPolicy())schedule();
    });
  }
  function pause(reason='paused') {stopClock();player?.pause(reason);refresh();}
  function cancelLoad() {generation++;loadController?.abort();loadController=null;loading=false;}
  async function initialize() {
    if(disposed || !selected || !visible || doc.hidden || loading)return;
    if(player){if(!frame)await player.seek(0);refresh();return;}
    const owner=++generation;const controller=new AbortController();loadController=controller;loading=true;status='loading';error=null;refresh();
    try {
      const manifest=await loadManifest(win,baseUrl,controller);
      if(owner!==generation || !selected || !visible || disposed || doc.hidden)return;
      if(!context)throw Error('Canvas display unavailable');
      player=createSolarSequencePlayer(manifest,{baseUrl,fetchImpl:win.fetch.bind(win),
        decode:bytes=>win.createImageBitmap(new Blob([bytes],{type:'image/jpeg'})),
        onFrame:({frame:next,bitmap})=>{if(disposed || !selected || !visible || doc.hidden)return;context.drawImage(bitmap,0,0,512,512);frame=next;},
        onState:state=>{if(disposed)return;status=state.status;error=state.error;refresh();}});
      await player.seek(0);
    } catch(cause) {
      if(owner===generation && !disposed){status='failed';error=String(cause?.message || cause);}
    } finally {
      if(owner===generation){loading=false;loadController=null;refresh();}
    }
  }
  function listen(target,event,callback){if(target){target.addEventListener(event,callback);listeners.push([target,event,callback]);}}
  listen(toggle,'click',()=>{
    selected=!selected;
    if(selected){void initialize();}else{cancelLoad();pause('still image selected');}
    refresh();
  });
  listen(play,'click',()=>{
    if(!allowed() || !player)return;
    if(player.getState().playing)pause();else if(player.play()){lastTick=null;schedule();refresh();}
  });
  listen(restart,'click',async()=>{if(!selected || !visible || !player)return;pause();await player.seek(0);refresh();});
  listen(time,'input',async()=>{if(!selected || !visible || !player)return;const index=Number(time.value);pause();if(Number.isInteger(index) && index>=0 && index<player.manifest.frames.length)await player.seek(index);refresh();});
  listen(rate,'change',()=>{const value=Number(rate.value);rateValue=value===600?600:60;rate.value=String(rateValue);lastTick=null;});
  listen(doc,'visibilitychange',()=>{if(doc.hidden){cancelLoad();pause('background');}else if(selected && visible){void initialize();refresh();}});
  listen(motion,'change',()=>{if(motion.matches)pause('reduced motion');refresh();});
  function setVisible(value) {
    const next=Boolean(value);if(disposed || next===visible)return;visible=next;
    if(!visible){cancelLoad();pause('hidden');}else if(selected){void initialize();}
    refresh();
  }
  function dispose() {
    if(disposed)return;disposed=true;cancelLoad();stopClock();
    for(const [target,event,callback] of listeners)target.removeEventListener(event,callback);
    player?.dispose();player=null;frame=null;if(canvas)canvas.hidden=true;if(container)container.hidden=true;
  }
  refresh(false);
  return Object.freeze({active,presentation,setVisible,dispose});
}
