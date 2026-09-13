// Numeric, source-frame terrain only. These pure render transforms never change body state.
/** @typedef {{width:number,height:number,heightsKm:Float32Array,referenceRadiusKm:number,primeMeridianU:number}} TerrainGrid */
const DEG = Math.PI / 180;
const unit = p => {const l=Math.hypot(...p);return p.map(v=>v/l);};
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/** @param {TerrainGrid} grid */
function sampler(grid) {
  const {width,height,heightsKm,primeMeridianU}=grid;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<4||height<2||width>4096||height>2048||heightsKm.length!==width*height||!Number.isFinite(primeMeridianU)) throw new Error('Invalid terrain grid dimensions or registration');
  const mean = row => {let sum=0;for(let i=0;i<width;i++) {const x=heightsKm[row*width+i];if(!Number.isFinite(x))return null;sum+=x;}return sum/width;};
  const north=mean(0),south=mean(height-1);
  const cell = (x,y) => heightsKm[y*width+((x%width)+width)%width];
  return (longitudeDegrees,latitudeDegrees) => {
    if(!Number.isFinite(longitudeDegrees)||!Number.isFinite(latitudeDegrees)||Math.abs(latitudeDegrees)>90) throw new Error('Invalid terrain coordinate');
    const u=((primeMeridianU+longitudeDegrees/360)%1+1)%1;
    const x=u*width-.5,y=(90-latitudeDegrees)/180*height-.5,ix=Math.floor(x),fx=x-ix;
    const atRow = row => {const a=cell(ix,row),b=cell(ix+1,row);return !Number.isFinite(a)||!Number.isFinite(b)?null:a+(b-a)*fx;};
    if(y<0) {const row=atRow(0);return north===null||row===null?null:north+(row-north)*(y+.5)*2;}
    if(y>height-1) {const row=atRow(height-1);return south===null||row===null?null:south+(row-south)*(height-.5-y)*2;}
    const iy=Math.floor(y),fy=y-iy,a=atRow(iy),b=atRow(Math.min(height-1,iy+1));
    return a===null||b===null?null:a+(b-a)*fy;
  };
}

/** Bilinear, centered-pixel interpolation; missing cells return null, never invented relief.
 * Pole half-cells converge to the mean of their source edge row to close a single globe.
 * @param {TerrainGrid} grid @param {number} longitudeDegrees @param {number} latitudeDegrees
 * @returns {number|null} */
export function sampleTerrainHeight(grid,longitudeDegrees,latitudeDegrees) {return sampler(grid)(longitudeDegrees,latitudeDegrees);}

/** @param {TerrainGrid} grid @param {number} longitudeDegrees @param {number} latitudeDegrees */
export function terrainRadiusKm(grid,longitudeDegrees,latitudeDegrees) {
  const h=sampleTerrainHeight(grid,longitudeDegrees,latitudeDegrees);
  return h===null?null:grid.referenceRadiusKm+h;
}

/** Bounded whole-globe LOD; no mismatched tile boundaries. @param {number} pixelDiameter */
export function terrainLod(pixelDiameter) {
  const latSegments=Number.isFinite(pixelDiameter)&&pixelDiameter>600?192:Number.isFinite(pixelDiameter)&&pixelDiameter>160?96:48;
  return {latSegments,lonSegments:latSegments*2};
}

/**
 * Build the *physical* radius field in the existing unit-ellipsoid object coordinates.
 * The renderer applies diag(eq,eq,pol); normals are precompensated so its inverse
 * transpose recovers the physical finite-difference normal. No height exaggeration.
 * Grid heights are radial offsets from a reference sphere, NOT height above areoid.
 * @param {TerrainGrid} grid
 * @param {{latSegments?:number,lonSegments?:number,equatorialRadiusKm:number,polarRadiusKm:number}} options
 */
