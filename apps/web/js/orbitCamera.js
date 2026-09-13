// Camera-only framing of existing display geometry; never resizes or moves a body.
function validExtent(extent, worldDistance) {
  if (!Number.isFinite(extent) || extent <= 0 || !Number.isFinite(worldDistance) || worldDistance < 0) {
    throw new TypeError('Invalid camera extent or world distance');
  }
}

export function minimumOrbitDistance(extent, worldDistance) {
  validExtent(extent, worldDistance);
  // World transforms still use Float32 on the GPU. Keep the eye separated by
  // 32 conservative relative ulps; this is a limit, not a precision restoration.
  return Math.max(extent * 1.08, extent + Math.max(1e-8, worldDistance * 2 ** -23 * 32));
}

export function fitOrbitDistance(extent, aspect, fovY, worldDistance) {
  validExtent(extent, worldDistance);
  if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(fovY) || fovY <= 0 || fovY >= Math.PI) {
    throw new TypeError('Invalid camera viewport or field of view');
  }
  // A sphere subtends asin(radius/distance). Reserve 24% of the limiting
  // viewport dimension for context; rings use their full enclosing radius.
  const halfAngle = Math.atan(.76 * Math.tan(fovY / 2) * Math.min(1, aspect));
  return Math.max(extent / Math.sin(halfAngle), minimumOrbitDistance(extent, worldDistance));
}

export function orbitNearPlane(distance, extent) {
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(extent) || extent < 0) {
    throw new TypeError('Invalid camera distance or extent');
  }
  return Math.max(1e-9, Math.min(.008, (distance - extent) * .25));
}
