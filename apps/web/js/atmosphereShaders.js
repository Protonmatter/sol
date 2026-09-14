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
// Observer-only compensated products retain cancellation residuals. The
// homogeneous metric avoids rounding a distant origin through z/polarRatio.
// Inputs to observer roots are physical km and finite nonzero raw directions;
// near-body solar/column roots keep their independently qualified implementation.

vec2 atmosphereExactProduct(float a,float b){
  float ah=uintBitsToFloat(floatBitsToUint(a)&0xfffff000u),al=a-ah;
  float bh=uintBitsToFloat(floatBitsToUint(b)&0xfffff000u),bl=b-bh;
  float p=a*b;
  return vec2(p,((ah*bh-p)+ah*bl+al*bh)+al*bl);
}
vec2 atmospherePairAdd(vec2 a,vec2 b){
  float s=a.x+b.x,v=s-a.x;
  float e=(a.x-(s-v))+(b.x-v)+a.y+b.y;
  float h=s+e;return vec2(h,e-(h-s));
}
vec2 atmospherePairMul(vec2 a,vec2 b){
  return atmospherePairAdd(atmosphereExactProduct(a.x,b.x),vec2(a.x*b.y+a.y*b.x+a.y*b.y,0));
}
vec2 atmospherePairDiv(vec2 a,vec2 b){
  float q=a.x/b.x;
  vec2 r=atmospherePairAdd(a,-atmospherePairMul(vec2(q,0),b));
  return atmospherePairAdd(vec2(q,0),vec2((r.x+r.y)/b.x,0));
}
// Homogeneous A, C and closest parameter describe the original raw ray. They
// are shared by both intersection radii and the rationalized limb coordinate.
struct AtmosphereObserverMetric { vec2 a; vec2 c; vec2 center; };
AtmosphereObserverMetric atmosphereObserverMetric(vec3 origin,vec3 direction){
  vec2 q2=atmosphereExactProduct(u_atmospherePolarRatio,u_atmospherePolarRatio);
  vec2 a=atmospherePairAdd(atmospherePairMul(q2,atmospherePairAdd(
    atmosphereExactProduct(direction.x,direction.x),atmosphereExactProduct(direction.y,direction.y))),
    atmosphereExactProduct(direction.z,direction.z));
  if(a.x+a.y<=0.0)return AtmosphereObserverMetric(a,vec2(0),vec2(0));
  vec2 pd=atmospherePairAdd(atmospherePairMul(q2,atmospherePairAdd(
    atmosphereExactProduct(origin.x,direction.x),atmosphereExactProduct(origin.y,direction.y))),
    atmosphereExactProduct(origin.z,direction.z));
  vec2 cx=atmospherePairAdd(atmosphereExactProduct(origin.y,direction.z),-atmosphereExactProduct(origin.z,direction.y));
  vec2 cy=atmospherePairAdd(atmosphereExactProduct(origin.z,direction.x),-atmosphereExactProduct(origin.x,direction.z));
  vec2 cz=atmospherePairAdd(atmosphereExactProduct(origin.x,direction.y),-atmosphereExactProduct(origin.y,direction.x));
  vec2 crossSquared=atmospherePairAdd(atmospherePairAdd(atmospherePairMul(cx,cx),atmospherePairMul(cy,cy)),
    atmospherePairMul(q2,atmospherePairMul(cz,cz)));
  return AtmosphereObserverMetric(a,crossSquared,atmospherePairDiv(-pd,a));
}
vec2 atmosphereMetricInterval(AtmosphereObserverMetric metric,float radius){
  if(metric.a.x+metric.a.y<=0.0)return vec2(1,-1);
  vec2 q2=atmosphereExactProduct(u_atmospherePolarRatio,u_atmospherePolarRatio);
  vec2 discriminant=atmospherePairAdd(atmospherePairMul(atmosphereExactProduct(radius,radius),metric.a),-metric.c);
  if(discriminant.x+discriminant.y<0.0)return vec2(1,-1);
  vec2 width=atmospherePairDiv(atmospherePairMul(q2,discriminant),atmospherePairMul(metric.a,metric.a));
  float center=metric.center.x+metric.center.y,halfWidth=sqrt(max(0.0,width.x+width.y));
  return vec2(center-halfWidth,center+halfWidth);
}
float atmosphereMetricHeight(AtmosphereObserverMetric metric){
  if(metric.a.x+metric.a.y<=0.0)return 0.0;
  vec2 numerator=atmospherePairAdd(metric.c,-atmospherePairMul(atmosphereExactProduct(u_atmosphereRadiusKm,u_atmosphereRadiusKm),metric.a));
  vec2 delta=atmospherePairDiv(numerator,metric.a),squared=atmospherePairDiv(metric.c,metric.a);
  float impact=sqrt(max(0.0,squared.x+squared.y));
  return (delta.x+delta.y)/(impact+u_atmosphereRadiusKm);
}
vec2 atmosphereObserverInterval(vec3 origin,vec3 direction,float radius){
  return atmosphereMetricInterval(atmosphereObserverMetric(origin,direction),radius);
}
// Intersection with the planet's anti-solar infinite shadow cylinder. Use raw
// physical inputs: cross products eliminate the separately rounded projection
// onto a normalized/unflattened solar axis. Compensated coefficients and stable
// quadratic roots retain short lit intervals beside the shadow boundary.
struct AtmospherePairVector { vec2 x; vec2 y; vec2 z; };
AtmospherePairVector atmospherePairCross(vec3 a,vec3 b){
  return AtmospherePairVector(
    atmospherePairAdd(atmosphereExactProduct(a.y,b.z),-atmosphereExactProduct(a.z,b.y)),
    atmospherePairAdd(atmosphereExactProduct(a.z,b.x),-atmosphereExactProduct(a.x,b.z)),
    atmospherePairAdd(atmosphereExactProduct(a.x,b.y),-atmosphereExactProduct(a.y,b.x)));
}
vec2 atmosphereCrossMetric(AtmospherePairVector a,AtmospherePairVector b,vec2 q2){
  return atmospherePairAdd(atmospherePairAdd(atmospherePairMul(a.x,b.x),atmospherePairMul(a.y,b.y)),
    atmospherePairMul(q2,atmospherePairMul(a.z,b.z)));
}
vec2 atmosphereAxialMetric(vec3 a,vec3 b,vec2 q2){
  return atmospherePairAdd(atmospherePairMul(q2,atmospherePairAdd(
    atmosphereExactProduct(a.x,b.x),atmosphereExactProduct(a.y,b.y))),atmosphereExactProduct(a.z,b.z));
}
vec2 atmosphereShadowInterval(vec3 origin,vec3 direction){
  vec3 light=u_atmosphereSunDirection;
  vec2 q2=atmosphereExactProduct(u_atmospherePolarRatio,u_atmospherePolarRatio);
  vec2 lightMetric=atmosphereAxialMetric(light,light,q2);
  float lightSquared=lightMetric.x+lightMetric.y;
  if(lightSquared<=0.0)return vec2(1,-1);
  AtmospherePairVector p=atmospherePairCross(origin,light),d=atmospherePairCross(direction,light);
  vec2 a=atmosphereCrossMetric(d,d,q2),b=atmosphereCrossMetric(p,d,q2);
  vec2 c=atmospherePairAdd(atmosphereCrossMetric(p,p,q2),
    -atmospherePairMul(atmosphereExactProduct(u_atmosphereRadiusKm,u_atmosphereRadiusKm),lightMetric));
  vec2 interval;
  // The old normalized metric tests are transformed without changing their
  // thresholds: a_old=a/lightMetric; axialD_old=D/(q*sqrt(lightMetric)).
  if(a.x+a.y<1e-12*lightSquared){
    if(c.x+c.y>0.0)return vec2(1,-1);interval=vec2(-1e20,1e20);
  }else{
    vec2 disc=atmospherePairAdd(atmospherePairMul(b,b),-atmospherePairMul(a,c));
    float discriminant=disc.x+disc.y;
    if(discriminant<0.0)return vec2(1,-1);
    if(discriminant<=0.0){vec2 root=atmospherePairDiv(-b,a);interval=vec2(root.x+root.y);}
    else{
      float s=sqrt(discriminant);
      vec2 remainder=atmospherePairAdd(disc,-atmosphereExactProduct(s,s));
      vec2 radical=atmospherePairAdd(vec2(s,0),vec2((remainder.x+remainder.y)/(2.0*s),0));
      vec2 stable=atmospherePairAdd(-b,b.x+b.y>=0.0?-radical:radical);
      vec2 first=atmospherePairDiv(stable,a),second=atmospherePairDiv(c,stable);
      float x=first.x+first.y,y=second.x+second.y;interval=vec2(min(x,y),max(x,y));
    }
  }
  vec2 axialP=atmosphereAxialMetric(origin,light,q2),axialD=atmosphereAxialMetric(direction,light,q2);
  float planeDirection=axialD.x+axialD.y;
  if(abs(planeDirection)<1e-10*u_atmospherePolarRatio*sqrt(lightSquared)){
    if(axialP.x+axialP.y>=0.0)return vec2(1,-1);
  }else{
    vec2 quotient=atmospherePairDiv(-axialP,axialD);float plane=quotient.x+quotient.y;
    if(planeDirection>0.0)interval.y=min(interval.y,plane);else interval.x=max(interval.x,plane);
  }
  return interval;
}
// entry/ray/distance are one bounded physical-km segment. Ground and outer are
// signed physical-km intervals from the caller's original camera, not entry.
// Shadow is relative to this entry and is shared by source/weight/zero support.
// Neither consumers nor the prepared integrator normalize or clip this again.
struct AtmospherePath { vec3 entry; vec3 ray; float distance; vec2 ground; vec2 outer; float height; vec2 shadow; };
AtmospherePath atmosphereEmptyPath(vec3 origin){
  return AtmospherePath(origin,vec3(1,0,0),0.0,vec2(1,-1),vec2(1,-1),0.0,vec2(1,-1));
}
vec2 atmospherePhysicalInterval(vec2 interval,float norm){
  return interval.y<interval.x?vec2(1,-1):interval*norm;
}
AtmospherePath atmosphereObserverGeometry(vec3 origin,vec3 direction,float maximum,out bool complete){
  complete=false;
  AtmospherePath path=atmosphereEmptyPath(origin);
  float norm=length(direction);
  if(norm<=0.0||maximum<=0.0)return path;
  AtmosphereObserverMetric metric=atmosphereObserverMetric(origin,direction);
  vec2 sky=atmosphereMetricInterval(metric,u_atmosphereRadiusKm+u_atmosphereTopKm);
  path.ground=atmospherePhysicalInterval(atmosphereMetricInterval(metric,u_atmosphereRadiusKm),norm);
  path.outer=atmospherePhysicalInterval(sky,norm);path.height=atmosphereMetricHeight(metric);
  path.ray=direction/norm;
  if(sky.y<sky.x)return path;
  float begin=max(0.0,sky.x),end=min(maximum/norm,sky.y);
  if(end<=begin)return path;
  path.entry=origin+direction*begin;path.distance=(end-begin)*norm;
  complete=true;
  return path;
}
vec2 atmosphereReversePhysicalInterval(vec2 interval,float norm){
  return interval.y<interval.x?vec2(1,-1):vec2(1.0-interval.y,1.0-interval.x)*norm;
}
// Reverse raw endpoint geometry avoids distant-camera reconstruction. Intersect
// [0,1] before reversing so even an exterior endpoint leaves no exterior suffix.
// The caller keeps the actual surface endpoint separately for atlas coordinates.
AtmospherePath atmosphereSurfaceGeometry(vec3 origin,vec3 surface,out bool complete){
  complete=false;
  AtmospherePath path=atmosphereEmptyPath(origin);
  vec3 reverseDelta=origin-surface;float norm=length(reverseDelta);
  if(norm<=0.0)return path;
  AtmosphereObserverMetric metric=atmosphereObserverMetric(surface,reverseDelta);
  vec2 sky=atmosphereMetricInterval(metric,u_atmosphereRadiusKm+u_atmosphereTopKm);
  path.ground=atmosphereReversePhysicalInterval(atmosphereMetricInterval(metric,u_atmosphereRadiusKm),norm);
  path.outer=atmosphereReversePhysicalInterval(sky,norm);path.height=atmosphereMetricHeight(metric);
  path.ray=-reverseDelta/norm;
  if(sky.y<sky.x)return path;
  float begin=max(0.0,sky.x),end=min(1.0,sky.y);
  if(end<=begin)return path;
  path.entry=end>=1.0?origin:surface+reverseDelta*end;path.distance=(end-begin)*norm;
  complete=true;
  return path;
}
// Generator branches select geometry before this single shared shadow call.
// The private completion flag retains the exact original early-return branches,
// including empty paths, rather than reinterpreting the computed distance.
AtmospherePath atmosphereCompletePath(AtmospherePath path,bool complete){
  if(complete)path.shadow=atmosphereShadowInterval(path.entry,path.ray);
  return path;
}
AtmospherePath atmospherePrepareObserver(vec3 origin,vec3 direction,float maximum){
  bool complete;AtmospherePath path=atmosphereObserverGeometry(origin,direction,maximum,complete);
  return atmosphereCompletePath(path,complete);
}
AtmospherePath atmospherePrepareSurface(vec3 origin,vec3 surface){
  bool complete;AtmospherePath path=atmosphereSurfaceGeometry(origin,surface,complete);
  return atmosphereCompletePath(path,complete);
}
// Compatibility wrappers expose the same prepared segment to source consumers.
void atmosphereObserverSegment(vec3 origin,vec3 direction,float maximum,out vec3 entry,out vec3 ray,out float distance){
  AtmospherePath path=atmospherePrepareObserver(origin,direction,maximum);
  entry=path.entry;ray=path.ray;distance=path.distance;
}
void atmosphereSurfaceSegment(vec3 origin,vec3 surface,out vec3 entry,out vec3 ray,out float distance){
  AtmospherePath path=atmospherePrepareSurface(origin,surface);
  entry=path.entry;ray=path.ray;distance=path.distance;
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
  // An inward ray starting just inside the datum still hits the planet. Above
  // it, a negative normal dot alone does not imply a hit: curvature can leave
  // the entire solar ray clear. Require the already-computed forward exit.
  if(ground.y>0.001&&atmosphereHeight(point)<0.002&&dot(atmosphereUnflatten(point),atmosphereUnflatten(light))<0.0) return vec3(0.0);
  vec2 sky=atmosphereRayInterval(point,light,u_atmosphereRadiusKm+u_atmosphereTopKm);
  return sky.y>0.0 ? exp(-atmosphereOpticalDepth(point,light,sky.y)) : vec3(1.0);
}
// Private source kernel, called only on the complement of path.shadow. That
// support classifies the continuous observer ray once; classifying independently
// rounded Gauss positions again can spuriously remove finite quadrature weight
// at tangency. Keep the public local solar visibility function above unchanged.
vec3 atmosphereLitSunTransmission(vec3 samplePoint){
  vec3 light=normalize(u_atmosphereSunDirection);
  vec2 sky=atmosphereRayInterval(samplePoint,light,u_atmosphereRadiusKm+u_atmosphereTopKm);
  return sky.y>0.0?exp(-atmosphereOpticalDepth(samplePoint,light,sky.y)):vec3(1.0);
}
// Exact exponential optical-coordinate substitution on complete datum-bounded
// segments. These stable elementary evaluations avoid cancellation in binary32.
float atmosphereOneMinusExp(float x){
  if(x<0.125) return x*(1.0-x*(0.5-x*(1.0/6.0-x*(1.0/24.0-x*(1.0/120.0-x/720.0)))));
  return 1.0-exp(-x);
}
float atmosphereNegativeLogOneMinus(float x,float remainder){
  if(x<0.125) return x*(1.0+x*(0.5+x*(1.0/3.0+x*(0.25+x*(0.2+x*(1.0/6.0+x*(1.0/7.0+x*0.125)))))));
  return -log(remainder);
}
vec2 atmosphereOpticalCoordinate(float u,float opticalWidth){
  if(opticalWidth<=0.0) return vec2(u,1.0);
  float span=atmosphereOneMinusExp(opticalWidth);
  float remainder=(1.0-u)+u*exp(-opticalWidth);
  return vec2(atmosphereNegativeLogOneMinus(u*span,remainder)/opticalWidth,
    span/(opticalWidth*remainder));
}
vec3 atmosphereScatteredMonotonic(vec3 origin,vec3 direction,vec2 interval){
  if(interval.y<=interval.x) return vec3(0.0);
  float mu=clamp(dot(direction,normalize(u_atmosphereSunDirection)),-1.0,1.0);
  float phaseR=3.0*(1.0+mu*mu)/(16.0*ATM_PI), g=u_atmosphereG;
  float phaseA=(1.0-g*g)/(4.0*ATM_PI*pow(1.0+g*g-2.0*g*mu,1.5));
  float halfWidth=(interval.y-interval.x)*.5, middle=(interval.y+interval.x)*.5;
  vec2 ground=atmosphereRayInterval(origin,direction,u_atmosphereRadiusKm);
  bool belowDatum=ground.y>ground.x&&interval.x>=ground.x&&interval.y<=ground.y;
  vec3 extinction=u_atmosphereRayleighKm+u_atmosphereAerosolKm;
  float opticalWidth=belowDatum?(interval.y-interval.x)*min(extinction.x,min(extinction.y,extinction.z)):0.0;
  vec3 sum=vec3(0.0);
  for(int i=0;i<12;i++){
    float distance=middle+halfWidth*ATM_X12[i];
    vec2 coordinate=atmosphereOpticalCoordinate((ATM_X12[i]+1.0)*.5,opticalWidth);
    if(opticalWidth>0.0) distance=interval.x+(interval.y-interval.x)*coordinate.x;
    vec3 p=origin+direction*distance;
    vec2 density=exp(-atmosphereHeight(p)/u_atmosphereDensityScaleKm);
    vec3 source=u_atmosphereRayleighKm*density.x*phaseR
      +u_atmosphereAerosolKm*u_atmosphereAerosolSSA*density.y*phaseA;
    vec3 transmission=exp(-atmosphereOpticalDepth(origin,direction,distance))*atmosphereLitSunTransmission(p);
    sum+=ATM_W12[i]*coordinate.y*transmission*source;
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
AtmosphereResult integrateAtmospherePrepared(AtmospherePath path){
  AtmosphereResult result=AtmosphereResult(vec3(1.0),vec3(0.0));
  if(u_atmosphereEnabled==0) return result;
  vec3 entry=path.entry,ray=path.ray;float distance=path.distance;
  if(distance<=0.0) return result;
  result.transmittance=exp(-atmosphereOpticalDepth(entry,ray,distance));
  vec2 shadow=path.shadow;
  vec2 first=vec2(0.0,distance),last=vec2(0.0);
  int segmentCount=1;
  if(!(shadow.y<=shadow.x||shadow.y<=0.0||shadow.x>=distance)){
    first=vec2(0.0,max(0.0,shadow.x));
    last=vec2(min(distance,shadow.y),distance);segmentCount=2;
  }
  vec3 scattered=vec3(0.0);
  for(int segment=0;segment<segmentCount;segment++){
    vec2 interval=segment==0?first:last;
    vec3 part=atmosphereScatteredSegment(entry,ray,interval);
    if(segment==0)scattered=part;
    else scattered=scattered+part;
  }
  result.scattering=scattered*ATM_PI*u_atmosphereSolarScale*u_atmosphereExposure;
  return result;
}
AtmosphereResult integrateAtmosphere(vec3 origin,vec3 direction,float maxDistance){
  return integrateAtmospherePrepared(atmospherePrepareObserver(origin,direction,maxDistance));
}
vec3 atmosphereSurfaceColor(vec3 linearSurfaceColor,vec3 surfaceBodyKm){
  AtmosphereResult optics=integrateAtmospherePrepared(atmospherePrepareSurface(u_atmosphereCameraKm,surfaceBodyKm));
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
uniform int u_linearOutput;
${ATMOSPHERE_GLSL}
vec3 atmosphereEncode(vec3 c){ c=max(c,vec3(0)); return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(vec3(.0031308),c)); }
void main(){
  if(u_atmosphereEnabled==0) discard;
  vec3 direction=v_atmosphereBodyKm-u_atmosphereCameraKm;
  AtmospherePath path=atmospherePrepareObserver(u_atmosphereCameraKm,direction,1e20);
  vec2 ground=path.ground;
  if(ground.y>0.0&&ground.x>=0.0) discard;
  AtmosphereResult optics=integrateAtmospherePrepared(path);
  // Premultiplied ONE, ONE_MINUS_SRC_ALPHA. Scattered light composes correctly on
  // black. Extinction of pre-existing sRGB stars is only a scalar-alpha approximation.
  float alpha=1.0-dot(optics.transmittance,vec3(.2126,.7152,.0722));
  o=vec4(u_linearOutput==1 ? optics.scattering : atmosphereEncode(optics.scattering),clamp(alpha,0.0,1.0));
}`;
