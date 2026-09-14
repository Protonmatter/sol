// Bounded single-scattering transfer, not a multiple-scattering or weather solver.
// Shared by the surface material (linear composition) and the off-disk limb pass.
// Inputs are body-frame physical km. Z is NOT unflattened before calling these.
export const ATMOSPHERE_GLSL = `
uniform int u_atmosphereEnabled;
uniform int u_atmosphereRefractionEnabled;
uniform float u_atmosphereRefractivity;
uniform float u_atmosphereRadiusKm, u_atmosphereTopKm, u_atmospherePolarRatio;
uniform vec2 u_atmosphereDensityScaleKm;
uniform vec3 u_atmosphereRayleighKm, u_atmosphereAerosolKm, u_atmosphereAerosolSSA;
uniform vec3 u_atmosphereCameraKm, u_atmosphereSunDirection;
uniform float u_atmosphereG, u_atmosphereSolarScale, u_atmosphereExposure;
const float ATM_PI=3.141592653589793;
// Gauss-Legendre nodes/weights on [-1,1], fixed resource envelope.
const float ATM_X8[8]=float[8](-.9602898565,-.7966664774,-.5255324099,-.1834346425,.1834346425,.5255324099,.7966664774,.9602898565);
const float ATM_W8[8]=float[8](.1012285363,.2223810345,.3137066459,.3626837834,.3626837834,.3137066459,.2223810345,.1012285363);
const float ATM_X12[12]=float[12](-.9815606342,-.9041172564,-.7699026742,-.5873179543,-.3678314990,-.1252334085,.1252334085,.3678314990,.5873179543,.7699026742,.9041172564,.9815606342);
const float ATM_W12[12]=float[12](.0471753364,.1069393260,.1600783285,.2031674267,.2334925365,.2491470458,.2491470458,.2334925365,.2031674267,.1600783285,.1069393260,.0471753364);
struct AtmosphereResult { vec3 transmittance; vec3 scattering; };
vec3 atmosphereUnflatten(vec3 p){ return vec3(p.xy,p.z/u_atmospherePolarRatio); }
vec2 atmosphereRayInterval(vec3 origin,vec3 direction,float radius){
  vec3 p=atmosphereUnflatten(origin), d=atmosphereUnflatten(direction);
  float a=dot(d,d), center=-dot(p,d)/a;
  // Closest-approach form avoids subtraction of two large squared distances.
  vec3 closest=p+center*d;
  float delta=(radius*radius-dot(closest,closest))/a;
  if(delta<0.0) return vec2(1.0,-1.0);
  float halfWidth=sqrt(max(0.0,delta));
  return vec2(center-halfWidth,center+halfWidth);
}
float atmosphereHeight(vec3 point){ return max(0.0,length(atmosphereUnflatten(point))-u_atmosphereRadiusKm); }
float atmosphereColumnSegment(vec3 origin,vec3 direction,float begin,float end,float scaleHeight){
  if(end<=begin) return 0.0;
  float halfWidth=(end-begin)*.5, middle=(end+begin)*.5, column=0.0;
  for(int i=0;i<8;i++){
    vec3 p=origin+direction*(middle+halfWidth*ATM_X8[i]);
    column+=ATM_W8[i]*exp(-atmosphereHeight(p)/scaleHeight);
  }
  return column*halfWidth;
}
float atmosphereColumn(vec3 origin,vec3 direction,float distance,float scaleHeight){
  // Each component gets its own support interval. Without this clipping an 8-node
  // integral over 100 km can completely miss the 1.2 km terrestrial aerosol layer.
  float support=min(u_atmosphereTopKm,12.0*scaleHeight);
  vec2 segment=atmosphereRayInterval(origin,direction,u_atmosphereRadiusKm+support);
  float begin=max(0.0,segment.x), end=min(distance,segment.y);
  if(end<=begin) return 0.0;
  vec3 p=atmosphereUnflatten(origin), d=atmosphereUnflatten(direction);
  float closest=-dot(p,d)/dot(d,d);
  // A grazing ray has an interior density maximum. Split there so narrow
  // near-ground aerosol density cannot fall between the Gaussian nodes.
  if(closest>begin&&closest<end)
    return atmosphereColumnSegment(origin,direction,begin,closest,scaleHeight)
      +atmosphereColumnSegment(origin,direction,closest,end,scaleHeight);
  return atmosphereColumnSegment(origin,direction,begin,end,scaleHeight);
}
vec3 atmosphereOpticalDepth(vec3 origin,vec3 direction,float distance){
  return u_atmosphereRayleighKm*atmosphereColumn(origin,direction,distance,u_atmosphereDensityScaleKm.x)
    +u_atmosphereAerosolKm*atmosphereColumn(origin,direction,distance,u_atmosphereDensityScaleKm.y);
}
vec3 atmosphereSunTransmission(vec3 point){
  if(u_atmosphereEnabled==0) return vec3(1.0);
  vec3 light=normalize(u_atmosphereSunDirection);
  vec2 ground=atmosphereRayInterval(point,light,u_atmosphereRadiusKm);
  if(ground.y>0.001&&ground.x>0.001) return vec3(0.0);
  // At the ground boundary a sunward ray may start at a rounding error inside.
  if(atmosphereHeight(point)<0.002&&dot(atmosphereUnflatten(point),atmosphereUnflatten(light))<0.0) return vec3(0.0);
  vec2 sky=atmosphereRayInterval(point,light,u_atmosphereRadiusKm+u_atmosphereTopKm);
  return sky.y>0.0 ? exp(-atmosphereOpticalDepth(point,light,sky.y)) : vec3(1.0);
}
// Intersection with the planet's anti-solar infinite shadow cylinder. Splitting
// at its analytical boundaries avoids 12-node quadrature producing twilight bands.
vec2 atmosphereShadowInterval(vec3 origin,vec3 direction){
  vec3 p=atmosphereUnflatten(origin), d=atmosphereUnflatten(direction);
  vec3 axis=normalize(atmosphereUnflatten(u_atmosphereSunDirection));
  float axialP=dot(p,axis), axialD=dot(d,axis);
  vec3 pp=p-axis*axialP, dd=d-axis*axialD;
  float a=dot(dd,dd), b=dot(pp,dd), c=dot(pp,pp)-u_atmosphereRadiusKm*u_atmosphereRadiusKm;
  vec2 interval;
  if(a<1e-12){ if(c>0.0) return vec2(1.0,-1.0); interval=vec2(-1e20,1e20); }
  else { float disc=b*b-a*c; if(disc<0.0) return vec2(1.0,-1.0);
    float halfWidth=sqrt(max(disc,0.0)); interval=vec2((-b-halfWidth)/a,(-b+halfWidth)/a); }
  if(abs(axialD)<1e-10){ if(axialP>=0.0) return vec2(1.0,-1.0); }
  else if(axialD>0.0) interval.y=min(interval.y,-axialP/axialD);
  else interval.x=max(interval.x,-axialP/axialD);
  return interval;
}
vec3 atmosphereScatteredMonotonic(vec3 origin,vec3 direction,vec2 interval){
  if(interval.y<=interval.x) return vec3(0.0);
  float mu=clamp(dot(direction,normalize(u_atmosphereSunDirection)),-1.0,1.0);
  float phaseR=3.0*(1.0+mu*mu)/(16.0*ATM_PI), g=u_atmosphereG;
  float phaseA=(1.0-g*g)/(4.0*ATM_PI*pow(1.0+g*g-2.0*g*mu,1.5));
  float halfWidth=(interval.y-interval.x)*.5, middle=(interval.y+interval.x)*.5;
  vec3 sum=vec3(0.0);
  for(int i=0;i<12;i++){
    float distance=middle+halfWidth*ATM_X12[i];
    vec3 p=origin+direction*distance;
    vec2 density=exp(-atmosphereHeight(p)/u_atmosphereDensityScaleKm);
    vec3 source=u_atmosphereRayleighKm*density.x*phaseR
      +u_atmosphereAerosolKm*u_atmosphereAerosolSSA*density.y*phaseA;
    vec3 transmission=exp(-atmosphereOpticalDepth(origin,direction,distance))*atmosphereSunTransmission(p);
    sum+=ATM_W12[i]*transmission*source;
  }
  return sum*halfWidth;
}
vec3 atmosphereScatteredSegment(vec3 origin,vec3 direction,vec2 interval){
  if(interval.y<=interval.x) return vec3(0.0);
  vec3 p=atmosphereUnflatten(origin), d=atmosphereUnflatten(direction);
  float closest=-dot(p,d)/dot(d,d);
  vec2 ground=atmosphereRayInterval(origin,direction,u_atmosphereRadiusKm);
  if(ground.y<ground.x) ground=vec2(closest);
  // Sorted in ray-distance order before clamping. Duplicate/tangent cuts have
  // zero width; unchanged monotonic quadrature returns zero for those pieces.
  float cuts[5]=float[5](interval.x,clamp(ground.x,interval.x,interval.y),
    clamp(closest,interval.x,interval.y),clamp(ground.y,interval.x,interval.y),interval.y);
  vec3 result=vec3(0.0);
  for(int i=0;i<4;i++)
    result+=atmosphereScatteredMonotonic(origin,direction,vec2(cuts[i],cuts[i+1]));
  return result;
}
// maxDistance is the actual surface endpoint when used on a displaced mesh.
// The limb caller separately rejects solid-body hits before requesting a full ray.
AtmosphereResult integrateAtmosphere(vec3 origin,vec3 direction,float maxDistance){
  AtmosphereResult result=AtmosphereResult(vec3(1.0),vec3(0.0));
  if(u_atmosphereEnabled==0) return result;
  vec3 ray=normalize(direction);
  vec2 outer=atmosphereRayInterval(origin,ray,u_atmosphereRadiusKm+u_atmosphereTopKm);
  float begin=max(0.0,outer.x), end=min(maxDistance,outer.y);
  if(end<=begin) return result;
  vec3 entry=origin+ray*begin;
  float distance=end-begin;
  result.transmittance=exp(-atmosphereOpticalDepth(entry,ray,distance));
  vec2 shadow=atmosphereShadowInterval(entry,ray);
  vec3 scattered;
  if(shadow.y<=shadow.x||shadow.y<=0.0||shadow.x>=distance){
    scattered=atmosphereScatteredSegment(entry,ray,vec2(0.0,distance));
  } else {
    scattered=atmosphereScatteredSegment(entry,ray,vec2(0.0,max(0.0,shadow.x)))
      +atmosphereScatteredSegment(entry,ray,vec2(min(distance,shadow.y),distance));
  }
  result.scattering=scattered*ATM_PI*u_atmosphereSolarScale*u_atmosphereExposure;
  return result;
}
vec3 atmosphereSurfaceColor(vec3 linearSurfaceColor,vec3 surfaceBodyKm){
  vec3 delta=surfaceBodyKm-u_atmosphereCameraKm;
  AtmosphereResult optics=integrateAtmosphere(u_atmosphereCameraKm,delta,length(delta));
  return linearSurfaceColor*optics.transmittance+optics.scattering;
}
`;

