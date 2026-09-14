// Bounded synthetic dielectric GGX model. No Earth material is inferred from RGB.
import {dielectricFresnel} from './atmosphereOptics.js';

/** @param {readonly number[]} value */
function unit(value) {
  if(value.length!==3||!value.every(Number.isFinite)||Math.abs(Math.hypot(...value)-1)>1e-10)
    throw new RangeError('Reflection requires finite unit vectors');
}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

/** Directions point away from the surface; alpha is slope width, not perceptual roughness.
 * @param {{normal:readonly number[],incident:readonly number[],view:readonly number[],alpha:number,nIncident:number,nMaterial:number}} input */
export function evaluateReflection({normal,incident,view,alpha,nIncident,nMaterial}) {
  for(const value of [normal,incident,view])unit(value);
  if(!Number.isFinite(alpha)||alpha<.05||alpha>1)throw new RangeError('Reflection alpha must be finite in [.05,1]');
  dielectricFresnel(1,nIncident,nMaterial);
  const ni=dot(normal,incident),nv=dot(normal,view),incidentCosine=Math.max(0,ni);
  if(ni<=0||nv<=0)return {brdf:0,incidentCosine};
  const sum=incident.map((v,i)=>v+view[i]),length=Math.hypot(...sum);
  if(length<=1e-15)return {brdf:0,incidentCosine};
  const h=sum.map(v=>v/length),nh=Math.max(0,Math.min(1,dot(normal,h))),a2=alpha*alpha;
  const d=a2/(Math.PI*(nh*nh*(a2-1)+1)**2);
  const g1=c=>2*c/(c+Math.sqrt(a2+(1-a2)*c*c));
  const f=dielectricFresnel(Math.max(0,Math.min(1,dot(incident,h))),nIncident,nMaterial);
  return {brdf:d*g1(ni)*g1(nv)*f/(4*ni*nv),incidentCosine};
}
