// SOL Planet Look Lab v7: 12f633b27e435479f4b2322b613f8dd204847d2e.
// Presentation only: this module never owns an ephemeris or observation clock.
import {rotationDisplayStepSeconds} from './orreryTime.js';
import {oceanMaskPixels,OCEAN_MASK_WIDTH,OCEAN_MASK_HEIGHT} from './earthOceanMask.js';

export const EARTH_LOOK_ASSET=Object.freeze({
  body:'Earth',path:'textures/earth-look/earth-land-2004-july.jpg',
  dimensions:[5400,2700],bytes:1617810,
  sha256:'f55226d46d27e05511f2118dc6aa24f5dbf9b6b2cddc87cc6e0e7dd067c00b11',
  credits:'NASA Earth Observatory / Reto Stockli',
  source:'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july/world.200407.3x5400x2700.jpg',
});
export const EARTH_LOOK_EXPOSURE=1.6;
export function earthLookSelected(state={}) {
  return state.planetLook==='illustrative'&&state.useTextures!==false&&!state.galaxy
    &&state.earthCloudSource!=='daily'&&state.earthIce!==true&&!state.hdrEnabled;
}
export function earthLookDescription(state={}) {
  const status=state.earthLookStatus;
  const readiness=status==='ready'?'':status==='unavailable'
    ?'Earth look unavailable; showing the existing fallback. Switch appearance mode to retry. '
    :status==='loading'?'Loading the July Earth look. ':'Focus or zoom in to load the July Earth look. ';
  return readiness+'SOL Look Lab v7 · NASA July 2004 surface, 2002 clouds and 2016 night lights. '
    +'Darker oceans, 1.6× display exposure and illustrative cloud depth/lighting; not current weather, measured cloud heights or calibrated reflectance.';
}
export function advanceSolEarthCloudPhase(phase,realSeconds,simulatedSeconds,rotationHours,enabled) {
  if(!enabled||!Number.isFinite(realSeconds)||realSeconds<=0)return phase;
  const dt=Math.min(realSeconds,.1);
  const step=rotationDisplayStepSeconds(dt,simulatedSeconds*dt/realSeconds,rotationHours);
  if(step===0)return phase;
  // Preserve the lab's 35% relative drift using SOL's capped display rotation.
  // Bound suspended-frame catch-up without adding a second angular-speed cap.
  return ((phase+step/(Math.abs(rotationHours)*3600)*.35)%1+1)%1;
}
export function uploadEarthOceanMask(gl) {
  const texture=gl.createTexture();
  if(!texture)throw new Error('Earth ocean mask allocation failed');
  try {
    gl.activeTexture(gl.TEXTURE0+11);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,OCEAN_MASK_WIDTH,OCEAN_MASK_HEIGHT,0,gl.RED,gl.UNSIGNED_BYTE,oceanMaskPixels());
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(gl.getError()!==gl.NO_ERROR)throw new Error('Earth ocean mask upload failed');
    return texture;
  } catch(error) {gl.deleteTexture(texture);throw error;}
  finally {gl.activeTexture(gl.TEXTURE0);}
}