// Offline incident-field generator only; never included in the production vertex
// shader. Six shooting iterations plus one final 96-step RK4 ray provide each
// immutable numerical sample. Observer and single-scattering rays remain straight.
export const ATMOSPHERE_REFRACTION_GLSL = `
struct AtmosphereRayState { vec3 position; vec3 direction; vec2 columns; };
struct AtmosphereSolarRay { vec3 direction; vec3 transmission; };
AtmosphereRayState atmosphereRayDerivative(AtmosphereRayState s){
  float radius=length(atmosphereUnflatten(s.position));
  float height=max(0.0,radius-u_atmosphereRadiusKm);
  vec2 density=exp(-height/u_atmosphereDensityScaleKm);
  float nr=u_atmosphereRefractivity*density.x;
  vec3 gradient=vec3(s.position.xy,s.position.z/(u_atmospherePolarRatio*u_atmospherePolarRatio))/radius;
  gradient*=radius>=u_atmosphereRadiusKm ? -nr/u_atmosphereDensityScaleKm.x : 0.0;
  return AtmosphereRayState(s.direction,(gradient-s.direction*dot(s.direction,gradient))/(1.0+nr),density);
}
AtmosphereRayState atmosphereRayAdvance(AtmosphereRayState a,AtmosphereRayState b,float distance){
  return AtmosphereRayState(a.position+b.position*distance,a.direction+b.direction*distance,a.columns+b.columns*distance);
}
bool atmosphereCurvedRay(vec3 origin,vec3 direction,out vec3 outgoing,out vec2 columns){
  AtmosphereRayState s=AtmosphereRayState(origin,direction,vec2(0));
  float floorHeight=min(0.0,length(atmosphereUnflatten(origin))-u_atmosphereRadiusKm);
  for(int i=0;i<96;i++){
    float height=length(atmosphereUnflatten(s.position))-u_atmosphereRadiusKm;
    if(height>=u_atmosphereTopKm){outgoing=s.direction;columns=s.columns;return true;}
    if(height<floorHeight-.002) break;
    vec3 up=normalize(vec3(s.position.xy,s.position.z/(u_atmospherePolarRatio*u_atmospherePolarRatio)));
    // Resolve the low aerosol layer; increase steps only after its contribution
    // is small. RK4 also integrates density columns on the very same curved ray.
    float h=mix(u_atmosphereDensityScaleKm.y,u_atmosphereDensityScaleKm.x,
      smoothstep(4.0*u_atmosphereDensityScaleKm.y,8.0*u_atmosphereDensityScaleKm.y,height));
    float ds=min(5.0*u_atmosphereDensityScaleKm.x,.7*h/max(abs(dot(up,s.direction)),.1));
    AtmosphereRayState k1=atmosphereRayDerivative(s);
    AtmosphereRayState k2=atmosphereRayDerivative(atmosphereRayAdvance(s,k1,.5*ds));
    AtmosphereRayState k3=atmosphereRayDerivative(atmosphereRayAdvance(s,k2,.5*ds));
    AtmosphereRayState k4=atmosphereRayDerivative(atmosphereRayAdvance(s,k3,ds));
    s.position+=ds*(k1.position+2.0*k2.position+2.0*k3.position+k4.position)/6.0;
    s.direction=normalize(s.direction+ds*(k1.direction+2.0*k2.direction+2.0*k3.direction+k4.direction)/6.0);
    s.columns+=ds*(k1.columns+2.0*k2.columns+2.0*k3.columns+k4.columns)/6.0;
  }
  outgoing=s.direction;columns=s.columns;return false;
}
vec3 atmosphereAboveHorizon(vec3 direction,vec3 up){
  return normalize(direction+max(0.0,.000001-dot(direction,up))*up);
}
AtmosphereSolarRay atmosphereIncidentSun(vec3 surface){
  vec3 target=normalize(u_atmosphereSunDirection);
  vec3 up=normalize(vec3(surface.xy,surface.z/(u_atmospherePolarRatio*u_atmospherePolarRatio)));
  if(dot(target,up)<-.04) return AtmosphereSolarRay(target,vec3(0));
  vec3 guess=atmosphereAboveHorizon(target,up), nextDirection=guess;
  vec3 outgoing;vec2 columns;
  for(int i=0;i<6;i++){
    if(!atmosphereCurvedRay(surface,guess,outgoing,columns))
      return AtmosphereSolarRay(target,atmosphereSunTransmission(surface));
    nextDirection=normalize(target-outgoing+guess);
    vec3 nextGuess=atmosphereAboveHorizon(nextDirection,up);
    if(length(nextGuess-guess)<.000001){guess=nextGuess;break;}
    guess=nextGuess;
  }
  if(dot(nextDirection,up)<0.0) return AtmosphereSolarRay(nextDirection,vec3(0));
  if(!atmosphereCurvedRay(surface,guess,outgoing,columns))
    return AtmosphereSolarRay(target,atmosphereSunTransmission(surface));
  return AtmosphereSolarRay(guess,exp(-u_atmosphereRayleighKm*columns.x-u_atmosphereAerosolKm*columns.y));
}
`;

