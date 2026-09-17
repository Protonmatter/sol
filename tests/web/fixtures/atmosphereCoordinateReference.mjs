// Independent binary64 quadrature for one retained physical regression. This
// fixture does not import the renderer's density, visibility or column solver.
// Query: O Mars-near-top-terrain-v2-explicit-height/surface/287, once-f32 inputs.
const R=3396.18994140625,q=.9941110610961914,H=11.100000381469727;
const direction=[-.4978541964643753,-2.846906334085883e-5,-.8672607440973699];
const sun=[.0004495123786624217,.9999998629221754,.0002685037277158674];
const camera=[2996.905517578125,0,1790.1181640625],begin=.11429141236703799;
const betaR=[.00010036788444267586,.0002380234800511971,.0005954624502919614];
const betaA=.0045045046135783195,ssa=.9399999976158142,g=.6499999761581421;
const point=(origin,d,t)=>origin.map((v,i)=>v+d[i]*t);
const metric=v=>[v[0],v[1],v[2]/q];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const entry=point(camera,direction,begin);
function roots(origin,d,radius){
  const p=metric(origin),v=metric(d),a=dot(v,v),center=-dot(p,v)/a;
  const closest=point(p,v,center),delta=(radius*radius-dot(closest,closest))/a;
  return delta<0?null:[center-Math.sqrt(delta),center+Math.sqrt(delta)];
}
function rule(n){
  const nodes=[],weights=[];
  for(let i=1;i<=n;i++){
    let x=Math.cos(Math.PI*(i-.25)/(n+.5)),derivative;
    for(let iteration=0;iteration<32;iteration++){
      let p0=1,p1=x;
      for(let k=2;k<=n;k++){const next=((2*k-1)*x*p1-(k-1)*p0)/k;p0=p1;p1=next;}
      derivative=n*(x*p1-p0)/(x*x-1);const dx=p1/derivative;x-=dx;
      if(Math.abs(dx)<1e-15)break;
    }
    nodes.push(x);weights.push(2/((1-x*x)*derivative*derivative));
  }
  return {nodes,weights};
}
const columnRule=rule(32);
function column(origin,d,length){
  const p=metric(origin),v=metric(d),center=-dot(p,v)/dot(v,v),ground=roots(origin,d,R)||[center,center];
  const cuts=[0,...[ground[0],center,ground[1]].map(t=>Math.max(0,Math.min(length,t))),length];
  let total=0;
  for(let j=1;j<cuts.length;j++){
    const width=cuts[j]-cuts[j-1];if(width<=0)continue;
    const middle=(cuts[j]+cuts[j-1])/2;
    for(let i=0;i<columnRule.nodes.length;i++){
      const h=Math.max(0,Math.hypot(...point(p,v,middle+width/2*columnRule.nodes[i]))-R);
      total+=width/2*columnRule.weights[i]*Math.exp(-h/H);
    }
  }
  return total;
}
const mu=dot(direction,sun),phaseR=3*(1+mu*mu)/(16*Math.PI);
const phaseA=(1-g*g)/(4*Math.PI*(1+g*g-2*g*mu)**1.5);
function integrand(t){
  const p=point(entry,direction,t),height=Math.hypot(...metric(p))-R,ground=roots(p,sun,R);
  if(ground&&ground[1]>.001&&(ground[0]>.001||(height<.002&&dot(metric(p),metric(sun))<0)))return [0,0,0];
  const sky=roots(p,sun,R+100);if(!sky||sky[1]<=0)return [0,0,0];
  const depth=column(entry,direction,t)+column(p,sun,sky[1]),density=Math.exp(-Math.max(height,0)/H);
  return betaR.map(br=>Math.exp(-(br+betaA)*depth)*density*(br*phaseR+betaA*ssa*phaseA));
}
// Original analytical lit/datum/closest cuts, before the coordinate proposal.
const segments=[[0,114.6818454627869],[114.6818454627869,3035.7220703663006],
  [3035.7220703663006,3757.9238473935284],[5956.762490523654,5963.949541412609]];
export const mesh287Converged=[.005944170939777359,.006063393714247115,.006318033226204257];
export function mesh287Scattering(nodes,weights,coordinate){
  const result=[0,0,0];let count=0;
  for(let segment=0;segment<segments.length;segment++){
    const [a,b]=segments[segment],width=b-a,rate=segment===1||segment===2?Math.min(...betaR)+betaA:0;
    for(let i=0;i<nodes.length;i++){
      const [fraction,jacobian]=coordinate((nodes[i]+1)/2,rate*width);
      const source=integrand(a+width*fraction);count++;
      for(let j=0;j<3;j++)result[j]+=Math.PI*width/2*weights[i]*jacobian*source[j];
    }
  }
  return {scattering:result,nodes:count};
}
