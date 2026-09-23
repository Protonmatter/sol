// Illustrative look layer for the dynamic Sun, ported from tools/lookdev: a
// network and flame surface, torn dark regions, plage, cores and fans, limb fur,
// 3-D loop fans and a prominence rope. Placement comes from the admitted packet
// (hole field and footpoint groups); widths, gains and motion are art direction,
// not modeled plasma. Intensities are in the lab's palette units. Requires
// SOLAR_CELLULAR_GLSL and the dynamic uniforms.
export const LOOK_RECIPE=Object.freeze({
  flowRadPerS:.002,cellOrbitRadPerS:.0015,holeThresholds:[-.07,.06],
  fanLineWidth:.06,loopWidthR:.0018,loopPlanes:8,loopTilt:.6,loopsPerPlane:3,strandWidthScale:.45,
  furScaleHeightsR:[.018,.085,.33],promSite:[90,20],promHalfSpanDeg:9,promHeightR:.2,promWidthR:.0022,
  bloom:1.1,bloomThreshold:.35,
});

/** Per-draw switches. The layer is EUV-only: the visible photosphere keeps its
 * modeled appearance, and strands keep full width when the layer is off. */
export function lookSettings({look=false,channel='euv'}={}){
  const on=look===true&&channel!=='visible';
  return {look:on?1:0,strandWidthScale:on?LOOK_RECIPE.strandWidthScale:1};
}

/** Lab palette (orange), display-referred sRGB in [0,1). */
export function lookPalette(intensity){
  const i=Math.max(0,intensity);
  return [1-Math.exp(-2.3*i),1-Math.exp(-.68*i**1.4),1-Math.exp(-.1*i**2.4)];
}

/** Linear radiance that the Reinhard presentation x/(1+x) followed by sRGB
 * encoding maps back to the given display color, so the lab palette survives the
 * app's existing tone map unchanged at zero exposure stops. */
export function lookPresentationLinear(display){
  return display.map(c=>{
    const v=Math.min(Math.max(c,0),1),l=v<=.04045?v/12.92:((v+.055)/1.055)**2.4,m=Math.min(l,.985);
    return m/(1-m);
  });
}

export const LOOK_COMPOSE_GLSL=`
vec3 lookPalette(float i){i=max(i,0.);return vec3(1.-exp(-2.3*i),1.-exp(-.68*pow(i,1.4)),1.-exp(-.1*pow(i,2.4)));}
vec3 lookPresentationLinear(vec3 d){
  d=clamp(d,0.,1.);vec3 l=mix(d/12.92,pow((d+.055)/1.055,vec3(2.4)),step(vec3(.04045),d));
  l=min(l,vec3(.985));return l/(1.-l);
}
`;

