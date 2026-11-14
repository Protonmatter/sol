import {writeText,writeAttribute,writeBoolean} from './domWrites.js';
import {illustrativeSelected} from './illustrativeAppearance.js';
import {earthLookSelected} from './earthLook.js';
import {terrainReference,terrainSummary} from './terrainAssets.js';
import {getAtmosphereProfile} from './atmosphereOptics.js';
import {sunLookDescription} from './sunLook.js';
import {solarPlayback} from './solarAppearance.js';
import {renderPlanetPhenomena} from './planetPhenomena.js';

function writeValue(node,value){if(node.value!==value)node.value=value;}

// DOM status consumes completed render state; it does not prepare GPU resources.
export function createPhysicalPresenter({document,state,opticalSubject,solarEuvActive,solarPlaybackAvailable,linearFrame,
    renderPhenomena=renderPlanetPhenomena}) {
  let phenomenonBody='',disposePhenomena=()=>{};
  function present() {
    const body=state.active&&!state.galaxy&&!state.selectedStar?(state.selected||state.anchor):'',notes=[];
    const saturnControls=document.getElementById('orrerySaturnControls');
    if(saturnControls)writeBoolean(saturnControls,'hidden',body!=='Saturn'||!illustrativeSelected('Saturn',state));
    const saturnLighting=/** @type {HTMLSelectElement|null} */(document.getElementById('orrerySaturnLighting'));
    if(saturnLighting)writeValue(saturnLighting,state.saturnLighting);
    const galleryBody=body,opticalBody=opticalSubject();
    const host=document.getElementById('orreryPlanetPhenomena');
    if(host&&phenomenonBody!==galleryBody){disposePhenomena();phenomenonBody=galleryBody;disposePhenomena=renderPhenomena(host,galleryBody);}
    if(terrainReference(body)&&illustrativeSelected(body,state))notes.push('Measured terrain relief is suspended while Illustrative look is selected, including loading, failure, and when the map is not retained.');
    else if(terrainReference(body))notes.push(state.terrainEnabled?terrainSummary(body,state.terrainStatus[body]==='ready'&&!state.terrainRendered[body]?'deferred':state.terrainStatus[body],!!state.terrainRendered[body]):'Terrain relief disabled.');
    if(opticalBody==='Earth'&&earthLookSelected(state))notes.push('Look Lab Earth: illustrative atmosphere and cloud density at nominal 1–12 km; Sun-directed shadows and 35% relative display drift. Not measured weather or qualified optical transfer.');
    else if(getAtmosphereProfile(opticalBody))notes.push((opticalBody!==body?`${opticalBody} · `:'')+(!state.opticsEnabled?'Reference optical transfer disabled.':state.opticsStatus[opticalBody]==='ready'?`Reference atmosphere: molecular + aerosol scattering${opticalBody==='Earth'?' and Chappuis ozone absorption':''} and cached incident refraction; physical km, ${linearFrame()?'fixed presentation exposure':'adaptive display exposure'}. Not current weather.`:state.opticsStatus[opticalBody]==='loading'?'Reference optical programs and fields loading; haze columns shown until ready.':state.opticsStatus[opticalBody]==='unavailable'?'Reference optical programs or fields unavailable; haze columns shown. Toggle optical transfer to retry.':'Reference optical transfer appears in close views; distant limb uses admitted haze columns.'));
    if(state.hdrEnabled)notes.push(state.hdrStatus.state==='ready'?'Linear display composition candidate; fixed exposure and SDR output. Source images remain display references. The visible Sun uses a fixed display emission scale.':`${state.hdrStatus.reason} Existing SDR display retained.`);
    if(body==='Sun')notes.push(state.solarMode==='illustrative'?sunLookDescription(state):solarEuvActive()?`SDO / AIA 171 Å · 10 May 2024 · ${state.solarStatus}. Gold is an assigned EUV color, lifted so the star stays luminous. The observed face stays those frames. Arches rooted in three tilted pairs drift with a compressed differential-rotation clock, and one pair periodically opens into a front. That is an educational display, not fluid dynamics, a magnetogram, or a measured CME. The unobserved disk keeps the observed radial brightness.`:'Visible-light approximation. A compressed educational photosphere: convective cells and three spot groups that drift faster at the equator. One displayed second stands for two solar hours. Not an HMI observation.');
    if(body&&state.solarInspection)notes.push('Sun inspection · other bodies and orbit guides hidden. Our system restores the complete scene.');
    const inspect=document.getElementById('orreryInspectSun');if(inspect)writeAttribute(inspect,'aria-pressed',String(state.solarInspection));
    const node=document.getElementById('orreryPhysicalStatus');
    if(node){const text=notes.join(' ');if(node.textContent!==text)writeText(node,text);writeBoolean(node,'hidden',!text||(state.galaxy&&!state.hdrEnabled)||!state.active);}
    syncSolarPlaybackControls();
  }

  function syncSolarPlaybackControls() {
    const body=state.selected||state.anchor,playbackAvailable=solarPlaybackAvailable();
    if(!playbackAvailable)state.solarPlayback.playing=false;
    const controls=document.getElementById('orrerySolarControls');if(controls)writeBoolean(controls,'hidden',body!=='Sun'||!!state.selectedStar||state.galaxy||!state.active);
    const look=state.solarMode==='illustrative';
    const lookControls=document.getElementById('orrerySunLookControls');if(lookControls)writeBoolean(lookControls,'hidden',!look);
    const archiveControls=document.getElementById('orrerySolarArchiveControls');if(archiveControls)writeBoolean(archiveControls,'hidden',state.solarMode!=='reconstructed-euv');
    const lookPlay=document.getElementById('orrerySunLookPlay');if(lookPlay){writeText(lookPlay,state.sunLookPlaying?'Pause Sun':'Play Sun');writeAttribute(lookPlay,'aria-pressed',String(state.sunLookPlaying));}
    const detail=/** @type {HTMLSelectElement|null} */(document.getElementById('orrerySunResolution'));if(detail)writeValue(detail,String(state.sunLookResolution));
    const lookStatus=document.getElementById('orrerySunLookStatus');if(lookStatus)writeText(lookStatus,state.sunLookReason||sunLookDescription(state));
    const mode=/** @type {HTMLSelectElement|null} */(document.getElementById('orrerySolarMode'));if(mode)writeValue(mode,state.solarMode);
    const play=/** @type {HTMLButtonElement|null} */(document.getElementById('orrerySolarPlay'));if(play){writeText(play,state.solarPlayback.playing?'Pause source':'Play source');writeAttribute(play,'aria-pressed',String(state.solarPlayback.playing));writeBoolean(play,'disabled',!playbackAvailable);}
    const range=/** @type {HTMLInputElement|null} */(document.getElementById('orrerySolarTime'));if(range)writeValue(range,String(state.solarPlayback.seconds));
    const epoch=document.getElementById('orrerySolarEpoch');if(epoch)writeText(epoch,solarPlayback(state.solarPlayback.seconds).sourceTime.replace('T',' ').replace('Z',' UTC'));
  }

  return {present,syncSolarPlaybackControls,dispose(){disposePhenomena();disposePhenomena=()=>{};phenomenonBody='';}};
}
