// Orbit ellipses are display guides, not integrated trajectories. Tessellate in
// the current view: a fixed world-space polygon can miss a physical-scale planet
// portrait entirely. Project and clip in binary64 before the Float32 GPU upload,
// avoiding subtraction of large heliocentric coordinates in the line shader.
export function projectOrbitLines(body, vp, width, height) {
  const {a_au:a,ecc:e,inc_deg:inc,node_deg:node,argp_deg:argp}=body;
  if (![a,e,inc,node,argp,width,height].every(Number.isFinite) || a<=0 || e<0 || e>=1 || width<=0 || height<=0
      || vp.length!==16 || !Array.from(vp).every(Number.isFinite)) throw new TypeError('Invalid orbit projection');
  const rad=Math.PI/180,ci=Math.cos(inc*rad),si=Math.sin(inc*rad);
  const co=Math.cos(argp*rad),so=Math.sin(argp*rad),cn=Math.cos(node*rad),sn=Math.sin(node*rad);
  // Same J2000 ecliptic element rotation as ellipse3d; no frame or center change.
  const x=[co*cn-so*sn*ci,co*sn+so*cn*ci,so*si];
  const y=[-so*cn-co*sn*ci,-so*sn+co*cn*ci,co*si],b=a*Math.sqrt(1-e*e);
  const center=x.map(v=>-a*e*v);
  const point=t=>center.map((v,j)=>v+a*Math.cos(t)*x[j]+b*Math.sin(t)*y[j]);
  const project=p=>[0,1,2,3].map(r=>vp[r]*p[0]+vp[r+4]*p[1]+vp[r+8]*p[2]+vp[r+12]);
  const planes=p=>[p[3]+p[0],p[3]-p[0],p[3]+p[1],p[3]-p[1],p[3]+p[2],p[3]-p[2]];
  const ndc=p=>p.slice(0,3).map(v=>v/p[3]);
  const positions=[];
  let visits=0,capped=false;
  function emit(c0,c2) {
    const p0=planes(c0),p2=planes(c2);
    let lo=0,hi=1;
    for(let k=0;k<6;k++) {
      if(p0[k]<0 && p2[k]<0) return;
      if(p0[k]<0) lo=Math.max(lo,p0[k]/(p0[k]-p2[k]));
      if(p2[k]<0) hi=Math.min(hi,p0[k]/(p0[k]-p2[k]));
    }
    if(lo>hi) return;
    const start=c0.map((v,j)=>v+lo*(c2[j]-v)),end=c0.map((v,j)=>v+hi*(c2[j]-v));
    if(start[3]<=0 || end[3]<=0) return;
    // Clamp only roundoff at the clipping planes, before the Float32 upload.
    positions.push(...ndc(start).map(v=>Math.max(-1,Math.min(1,v))),...ndc(end).map(v=>Math.max(-1,Math.min(1,v))));
  }
  function visit(t0,t2,c0,c2,depth) {
    visits++;
    const tm=(t0+t2)/2,weight=Math.cos((t2-t0)/2),pm=point(tm);
    // A <=90 degree ellipse arc is a positive-weight rational quadratic.
    // Its control triangle contains the entire arc; endpoints/midpoints alone
    // cannot conservatively reject a narrow viewport crossing.
    const c1=project(pm.map((v,j)=>center[j]+(v-center[j])/weight));
    const p0=planes(c0),p1=planes(c1),p2=planes(c2);
    if(p0.some((v,k)=>v<0 && p1[k]<0 && p2[k]<0)) return;
    let flat=false;
    if(c0[3]>0 && c1[3]>0 && c2[3]>0) {
      const q0=ndc(c0),q1=ndc(c1),q2=ndc(c2);
      const dx=(q2[0]-q0[0])*width/2,dy=(q2[1]-q0[1])*height/2,dz=(q2[2]-q0[2])*height/2;
      const ox=(q1[0]-q0[0])*width/2,oy=(q1[1]-q0[1])*height/2,oz=(q1[2]-q0[2])*height/2;
      const fraction=Math.max(0,Math.min(1,(ox*dx+oy*dy+oz*dz)/(dx*dx+dy*dy+dz*dz)||0));
      // Positive projected weights keep the curve in this triangle. Its
      // control-point distance therefore bounds the screen error of the chord.
      // Include depth so an edge-on arc cannot collapse into a screen-space
      // straight line with the wrong depth or near-plane intersections.
      flat=Math.hypot(ox-fraction*dx,oy-fraction*dy,oz-fraction*dz)<=.35;
    }
    if(flat) { emit(c0,c2);return; }
    // Deterministic work bounds for pathological views; expose saturation to
    // diagnostics rather than claiming the pixel bound when a limit is hit.
    if(depth>=24 || visits>=65536) { capped=true;emit(c0,c2);return; }
    const cm=project(pm);
    visit(t0,tm,c0,cm,depth+1);
    visit(tm,t2,cm,c2,depth+1);
  }
  for(let k=0;k<4;k++) {
    const t0=k*Math.PI/2,t2=(k+1)*Math.PI/2;
    visit(t0,t2,project(point(t0)),project(point(t2)),0);
  }
  return {positions,capped};
}
