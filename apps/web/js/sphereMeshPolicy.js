// Display geometry only. This policy never changes body centers, radii or epochs.
// Its .03-device-pixel criterion bounds projected surface positions, not shader
// color, texture derivatives, raster quantization or temporal appearance.
export const SPHERE_MESH_LEVELS=Object.freeze([8,12,16,24,32,48]);
export const SPHERE_BASE_LEVEL=48;
export const SPHERE_PIXEL_LIMIT=0.03;
export const SPHERE_VERTEX_ALLOWANCE=1e-6;
const LOCAL_RADIUS=1+SPHERE_VERTEX_ALLOWANCE;
const F32_NORMAL_MIN=2**-126;
const F32_UNIT=2**-23;
const DOT_GAMMA=7*F32_UNIT/(1-7*F32_UNIT);
// Four coefficient-input flushes, four products and three adds are covered for
// zero-or-normal unit-sphere attributes. 32*N exceeds their propagated sum.
const DOT_ABSOLUTE=32*F32_NORMAL_MIN;
const MAX_COEFFICIENT=1e20; // four unit products cannot overflow Float32
const MAX_VIEWPORT=2**20;
const DECISION_MARGIN=1e-8;
const PROTECTED_NAMES=new Set(["Sun","Earth","Moon","Titan"]);

/** @param {number} stacks */
function idealDeficit(stacks){
  const alpha=Math.PI/(2*stacks),c=Math.cos(alpha),t=Math.tan(alpha);
  return 1-c/Math.sqrt(1+c*c*t*t);
}
const RADIAL_ERRORS=Object.freeze(SPHERE_MESH_LEVELS.map(n=>
  Math.max(idealDeficit(n),idealDeficit(SPHERE_BASE_LEVEL))+2*SPHERE_VERTEX_ALLOWANCE));

/**
 * Both ideal welded UV grids are radial boundaries between a concentric inner
 * ball and the unit sphere. Pairing along each ray bounds the two surfaces by
 * max(1-hL,1-h48), including the nonnested32 grid. Matching-triangle vertex
 * perturbations contribute two1e-6 allowances. Actual Float32 triangles are NOT
 * assumed strictly convex. The pool validates their grid correspondence.
 * @param {number} stacks
 */
export function sphereRadialError(stacks){
  const index=SPHERE_MESH_LEVELS.indexOf(stacks);
  if(index<0)throw new RangeError('Unsupported sphere mesh level');
  return RADIAL_ERRORS[index];
}

/** @param {ArrayLike<number>} positions */
export function validateUnitSpherePositions(positions){
  if(!positions||!Number.isInteger(positions.length)||!positions.length||positions.length%3)return false;
  for(let i=0;i<positions.length;i+=3){
    for(let j=0;j<3;j++){
      const value=positions[i+j],abs=Math.abs(value);
      if(!Number.isFinite(value)||Math.fround(value)!==value||abs>1||(abs>0&&abs<F32_NORMAL_MIN))return false;
    }
    if(Math.abs(Math.hypot(positions[i],positions[i+1],positions[i+2])-1)>SPHERE_VERTEX_ALLOWANCE)return false;
  }
  return true;
}

/** @param {ArrayLike<number>|null|undefined} matrix */
function uploadedMatrix(matrix){
  if(!matrix||matrix.length!==16)return false;
  for(let i=0;i<16;i++){
    const value=matrix[i];
    if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>MAX_COEFFICIENT||Math.fround(value)!==value)return false;
  }
  return true;
}
/** @param {number} size */
const viewportSize=size=>Number.isInteger(size)&&size>0&&size<=MAX_VIEWPORT;
/** @param {ArrayLike<number>} m @param {number} row */
function coordinateError(m,row){
  return DOT_GAMMA*(Math.abs(m[row+12])+LOCAL_RADIUS*(Math.abs(m[row])+Math.abs(m[row+4])+Math.abs(m[row+8])))+DOT_ABSOLUTE;
}