export function buildTerrainMesh(grid,options) {
  const {latSegments=96,lonSegments=192,equatorialRadiusKm:eq,polarRadiusKm:pol}=options;
  if(!Number.isInteger(latSegments)||!Number.isInteger(lonSegments)||latSegments<4||lonSegments<8||latSegments>256||lonSegments>512) throw new Error('Terrain segments exceed mesh budget');
  if(!Number.isFinite(eq)||!Number.isFinite(pol)||eq<=0||pol<=0||!Number.isFinite(grid.referenceRadiusKm)||grid.referenceRadiusKm<=0) throw new Error('Invalid terrain radius');
  const sample=sampler(grid);
  let minRadiusKm=Infinity,maxRadiusKm=-Infinity;
  for(const h of grid.heightsKm) {
    if(!Number.isFinite(h)) throw new Error('Terrain grid has missing coverage; retain smooth fallback');
    const r=grid.referenceRadiusKm+h;
    if(r<=0||Math.abs(h)>grid.referenceRadiusKm*.1) throw new Error('Terrain radial height exceeds physical bounds');
    minRadiusKm=Math.min(minRadiusKm,r);maxRadiusKm=Math.max(maxRadiusKm,r);
  }
  const position = d => {
    const lat=Math.atan2(d[2],Math.hypot(d[0],d[1]))/DEG,lon=Math.atan2(d[1],d[0])/DEG;
    const h=sample(lon,lat);
    if(h===null) throw new Error('Terrain grid has missing coverage');
    const r=grid.referenceRadiusKm+h;
    return d.map(v=>v*r);
  };
  const count=(latSegments+1)*(lonSegments+1),row=lonSegments+1;
  const pos=new Float32Array(count*6);
  // Differentiate the retained source field, not neighboring coarse mesh vertices.
  const delta=Math.PI/grid.height*.5;
  for(let i=0;i<=latSegments;i++) {
    const lat=Math.PI*.5-i*Math.PI/latSegments;
    for(let j=0;j<lonSegments;j++) {
      const lon=j*Math.PI*2/lonSegments;
      const d=i===0?[0,0,1]:i===latSegments?[0,0,-1]:[Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];
      const p=position(d),t=unit(cross(Math.abs(d[2])>.9?[1,0,0]:[0,0,1],d)),b=cross(d,t);
      const diff = tangent => {
        const plus=position(unit(d.map((v,k)=>v+delta*tangent[k]))),minus=position(unit(d.map((v,k)=>v-delta*tangent[k])));
        return plus.map((v,k)=>v-minus[k]);
      };
      const n=unit(cross(diff(t),diff(b)));
      const objNormal=unit([n[0],n[1],n[2]*pol/eq]);
      pos.set([p[0]/eq,p[1]/eq,p[2]/pol,...objNormal],(i*row+j)*6);
    }
    // Exact copied boundary, including normals, avoids trigonometric roundoff cracks.
    pos.set(pos.subarray(i*row*6,i*row*6+6),(i*row+lonSegments)*6);
  }
  const idx=count<=65536?new Uint16Array(lonSegments*(latSegments-1)*6):new Uint32Array(lonSegments*(latSegments-1)*6);
  let cursor=0;
  for(let i=0;i<latSegments;i++) for(let j=0;j<lonSegments;j++) {
    const a=i*row+j,b=a+row;
    if(i>0) {idx[cursor++]=a;idx[cursor++]=b;idx[cursor++]=a+1;}
    if(i<latSegments-1) {idx[cursor++]=a+1;idx[cursor++]=b;idx[cursor++]=b+1;}
  }
  return {pos,idx,indexType:idx instanceof Uint32Array?'uint32':'uint16',minRadiusKm,maxRadiusKm,
    minRadiusFactor:minRadiusKm/Math.max(eq,pol),maxRadiusFactor:maxRadiusKm/Math.min(eq,pol),
    vertexCount:count,latSegments,lonSegments,nativeDegreesPerTexel:180/grid.height};
}

/** Uniforms for the bounded terrain ray pass; every distance is kilometres.
 * @param {TerrainGrid} grid */
export function terrainShadowUniforms(grid) {
  sampler(grid); // admission of dimensions and coordinate registration
  if(!Number.isFinite(grid.referenceRadiusKm)||grid.referenceRadiusKm<=0)throw new Error('Invalid terrain reference radius');
  let minimum=Infinity,maximum=-Infinity,north=0,south=0;
  for(let i=0;i<grid.heightsKm.length;i++) {
    const h=grid.heightsKm[i];
    if(!Number.isFinite(h)||Math.abs(h)>grid.referenceRadiusKm*.1)throw new Error('Nonfinite or unsupported terrain coverage');
    minimum=Math.min(minimum,h);maximum=Math.max(maximum,h);
    if(i<grid.width)north+=h;
    if(i>=(grid.height-1)*grid.width)south+=h;
  }
  const nativeCellKm=grid.referenceRadiusKm*Math.PI/grid.height;
  return {shape:[grid.referenceRadiusKm,grid.referenceRadiusKm+minimum,grid.referenceRadiusKm+maximum,grid.primeMeridianU],
    poles:[north/grid.width,south/grid.width],nativeCellKm,biasKm:Math.max(.002,Math.min(.05,nativeCellKm*.001)),maxSteps:64};
}

