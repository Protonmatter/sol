// Approved illustrative recipe. These are display controls, never solar model inputs.
export const SUN_LOOK_SOURCE_SHA256='7cc33aae070dd48ad26efdd166be91c8e6b75d59b085399e7d9a693610e33a18';
export const SUN_LOOK_RESOLUTIONS=Object.freeze([1024,2048,4096]);
export const SUN_LOOK_DEFAULT_RESOLUTION=1024;
export const SUN_LOOK_EXTENT=2.1;
export const SUN_LOOK_MAX_BYTES=4096*4096*9;
const D=Math.PI/180;
export const SUN_LOOK_REGIONS=Object.freeze([
  [16*D,18*D,.22,12*D,1],[-14*D,-34*D,.20,-8*D,.95],[24*D,70*D,.11,18*D,.7],
  [-9*D,150*D,.14,5*D,.9],[6*D,-110*D,.10,-15*D,.6],[3*D,-8*D,.05,30*D,.45],
  [-24*D,28*D,.045,-20*D,.4],[30*D,-40*D,.05,10*D,.35],[-5*D,52*D,.04,40*D,.4],
  [12*D,-70*D,.05,-5*D,.35],
].map(row=>Object.freeze(row)));

export function sunLookResolution(value){
  const n=Number(value);
  return SUN_LOOK_RESOLUTIONS.includes(n)?n:SUN_LOOK_DEFAULT_RESOLUTION;
}

export function sunLookDescription(state){
  const status=state.sunLookStatus||'deferred',size=sunLookResolution(state.sunLookResolution)/1024;
  const detail=state.useTextures===false?'Detail disabled because Texture layers is off'
    :status==='ready'?'':status==='deferred'?'Detail deferred at this distance':`Sun look ${status}`;
  return `Illustrative Sun Surface Lab v2 \u00b7 ${size}K. Procedural boiling cells, textured dark regions, dipole fans and feathery corona; not an observation, measured radiance or a magnetic-field solution.`
    +(detail?` ${detail}; simplified visible Sun retained.`:'');
}

const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const length=a=>Math.hypot(...a);
const unit=a=>a.map(v=>v/length(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// The lab's north is +Y; SOL's IAU local north is +Z. This proper rotation maps
// (x,y,z)_lab -> (x,-z,y)_IAU, retaining body attachment while the camera orbits.
export function sunLookRotation(iau){
  return [iau[0],iau[1],iau[2],0, iau[8],iau[9],iau[10],0,
    -iau[4],-iau[5],-iau[6],0, 0,0,0,1];
}

/** Conservative projected envelope and perspective ray basis, in lab body coordinates. */
export function planSunLook({vp,rotation,position,radius,eye,resolution=1024,pixels=0}){
  if(![...vp,...rotation,...position,...eye,radius,pixels].every(Number.isFinite)||radius<=0||pixels<8)return null;
  const body=v=>[0,4,8].map(i=>dot(v,rotation.slice(i,i+3)));
  const camera=body(eye.map((v,i)=>(v-position[i])/radius));
  if(length(camera)<=1)return null;
  const rx=[vp[0],vp[4],vp[8]],uy=[vp[1],vp[5],vp[9]],fz=[vp[3],vp[7],vp[11]];
  if(Math.min(length(rx),length(uy),length(fz))<1e-10)return null;
  const rayX=body(rx.map(v=>v/dot(rx,rx))),rayY=body(uy.map(v=>v/dot(uy,uy))),rayZ=body(unit(fz));
  const front=unit(camera),right=unit(cross(body(unit(uy)),front)),up=cross(front,right);
  if(![...right,...up].every(Number.isFinite))return null;
  const model=rotation.map((v,i)=>i<12?v*radius:v);
  model[12]=position[0];model[13]=position[1];model[14]=position[2];
  const mvp=Array.from({length:16},(_,i)=>[0,1,2,3].reduce((s,k)=>s+vp[k*4+i%4]*model[Math.floor(i/4)*4+k],0));
  let xmin=1,ymin=1,xmax=-1,ymax=-1,behind=0;
  for(const x of [-SUN_LOOK_EXTENT,SUN_LOOK_EXTENT])for(const y of [-SUN_LOOK_EXTENT,SUN_LOOK_EXTENT])for(const z of [-SUN_LOOK_EXTENT,SUN_LOOK_EXTENT]){
    const p=[x,y,z,1],c=[0,1,2,3].map(i=>p.reduce((s,v,j)=>s+v*mvp[j*4+i],0));
    if(c[3]<=0){behind++;continue;}
    xmin=Math.min(xmin,c[0]/c[3]);xmax=Math.max(xmax,c[0]/c[3]);
    ymin=Math.min(ymin,c[1]/c[3]);ymax=Math.max(ymax,c[1]/c[3]);
  }
  if(behind===8)return null;
  const rect=behind?[-1,-1,1,1]:[Math.max(-1,xmin),Math.max(-1,ymin),Math.min(1,xmax),Math.min(1,ymax)];
  if(rect[0]>=rect[2]||rect[1]>=rect[3])return null;
  const size=sunLookResolution(resolution);
  const w=[mvp[3],mvp[7],mvp[11]],w0=mvp[15],a=w0*w0-dot(w,w);
  const bloomRadiiPx=[0,1].map(axis=>{
    // Tangency to the unit sphere: (row0 - ndc*w0)^2 = |row - ndc*w|^2.
    // The two quadratic roots bound the actual disk, including off-axis views.
    // A disk crossing the view plane has unbounded image extent; cap its display
    // footprint to the target there rather than admitting an infinite blur stride.
    if(a<=1e-12)return size;
    const row=[mvp[axis],mvp[axis+4],mvp[axis+8]],row0=mvp[axis+12];
    const b=2*(dot(row,w)-row0*w0),c=row0*row0-dot(row,row);
    const span=Math.sqrt(Math.max(0,b*b-4*a*c))/a;
    return span*size/(2*(rect[axis+2]-rect[axis]));
  });
  const radiusPx=Math.min(...bloomRadiiPx);
  // Screen-size LOD controls detail only; bloom remains in target-pixel units.
  const detailRadiusPx=pixels<64?Math.min(radiusPx,pixels/2):radiusPx;
  return {size,bytes:size*size*9,camera,rayX,rayY,rayZ,viewBasis:[...right,...up,...front],mvp,rect,
    radiusPx,bloomRadiiPx,detailRadiusPx};
}
