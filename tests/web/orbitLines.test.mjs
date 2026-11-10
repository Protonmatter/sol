import test from 'node:test';
import assert from 'node:assert/strict';
import * as math from '../../apps/web/js/orreryMath.js';
import * as orbitLines from '../../apps/web/js/orbitLines.js';
import {fitOrbitDistance,orbitNearPlane} from '../../apps/web/js/orbitCamera.js';

const orbit={a_au:30,ecc:0,inc_deg:0,node_deg:0,argp_deg:0};
const width=732,height=612,fov=42*Math.PI/180;
function camera(center,distance,extent=0){
  return math.mul(math.perspective(fov,width/height,orbitNearPlane(distance,extent),800),
    math.lookAt([center[0],center[1],center[2]+distance],center,[0,1,0]));
}
const project=(p,vp)=>{
  const c=[0,1,2,3].map(r=>vp[r]*p[0]+vp[r+4]*p[1]+vp[r+8]*p[2]+vp[r+12]);
  return c.slice(0,3).map(x=>x/c[3]);
};
function pixelsToLines(p,positions){
  let minimum=Infinity;
  for(let k=0;k<positions.length;k+=6){
    const a=[positions[k]*width/2,positions[k+1]*height/2];
    const d=[(positions[k+3]-positions[k])*width/2,(positions[k+4]-positions[k+1])*height/2];
    const o=[p[0]*width/2-a[0],p[1]*height/2-a[1]];
    const t=Math.max(0,Math.min(1,(o[0]*d[0]+o[1]*d[1])/(d[0]**2+d[1]**2)||0));
    minimum=Math.min(minimum,Math.hypot(o[0]-t*d[0],o[1]-t*d[1]));
  }
  return minimum;
}
function lines(body,vp){
  assert.equal(typeof orbitLines.projectOrbitLines,'function','view-dependent orbit projection must be available');
  return orbitLines.projectOrbitLines(body,vp,width,height);
}

test('true-scale outer orbit remains visible between the former 160 vertices',()=>{
  const phase=1.07,center=[30*Math.cos(phase),30*Math.sin(phase),0],extent=.00042;
  const vp=camera(center,fitOrbitDistance(extent,width/height,fov,30),extent);
  const result=lines(orbit,vp);
  assert.equal(result.capped,false);
  assert.ok(result.positions.length>0);
  assert.ok(pixelsToLines(project(center,vp),result.positions)<=.35);
});

test('projected circular arc stays within 0.35 pixels at overview and physical close zoom',()=>{
  for(const distance of [90,.02,.00012]){
    const phase=.537,center=[30*Math.cos(phase),30*Math.sin(phase),0],vp=camera(center,distance);
    const result=lines(orbit,vp);
    assert.equal(result.capped,false);
    assert.ok(result.positions.length<10000);
    assert.ok(result.positions.every(x=>Number.isFinite(x)&&Math.abs(x)<=1+1e-8));
    for(let j=-100;j<=100;j++){
      const angle=phase+j/100*Math.min(.1,distance/30*.6);
      const p=project([30*Math.cos(angle),30*Math.sin(angle),0],vp);
      if(Math.abs(p[0])<.98&&Math.abs(p[1])<.98)
        assert.ok(pixelsToLines(p,result.positions)<=.35,`distance ${distance}, sample ${j}`);
    }
  }
});

test('an orbit crossing the eye and near plane emits finite clipped segments',()=>{
  const vp=math.mul(math.perspective(fov,1.2,.01,100),math.lookAt([30,0,0],[0,0,0],[0,0,1]));
  const result=lines(orbit,vp);
  assert.equal(result.capped,false);
  assert.ok(result.positions.length>0);
  assert.ok(result.positions.every(x=>Number.isFinite(x)&&Math.abs(x)<=1+1e-7));
});

test('offscreen or behind-eye ellipses emit no geometry',()=>{
  for(const vp of [camera([300,300,0],.001),
    math.mul(math.perspective(fov,1.2,.01,100),math.lookAt([0,0,50],[0,0,100],[0,1,0]))]){
    const result=lines(orbit,vp);
    assert.equal(result.capped,false);
    assert.deepEqual(result.positions,[]);
  }
});

test('invalid orbital or viewport inputs fail explicitly',()=>{
  assert.equal(typeof orbitLines.projectOrbitLines,'function');
  const vp=camera([0,0,0],90);
  for(const body of [{...orbit,ecc:1},{...orbit,ecc:-.1},{...orbit,a_au:0},{...orbit,node_deg:NaN}])
    assert.throws(()=>orbitLines.projectOrbitLines(body,vp,width,height),TypeError);
  for(const [matrix,w,h] of [[[],width,height],[vp,0,height],[vp,width,Infinity],[[...vp.slice(0,15),NaN],width,height]])
    assert.throws(()=>orbitLines.projectOrbitLines(orbit,matrix,w,h),TypeError);
});

test('inclined high-eccentricity guides preserve the existing element rotation',()=>{
  for(const ecc of [.1,.8,.99,.999999]) {
    const body={a_au:17,ecc,inc_deg:73,node_deg:149,argp_deg:286};
    const vp=math.mul(math.perspective(fov,width/height,.008,800),math.lookAt([0,-80,50],[0,0,0],[0,0,1]));
    const result=lines(body,vp);
    assert.equal(result.capped,false);
    assert.ok(result.positions.length>0);
    for(const point of math.ellipse3d(body)) {
      const p=project(point,vp);
      if(p.every(x=>Math.abs(x)<.98)) assert.ok(pixelsToLines(p,result.positions)<=.35);
    }
  }
});

test('pathological projection work is bounded and saturation is explicit',()=>{
  const vp=camera([0,0,0],90);
  const result=orbitLines.projectOrbitLines(orbit,vp,1e14,1e14);
  assert.equal(result.capped,true);
  assert.ok(result.positions.length<210000);
  assert.ok(result.positions.every(Number.isFinite));
});
