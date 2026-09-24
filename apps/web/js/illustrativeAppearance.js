// Optional display materials. This module never owns or changes ephemeris state.
import {ILLUSTRATIVE_ASSETS} from './illustrativeAssetManifest.js';
export {ILLUSTRATIVE_ASSETS};
export const MAX_ILLUSTRATIVE_TEXTURES = 2;

export function illustrativeSelected(body, state = {}) {
  return state.planetLook === 'illustrative' && state.useTextures !== false
    && !(body === 'Venus' && state.venusRadar === true)
    && ILLUSTRATIVE_ASSETS.some(a => a.body === body);
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
