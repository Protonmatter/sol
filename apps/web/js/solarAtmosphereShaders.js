import {SOLAR_COOL_PLASMA_GLSL} from './solarCoolPlasma.js';
import {SOLAR_CELLULAR_GLSL} from './solarSurfaceShaders.js';
import {SOLAR_LOOK_GLSL} from './solarLookShaders.js';

export const DYNAMIC_SOLAR_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_mvp;
uniform float u_extent;
out vec3 v_obj;
void main(){v_obj=a_pos*u_extent;gl_Position=u_mvp*vec4(v_obj,1.);}
`;

export const DYNAMIC_SOLAR_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
in vec3 v_obj;
out vec4 o;
uniform mat4 u_mvp;
uniform vec3 u_camObj;
uniform float u_extent,u_seconds,u_pixelDiameter,u_rate,u_eventSeconds;
uniform int u_pass,u_channel,u_debug,u_samples,u_hasPulse,u_linearOutput,u_regionCount,u_showCorona,u_domainWarp;
uniform int u_showDiffuse;
uniform sampler3D u_volume,u_pulse;
uniform sampler2D u_surface;
uniform uint u_seed;
uniform vec3 u_rotation;
uniform vec4 u_surfaceRecipe,u_euvRecipe;
uniform vec4 u_regions[32];
uniform float u_regionTemperature[32];
uniform int u_emissionRegionCount;
uniform vec3 u_emissionCenters[10];
uniform vec4 u_emissionAxesU[10],u_emissionAxesV[10],u_emissionCores[40],u_emissionCoreGains[10];
uniform vec4 u_emissionCoreAxes[40];
${SOLAR_CELLULAR_GLSL}
${SOLAR_COOL_PLASMA_GLSL}

vec2 interval(vec3 origin,vec3 dir,float radius){
  vec3 crossRay=cross(origin,dir);float d=radius*radius-dot(crossRay,crossRay);
  if(d<0.)return vec2(1.,-1.);float mid=-dot(origin,dir),span=sqrt(d);return vec2(mid-span,mid+span);
}
vec3 advected(vec3 p){return turnZ(p,-(rotationAt(p,u_rotation)-14.1844)*.017453292519943295*u_seconds/86400.);}
${SOLAR_LOOK_GLSL}
vec3 encode(vec3 c){return mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
vec3 present(vec3 linear){return u_linearOutput==1?linear:encode(max(linear,vec3(0))/(vec3(1)+max(linear,vec3(0))));}
vec3 palette(float intensity){
  vec3 hue=mix(vec3(1.,.24,.012),vec3(1.,.72,.20),smoothstep(.08,1.3,intensity));
  hue=mix(hue,vec3(1.,.94,.67),smoothstep(2.,8.,intensity));return max(intensity,0.)*hue;
}
float surfaceValue(vec3 p){
  float longitude=atan(p.y,p.x)/6.283185307179586;
  return texture(u_surface,vec2(fract(longitude),asin(clamp(p.z,-1.,1.))/3.141592653589793+.5)).r;
}
float pulseValue(vec3 uv){
  if(u_hasPulse==0)return 0.;vec4 data=texture(u_pulse,uv);
  float age=u_seconds-data.y;
  if(data.z<=0.||age<=0.||age>=data.z)return 0.;
  float window=pow(sin(3.141592653589793*age/data.z),2.);
  float d=(data.x-.0002*age)/.04;
  return data.w*.3*window*exp(-.5*d*d);
}
float attachmentEmission(vec3 p,vec4 fields){
  float value=0.,sparse=max(0.,fields.y-.65)/.35;sparse*=sparse;
  for(int i=0;i<10;i++){
    if(i>=u_emissionRegionCount)break;
    for(int j=0;j<4;j++){
      vec4 core=u_emissionCores[4*i+j];
      if(core.w<=0.)continue;
      vec3 delta=p-core.xyz;float distance2=dot(delta,delta);
      vec4 axis=u_emissionCoreAxes[4*i+j];
      float support=exp(-.5*distance2/(.015*.015));
      float laneCoordinate=(dot(delta,axis.xyz)/.015+.2*fields.w)/.10;
      float lane=exp(-.5*laneCoordinate*laneCoordinate);
      float internal=axis.w*support*sparse*(.4+.6*fields.z);
      value+=internal*(1.-.9*lane)+u_emissionCoreGains[i][j]*exp(-.5*distance2/(core.w*core.w));
    }
  }
  return value;
}
float hierarchicalEuv(vec3 p,float seconds,uint seed){
  float quietMeso;vec4 fields=euvHierarchyComponents(p,seconds,seed,quietMeso);
  return (1.-.92*fields.x)*(.012+.11*quietMeso)*(.9+.2*fields.z)+attachmentEmission(p,fields);
}
void main(){
  if(length(u_camObj)<=1.)discard;
  vec3 direction=normalize(v_obj-u_camObj);
  vec2 outer=interval(u_camObj,direction,u_extent);
  if(outer.y<=max(outer.x,0.))discard;
  vec2 inner=interval(u_camObj,direction,1.);
  bool disk=inner.y>=inner.x&&inner.x>0.;
  if(u_pass==1&&!disk)discard;
  float start=max(outer.x,0.),finish=disk?min(outer.y,inner.x):outer.y;
  // Every non-discard path writes depth, including raw transfer/debug returns.
  // Otherwise a statically depth-writing fragment shader has undefined depth.
  vec4 clip=u_mvp*vec4(u_camObj+(disk?inner.x:start)*direction,1.);
  gl_FragDepth=clamp(.5*(clip.z/clip.w)+.5,0.,1.);
  vec2 sheet=coolSheet(u_camObj,direction,finish,u_seconds,vec3(u_rotation.x-14.1844,u_rotation.yz));
  vec3 color=vec3(0.);float debugSurface=0.;
  if(disk&&u_pass!=2){
    vec3 point=normalize(u_camObj+inner.x*direction),carried=advected(point);
    float mu=max(0.,dot(point,-direction));
    if(u_debug==2){o=vec4(cellular(carried,u_seconds,695.7,1200.,u_seed),0,0,1);return;}
    if(u_debug==3){o=vec4(euvStructure(carried,u_seconds,u_seed),0,0,1);return;}
    if(u_debug==4){o=vec4(euvHierarchyComponents(carried,u_seconds,u_seed).xyz,1);return;}
    if(u_debug==5){o=vec4(hierarchicalEuv(carried,u_seconds,u_seed),0,0,1);return;}
    if(u_debug==6){o=vec4(attachmentEmission(carried,vec4(0.,1.,.5,0.)),0,0,1);return;}
    if(u_channel==1){
      float visibility=smoothstep(1.,3.,u_pixelDiameter*u_surfaceRecipe.z/1391400.);
      visibility*=1.-smoothstep(600.,7200.,u_rate);
      float cells=visibility>0.?cellular(carried,u_seconds,695700./u_surfaceRecipe.z,1200.,u_seed):0.;
      float temperature=u_surfaceRecipe.x+u_surfaceRecipe.w*cells*visibility;
      for(int i=0;i<32;i++){
        if(i>=u_regionCount)break;
        float distanceAngle=acos(clamp(dot(carried,u_regions[i].xyz),-1.,1.));
        float mask=1.-smoothstep(.45*u_regions[i].w,u_regions[i].w,distanceAngle);
        temperature=mix(temperature,u_regionTemperature[i],mask);
      }
      float value=planckRatio(temperature)*(1.-u_surfaceRecipe.y*(1.-mu));
      color=vec3(value*3.);debugSurface=value;
    }else{
      float value;
      if(u_euvRecipe.w>1.5){
        // The attachment field is evaluated directly. No lower-resolution
        // reference raster contributes to this production branch.
        value=hierarchicalEuv(carried,u_seconds,u_seed);
      }else{
        float base=surfaceValue(carried),scale=695700./max(u_euvRecipe.x,1000.);
        float visibility=smoothstep(.5,2.,u_pixelDiameter/max(scale*2.,1.));
        visibility*=1.-smoothstep(600.,7200.,u_rate);
        float cells=u_euvRecipe.w>.5?euvStructure(carried,u_seconds,u_seed):cellular(carried,u_seconds,scale,max(u_euvRecipe.y,1200.),u_seed);
        value=base*mix(1.,exp(u_euvRecipe.z*(cells-.2)),visibility);
      }
      debugSurface=value;color=palette(value*3.2);
    }
  }
  color*=disk?coolTransmission(sheet,inner.x):1.;
  debugSurface*=disk?coolTransmission(sheet,inner.x):1.;
  float emission=0.;
  if(u_pass!=1&&u_showCorona!=0&&u_showDiffuse!=0){
    float ds=(finish-start)/float(max(u_samples,1));
    for(int i=0;i<96;i++){
      if(i>=u_samples)break;
      vec3 point=u_camObj+(start+(float(i)+.5)*ds)*direction;
      vec3 carried=advected(point),uv=carried/(2.*u_extent)+.5;
      emission+=(texture(u_volume,uv).r+pulseValue(uv))*ds*coolTransmission(sheet,start+(float(i)+.5)*ds);
    }
  }
  // Explicit illustrative event, finite window on the same scenario clock.
  if(u_pass!=1&&u_eventSeconds>=0.&&u_eventSeconds<3600.&&u_showCorona!=0){
    float t=u_eventSeconds/3600.,radius=1.05+1.15*t;
    vec2 eventHit=interval(u_camObj,direction,radius);
    if(eventHit.y>max(eventHit.x,0.)&&(!disk||eventHit.x<inner.x)){
      vec3 n=normalize(u_camObj+max(eventHit.x,0.)*direction);
      float cap=smoothstep(.88,.985,dot(n,normalize(vec3(1.,.25,.3))));
      emission+=cap*pow(sin(3.141592653589793*t),2.)*.02*coolTransmission(sheet,max(eventHit.x,0.));
    }
  }
  // Sheet source occurs exactly once, in the volume pass, even without corona.
  if(u_pass!=1&&sheet.x>0.)emission+=.004*(1.-exp(-sheet.y));
  // Illustrative look layer (fans, fur, prominence), once, in the volume pass.
  if(u_pass!=1&&u_showCorona!=0)emission+=lookEmission(u_camObj,direction,disk,inner.x);
  if(u_debug==1){o=vec4(emission,debugSurface,u_pass==1&&disk?1.:0.,u_pass==1?1.:0.);return;}
  color+=u_channel==1?vec3(emission*2.):palette(emission*40.);
  if(u_pass==2){if(max(color.r,max(color.g,color.b))<1e-6)discard;o=vec4(present(color),0.);}
  else o=vec4(present(color),disk?1.:0.);
}
`;