export const ATMOSPHERE_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_mvp;
uniform float u_atmosphereRadiusKm, u_atmosphereTopKm, u_atmospherePolarRatio;
out vec3 v_atmosphereBodyKm;
void main(){
  v_atmosphereBodyKm=vec3(a_pos.xy,a_pos.z*u_atmospherePolarRatio)*(u_atmosphereRadiusKm+u_atmosphereTopKm);
  gl_Position=u_mvp*vec4(a_pos,1.0);
}`;

export const ATMOSPHERE_FS = `#version 300 es
precision highp float;
in vec3 v_atmosphereBodyKm; out vec4 o;
${ATMOSPHERE_GLSL}
vec3 atmosphereEncode(vec3 c){ c=max(c,vec3(0)); return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(vec3(.0031308),c)); }
void main(){
  if(u_atmosphereEnabled==0) discard;
  vec3 direction=normalize(v_atmosphereBodyKm-u_atmosphereCameraKm);
  vec2 ground=atmosphereRayInterval(u_atmosphereCameraKm,direction,u_atmosphereRadiusKm);
  if(ground.y>0.0&&ground.x>=0.0) discard;
  AtmosphereResult optics=integrateAtmosphere(u_atmosphereCameraKm,direction,1e20);
  // Premultiplied ONE, ONE_MINUS_SRC_ALPHA. Scattered light composes correctly on
  // black. Extinction of pre-existing sRGB stars is only a scalar-alpha approximation.
  float alpha=1.0-dot(optics.transmittance,vec3(.2126,.7152,.0722));
  o=vec4(atmosphereEncode(optics.scattering),clamp(alpha,0.0,1.0));
}`;
