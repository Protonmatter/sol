import {LAB_SCENE_FS,LAB_BLUR_FS} from './sunLookRecipe.js';
import {DISPLAY_COMPOSITION_GLSL} from './materialColor.js';

export const SUN_LOOK_VS=`#version 300 es
out vec2 v_uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);v_uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
export const SUN_LOOK_COMPOSITE_VS=`#version 300 es
uniform vec4 u_rect;out vec2 v_uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);v_uv=p;gl_Position=vec4(mix(u_rect.xy,u_rect.zw,p),0.,1.);}`;

const RAYS=`
uniform vec4 u_rect;
uniform vec3 u_camera,u_rayX,u_rayY,u_rayZ;
vec3 viewRay(vec2 uv){vec2 ndc=mix(u_rect.xy,u_rect.zw,uv);return normalize(u_rayZ+ndc.x*u_rayX+ndc.y*u_rayY);}
float hitSun(vec3 rd){float d=1.-dot(cross(u_camera,rd),cross(u_camera,rd));return d>=0.?-dot(u_camera,rd)-sqrt(d):-1.;}
`;
function substitute(text,old,next){
  if(text.split(old).length!==2)throw new Error('Approved Sun shader adapter no longer matches its source');
  return text.replace(old,next);
}

let scene=substitute(LAB_SCENE_FS,'out vec4 o;','out vec4 o;\n'+RAYS+'\nuniform mat3 u_viewBasis;');
scene=substitute(scene,`  return ry*rx;`,`  return u_viewBasis;`);
scene=substitute(scene,`  vec2 uv=(gl_FragCoord.xy-.5*u_res)/(.5*u_res.y);
  vec2 q=uv*u_scale;float b=length(q);`, `  vec3 rd=viewRay(gl_FragCoord.xy/u_res);
  float t=hitSun(rd);
  vec3 closest=u_camera-rd*dot(u_camera,rd);
  float b=length(closest);
  if(dot(u_camera,rd)>=0. || b>=2.1)discard;
  vec2 projected=vec2(dot(closest,u_viewBasis[0]),dot(closest,u_viewBasis[1]));
  vec2 q=projected/max(length(projected),1e-8)*b;`);
scene=substitute(scene,`  if(b<1.){
    vec3 nw=vec3(q,sqrt(1.-b*b));float mu=nw.z;
    vec3 p=B*nw;`, `  if(t>0.){
    vec3 p=normalize(u_camera+rd*t);float mu=max(0.,dot(p,-rd));`);
scene=substitute(scene,'  o=vec4(I,P,0.,1.);','  float fade=1.-smoothstep(1.7,2.1,b);o=vec4(I*fade,P*fade,0.,1.);');
export const SUN_LOOK_SCENE_FS=scene;
export const SUN_LOOK_BLUR_FS=LAB_BLUR_FS;

// The palette is applied once, after scalar-intensity bloom, as in the approved lab.
// The disk writes its actual perspective surface depth. Off-limb emission is a
// thin artistic layer at closest approach to the Sun, tested against scene depth.
export const SUN_LOOK_COMPOSITE_FS=`#version 300 es
precision highp float;in vec2 v_uv;out vec4 o;
${RAYS}
${DISPLAY_COMPOSITION_GLSL}
uniform sampler2D u_scene,u_blur;
uniform mat4 u_mvp;uniform int u_pass;
vec3 palette(float I){I=max(I,0.);return vec3(1.-exp(-2.3*I),1.-exp(-.68*pow(I,1.4)),1.-exp(-.1*pow(I,2.4)));}
void main(){
  vec3 rd=viewRay(v_uv);float t=hitSun(rd);
  if((u_pass==1 && t<=0.) || (u_pass==2 && t>0.))discard;
  if(dot(u_camera,rd)>=0.)discard;
  vec4 s=texture(u_scene,v_uv),g=texture(u_blur,v_uv);
  vec3 color=palette(s.r+1.1*g.r)+vec3(1.,.28,.05)*(1.-exp(-(s.g+.8*g.g)*1.3));
  if(u_pass==2 && max(color.r,max(color.g,color.b))<.0001)discard;
  vec3 p=u_camera+rd*(u_pass==1?t:-dot(u_camera,rd));
  vec4 clip=u_mvp*vec4(p,1.);float depth=clip.z/clip.w*.5+.5;
  if(depth<0. || depth>1.)discard;
  gl_FragDepth=depth;o=vec4(displayOutput(color),u_pass==1?1.:0.);
}`;
