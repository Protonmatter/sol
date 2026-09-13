// Conservative screen-space presentation only. No body, camera or orbit mutation.
// Discs cover known opaque interiors; rings and atmosphere are not occluders.

/** @typedef {{id:string,x:number,y:number,radius:number,depth:number}} OpaqueDisc */
/** @typedef {{x:number,y:number,width:number,height:number}} LabelBounds */
/** @typedef {{id:string,x:number,y:number,depth?:number,background?:boolean,bounds?:LabelBounds}} OcclusionLabel */

const finite = value => typeof value === "number" && Number.isFinite(value);
const validId = value => typeof value === "string" && value.length > 0;
const vector = (value, size) => value != null && value.length === size && Array.from(value).every(finite);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

/**
 * Project an inscribed opaque sphere using the same symmetric perspective VP
 * and CSS viewport dimensions as the DOM labels. For an oblate planet, radius
 * must be min(display equatorial radius, display polar radius); for a moon use
 * its actual drawn radius. Its center-plane circle projects entirely inside
 * the sphere silhouette, including off-axis views. The 0.5% and 1px guard leaves
 * a small rim for the renderer's triangulated surface and antialiasing.
 *
 * Depth is positive clip-w, shared with world-label projection. It is never
 * compared with the arbitrary radius of the directional sky background.
 * Unsupported projections and uncertain camera/clip cases return null.
 *
 * @param {{id:string,position:ArrayLike<number>,radius:number}} body
 * @param {ArrayLike<number>} matrix Column-major perspective view-projection.
 * @param {{width:number,height:number}} viewport CSS pixels, not backing pixels.
 * @returns {OpaqueDisc|null}
 */
export function projectOpaqueDisc(body, matrix, viewport) {
  if (!body || !validId(body.id) || !vector(body.position, 3) || !finite(body.radius) || body.radius <= 0
      || !vector(matrix, 16) || !viewport || !finite(viewport.width) || !finite(viewport.height)
      || viewport.width <= 0 || viewport.height <= 0) return null;
  const rows = [[matrix[0], matrix[4], matrix[8]], [matrix[1], matrix[5], matrix[9]],
    [matrix[3], matrix[7], matrix[11]]];
  const norms = rows.map(row => Math.hypot(...row));
  if (norms.some(value => !finite(value) || value <= 0)) return null;
  // Off-center/sheared projection requires a different silhouette calculation.
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
    if (Math.abs(dot(rows[a], rows[b])) > 1e-9 * norms[a] * norms[b]) return null;
  }
  const depth = dot(rows[2], body.position) + matrix[15];
  if (!finite(depth) || depth <= Math.max(1e-4, body.radius * norms[2])) return null;
  const clipZ = matrix[2] * body.position[0] + matrix[6] * body.position[1]
    + matrix[10] * body.position[2] + matrix[14];
  if (!finite(clipZ) || clipZ < -depth || clipZ > depth) return null;
  const x = ((dot(rows[0], body.position) + matrix[12]) / depth * .5 + .5) * viewport.width;
  const y = (.5 - (dot(rows[1], body.position) + matrix[13]) / depth * .5) * viewport.height;
  const focal = Math.min(norms[0] * viewport.width / 2, norms[1] * viewport.height / 2);
  const radius = focal * body.radius / depth * .995 - 1;
  if (![x, y, radius].every(finite) || radius <= 0) return null;
  return { id: body.id, x, y, radius, depth };
}

/**
 * Hide a background label only when its anchor (or supplied placed text box)
 * intersects a known foreground opaque interior. A body's own disc never hides
 * its label; a nearer different body can. Equality/tangency remains visible.
 * Invalid or incomparable data cannot establish occlusion and returns false.
 *
 * Pass background:true for skyVp directional labels; their clip-w is not a
 * world-space distance. Finite world labels must pass the vp clip-w as depth.
 * With bounds supplied this also avoids text extending over a disc even when
 * the object's anchor is outside it. It does not change object visibility/pick.
 *
 * @param {OcclusionLabel} label
 * @param {ReadonlyArray<OpaqueDisc>} discs
 * @returns {boolean}
 */
export function isLabelOccluded(label, discs) {
  if (!label || !validId(label.id) || ![label.x, label.y].every(finite) || !Array.isArray(discs)
      || (label.background !== true && (!finite(label.depth) || label.depth <= 0))) return false;
  const box = label.bounds;
  if (box !== undefined && (!box || ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(finite)
      || box.width <= 0 || box.height <= 0)) return false;
  return discs.some(disc => {
    if (!disc || !validId(disc.id) || disc.id === label.id
        || ![disc.x, disc.y, disc.radius, disc.depth].every(finite) || disc.radius <= 0 || disc.depth <= 0) return false;
    if (label.background !== true) {
      const tolerance = 1e-7 * Math.max(1, label.depth, disc.depth);
      if (label.depth <= disc.depth + tolerance) return false;
    }
    const x = box ? Math.max(box.x, Math.min(disc.x, box.x + box.width)) : label.x;
    const y = box ? Math.max(box.y, Math.min(disc.y, box.y + box.height)) : label.y;
    return Math.hypot(x - disc.x, y - disc.y) < disc.radius;
  });
}