/**
 * Return the original level on any uncertainty. The input must contain exactly
 * the Float32 values uploaded for THIS draw; transforms for expanded shells
 * cannot reuse the opaque body's matrix. Width/height are backing-store pixels.
 * No allocation or synchronous GL query occurs in this per-draw policy.
 * @param {ArrayLike<number>|null|undefined} m
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function sphereMeshLevel(m,width,height){
  if(!m||!uploadedMatrix(m)||!viewportSize(width)||!viewportSize(height))return SPHERE_BASE_LEVEL;
  const wn=Math.hypot(m[3],m[7],m[11]),minimumW=m[15]-LOCAL_RADIUS*wn;
  const ew=coordinateError(m,3),ez=coordinateError(m,2);
  const near=m[15]+m[14]-LOCAL_RADIUS*Math.hypot(m[3]+m[2],m[7]+m[6],m[11]+m[10]);
  const far=m[15]-m[14]-LOCAL_RADIUS*Math.hypot(m[3]-m[2],m[7]-m[6],m[11]-m[10]);
  if(!Number.isFinite(wn)||!Number.isFinite(minimumW)||!Number.isFinite(ew)||!Number.isFinite(ez)
      ||!Number.isFinite(near)||!Number.isFinite(far)||minimumW<=ew||near<=ew+ez||far<=ew+ez)return SPHERE_BASE_LEVEL;
  let lx=0,ly=0,ex=0,ey=0;
  for(let row=0;row<2;row++){
    const norm=Math.hypot(m[row],m[row+4],m[row+8]);
    const numerator=Math.abs(m[row+12])+LOCAL_RADIUS*norm;
    const derivative=norm/minimumW+wn*numerator/(minimumW*minimumW);
    const error=(coordinateError(m,row)+numerator/minimumW*ew)/(minimumW-ew);
    if(!Number.isFinite(norm)||!Number.isFinite(numerator)||!Number.isFinite(derivative)||!Number.isFinite(error))return SPHERE_BASE_LEVEL;
    if(row===0){lx=derivative;ex=error;}else{ly=derivative;ey=error;}
  }
  const projection=Math.hypot(width*lx,height*ly)/2;
  // Two independently rounded mesh evaluations each contribute pixel/2.
  const arithmetic=Math.hypot(width*ex,height*ey);
  if(!Number.isFinite(projection)||!Number.isFinite(arithmetic))return SPHERE_BASE_LEVEL;
  for(let i=0;i<SPHERE_MESH_LEVELS.length-1;i++){
    const bound=RADIAL_ERRORS[i]*projection+arithmetic;
    if(Number.isFinite(bound)&&bound<=SPHERE_PIXEL_LIMIT-DECISION_MARGIN)return SPHERE_MESH_LEVELS[i];
  }
  return SPHERE_BASE_LEVEL;
}

/**
 * Only for the validated unit-position, position-linear sphere vertex program.
 * Every triangle is within the unit BOX regardless of Float32 facet convexity.
 * An expanded or displaced vertex program requires a different certificate.
 * Uncertain values mean draw; only a common strict outside halfspace may skip.
 * @param {ArrayLike<number>|null|undefined} m
 */
export function sphereOutsideClip(m){
  if(!m||!uploadedMatrix(m))return false;
  for(let row=0;row<3;row++)for(let sign=-1;sign<=1;sign+=2){
    let upper=m[15]+sign*m[row+12],magnitude=0;
    for(let col=0;col<3;col++)upper+=Math.abs(m[col*4+3]+sign*m[col*4+row]);
    // Use BOTH original row magnitudes: combined coefficients can cancel.
    for(let col=0;col<4;col++)magnitude+=Math.abs(m[col*4+3])+Math.abs(m[col*4+row]);
    const padding=64*F32_UNIT*Math.max(1,magnitude)+2*DOT_ABSOLUTE;
    if(Number.isFinite(upper)&&Number.isFinite(magnitude)&&Number.isFinite(padding)&&upper< -padding)return true;
  }
  return false;
}

/** @param {{name?:string,selected?:string,anchor?:string,moon?:boolean,mappedMoon?:boolean,terrain?:boolean,physical?:boolean,special?:boolean}} options */
export function sphereMeshEligible(options){
  const {name,selected,anchor,moon=false,mappedMoon=false,terrain=false,physical=false,special=false}=options;
  return typeof name==='string'&&name.length>0&&!PROTECTED_NAMES.has(name)
    &&name!==selected&&name!==anchor&&!terrain&&!physical&&!special&&!(moon&&mappedMoon);
}
