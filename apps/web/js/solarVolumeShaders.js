// A source-facing reference sphere plus an explicitly modeled optically thin arcade volume.
// All coordinates are in the fixed frame-0 observer basis, with distances in solar radii.
// 32 midpoint samples × 24 bounded arches: 12 source-anchored, 12 whole-sphere educational.
// No noise and no fictitious photospheric spots. Far-side disk structure stays the observed
// radial median. The extra arches drift with a compressed differential-rotation clock.
// A periodic front is an educational ejection, not a measured CME, MHD, or far-side imagery.
import { DISPLAY_COMPOSITION_GLSL } from './materialColor.js';
export const SOLAR_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_mvp;
uniform float u_extent;
out vec3 v_obj;
void main(){v_obj=a_pos*u_extent;gl_Position=u_mvp*vec4(v_obj,1.0);}`;

export const SOLAR_FS = `#version 300 es
precision highp float;
in vec3 v_obj;
out vec4 o;
${DISPLAY_COMPOSITION_GLSL}
uniform mat4 u_mvp;
uniform vec3 u_camObj;
// 0 is the standalone combined reference; production draws 1 (opaque) then 2 (emission).
uniform int u_pass;
uniform float u_extent;
uniform sampler2D u_atlas;
uniform float u_frameMix;
uniform float u_phase;
uniform mat3 u_sourceBasis0;
uniform mat3 u_sourceBasis1;
uniform vec4 u_projection0;
uniform vec4 u_projection1;
uniform vec2 u_observerRadii;
uniform sampler2D u_quiet;
// 0 keeps the admitted 1x gold map. The live view uploads a soft-shoulder strength.
uniform float u_displayGain;
// 0 draws no whole-limb shell, so an empty off-limb probe stays transparent.
uniform float u_coronaGlow;
// 0 hides the ejection. Progress 0..1 moves a front from the surface toward u_extent.
uniform float u_cmeProgress;
uniform vec3 u_cmeAxis;
uniform vec4 u_loopNormal[24];
uniform vec4 u_loopTangent[24];
uniform float u_loopGain[24];

