// GLSL sources for the 3-D view's five programs (WebGL2 / GLSL ES 3.00). Pure string
// constants — extracted from orrery.js so the renderer file holds plumbing, not shader
// text. NOISE is the shared value-noise/fbm/crater library interpolated into SPHERE_FS.

const NOISE = `
float h31(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
float craters(vec3 p,float sc){ p*=sc; vec3 ip=floor(p); float best=1e9,rnd=0.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){ vec3 c=ip+vec3(x,y,z);
    vec3 o=vec3(h31(c),h31(c+11.0),h31(c+23.0)); float rad=0.32+0.5*h31(c+37.0);
    float d=length(p-(c+o))/rad; if(d<best){ best=d; rnd=h31(c+53.0);} }
  float rim=smoothstep(1.05,0.92,best)-smoothstep(0.92,0.6,best); // bright rim, dark floor
  float floor_=smoothstep(0.9,0.0,best); return rim*0.5 - floor_*0.28*rnd; }
`;

export const SPHERE_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm;
uniform mat4 u_mvp; uniform mat4 u_model; uniform mat3 u_nmat;
out vec3 v_obj; out vec3 v_world; out vec3 v_nrm;
void main(){ v_obj=a_pos; v_world=(u_model*vec4(a_pos,1.0)).xyz; v_nrm=normalize(u_nmat*a_nrm); gl_Position=u_mvp*vec4(a_pos,1.0); }`;

export const SPHERE_FS = `#version 300 es
precision highp float;
in vec3 v_obj; in vec3 v_world; in vec3 v_nrm; out vec4 o;
uniform int u_style; uniform int u_mode; uniform float u_time;
uniform vec3 u_base; uniform vec3 u_light; uniform vec3 u_cam; uniform vec3 u_atmo; uniform float u_atmoStr;
uniform int u_useTex; uniform sampler2D u_tex;
// Sun-fixed SDO projection basis (object space) + the channel's disk-radius/frame ratio.
uniform vec3 u_sunA; uniform vec3 u_sunR; uniform vec3 u_sunU; uniform float u_diskScale;
${NOISE}
void main(){
  vec3 N=normalize(v_nrm); vec3 V=normalize(u_cam-v_world); vec3 p=normalize(v_obj);
  float lat=p.z; float fres=pow(1.0-clamp(dot(N,V),0.0,1.0),3.0);
  if(u_mode==2){ // atmosphere limb halo (additive shell)
    o=vec4(u_atmo*pow(1.0-clamp(dot(N,V),0.0,1.0),2.2)*u_atmoStr*1.4, 1.0); return; }
  if(u_mode==1){ // Sun
    // Procedural granulation + sunspots + limb darkening — the full-surface model, and the
    // far-side fallback when a live SDO channel is wrapped on the near side.
    float g=fbm(p*9.0+vec3(u_time*0.06)); float fac=fbm(p*22.0+vec3(u_time*0.1));
    float spot=smoothstep(0.60,0.55,fbm(p*3.2+vec3(5.0)));
    vec3 proc=mix(vec3(1.0,0.50,0.10),vec3(1.0,0.92,0.55),0.45+0.6*g);
    proc+=vec3(0.25,0.18,0.05)*smoothstep(0.6,0.95,fac); // faculae
    proc=mix(proc,vec3(0.30,0.13,0.05),spot*0.9);
    float limb=pow(clamp(dot(N,V),0.0,1.0),0.45); proc*=0.55+0.7*limb;
    if(u_useTex==1){
      // The live SDO image is a photo of the EARTH-FACING disk. Project it in the
      // SUN-FIXED frame: u_sunA/u_sunR/u_sunU are object-space basis vectors computed
      // once per texture from the Earth direction at load time, so the model matrix's
      // IAU rotation carries the active regions around with the Sun's real ~25-day spin —
      // they stay fixed on the surface instead of following the camera. The far side is
      // the procedural model (we cannot see it), blended across the limb.
      float vis=dot(p,u_sunA);
      vec2 d=vec2(dot(p,u_sunR),dot(p,u_sunU))*u_diskScale;  // diskScale = disk radius / SDO frame width
      vec3 sc=texture(u_tex, vec2(0.5+d.x, 0.5-d.y)).rgb;
      float shade=0.65+0.5*pow(clamp(vis,0.0,1.0),0.45);     // continue the photo's own limb falloff
      float w=smoothstep(0.02,0.20,vis);                     // near-side photo → far-side procedural
      o=vec4(mix(proc, sc*shade, w), 1.0); return; }
    o=vec4(proc,1.0); return; }
  vec3 col=u_base;
  if(u_useTex==1){ float uu=0.5+atan(p.y,p.x)*0.1591549431; float vv=acos(clamp(p.z,-1.0,1.0))*0.3183098862; col=texture(u_tex,vec2(uu,vv)).rgb; }
  else if(u_style==1){ col=vec3(0.55,0.51,0.46)*(0.75+0.5*fbm(p*6.0)); col+=craters(p,7.0); }       // Mercury
  else if(u_style==9){ float mare=smoothstep(0.52,0.46,fbm(p*2.4+vec3(3.0)));                   // Moon
        col=mix(vec3(0.62,0.61,0.58),vec3(0.30,0.30,0.31),mare); col+=craters(p,8.0); }
  else if(u_style==2){ float c=fbm(p*4.0+vec3(u_time*0.03,0,0));                                // Venus
        col=mix(vec3(0.86,0.78,0.55),vec3(0.97,0.93,0.78),c); }
  else if(u_style==3){ float cont=fbm(p*2.3+vec3(11.0));                                        // Earth
        float land=smoothstep(0.50,0.54,cont); float ice=smoothstep(0.80,0.90,abs(lat));
        vec3 ground=mix(vec3(0.16,0.40,0.15),vec3(0.50,0.42,0.25),smoothstep(0.25,0.6,fbm(p*5.0)));
        ground=mix(ground,vec3(0.22,0.34,0.13),smoothstep(0.0,0.4,abs(lat))*0.4);
        vec3 surf=mix(vec3(0.04,0.20,0.42),ground,land); surf=mix(surf,vec3(0.95,0.96,0.98),ice);
        float cl=smoothstep(0.58,0.78,fbm(p*3.2+vec3(u_time*0.02,0.0,0.0))); col=mix(surf,vec3(1.0),cl*0.55); }
  else if(u_style==4){ float a=fbm(p*3.4+vec3(7.0));                                            // Mars
        col=mix(vec3(0.78,0.36,0.22),vec3(0.55,0.26,0.16),a); col+=craters(p,6.0)*0.6;
        col=mix(col,vec3(0.95,0.95,0.97),smoothstep(0.86,0.95,abs(lat))); }
  else if(u_style==5){ float warp=fbm(p*vec3(3.0,8.0,3.0));                                     // Jupiter
        float b=sin(lat*22.0+1.6*warp); vec3 zone=vec3(0.92,0.85,0.70),belt=vec3(0.72,0.52,0.36);
        col=mix(belt,zone,smoothstep(-0.3,0.3,b)); col*=0.9+0.2*fbm(p*vec3(10.0,3.0,10.0));
        float lon=atan(p.y,p.x); float grs=smoothstep(0.16,0.0,length(vec2((lon-2.2),(lat+0.34)*2.0)));
        col=mix(col,vec3(0.80,0.34,0.22),grs); }
  else if(u_style==6){ float warp=fbm(p*vec3(3.0,7.0,3.0));                                     // Saturn
        float b=sin(lat*18.0+1.4*warp); col=mix(vec3(0.80,0.72,0.52),vec3(0.95,0.90,0.72),smoothstep(-0.3,0.3,b)); }
  else if(u_style==7){ float b=sin(lat*10.0+fbm(p*4.0));                                        // Uranus
        col=mix(vec3(0.58,0.83,0.86),vec3(0.72,0.92,0.93),0.5+0.5*b); }
  else if(u_style==8){ float warp=fbm(p*vec3(3.0,6.0,3.0));                                     // Neptune
        float b=sin(lat*9.0+1.2*warp); col=mix(vec3(0.18,0.34,0.78),vec3(0.30,0.46,0.88),0.5+0.5*b);
        float lon=atan(p.y,p.x); col=mix(col,vec3(0.10,0.16,0.40),smoothstep(0.14,0.0,length(vec2(lon+1.0,(lat-0.3)*2.0)))); }
  float lambert=max(dot(N,normalize(u_light)),0.0);
  float shade=0.05+0.95*lambert;
  col*=shade;
  col+=u_atmo*fres*u_atmoStr*(0.25+0.75*lambert); // atmospheric scattering on the disc rim
  o=vec4(col,1.0);
}`;

export const LINE_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_col;
uniform mat4 u_vp; out vec3 v_col; void main(){ v_col=a_col; gl_Position=u_vp*vec4(a_pos,1.0); }`;
export const LINE_FS = `#version 300 es
precision highp float; in vec3 v_col; out vec4 o; uniform float u_alpha;
void main(){ o=vec4(v_col,u_alpha); }`;

