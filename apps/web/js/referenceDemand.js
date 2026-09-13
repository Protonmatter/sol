// Display-resource policy only. Engine coordinates and source epochs are inputs,
// never mutated by deciding whether a photographic map is useful on screen.
import { appearanceReference, earthCloudRole } from './planetAppearance.js';

export const MAX_REFERENCE_TEXTURES = 8;
export const MAX_REFERENCE_REQUESTS = 2;
export const MIN_REFERENCE_DIAMETER = 8; // CSS pixels, independent of device DPI.

export function referencePixelDiameter(position, radius, vp, viewport) {
  if (!position || position.length !== 3 || !Array.from(position).every(Number.isFinite)
      || !Number.isFinite(radius) || radius <= 0 || !vp || vp.length !== 16
      || !Array.from(vp).every(Number.isFinite) || !viewport
      || ![viewport.width,viewport.height].every(n=>Number.isFinite(n)&&n>0)) return 0;
  const component = row => vp[row]*position[0]+vp[row+4]*position[1]+vp[row+8]*position[2]+vp[row+12];
  const depth = component(3), depthNorm = Math.hypot(vp[3],vp[7],vp[11]);
  if (!Number.isFinite(depth) || !Number.isFinite(depthNorm) || depthNorm <= 0) return 0;
  // Reject only a sphere wholly outside a frustum plane. A center-plane disc
  // misses off-axis limbs and intersections with the near/far clipping planes.
  for (const row of [0,1,2]) for (const sign of [-1,1]) {
    const distance = depth + sign*component(row);
    const planeNorm = Math.hypot(vp[3]+sign*vp[row],vp[7]+sign*vp[row+4],vp[11]+sign*vp[row+8]);
    if (!Number.isFinite(distance) || !Number.isFinite(planeNorm) || distance < -radius*planeNorm) return 0;
  }
  const nearDepth = depth-radius*depthNorm;
  if (nearDepth <= 0) return Math.max(viewport.width,viewport.height)*2;
  // Upper bounds on perspective x/y extent, including off-axis displacement.
  // This is a resource-usefulness policy, not a measurement shown to the user.
  const pixels = Math.max(...[0,1].map(row => (row ? viewport.height : viewport.width)*radius
    *(Math.hypot(vp[row],vp[row+4],vp[row+8])+Math.abs(component(row)/depth)*depthNorm)/nearDepth));
  if (!Number.isFinite(pixels) || pixels < MIN_REFERENCE_DIAMETER) return 0;
  return pixels;
}

export function planReferenceDemand(visible, state = {}) {
  if (state.useTextures === false || state.galaxy) return [];
  const bodies = [...visible].filter(([,diameter])=>Number.isFinite(diameter)&&diameter>=MIN_REFERENCE_DIAMETER)
    .sort(([a,ad],[b,bd])=>Number(b===state.anchor)-Number(a===state.anchor)||bd-ad||(a<b?-1:a>b?1:0));
  const assets = [];
  for (const [body] of bodies) {
    const roles = ['surface'];
    if (body === 'Earth') {
      if (state.earthNight !== false) roles.push('night-lights');
      if (state.earthWeather !== false) roles.push(earthCloudRole(state));
      if (state.earthIce === true) roles.push('sea-ice');
    }
    for (const role of roles) {
      const asset = appearanceReference(body,role);
      if (asset && !assets.some(a=>a.id===asset.id)) assets.push(asset);
      if (assets.length === MAX_REFERENCE_TEXTURES) return assets;
    }
  }
  return assets;
}