vec2 sphereRay(vec3 origin,vec3 direction,float radius){
  // Perpendicular distance avoids subtracting two squared distant-camera lengths.
  vec3 perpendicular=cross(origin,direction);
  float discriminant=radius*radius-dot(perpendicular,perpendicular);
  if(discriminant<0.0)return vec2(1.0,-1.0);
  float middle=-dot(origin,direction),span=sqrt(discriminant);
  return vec2(middle-span,middle+span);
}
vec3 gold(float value){
  float v=clamp(value,0.0,1.0);
  return vec3(pow(v,.7),.76*pow(v,1.25),.22*pow(v,2.1));
}
vec2 sourceIntensity(vec3 point,mat3 basis,vec4 projection,float distance,float frame){
  float x=dot(point,basis[0]),y=dot(point,basis[1]),z=dot(point,basis[2]);
  float denominator=distance-z;
  vec2 uv=vec2(projection.x+x/denominator*projection.z,1.0-projection.y-y/denominator*projection.w);
  float mu=(distance*z-1.0)/sqrt(distance*distance+1.0-2.0*distance*z);
  float coverage=smoothstep(.12,.2,mu);
  if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))coverage=0.0;
  // Explicit level 0 and tile-center clamp prevent cross-frame mip/edge contamination.
  uv=clamp(uv,vec2(.5/1024.0),vec2(1.0-.5/1024.0));
  float value=textureLod(u_atlas,vec2((uv.x+frame)*.5,uv.y),0.0).r;
  return vec2(value,coverage);
}
float emissivity(vec3 point,vec3 normal,vec3 tangent,float arcRadius,float width,float gain,float offset){
  float radius=length(point);
  if(radius<1.0||radius>u_extent)return 0.0;
  float x=dot(point,tangent),y=dot(point,normal)-sqrt(1.0-arcRadius*arcRadius);
  if(y<0.0)return 0.0;
  float z=dot(point,cross(normal,tangent));
  float radial=length(vec2(x,y))-arcRadius;
  float d2=(radial*radial+z*z)/(width*width);
  if(d2>16.0)return 0.0;
  float angle=atan(y,x),flow=.7+.3*cos(4.0*angle-u_phase+offset);
  return exp(-.5*d2)*gain*flow;
}
float quietIntensity(float axisZ,float distance,float row){
  // The observed face follows the radial median. The Sun has no night side, but
  // mirroring that curve through |mu| would repeat 171 limb brightening as a
  // bullseye around the anti-observer point. Past the limb, ease from the limb
  // value to the disk-center value instead: continuous, flat, still observed.
  float mu=(distance*axisZ-1.0)/sqrt(max(distance*distance+1.0-2.0*distance*axisZ,1e-12));
  if(mu>=0.0)return texture(u_quiet,vec2(min(mu,1.0),row)).r;
  float limb=texture(u_quiet,vec2(0.0,row)).r,center=texture(u_quiet,vec2(1.0,row)).r;
  return mix(limb,center,smoothstep(0.0,0.6,-mu));
}
vec3 presentGold(vec3 c){
  // Normalized shoulder: slope k/(1-exp(-k)) near black, exactly 1 at full scale.
  // A linear gain followed by the output clamp red-clipped half the observed disk.
  if(u_displayGain<=0.0)return c;
  return (1.0-exp(-u_displayGain*c))/(1.0-exp(-u_displayGain));
}
void main(){
  if(length(u_camObj)<=1.0)discard;
  vec3 direction=normalize(v_obj-u_camObj);
  vec2 outer=sphereRay(u_camObj,direction,u_extent);
  if(outer.y<=max(0.0,outer.x))discard;
  vec2 inner=sphereRay(u_camObj,direction,1.0);
  bool surfaceHit=inner.y>=inner.x&&inner.x>0.0;
  if(u_pass==1&&!surfaceHit)discard;
  float start=max(0.0,outer.x),finish=surfaceHit?min(outer.y,inner.x):outer.y;
  vec3 color=vec3(0.0);
  float opacity=0.0;
  if(surfaceHit&&u_pass!=2){
    vec3 point=normalize(u_camObj+direction*inner.x);
    vec2 a=sourceIntensity(point,u_sourceBasis0,u_projection0,u_observerRadii.x,0.0);
    vec2 b=sourceIntensity(point,u_sourceBasis1,u_projection1,u_observerRadii.y,1.0);
    float coverage=mix(a.y,b.y,u_frameMix);
    float value=mix(a.x*a.y,b.x*b.y,u_frameMix)/max(coverage,1e-8);
    // Where AIA did not see the disk, keep the observed radial median. That is
    // self-luminous quiet corona, not a dark hemisphere and not invented spots.
    // Whole-sphere arches are a separate educational volume, not disk imagery.
    float quiet=mix(quietIntensity(dot(point,u_sourceBasis0[2]),u_observerRadii.x,0.25),
      quietIntensity(dot(point,u_sourceBasis1[2]),u_observerRadii.y,0.75),u_frameMix);
    color=presentGold(gold(mix(quiet,value,coverage)));
    opacity=1.0;
  }
  float emission=0.0;
  for(int arc=0;arc<24;arc++){
    if(u_pass==1)break;
    vec3 normal=u_loopNormal[arc].xyz,tangent=u_loopTangent[arc].xyz;
    float radius=u_loopNormal[arc].w,width=u_loopTangent[arc].w,gain=u_loopGain[arc];
    if(gain<=0.0)continue;
    vec3 center=normal*sqrt(1.0-radius*radius);
    vec2 bounds=sphereRay(u_camObj-center,direction,radius+4.0*width);
    float nearArc=max(start,bounds.x),farArc=min(finish,bounds.y);
    if(farArc<=nearArc)continue;
    float stepLength=(farArc-nearArc)/32.0;
    for(int sampleIndex=0;sampleIndex<32;sampleIndex++){
      float t=nearArc+(float(sampleIndex)+.5)*stepLength;
      emission+=emissivity(u_camObj+t*direction,normal,tangent,radius,width,gain,float(arc)*.47)*stepLength;
    }
  }
  // Fixed display exposure, not a measured EUV response or optically thick extinction model.
  float glow=1.0-exp(-35.0*emission);
  // Applied after the exponential so saturated arches still dim and recover.
  // In phase around the whole limb; a traveling wave alone stays hidden once glow clamps.
  float pulse=.7+.3*cos(u_phase);
  color+=vec3(1.0,.58,.12)*glow*pulse;
  // Shell RGB is added after the off-limb divide. That divide recovers arcade hue
  // from a premultiplied glow; applying it to the shell cancels the pulse.
  vec3 shellColor=vec3(0.0);
  float shellCover=0.0;
  if(u_pass!=1 && u_coronaGlow>0.0){
    // A breathing shell around the whole limb. Brighter near the photosphere,
    // never a measured electron corona, and off unless the live view asks for it.
    float impact=length(cross(u_camObj,direction));
    float limb=impact>1.0 && impact<u_extent ? 1.0-smoothstep(1.02,u_extent,impact) : 0.0;
    shellColor=vec3(1.0,.78,.32)*limb*pulse*u_coronaGlow;
    shellCover=limb*u_coronaGlow;
  }
  if(u_pass!=1 && u_cmeProgress>0.0 && u_cmeProgress<1.0){
    float front=mix(1.06,u_extent*0.98,u_cmeProgress);
    vec2 hit=sphereRay(u_camObj,direction,front);
    vec2 photo=sphereRay(u_camObj,direction,1.0);
    float t=max(hit.x,0.0);
    if(hit.y>t && (photo.y<=photo.x || t<photo.x)){
      vec3 point=u_camObj+direction*t;
      float radial=length(point);
      vec3 nrm=point/max(radial,1e-4);
      float facing=smoothstep(0.2,0.9,dot(nrm,normalize(u_cmeAxis)));
      float band=exp(-pow((radial-front)/max(0.03+0.04*u_cmeProgress,1e-3),2.0));
      float fade=1.0-u_cmeProgress;
      shellColor+=vec3(1.0,.62,.18)*facing*band*fade;
      shellCover=max(shellCover,facing*band*fade);
    }
  }
  opacity=max(opacity,glow);
  if(opacity<.001 && shellCover<.001)discard;
  // The modeled corona is optically thin emission, not an opaque outer bounding sphere.
  // Production pass 2 uses ONE, ONE with depth writes off, preserving the background.
  // Its submission precedes nearer transparent rings/atmospheres so those can attenuate it.
  if(u_pass==2)o=vec4(displayOutput(color+shellColor),0.0);
  else {
    if(!surfaceHit)color/=max(opacity,1e-8);
    color+=shellColor;
    opacity=max(opacity,shellCover);
    o=vec4(displayOutput(clamp(color,0.0,1.0)),opacity);
  }
  float depthTime=surfaceHit?inner.x:start;
  vec4 clip=u_mvp*vec4(u_camObj+direction*depthTime,1.0);
  gl_FragDepth=clamp(.5*(clip.z/clip.w)+.5,0.0,1.0);
}`;