/**
 * Double-precision CPU reference for directional-sun occlusion by the numeric radius
 * field. Default 64 samples matches the shipped budget; maxSteps=4096 is a denser
 * convergence reference. This is not a finite-angular-Sun penumbra calculation.
 * A ray interval is at most 4096 km, deliberately bounded for admitted Moon/Mars grids.
 * Very long grazing paths can undersample features; stepKm exposes that limitation.
 * @param {TerrainGrid} grid @param {number[]} surfaceKm @param {number[]} sunDirectionBody
 * @param {{maxSteps?:number,maxDistanceKm?:number}} [options]
 */
export function terrainShadowVisibility(grid,surfaceKm,sunDirectionBody,{maxSteps=64,maxDistanceKm=4096}={}) {
  if(!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>4096)throw new Error('Invalid terrain shadow steps');
  if(!Number.isFinite(maxDistanceKm)||maxDistanceKm<=0||maxDistanceKm>4096)throw new Error('Invalid terrain shadow distance budget');
  if(surfaceKm.length!==3||!surfaceKm.every(Number.isFinite)||Math.hypot(...surfaceKm)<=0)throw new Error('Invalid terrain shadow surface radius');
  if(sunDirectionBody.length!==3||!sunDirectionBody.every(Number.isFinite)||Math.hypot(...sunDirectionBody)<=0)throw new Error('Invalid terrain shadow solar direction');
  const uniforms=terrainShadowUniforms(grid),sample=sampler(grid),bias=uniforms.biasKm;
  const d=unit(surfaceKm),l=unit(sunDirectionBody),height=sample(Math.atan2(d[1],d[0])/DEG,Math.atan2(d[2],Math.hypot(d[0],d[1]))/DEG);
  if(height===null)throw new Error('Terrain shadow surface has missing coverage');
  // Coarse triangles can lie below the native field. Project to that same field before
  // adding a metric numerical bias; this cannot manufacture a geological obstruction.
  const radius=Math.max(Math.hypot(...surfaceKm),grid.referenceRadiusKm+height)+bias;
  const origin=d.map(v=>v*radius),dot=origin.reduce((s,v,k)=>s+v*l[k],0);
  const result=(visibility,steps=0,stepKm=0,truncated=false)=>({visibility,steps,stepKm,truncated,biasKm:bias,maxStepVsCell:stepKm/uniforms.nativeCellKm});
  const outer=uniforms.shape[2]+2*bias,disc=dot*dot-radius*radius+outer*outer;
  if(disc<=0)return result(1);
  const near=-dot-Math.sqrt(disc),far=-dot+Math.sqrt(disc),start=Math.max(0,near);
  if(far<=start)return result(1);
  const inner=uniforms.shape[1]-bias,innerDisc=dot*dot-radius*radius+inner*inner;
  if(innerDisc>=0&&-dot+Math.sqrt(innerDisc)>0&&-dot-Math.sqrt(innerDisc)>0)return result(0);
  const distance=Math.min(far-start,maxDistanceKm),truncated=far-start>maxDistanceKm;
  const samples=Math.min(maxSteps,Math.max(1,Math.ceil(distance/(uniforms.nativeCellKm*.5))));
  const step=distance/samples;
  for(let i=0;i<samples;i++) {
    const t=start+(i+.5)*step,q=origin.map((v,k)=>v+t*l[k]),r=Math.hypot(...q);
    const h=sample(Math.atan2(q[1],q[0])/DEG,Math.atan2(q[2],Math.hypot(q[0],q[1]))/DEG);
    if(h===null)throw new Error('Terrain shadow ray has missing coverage');
    if(r+bias*.25<grid.referenceRadiusKm+h)return result(0,i+1,step,truncated);
  }
  return result(1,samples,step,truncated);
}