const R=LOOK_RECIPE,g=x=>Number(x).toFixed(6);
export const SOLAR_LOOK_GLSL=`
uniform int u_look;
const float LOOK_DEG=.017453292519943295,LOOK_PI=3.141592653589793;
// Inverse of advected(): carries a t0 Carrington point to its displayed position.
vec3 lookForward(vec3 q){return turnZ(q,(rotationAt(q,u_rotation)-14.1844)*LOOK_DEG*u_seconds/86400.);}
float lookPixelR(){return 2./max(u_pixelDiameter,1.);}
// Smoothly evolving value noise on the shared deterministic lattice.
float lookNoise(vec3 q,uint salt,float epochSeconds){
  float e=u_seconds/epochSeconds,f=fract(e);int n=int(floor(e));f=f*f*(3.-2.*f);
  uint s=u_seed^salt;return mix(correlatedNoise(q,s,n),correlatedNoise(q,s,n+1),f);
}
// Flow noise: integer-hashed lattice gradients rotate with model time, so the
// field evolves in place instead of sliding.
vec3 lookGrad(ivec3 c,uint salt){
  uint h=cellHash(u_seed^salt,c,0);
  vec3 v=vec3(float(h&1023u),float((h>>10)&1023u),float((h>>20)&1023u))/511.5-1.;
  float a=u_seconds*${g(R.flowRadPerS)}*(.6+.8*unitBits(mixBits(h)));float s=sin(a),k=cos(a);
  return vec3(k*v.x-s*v.y,s*v.x+k*v.y,v.z);
}
float lookGnoise(vec3 p,uint salt){
  ivec3 i=ivec3(floor(p));vec3 f=fract(p),u=f*f*f*(f*(f*6.-15.)+10.);
  float a=dot(lookGrad(i,salt),f),b=dot(lookGrad(i+ivec3(1,0,0),salt),f-vec3(1,0,0));
  float c=dot(lookGrad(i+ivec3(0,1,0),salt),f-vec3(0,1,0)),d=dot(lookGrad(i+ivec3(1,1,0),salt),f-vec3(1,1,0));
  float e=dot(lookGrad(i+ivec3(0,0,1),salt),f-vec3(0,0,1)),q=dot(lookGrad(i+ivec3(1,0,1),salt),f-vec3(1,0,1));
  float r=dot(lookGrad(i+ivec3(0,1,1),salt),f-vec3(0,1,1)),s=dot(lookGrad(i+ivec3(1,1,1),salt),f-vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),mix(mix(e,q,u.x),mix(r,s,u.x),u.y),u.z);
}
float lookFbm(vec3 p,int octaves,uint salt){
  float s=0.,a=.5;
  for(int i=0;i<5;i++){if(i>=octaves)break;s+=a*lookGnoise(p,salt+uint(i));p=p*2.03+vec3(1.7,-.3,.9);a*=.5;}
  return s;
}
float lookRidged(vec3 p,int octaves,uint salt){
  float s=0.,a=.5;
  for(int i=0;i<5;i++){if(i>=octaves)break;float r=1.-abs(lookGnoise(p,salt+uint(i)));s+=a*r*r;p=p*2.11+vec3(-.7,.4,1.3);a*=.55;}
  return s;
}
// Worley network whose sites orbit their seeds: cells reshape, never slide.
vec2 lookWorley(vec3 p){
  ivec3 b=ivec3(floor(p));vec3 f=fract(p);float d1=8.,d2=8.;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    ivec3 o=ivec3(x,y,z);uint h=cellHash(u_seed^0x3c6ef372u,b+o,0);
    vec3 site=vec3(float(h&1023u),float((h>>10)&1023u),float((h>>20)&1023u))/1023.;
    site=.5+.42*sin(u_seconds*${g(R.cellOrbitRadPerS)}+6.2831853*site);
    vec3 r=vec3(o)+site-f;float d=dot(r,r);
    if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;
  }
  return sqrt(vec2(d1,d2));
}
// Dark regions, as in the look lab: a domain-warped fbm threshold torn at two
// finer scales, seeded by the packet. They dim the surface but keep its texture.
vec3 lookHoleWarp(vec3 p){return .55*vec3(lookFbm(p*1.6,3,0x530u),lookFbm(p*1.6+4.,3,0x533u),lookFbm(p*1.6+9.,3,0x536u));}
float lookHoleField(vec3 p){return lookFbm(p*1.25+lookHoleWarp(p),4,0x520u);}
float lookHole(vec3 p,vec3 warp,float fine){
  float m=lookHoleField(p)+.34*lookFbm(p*6.+warp,3,0x500u)+.18*fine*lookFbm(p*18.,2,0x510u);
  return smoothstep(${g(R.holeThresholds[0])},${g(R.holeThresholds[1])},m);
}
// Footpoint-group centroids of one emission region, in t0 Carrington frame.
bool lookPoles(int i,out vec3 pa,out vec3 pb,out float amp){
  vec4 c0=u_emissionCores[4*i],c1=u_emissionCores[4*i+1],c2=u_emissionCores[4*i+2],c3=u_emissionCores[4*i+3];
  pa=normalize(c0.xyz+c1.xyz);pb=normalize(c2.xyz+c3.xyz);amp=dot(u_emissionCoreGains[i],vec4(1.))/2.8;
  return min(min(c0.w,c1.w),min(c2.w,c3.w))>0.&&length(pa-pb)>1e-4;
}
// Surface fan, as in the look lab: contours of the angle the two poles subtend
// are the arcs of a line dipole, frayed by noise, over uneven hot cores and a
// plage. Lines are thinner than the lab's.
float lookFan(vec3 p,vec3 pa,vec3 pb,float amp,out float core,out float plage){
  core=0.;plage=0.;
  vec3 c=normalize(pa+pb),a=pa-pb;float d=length(a);a/=d;
  float cd=dot(p,c),reach=3.4*d;if(cd<1.-.5*reach*reach)return 0.;
  vec3 b=cross(c,a),q=p-c*cd;float x=dot(q,a),y=dot(q,b);
  float r1=length(vec2(x-.5*d,y)),r2=length(vec2(x+.5*d,y)),rm=length(vec2(x,y));
  float psi=atan(y,x-.5*d)-atan(y,x+.5*d);
  psi+=.22*lookGnoise(vec3(x,y,c.x)*38.,0x600u)+.08*lookGnoise(vec3(x,y,c.y)*110.,0x601u);
  float n=psi*9./LOOK_PI,f=fract(n);uint id=cellHash(u_seed^0x19660du,ivec3(int(floor(n)),int(1e3*c.x),int(1e3*c.y)),0);
  float w=${g(R.fanLineWidth)}*(1.+smoothstep(0.,2.*d,rm)),line=exp(-pow(min(f,1.-f)/w,2.));
  float strand=(.35+1.3*unitBits(id)*unitBits(id))*(.75+.25*sin(u_seconds*(.005+.015*unitBits(mixBits(id)))+6.2831853*unitBits(id^5u)));
  float n2=psi*23./LOOK_PI,f2=fract(n2);uint id2=cellHash(u_seed^0x3c6ef35fu,ivec3(int(floor(n2)),int(1e3*c.x),2),0);
  float fine=.35*exp(-pow(min(f2,1.-f2)/(.7*w),2.))*(.5+unitBits(id2));
  float env=exp(-min(r1,r2)/(d*.75))*smoothstep(d*3.2,d*1.4,rm);
  float s=d*.09*(1.+.5*lookGnoise(vec3(x,y,1.)*80.,0x602u)),stretch=1.+.8*abs(lookGnoise(vec3(x,y,2.)*40.,0x603u));
  core=(exp(-r1*r1/(s*s*stretch))+.7*exp(-r2*r2/(s*s*stretch)))*amp;
  plage=exp(-rm*rm/(d*d*1.1))*amp;
  return (line*strand+fine)*env*amp;
}
// Disk intensity for a t0 Carrington surface point at cosine mu.
float lookSurface(vec3 p,float mu){
  float px=.5*u_pixelDiameter;
  float dNet=smoothstep(40.,110.,px),dFine=smoothstep(80.,220.,px),dFan=smoothstep(28.,90.,px);
  float dGran=smoothstep(150.,420.,px),gran=0.;
  float mott=lookFbm(p*5.,4,0x100u);
  vec3 warp=vec3(lookGnoise(p*9.,0x200u),lookGnoise(p*9.+5.,0x201u),lookGnoise(p*9.+11.,0x202u));
  float quiet=.30+.24*mott;
  float bright=0.;
  if(dNet>0.){
    vec2 w=lookWorley(p*16.+.9*warp);
    float lanes=1.-smoothstep(0.,.22,w.y-w.x);
    bright=pow(max(0.,1.-w.x*2.6),6.)*smoothstep(0.,.3,lookGnoise(p*4.+7.,0x203u));
    quiet+=dNet*(.10*lanes*(.6+.8*lookGnoise(p*12.,0x204u))+.9*bright);
  }
  if(dFine>0.)quiet+=dFine*mix(.62,.4,dGran)*(lookRidged(p*26.+mix(1.6,.9,dGran)*warp,4,0x300u)-.34);
  // Close up, fine granules: bright cell interiors with dark lanes.
  if(dGran>0.){vec2 c=lookWorley(p*70.+.35*warp);gran=smoothstep(.55,.05,c.x)*smoothstep(0.,.18,c.y-c.x)-.25;quiet+=dGran*.2*gran;}
  quiet=1.15*pow(max(quiet,.015),1.25);
  float hole=lookHole(p,warp,dFine);
  float intensity=quiet*mix(1.,.30+.12*lookFbm(p*14.,2,0x400u),hole);
  for(int i=0;i<10;i++){
    if(i>=u_emissionRegionCount)break;
    vec3 pa,pb;float amp;if(!lookPoles(i,pa,pb,amp))continue;
    float core,plage,fan=lookFan(p,pa,pb,amp,core,plage);
    intensity+=dFan*3.*fan+.45*plage*(.6+.8*mott)+2.6*core;
  }
  // Limb brightening, then an emissive rim fed by the local surface: bright
  // network and plage glow at the limb, dark regions do not.
  float local=intensity;intensity*=1.+.55*pow(1.-mu,2.);
  return intensity+1.1*exp(-mu*14.)*pow(clamp(local/.45,0.,2.5),1.2);
}
// Cheaper surface brightness under a direction, for the fur's footpoint.
float lookFoot(vec3 n){
  float mott=lookFbm(n*5.,3,0x100u),quiet=1.15*pow(max(.30+.24*mott,.015),1.25);
  float hole=smoothstep(${g(R.holeThresholds[0])},${g(R.holeThresholds[1])},lookHoleField(n)+.34*lookFbm(n*6.,2,0x500u));
  float intensity=quiet*mix(1.,.18,hole);
  for(int i=0;i<10;i++){
    if(i>=u_emissionRegionCount)break;
    vec3 pa,pb;float amp;if(!lookPoles(i,pa,pb,amp))continue;
    float reach=1.6*length(pa-pb)+.04;
    intensity+=1.4*amp*exp(-(1.-dot(n,normalize(pa+pb)))/(.5*reach*reach));
  }
  return intensity/.55;
}
// Radial striations rooted at the surface: angular detail is fixed to the
// footpoint direction, so each streak rises from the feature below it.
float lookStreaks(vec3 n,float h){
  float coarse=lookNoise(n*(34.+2.*h),0x2545f491u,5400.);
  float fine=1.-abs(lookNoise(n*(118.+6.*h),0x9e3779b1u,2700.));fine*=fine;fine*=fine;
  return .25+1.15*max(coarse,0.)+.8*smoothstep(140.,440.,u_pixelDiameter)*exp(-h/.15)*fine;
}
// Off-limb fur along a ray's closest approach, fed by the surface beneath it.
float lookFur(vec3 cam,vec3 dir){
  float t=max(0.,-dot(cam,dir));vec3 c=cam+t*dir;float r=length(c),h=r-1.;
  if(h>.8||h<0.)return 0.;
  vec3 n=advected(c/r);float foot=pow(lookFoot(n),1.3),streaks=lookStreaks(n,h);
  return foot*smoothstep(.8,.45,h)*(1.7*exp(-h/${g(R.furScaleHeightsR[0])})*(.55+.45*streaks)
    +(.45*exp(-h/${g(R.furScaleHeightsR[1])})+.07*exp(-h/${g(R.furScaleHeightsR[2])}))*streaks);
}
// Loop fans: circles through a footpoint pair (field lines of a line dipole).
// Planes tilt about the pole axis over a wide, jittered range and each has its
// own pair separation, so seen from above the family spreads into a fan.
float lookLoops(vec3 cam,vec3 dir,float tMax){
  float pixel=lookPixelR(),w=max(${g(R.loopWidthR)},.6*pixel),gain=pow(${g(R.loopWidthR)}/w,.6),sum=0.;
  for(int i=0;i<10;i++){
    if(i>=u_emissionRegionCount)break;
    vec3 pa,pb;float strength;if(!lookPoles(i,pa,pb,strength))continue;
    pa=lookForward(pa);pb=lookForward(pb);
    vec3 axis=pa-pb;float d0=length(axis);axis/=d0;
    vec3 base=.5*(pa+pb),up=normalize(pa+pb),side=cross(up,axis);
    vec3 top=up*(1.+.6*d0);float tc=dot(top-cam,dir);
    if(length(cam+tc*dir-top)>1.4*d0+4.*w)continue;
    for(int k=0;k<${R.loopPlanes};k++){
      uint ph=cellHash(u_seed^0x85ebca6bu,ivec3(i,k,0),0);
      float tilt=((float(k)+unitBits(ph))/float(${R.loopPlanes})*2.-1.)*${g(R.loopTilt)};
      float d=d0*(.75+.5*unitBits(mixBits(ph)));
      vec3 plane=cos(tilt)*up+sin(tilt)*side,normal=cross(axis,plane);
      float den=dot(dir,normal),facing=smoothstep(.05,.3,abs(den));if(facing<=0.)continue;
      float t=dot(base-cam,normal)/den;if(t<=0.||t>=tMax)continue;
      vec3 p=cam+t*dir;if(dot(p,p)<1.)continue;
      float x=dot(p-base,axis),y=dot(p-base,plane);if(y<=0.)continue;
      float r1=length(vec2(x-.5*d,y)),r2=length(vec2(x+.5*d,y));
      float psi=atan(y,x-.5*d)-atan(y,x+.5*d);
      if(psi<.5*LOOK_PI||psi>.94*LOOK_PI)continue;
      psi+=.025*lookNoise(p*60.,0x68e31da4u+uint(k),3600.);
      float n=(psi+unitBits(ph^0x27d4eb2du))*float(${R.loopsPerPlane})/LOOK_PI,f=fract(n);
      float spacing=LOOK_PI/float(${R.loopsPerPlane})*r1*r2/d;
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
// Coronal-pass intensity in lab units (the composite multiplies emission by 40).
float lookEmission(vec3 cam,vec3 dir,bool disk,float surfaceT){
  if(u_look==0)return 0.;
  float tMax=disk?surfaceT:1e6,intensity=.7*lookLoops(cam,dir,tMax)+1.6*lookProminence(cam,dir,tMax);
  if(!disk)intensity+=lookFur(cam,dir);
  return intensity/40.;
}
`;
