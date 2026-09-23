import {SOLAR_COOL_PLASMA_GLSL} from './solarCoolPlasma.js';
// Finite Gaussian cylinders. Geometry carries only a conservative ray footprint;
// neither its skin nor the traced magnetic curve is an opaque material.
export const SOLAR_STRAND_VS=`#version 300 es
precision highp float;
layout(location=0) in vec4 a_start;
layout(location=1) in vec4 a_end;
layout(location=2) in vec4 a_pulse;
layout(location=3) in vec4 a_arc;
uniform mat4 u_mvp;
uniform vec3 u_camera,u_rotation;
uniform float u_seconds,u_thin;
out vec3 v_plane;
flat out vec4 v_start,v_end,v_pulse,v_arc;
vec3 advect(vec3 p){float s=p.z/length(p);float s2=s*s;
 float angle=(u_rotation.x+u_rotation.y*s2+u_rotation.z*s2*s2)*.017453292519943295*u_seconds/86400.;
 float c=cos(angle),q=sin(angle);return vec3(c*p.x-q*p.y,q*p.x+c*p.y,p.z);}
void main(){
 vec3 a=advect(a_start.xyz),b=advect(a_end.xyz),center=(a+b)*.5;
 vec3 view=normalize(u_camera-center),right=normalize(cross(abs(view.z)>.95?vec3(0,1,0):vec3(0,0,1),view));
 vec3 up=cross(view,right);float thin=u_thin>0.?u_thin:1.,radius=length(b-a)*.5+4.*thin*a_start.w;
 float distanceToCamera=length(u_camera-center);
 float bound=radius/sqrt(max(.01,1.-radius*radius/(distanceToCamera*distanceToCamera)));
 vec2 corner=vec2((gl_VertexID==1||gl_VertexID==2||gl_VertexID==4)?1.:-1.,(gl_VertexID==2||gl_VertexID==4||gl_VertexID==5)?1.:-1.);
 v_plane=center+bound*(right*corner.x+up*corner.y);
 v_start=vec4(a,thin*a_start.w);v_end=vec4(b,a_end.w);v_pulse=a_pulse;v_arc=a_arc;
 gl_Position=u_mvp*vec4(v_plane,1.);
}`;
export const SOLAR_STRAND_FS=`#version 300 es
precision highp float;
in vec3 v_plane;
flat in vec4 v_start,v_end,v_pulse,v_arc;
uniform vec3 u_camera,u_rotation;
uniform mat4 u_mvp;
uniform float u_seconds;
uniform int u_channel,u_transfer;
out vec4 o;
${SOLAR_COOL_PLASMA_GLSL}
float erfApprox(float x){float s=sign(x);x=abs(x);float t=1./(1.+.3275911*x);
 return s*(1.-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*exp(-x*x));}
float integral(float A,float B,float C,float lo,float hi){
 if(A<1e-8)return exp(-C)*(hi-lo);
 float r=sqrt(A),m=B/A;
 return max(0.,.88622692545/r*exp(min(0.,B*B/A-C))*(erfApprox(r*(hi+m))-erfApprox(r*(lo+m))));
}
float sheetIntegral(float A,float B,float C,float lo,float hi,float cut,float transmission){
 float split=clamp(cut,lo,hi);
 return integral(A,B,C,lo,split)+transmission*integral(A,B,C,split,hi);
}
void main(){
 vec3 ray=normalize(v_plane-u_camera),axis=normalize(v_end.xyz-v_start.xyz),q=u_camera-v_start.xyz;
 float L=length(v_end.xyz-v_start.xyz),z=dot(q,axis),dz=dot(ray,axis);
 vec3 qr=q-axis*z,dr=ray-axis*dz;
 float A=dot(dr,dr),B=dot(qr,dr),C=dot(qr,qr),radius=4.*v_start.w;
 float lo=0.,hi=1e6;
 if(abs(dz)<1e-7){if(z<0.||z>L)discard;}else{float x=-z/dz,y=(L-z)/dz;lo=max(lo,min(x,y));hi=min(hi,max(x,y));}
 if(A<1e-8){if(C>radius*radius)discard;}else{float d=B*B-A*(C-radius*radius);if(d<0.)discard;
  float s=sqrt(d);lo=max(lo,(-B-s)/A);hi=min(hi,(-B+s)/A);}
 // Clip to the nearest opaque photosphere, including the complete far side.
 float mid=-dot(u_camera,ray),disc=1.-dot(cross(u_camera,ray),cross(u_camera,ray));
 if(disc>=0.)hi=min(hi,mid-sqrt(disc));
 if(hi<=lo)discard;
 float center=(lo+hi)*.5,halfWidth=(hi-lo)*.5;
 vec3 radial=qr+center*dr;
 float variance=2.*v_start.w*v_start.w;
 A=dot(dr,dr)/variance;B=dot(radial,dr)/variance;C=dot(radial,radial)/variance;
 vec2 sheet=coolSheet(u_camera,ray,1e6,u_seconds,u_rotation);
 float cut=sheet.x>0.?sheet.x-center:halfWidth,transmission=exp(-sheet.y);
 float emission=sheetIntegral(A,B,C,-halfWidth,halfWidth,cut,transmission);
 float age=u_seconds-v_pulse.x;
 if(age>0.&&age<v_pulse.y){
  float arcScale=v_arc.z/L,arcDerivative=dz*arcScale;
  float w2=2.*v_arc.y*v_arc.y,offset=v_arc.x+(z+center*dz)*arcScale-age*v_pulse.z;
  float pulse=sheetIntegral(A+arcDerivative*arcDerivative/w2,B+offset*arcDerivative/w2,C+offset*offset/w2,-halfWidth,halfWidth,cut,transmission);
  emission+=v_pulse.w*pow(sin(3.141592653589793*age/v_pulse.y),2.)*pulse;
 }
 emission*=v_end.w;
 if(emission<1e-9)discard;
 vec4 clip=u_mvp*vec4(u_camera+lo*ray,1.);gl_FragDepth=clip.z/clip.w*.5+.5;
 // Linear light only. The caller accumulates and performs one display transfer.
 o=u_transfer==1?vec4(emission,0.,0.,0.):vec4(u_channel==1?vec3(emission*2.):emission*40.*vec3(1.,.55,.10),0.);
}`;
