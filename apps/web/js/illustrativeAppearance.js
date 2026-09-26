// Optional display materials. This module never owns or changes ephemeris state.
import {ILLUSTRATIVE_ASSETS} from './illustrativeAssetManifest.js';
export {ILLUSTRATIVE_ASSETS};
export const MAX_ILLUSTRATIVE_TEXTURES = 2;

// Display lift so the artistic cloud deck clears the radar sphere.
// Venus cloud tops are higher; this is not that measurement.
export const VENUS_ATMOSPHERE_SHELL_LIFT_KM = 40;

export function venusAtmosphereShellScale(radiusKm) {
  return 1 + VENUS_ATMOSPHERE_SHELL_LIFT_KM / radiusKm;
}

// The JPEG is opaque. Coverage is derived so the disk stays translucent,
// the limb reads thicker, and the night side does not veil the ground.
export const VENUS_ATMOSPHERE_SHELL_GLSL = `
  if(u_mode==4){
    float uu=0.5+atan(p.y,p.x)*0.1591549431;
    float vv=acos(clamp(p.z,-1.0,1.0))*0.3183098862;
    vec3 clouds=decodeSRGB(texture(u_tex,vec2(uu,vv)).rgb);
    float sun=max(dot(N,normalize(u_light)),0.0);
    float cover=smoothstep(0.05,0.22,sun);
    float ndv=clamp(dot(N,V),0.0,1.0);
    float alpha=(0.38+0.44*pow(1.0-ndv,1.35))*cover;
    if(alpha<=0.001) discard;
    vec3 color=clouds*(0.05+0.95*sun);
    o=vec4(u_linearOutput==1?color:encodeSRGB(color),alpha);
    return;
  }`;

export function illustrativeSelected(body, state = {}) {
  return state.planetLook === 'illustrative' && state.useTextures !== false
    && ILLUSTRATIVE_ASSETS.some(a => a.body === body);
}

// Radar keeps the registered Magellan ground. The artistic map is the shell above it.
export function venusAtmosphereOverlay(body, state = {}) {
  return body === 'Venus' && state.venusRadar === true && illustrativeSelected(body, state);
}

export function illustrativeReplacesSurface(body, state = {}) {
  return illustrativeSelected(body, state) && !venusAtmosphereOverlay(body, state);
}

export function planIllustrativeDemand(visible, state = {}) {
  if (state.galaxy || state.active === false) return [];
  return [...visible].filter(([body,pixels]) => illustrativeSelected(body,state) && Number.isFinite(pixels) && pixels >= 8)
    .sort(([a,ad],[b,bd]) => Number(b === state.anchor) - Number(a === state.anchor) || bd-ad || a.localeCompare(b))
    .slice(0,MAX_ILLUSTRATIVE_TEXTURES).map(([body]) => ILLUSTRATIVE_ASSETS.find(a => a.body === body));
}

export function illustrativeDescription(body, state = {}) {
  const status = state.illustrativeStatus?.[body];
  const visibleFocused = state.illustrativeVisibleFocused?.includes(body) === true;
  const retained = state.illustrativeDemandBodies?.includes(body) === true;
  // A focused body that is already large enough can still lose the two-map cache.
  // Telling that body to focus or zoom describes a different failure.
  const displaced = visibleFocused && !retained && status !== 'ready' && status !== 'loading' && status !== 'unavailable';
  const readiness = status === 'ready' ? '' : status === 'unavailable'
    ? 'Map unavailable; showing a simplified surface. Switch appearance mode to retry. '
    : status === 'loading' ? 'Loading illustrative map. '
    : displaced ? 'Only two illustrative maps stay loaded, so this focused body keeps a simplified surface. '
    : 'Focus or zoom in to load this look. ';
  return `${readiness}Illustrative look suppresses the registered surface for this planet. Solar System Scope / INOVE · CC BY 4.0. Artistic color and reconstructed coverage; not a registered observation, calibrated color or current weather. Measured terrain relief stays suspended while this look is selected, including loading, failure, and when the map is not retained.`;
}

export function venusAtmosphereNote(state = {}) {
  const status = state.illustrativeStatus?.Venus;
  const visibleFocused = state.illustrativeVisibleFocused?.includes('Venus') === true;
  const retained = state.illustrativeDemandBodies?.includes('Venus') === true;
  const displaced = visibleFocused && !retained && status !== 'ready' && status !== 'loading' && status !== 'unavailable';
  const readiness = status === 'ready' ? '' : status === 'unavailable'
    ? 'Illustrative atmosphere unavailable; the Magellan ground remains. '
    : status === 'loading' ? 'Loading illustrative atmosphere. '
    : displaced ? 'Only two illustrative maps stay loaded, so the atmosphere map is not drawn. '
    : 'Focus or zoom in to load the illustrative atmosphere. ';
  return `${readiness}Artistic Venus atmosphere drawn above the registered Magellan ground. Solar System Scope / INOVE · CC BY 4.0. Artistic cloud color; not a registered observation, calibrated color, or a measured optical profile.`;
}

/** Validate source bytes before decoding; close unwanted decoded images before returning.
 * @param {any} asset @param {AbortSignal} signal
 * @param {{fetch?:any,digest?:any,decode?:any}} services */
export async function decodeIllustrativeMap(asset, signal, services = {}) {
  const check = () => { if (signal.aborted) throw new Error('Illustrative request aborted'); };
  check();
  const response = await (services.fetch || fetch)(asset.path,{signal,credentials:'same-origin'});
  if (!response.ok) throw new Error('Illustrative map unavailable');
  const bytes = await response.arrayBuffer();check();
  if (bytes.byteLength !== asset.bytes) throw new Error('Illustrative size mismatch');
  const digest = await (services.digest || (b => crypto.subtle.digest('SHA-256',b)))(bytes);check();
  const hash = Array.from(new Uint8Array(digest),b => b.toString(16).padStart(2,'0')).join('');
  if (hash !== asset.sha256) throw new Error('Illustrative hash mismatch');
  const image = await (services.decode || (blob => createImageBitmap(blob)))(new Blob([bytes],{type:'image/jpeg'}));
  try {
    check();
    if (image.width !== asset.dimensions[0] || image.height !== asset.dimensions[1]) throw new Error('Illustrative dimensions mismatch');
    return image;
  } catch(error) {image.close();throw error;}
}