export const RING_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec4 a_col; layout(location=2) in float a_frac;
uniform mat4 u_mvp; out vec4 v_col; out float v_frac;
void main(){ v_col=a_col; v_frac=a_frac; gl_Position=u_mvp*vec4(a_pos,1.0); }`;
export const RING_FS = `#version 300 es
precision highp float; in vec4 v_col; in float v_frac; out vec4 o; uniform int u_useTex; uniform sampler2D u_tex;
void main(){ vec4 c=v_col; if(u_useTex==1){ vec4 t=texture(u_tex, vec2(v_frac,0.5)); c=vec4(t.rgb*1.05, t.a); } if(c.a<0.02) discard; o=c; }`;

export const PT_VS = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in float a_size; layout(location=2) in vec4 a_col;
uniform mat4 u_vp; uniform float u_dpr; uniform float u_shearT; uniform float u_shearK; uniform float u_shearRc;
out vec4 v_col;
void main(){
  v_col=a_col;
  vec3 p=a_pos;
  // Differential (galactic) rotation: a flat rotation curve gives angular speed Ω(r)=K/r, so inner
  // stars lap outer ones and any spiral feature shears/winds up over time (the "winding problem").
  // Inside Rc the disc turns rigidly (Ω=K/Rc), which both matches a real galaxy's rising inner curve
  // and avoids the r→0 singularity. u_shearT=0 (every non-galaxy draw) ⇒ no rotation.
  if(u_shearT!=0.0){
    float r=max(length(p.xy),u_shearRc);
    float ang=u_shearK/r*u_shearT;
    float c=cos(ang), s=sin(ang);
    p.xy=vec2(c*p.x - s*p.y, s*p.x + c*p.y);
  }
  gl_Position=u_vp*vec4(p,1.0); gl_PointSize=a_size*u_dpr;
}`;
export const PT_FS = `#version 300 es
precision highp float; in vec4 v_col; out vec4 o; uniform float u_soft;
void main(){ float d=length(gl_PointCoord-vec2(0.5))*2.0; if(d>1.0) discard;
  float a=mix(step(d,1.0), smoothstep(1.0,0.0,d), u_soft); o=vec4(v_col.rgb, v_col.a*a); }`;

export const GLOW_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform mat4 u_vp; uniform vec3 u_center; uniform vec3 u_right; uniform vec3 u_up; uniform float u_size;
out vec2 v_uv; void main(){ v_uv=a_corner; vec3 w=u_center+(a_corner.x*u_right+a_corner.y*u_up)*u_size;
  gl_Position=u_vp*vec4(w,1.0); }`;
export const GLOW_FS = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o; uniform vec3 u_color; uniform float u_pow;
void main(){ float r=length(v_uv); if(r>1.0) discard; float a=pow(1.0-r,u_pow); o=vec4(u_color*a,a); }`;
