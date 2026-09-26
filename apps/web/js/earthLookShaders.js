// The recovered v7 display recipe, adapted from the lab's orthographic sphere
// to SOL's perspective camera and existing oblate, IAU-rotated Earth geometry.
import {EARTH_GLSL,EARTH_VOLUME_GLSL} from './earthLookClouds.js';
import {DISPLAY_COMPOSITION_GLSL} from './materialColor.js';

export const EARTH_LOOK_EXTENT=1.06;
export const EARTH_LOOK_VS=`#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_mvp;
out vec3 v_obj;
void main(){v_obj=a_pos*${EARTH_LOOK_EXTENT};gl_Position=u_mvp*vec4(v_obj,1.);}`;

// The reference cloud/shadow/texture-lighting equations are shared verbatim.
// A footprint of 2/pixelDiameter equals the lab's 3.6/(resolution*zoom).
const footprint='3.6/(min(uResolution.x,uResolution.y)*uZoom)';
if(EARTH_VOLUME_GLSL.split(footprint).length!==2)throw new Error('Earth cloud footprint boundary changed');
const volume=EARTH_VOLUME_GLSL.replace(footprint,'2./max(u_pixelDiameter,1.)');
if(/\buResolution\b|\buZoom\b/.test(volume))throw new Error('Earth cloud camera uniform boundary changed');
export const EARTH_LOOK_FS=`#version 300 es
precision highp float;
in vec3 v_obj;out vec4 o;
uniform mat4 u_mvp;
uniform vec3 u_camObj,u_lightObj;
uniform float u_oblate,uCloudPhase,u_pixelDiameter,u_earthLookExposure;
uniform int u_earthLookPass,u_earthWeather,u_earthNight,u_earthAtmosphere;
uniform sampler2D u_tex,uCloudMap,u_nightTex,u_oceanMask;
${DISPLAY_COMPOSITION_GLSL}
const float PI=3.14159265359;
// SOL's north axis is +z; the lab's is +y. No view-driven texture rotation.
vec3 local(vec3 p){return p.xzy;}
vec2 earthUv(vec3 p){p=normalize(p);return vec2(fract(atan(p.y,p.x)/(2.*PI)+.5),acos(clamp(p.z,-1.,1.))/PI);}
float earthCloud(vec3 point){vec2 uv=earthUv(point);uv.x=fract(uv.x-uCloudPhase);return texture(uCloudMap,uv).a;}
${EARTH_GLSL}
${volume}
vec3 lookTone(vec3 value){value*=u_earthLookExposure;return pow(clamp((value*(2.51*value+.03))/(value*(2.43*value+.59)+.14),0.,1.),vec3(1./2.2));}

// Separate near/far cloud intervals retain fixed sample spacing at the ground
// silhouette. The density/light integration is the v7 recipe in body coordinates.
vec2 perspectiveCloudVolume(vec3 closest,vec3 ray,float distance2,vec3 light,bool ground){
  if(distance2>=CLOUD_TOP*CLOUD_TOP)return vec2(0.);
  float front=sqrt(max(0.,CLOUD_TOP*CLOUD_TOP-distance2));
  float inner=sqrt(max(0.,CLOUD_BASE*CLOUD_BASE-distance2));
  float stepSize=(front-inner)/12.,transmission=1.,radiance=0.;
  for(int i=0;i<24;i++){
    if(i>=12&&ground)break;
    float along=i<12?-front+(float(i)+.5)*stepSize:inner+(float(i)-12.+.5)*stepSize;
    vec3 point=closest+ray*along;
    float density=volumeDensity(point);
    if(density>0.){
      float opacity=1.-exp(-density*stepSize),mu=dot(normalize(point),light);
      float illumination=.012+smoothstep(-.08,.18,mu)*(.1+.95*pow(max(0.,mu),.45)*volumeTransmission(point,light));
      radiance+=transmission*opacity*illumination;transmission*=1.-opacity;
      if(transmission<.005)break;
    }
  }
  return vec2(radiance,1.-transmission);
}
void main(){
  vec3 ray=normalize(v_obj-u_camObj);
  vec3 closest=u_camObj-ray*dot(u_camObj,ray);
  // Cross-product form avoids subtracting two large squared camera distances.
  vec3 perpendicular=cross(u_camObj,ray);float distance2=dot(perpendicular,perpendicular);
  bool ground=distance2<1.;
  if((u_earthLookPass==0&&!ground)||(u_earthLookPass==1&&ground))discard;
  vec3 light=normalize(vec3(u_lightObj.xy,u_lightObj.z/u_oblate));
  vec3 cameraDirection=normalize(u_camObj);
  vec3 air=vec3(72.,140.,255.)/255.;
  vec3 color=vec3(0.);
  if(ground){
    vec3 point=closest-ray*sqrt(max(0.,1.-distance2)),normal=normalize(point);
    vec2 uv=earthUv(normal);vec3 encoded=texture(u_tex,uv).rgb;
    vec3 albedo=gradeOcean(pow(encoded,vec3(2.2)),texture(u_oceanMask,uv).r);
    // Texture-derived relief is a display choice, as in the Sites reference.
    float base=dot(encoded,vec3(.333));
    float dx=dot(texture(u_tex,uv+vec2(.001,0.)).rgb,vec3(.333))-base;
    float dy=dot(texture(u_tex,uv+vec2(0.,.001)).rgb,vec3(.333))-base;
    vec3 right=normalize(cross(abs(cameraDirection.z)>.99?vec3(0.,1.,0.):vec3(0.,0.,1.),cameraDirection));
    vec3 up=normalize(cross(cameraDirection,right));
    vec3 shadingNormal=normalize(vec3(normal.xy,normal.z/u_oblate)+(right*dx+up*dy)*.375);
    float ndl=dot(shadingNormal,normalize(u_lightObj)),lighting=max(ndl,0.);
    if(u_earthWeather==1&&dot(normal,light)>0.)lighting*=mix(.18,1.,volumeTransmission(normal,light));
    color=albedo*(lighting*.95+.018);
    if(u_earthNight==1)color+=pow(texture(u_nightTex,uv).rgb,vec3(1.5))*(1.-smoothstep(-.18,.12,ndl))*.72;
    if(u_earthAtmosphere==1)color+=air*pow(1.-max(dot(normal,-ray),0.),4.5)*.28*smoothstep(-.15,.5,dot(normal,light));
    vec4 clip=u_mvp*vec4(point,1.);gl_FragDepth=clamp(.5+.5*clip.z/clip.w,0.,1.);
  }
  vec2 clouds=u_earthWeather==1?perspectiveCloudVolume(closest,ray,distance2,light,ground):vec2(0.);
  vec3 cloudNormal=normalize(closest-ray*sqrt(max(0.,CLOUD_TOP*CLOUD_TOP-distance2)));
  vec3 cloudColor=vec3(clouds.x*(clouds.y>.001?cloudTextureLighting(cloudNormal,light):1.));
  if(u_earthAtmosphere==1)cloudColor+=air*pow(1.-max(dot(cloudNormal,-ray),0.),4.5)*.16*smoothstep(-.15,.5,dot(cloudNormal,light))*clouds.y;
  color=color*(1.-clouds.y)+cloudColor;
  if(ground){o=vec4(displayOutput(lookTone(color)),1.);return;}
  float edge=u_earthAtmosphere==1?exp(-(sqrt(distance2)-1.)*100.)*.16*smoothstep(-.12,.65,dot(normalize(closest-ray*.04),light)):0.;
  color+=air*edge;
  float alpha=max(clouds.y,clamp(edge*4.,0.,1.));
  if(alpha<.001)discard;
  vec4 clip=u_mvp*vec4(v_obj,1.);gl_FragDepth=clamp(.5+.5*clip.z/clip.w,0.,1.);
  // Compose premultiplied display radiance directly. Dividing by a small alpha
  // would clamp the bright limb before blending on an SDR framebuffer.
  o=vec4(displayOutput(lookTone(color)),alpha);
}`;
