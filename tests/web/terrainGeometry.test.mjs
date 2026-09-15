import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleTerrainHeight, terrainRadiusKm, buildTerrainMesh, terrainLod} from '../../apps/web/js/terrainGeometry.js';

const grid = (values = Array(32).fill(0), extra = {}) => ({width:8,height:4,heightsKm:Float32Array.from(values),referenceRadiusKm:1000,primeMeridianU:0.5,...extra});
const near = (a,b,epsilon=1e-6) => assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);

test('height samples use centered east-positive pixels, wrap longitude, and preserve latitude',()=>{
  const g=grid(Array.from({length:32},(_,i)=>i));
  near(sampleTerrainHeight(g,-157.5,67.5),0);
  near(sampleTerrainHeight(g,22.5,67.5),4);
  near(sampleTerrainHeight(g,202.5,67.5),0);
  near(sampleTerrainHeight(g,22.5,-67.5),28);
  near(sampleTerrainHeight(g,180,0),sampleTerrainHeight(g,-180,0));
});
test('pole caps converge to a single mean, without longitude cracks',()=>{
  const g=grid(Array.from({length:32},(_,i)=>i));
  for(const lon of [-180,-90,0,60,180]) {near(sampleTerrainHeight(g,lon,90),3.5); near(sampleTerrainHeight(g,lon,-90),27.5);}
});
test('missing elevation is never interpolated across or replaced with image brightness',()=>{
  const g=grid(); g.heightsKm[4]=NaN;
  assert.equal(sampleTerrainHeight(g,22.5,67.5),null);
  assert.equal(sampleTerrainHeight(g,22.5,90),null);
  assert.throws(()=>buildTerrainMesh(g,{latSegments:4,lonSegments:8,equatorialRadiusKm:1000,polarRadiusKm:1000}),/missing|coverage/i);
});
test('physical radius comes from radial DEM datum, not a second ellipsoid flattening',()=>{
  const g=grid(Array(32).fill(2),{referenceRadiusKm:1000});
  near(terrainRadiusKm(g,45,45),1002);
  const m=buildTerrainMesh(g,{latSegments:8,lonSegments:16,equatorialRadiusKm:1000,polarRadiusKm:900});
  for(let i=0;i<m.pos.length;i+=6) near(Math.hypot(m.pos[i]*1000,m.pos[i+1]*1000,m.pos[i+2]*900),1002,0.0002);
  assert.ok(m.maxRadiusFactor>=1002/900);
});
test('mesh normal remains normal to physical DEM under existing ellipsoid inverse transpose',()=>{
  const m=buildTerrainMesh(grid(),{latSegments:8,lonSegments:16,equatorialRadiusKm:1000,polarRadiusKm:900});
  for(let i=0;i<m.pos.length;i+=6) {
    const p=[m.pos[i],m.pos[i+1],m.pos[i+2]*.9];
    const n=[m.pos[i+3],m.pos[i+4],m.pos[i+5]/.9];
    const nd=Math.hypot(...n),pd=Math.hypot(...p);
    near((n[0]*p[0]+n[1]*p[1]+n[2]*p[2])/(nd*pd),1,0.00001);
  }
});
test('duplicate seam vertices have identical positions and normals, and triangles wind outward',()=>{
  const m=buildTerrainMesh(grid(),{latSegments:8,lonSegments:16,equatorialRadiusKm:1000,polarRadiusKm:1000});
  for(let row=0;row<=8;row++) assert.deepEqual(m.pos.slice(row*17*6,row*17*6+6),m.pos.slice((row*17+16)*6,(row*17+16)*6+6));
  for(let i=0;i<m.idx.length;i+=3) {
    const points=Array.from(m.idx.slice(i,i+3),v=>Array.from(m.pos.slice(v*6,v*6+3)));
    const [a,b,c]=points,u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    assert.ok(n.reduce((s,x,k)=>s+x*a[k],0)>0);
  }
});
test('terrain slopes change lighting normals and LOD index sizes are bounded',()=>{
  const g=grid(Array.from({length:32},(_,i)=>i%8===4?25:0));
  const m=buildTerrainMesh(g,{latSegments:8,lonSegments:16,equatorialRadiusKm:1000,polarRadiusKm:1000});
  assert.ok(Array.from({length:m.pos.length/6},(_,i)=>Math.abs(m.pos[i*6+3]-m.pos[i*6])).some(x=>x>0.02));
  assert.equal(m.indexType,'uint16');
  assert.deepEqual(terrainLod(40),{latSegments:48,lonSegments:96});
  assert.deepEqual(terrainLod(300),{latSegments:96,lonSegments:192});
  assert.deepEqual(terrainLod(800),{latSegments:192,lonSegments:384});
  assert.throws(()=>buildTerrainMesh(g,{latSegments:2048,lonSegments:4096,equatorialRadiusKm:1000,polarRadiusKm:1000}),/budget|segments/i);
});
test('high LOD switches to uint32 before crossing the 65535 vertex index limit',()=>{
  const m=buildTerrainMesh(grid(),{latSegments:192,lonSegments:384,equatorialRadiusKm:1000,polarRadiusKm:1000});
  assert.ok(m.idx instanceof Uint32Array);
  assert.equal(m.indexType,'uint32');
  assert.ok(m.idx.some(i=>i>65535));
  assert.ok(m.idx.every(i=>i<m.vertexCount));
});
test('finite-difference physical normals agree with an analytic displaced sphere',()=>{
  const width=360,height=180,epsilon=8,radius=1000;
  // r=R+e sin(latitude) has gradient grad_s(r)=e(zAxis-z*direction).
  const g={width,height,referenceRadiusKm:radius,primeMeridianU:0,
    heightsKm:Float32Array.from({length:width*height},(_,i)=>epsilon*Math.sin((90-(Math.floor(i/width)+.5))*Math.PI/180))};
  const m=buildTerrainMesh(g,{latSegments:24,lonSegments:48,equatorialRadiusKm:1000,polarRadiusKm:900});
  for(let i=1;i<24;i++) {
    const at=(i*49+9)*6,p=[m.pos[at]*1000,m.pos[at+1]*1000,m.pos[at+2]*900];
    const r=Math.hypot(...p),d=p.map(x=>x/r),grad=d.map((x,k)=>epsilon*((k===2?1:0)-d[2]*x));
    const n=d.map((x,k)=>x-grad[k]/r),actual=[m.pos[at+3],m.pos[at+4],m.pos[at+5]/.9];
    const agreement=n.reduce((s,x,k)=>s+x*actual[k],0)/Math.hypot(...n)/Math.hypot(...actual);
    near(agreement,1,0.000001);
  }
});
