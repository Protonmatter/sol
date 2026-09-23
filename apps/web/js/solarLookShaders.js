// Illustrative look layer for the dynamic Sun: loop fans, limb fur and a
// prominence rope. Geometry is anchored on the admitted packet (footpoint groups
// and the shared surface hierarchy); widths, gains and motion are art direction,
// not modeled plasma. Requires SOLAR_CELLULAR_GLSL and the dynamic uniforms.
export const LOOK_RECIPE=Object.freeze({
  loopWidthR:.0018,loopPlanes:8,loopTilt:.9,loopsPerPlane:3,strandWidthScale:.45,
  furScaleHeightsR:[.02,.06,.22],promSite:[90,20],promHalfSpanDeg:9,promHeightR:.2,promWidthR:.0022,
});
/** Per-draw switches. The layer is EUV-only: the visible photosphere keeps its
 * modeled appearance, and strands keep full width when the layer is off. */
export function lookSettings({look=false,channel='euv'}={}){
  const on=look===true&&channel!=='visible';
  return {look:on?1:0,strandWidthScale:on?LOOK_RECIPE.strandWidthScale:1};
}
const R=LOOK_RECIPE,g=x=>Number(x).toFixed(6);
export const SOLAR_LOOK_GLSL=`
uniform int u_look;
const float LOOK_DEG=.017453292519943295;
// Inverse of advected(): carries a t0 Carrington point to its displayed position.
vec3 lookForward(vec3 q){return turnZ(q,(rotationAt(q,u_rotation)-14.1844)*LOOK_DEG*u_seconds/86400.);}
float lookPixelR(){return 2./max(u_pixelDiameter,1.);}
// Smoothly evolving value noise on the shared deterministic lattice.
float lookNoise(vec3 q,uint salt,float epochSeconds){
  float e=u_seconds/epochSeconds,f=fract(e);int g=int(floor(e));f=f*f*(3.-2.*f);
  uint s=u_seed^salt;return mix(correlatedNoise(q,s,g),correlatedNoise(q,s,g+1),f);
}
// Surface brightness under a direction: coronal holes starve the fur, network
// and active regions feed it. n is a t0 Carrington unit vector.
float lookFoot(vec3 n){
  float quietMeso;vec4 f=euvHierarchyComponents(n,u_seconds,u_seed,quietMeso);
  float plage=0.;
  for(int i=0;i<10;i++){
    if(i>=u_emissionRegionCount)break;
    float ext=2.5*max(u_emissionAxesU[i].w,u_emissionAxesV[i].w);
    plage+=exp(-(1.-dot(n,u_emissionCenters[i]))/(ext*ext));
  }
  return pow((1.-.95*f.x)*(.15+1.8*quietMeso)+1.6*plage,1.4);
}
// Radial striations rooted at the surface: angular detail is fixed to the
// footpoint direction, so each streak rises from the feature below it.
float lookStreaks(vec3 n,float h){
  float coarse=lookNoise(n*(34.+2.*h),0x2545f491u,5400.);
  float fine=1.-abs(lookNoise(n*(118.+6.*h),0x9e3779b1u,2700.));fine*=fine;fine*=fine;
  float detail=smoothstep(140.,440.,u_pixelDiameter);
  return .15+1.4*max(coarse,0.)+.9*detail*fine;
}
float lookFurProfile(float h){return .9*exp(-h/${g(R.furScaleHeightsR[0])})+.4*exp(-h/${g(R.furScaleHeightsR[1])})+.07*exp(-h/${g(R.furScaleHeightsR[2])});}
// Off-limb rays use their closest approach; on-disk rays use the foreground
// atmosphere just above the surface point, fading toward disk centre.
float lookFur(vec3 cam,vec3 dir,bool disk,float surfaceT){
  if(disk){
    vec3 p=normalize(cam+surfaceT*dir);float mu=max(0.,dot(p,-dir));
    vec3 n=advected(p);return lookFoot(n)*lookStreaks(n,0.)*1.1*exp(-mu*12.);
  }
  float t=max(0.,-dot(cam,dir));vec3 c=cam+t*dir;float r=length(c),h=r-1.;
  if(h>.8)return 0.;
  vec3 n=advected(c/r);return lookFoot(n)*lookStreaks(n,h)*lookFurProfile(h);
}
// Loop fans: circles through a footpoint pair (field lines of a line dipole).
// Planes tilt about the pole axis over a wide, jittered range and each has its
// own pair separation, so seen from above the family spreads into a fan.
float lookLoops(vec3 cam,vec3 dir,float tMax){
  float pixel=lookPixelR(),w=max(${g(R.loopWidthR)},.6*pixel),gain=pow(${g(R.loopWidthR)}/w,.6),sum=0.;
  for(int i=0;i<10;i++){
    if(i>=u_emissionRegionCount)break;
    vec4 c0=u_emissionCores[4*i],c1=u_emissionCores[4*i+1],c2=u_emissionCores[4*i+2],c3=u_emissionCores[4*i+3];
    if(min(min(c0.w,c1.w),min(c2.w,c3.w))<=0.)continue;
    vec3 pa=lookForward(normalize(c0.xyz+c1.xyz)),pb=lookForward(normalize(c2.xyz+c3.xyz));
    vec3 axis=pa-pb;float d=length(axis);if(d<1e-4)continue;axis/=d;
    vec3 base=.5*(pa+pb),up=normalize(pa+pb),side=cross(up,axis);
    vec3 top=up*(1.+.6*d);float tc=dot(top-cam,dir);
    if(length(cam+tc*dir-top)>1.4*d+4.*w)continue;
    float strength=dot(u_emissionCoreGains[i],vec4(1.))/2.8;
    float d0=d;
    for(int k=0;k<${R.loopPlanes};k++){
      uint ph=cellHash(u_seed^0x85ebca6bu,ivec3(i,k,0),0);
      float tilt=((float(k)+unitBits(ph))/float(${R.loopPlanes})*2.-1.)*${g(R.loopTilt)};
      d=d0*(.75+.5*unitBits(mixBits(ph)));
      vec3 plane=cos(tilt)*up+sin(tilt)*side,normal=cross(axis,plane);
      vec3 origin=base;
      float den=dot(dir,normal),facing=smoothstep(.05,.3,abs(den));if(facing<=0.)continue;
      float t=dot(origin-cam,normal)/den;if(t<=0.||t>=tMax)continue;
      vec3 p=cam+t*dir;if(dot(p,p)<1.)continue;
      float x=dot(p-origin,axis),y=dot(p-origin,plane);if(y<=0.)continue;
      float r1=length(vec2(x-.5*d,y)),r2=length(vec2(x+.5*d,y));
      float psi=atan(y,x-.5*d)-atan(y,x+.5*d);
      if(psi<.5*3.141592653589793||psi>.94*3.141592653589793)continue;
      psi+=.025*lookNoise(p*60.,0x68e31da4u+uint(k),3600.);
      float n=(psi+unitBits(ph^0x27d4eb2du))*float(${R.loopsPerPlane})/3.141592653589793,f=fract(n);
      float spacing=3.141592653589793/float(${R.loopsPerPlane})*r1*r2/d;
      float e=min(f,1.-f)*spacing,line=exp(-(e*e)/(w*w));
      uint id=cellHash(u_seed^0x1b873593u,ivec3(i,k,int(floor(n))),0);
      float loop=(.3+1.3*unitBits(id)*unitBits(id))*(.75+.25*sin(u_seconds*(.0004+.0006*unitBits(mixBits(id)))+6.2831853*unitBits(id^7u)));
      float feet=1.+1.6*exp(-min(r1,r2)/(.2*d)),height=exp(-y/(.4*d));
      sum+=strength*facing*gain*loop*line*feet*height;
    }
  }
  return sum;
}
// Prominence: three braided threads over an elliptical arch in a vertical
// sheet that contains the local north direction, plus a faint hedgerow below.
float lookProminence(vec3 cam,vec3 dir,float tMax){
  float lon=${g(R.promSite[0])}*LOOK_DEG,lat=${g(R.promSite[1])}*LOOK_DEG;
  vec3 site=lookForward(vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat)));
  vec3 east=normalize(cross(vec3(0,0,1),site)),north=cross(site,east);
  float den=dot(dir,east),facing=smoothstep(.06,.3,abs(den));if(facing<=0.)return 0.;
  float t=dot(-cam,east)/den;if(t<=0.||t>=tMax)return 0.;
  vec3 p=cam+t*dir;float rho=length(p);if(rho<=1.)return 0.;
  float phi=atan(dot(p,north),dot(p,site)),span=${g(R.promHalfSpanDeg)}*LOOK_DEG,s=phi/span;
  if(abs(s)>=1.)return 0.;
  float arch=1.+${g(R.promHeightR)}*sqrt(1.-s*s),h=rho-1.;
  float turb=lookNoise(p*38.,0x7f4a7c15u,1800.),grain=.5+.5*lookNoise(p*140.,0x94d049bbu,900.);
  float pixel=lookPixelR(),w0=max(${g(R.promWidthR)},.6*pixel),gain=pow(${g(R.promWidthR)}/w0,.6);
  float rope=0.;
  for(int j=0;j<3;j++){
    float off=.004*sin(s*19.+float(j)*2.1+u_seconds*.0003)+.006*turb+.0035*float(j-1);
    float e=abs(rho-arch-off),w=w0*(1.+.8*abs(turb));
    rope+=exp(-(e*e)/(w*w))*(j==1?1.:.7);
  }
  float hedge=smoothstep(0.,.01,h)*smoothstep(arch-1.,.4*(arch-1.),h);
  float threads=pow(.5+.5*lookNoise(vec3(phi*420.,h*6.,0.),0x165667b1u,1800.),8.);
  float ends=smoothstep(1.,.75,abs(s));
  return facing*ends*smoothstep(.2,.65,grain)*(gain*rope*(1.5+max(turb,0.))+.3*hedge*threads);
}
float lookEmission(vec3 cam,vec3 dir,bool disk,float surfaceT){
  if(u_look==0)return 0.;
  float tMax=disk?surfaceT:1e6;
  return .0045*lookFur(cam,dir,disk,surfaceT)+.03*lookLoops(cam,dir,tMax)+.04*lookProminence(cam,dir,tMax);
}
`;
