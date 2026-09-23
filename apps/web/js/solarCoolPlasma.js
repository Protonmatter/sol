// Explicit phenomenological thin sheet, not a non-LTE plasma reconstruction.
// Canonical Carrington +Z north; radians, solar radii, seconds. A finite elliptical
// patch on r=1.12 has tau<=2 and source function .004 in coronal transfer units.
// The persistent patch is passively advected; it has no invented lifetime cycle.
export const COOL_PLASMA_RECIPE=Object.freeze({radius:1.12,longitudeWidth:.48,latitudeWidth:.12,opticalDepth:2,source:.004});
export function coolSheetIntersection(origin,direction,{enabled=false,seconds=0,rotation=[0,0,0],finish=Infinity}={}){
  if(!enabled)return null;
  if(![...origin,...direction,seconds,...rotation].every(Number.isFinite)||origin.length!==3||direction.length!==3||rotation.length!==3||!(finish>0))throw new RangeError('Invalid cool sheet ray');
  const norm=Math.hypot(...direction);if(Math.abs(norm-1)>1e-6)throw new RangeError('Cool sheet direction must be unit length');
  const mid=-origin.reduce((s,x,i)=>s+x*direction[i],0);
  const cross=[origin[1]*direction[2]-origin[2]*direction[1],origin[2]*direction[0]-origin[0]*direction[2],origin[0]*direction[1]-origin[1]*direction[0]];
  const d=1.12**2-cross.reduce((s,x)=>s+x*x,0);if(d<0)return null;
  for(const t of [mid-Math.sqrt(d),mid+Math.sqrt(d)]){
    if(t<=0||t>=finish)continue;
    const p=origin.map((x,i)=>(x+t*direction[i])/1.12),s2=p[2]**2;
    const a=-(rotation[0]+rotation[1]*s2+rotation[2]*s2*s2)*Math.PI/180*seconds/86400;
    const x=Math.cos(a)*p[0]-Math.sin(a)*p[1],y=Math.sin(a)*p[0]+Math.cos(a)*p[1];
    const q=(Math.atan2(y,x)/.48)**2+(Math.asin(Math.max(-1,Math.min(1,p[2])))/.12)**2;
    if(q<1){const tau=2*(1-q)**2;return {distance:t,opticalDepth:tau,transmission:Math.exp(-tau),source:.004};}
  }
  return null;
}
export function orderedSheetTransfer(foreground,background,opticalDepth,source){
  if(![foreground,background,opticalDepth,source].every(x=>Number.isFinite(x)&&x>=0))throw new RangeError('Transfer inputs must be finite and nonnegative');
  return foreground+background*Math.exp(-opticalDepth)+source*(-Math.expm1(-opticalDepth));
}
export const SOLAR_COOL_PLASMA_GLSL=`
uniform int u_coolEnabled;
// Return (ray distance, tau). Negative distance means no foreground sheet.
vec2 coolSheet(vec3 origin,vec3 ray,float finish,float seconds,vec3 rotation){
 if(u_coolEnabled==0)return vec2(-1.,0.);
 vec3 cr=cross(origin,ray);float d=1.2544-dot(cr,cr);if(d<0.)return vec2(-1.,0.);
 float mid=-dot(origin,ray),span=sqrt(d);
 for(int k=0;k<2;k++){
  float t=k==0?mid-span:mid+span;if(t<=0.||t>=finish)continue;
  vec3 p=(origin+t*ray)/1.12;float s2=p.z*p.z;
  float a=-(rotation.x+rotation.y*s2+rotation.z*s2*s2)*.017453292519943295*seconds/86400.;
  float c=cos(a),s=sin(a);p.xy=mat2(c,s,-s,c)*p.xy;
  vec2 ellipse=vec2(atan(p.y,p.x)/.48,asin(clamp(p.z,-1.,1.))/.12);
  float q=dot(ellipse,ellipse);if(q<1.)return vec2(t,2.*(1.-q)*(1.-q));
 }
 return vec2(-1.,0.);
}
float coolTransmission(vec2 sheet,float distance){return sheet.x>0.&&distance>sheet.x?exp(-sheet.y):1.;}
`;
