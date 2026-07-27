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
  // NOTE: smoothstep edges must be increasing — reversed edges are undefined in GLSL (they
  // only "worked" through ANGLE's clamp fallback). These are the defined-form equivalents.
  float rim=smoothstep(0.6,0.92,best)-smoothstep(0.92,1.05,best); // bright rim, dark floor
  float floor_=1.0-smoothstep(0.0,0.9,best); return rim*0.5 - floor_*0.28*rnd; }
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
// u_useTex: is a surface map bound at all. u_texMode: 0 = REPLACE (a real photographic map from
// tools/fetch_textures.py, or Earth's generated coastline map — the texture IS the surface);
// 1 = MODULATE (the generated IAU albedo map, mid-grey = unchanged), which multiplies over the
// procedural shading so crater and granulation detail survives beneath real macro-geography.
uniform int u_useTex; uniform int u_texMode; uniform sampler2D u_tex;
// u_sunA: the SDO disk-centre direction (Sun→Earth at capture time) in the SUN'S BODY FRAME —
// see sunDiskBasis() in orrery.js. Body-frame, not camera: the image must co-rotate with the
// Sun's real spin, not follow the eye around.
uniform vec3 u_sunA;
// Luminance-normalised average colour of the loaded SDO disc ((0,0,0) = no frame): the
// procedural far side is re-tinted to this palette so the two hemispheres match — SDO
// colourises HMI orange, and an untinted cream far side made the boundary a glaring seam.
uniform vec3 u_sunTint;
// Ring-shadow inputs: light direction in the body frame, the annulus radii in units of the
// equatorial radius ((0,0) = the body has no rings), the polar/equatorial ratio (the ray must
// start from the OBLATE surface, not the unit sphere), and the 1-D radial opacity profile
// baked from the same model that colours the drawn ring (ringOpacityProfile) — so each band's
// shadow is exactly as dark as the band is optically thick, and the Cassini Division lets
// sunlight through for free.
uniform vec3 u_lightObj; uniform vec2 u_ringRad; uniform float u_oblate; uniform sampler2D u_ringTex;
${NOISE}
void main(){
  vec3 N=normalize(v_nrm); vec3 V=normalize(u_cam-v_world); vec3 p=normalize(v_obj);
  float lat=p.z; float fres=pow(1.0-clamp(dot(N,V),0.0,1.0),3.0);
  if(u_mode==2){ // atmosphere limb halo (additive shell) — SUNLIT SIDE ONLY. The glow is sunlight
    // scattered through the limb, so it has to die on the night side: an unmasked shell drew a
    // bright full-circumference ring that made every planet look like an annular eclipse.
    float day=smoothstep(-0.32,0.22,dot(N,normalize(u_light)));
    o=vec4(u_atmo*pow(1.0-clamp(dot(N,V),0.0,1.0),2.2)*u_atmoStr*1.4*(0.04+0.96*day), 1.0); return; }
  if(u_mode==1){ // Sun
    // procedural granulation + sunspots + limb darkening — the whole sphere when no SDO frame
    // is available, and always the far side (the SDO image only covers one hemisphere).
    float g=fbm(p*9.0+vec3(u_time*0.06)); float fac=fbm(p*22.0+vec3(u_time*0.1));
    // Small, sparse dark spots where a mid-frequency field dips into its rare low tail. The
    // old reversed-edge smoothstep(0.60,0.55,…) was undefined GLSL that ANGLE evaluated as
    // "1 below 0.55" — i.e. "sunspot umbra" over half the star, which painted the whole
    // procedural Sun brown with cream blotches.
    float spot=1.0-smoothstep(0.235,0.27,fbm(p*6.0+vec3(5.0)));
    vec3 c=mix(vec3(1.0,0.66,0.26),vec3(1.0,0.95,0.70),0.45+0.6*g);
    c+=vec3(0.10,0.07,0.02)*smoothstep(0.6,0.95,fac); // faculae — subtle, not cream blotches
    c=mix(c,vec3(0.30,0.13,0.05),spot*0.9);
    float limb=pow(clamp(dot(N,V),0.0,1.0),0.45); c*=0.72+0.45*limb;
    if(u_sunTint.r>0.0){ // recolour the procedural surface to the SDO frame's own palette
      c=dot(c,vec3(0.299,0.587,0.114))*u_sunTint;
    }
    if(u_useTex==1){ // the real, latest SDO disk, wrapped SUN-FIXED on the u_sunA hemisphere.
      // Basis lives in the body frame (p, not N), so it needs no per-frame camera input and
      // cannot degenerate in the top-down view. Solar north is the body frame's +z; Earth
      // never nears the Sun's pole (b0 ≤ 7.25°), so the cross product is always well-formed.
      vec3 a=normalize(u_sunA);
      vec3 R=normalize(cross(vec3(0.0,0.0,1.0),a));
      vec3 U=cross(a,R);
      float vis=dot(p,a);
      vec2 d=vec2(dot(p,R),dot(p,U))*0.4565;                 // 0.4565 = disk radius / SDO frame width
      vec3 sc=texture(u_tex, vec2(0.5+d.x, 0.5-d.y)).rgb;
      // The HMI frame carries its own limb darkening — add only a whisper of view-angle
      // shading so the sphere still reads, not a second full limb law on top.
      sc*=0.88+0.18*limb;
      // Wide blend band: it hides the image's own limb-darkened rim (which otherwise reads as
      // a dark ring around the SDO hemisphere) under the brighter procedural surface.
      c=mix(c, sc, smoothstep(0.05,0.45,vis));
    }
    o=vec4(c,1.0); return; }
  // Equirectangular lookup: centre column = prime meridian (the body frame's +x), top row =
  // north pole. Matches surfacemap.js's lonToX/latToY exactly.
  float uu=0.5+atan(p.y,p.x)*0.1591549431; float vv=acos(clamp(p.z,-1.0,1.0))*0.3183098862;
  vec3 col=u_base;
  if(u_useTex==1&&u_texMode==0){ col=texture(u_tex,vec2(uu,vv)).rgb; }
  else if(u_style==1){ col=vec3(0.55,0.51,0.46)*(0.75+0.5*fbm(p*6.0)); col+=craters(p,7.0); }       // Mercury
  else if(u_style==9){ float mare=1.0-smoothstep(0.46,0.52,fbm(p*2.4+vec3(3.0)));               // Moon
        col=mix(vec3(0.62,0.61,0.58),vec3(0.30,0.30,0.31),mare); col+=craters(p,8.0); }
  // Styles 10/11 exist because 1 (Mercury) and 2 (Venus) OVERWRITE col with their own hard-coded
  // colours. Reusing them for moons silently discarded every per-moon colour from the catalogue —
  // Io came out Mercury-grey rather than sulphur-yellow. These modulate u_base instead of
  // replacing it, so the texture is shared but the colour is the body's own.
  else if(u_style==10){ col=u_base*(0.78+0.44*fbm(p*6.0)); col+=craters(p,7.0)*0.85; }           // rocky/icy moon
  else if(u_style==11){ float c=fbm(p*4.0+vec3(u_time*0.03,0,0));                                // hazy moon (Titan)
        col=u_base*(0.82+0.36*c); }
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
        float lon=atan(p.y,p.x); float grs=1.0-smoothstep(0.0,0.16,length(vec2((lon-2.2),(lat+0.34)*2.0)));
        col=mix(col,vec3(0.80,0.34,0.22),grs); }
  else if(u_style==6){ float warp=fbm(p*vec3(3.0,7.0,3.0));                                     // Saturn
        float b=sin(lat*18.0+1.4*warp); col=mix(vec3(0.80,0.72,0.52),vec3(0.95,0.90,0.72),smoothstep(-0.3,0.3,b)); }
  else if(u_style==7){ float b=sin(lat*10.0+fbm(p*4.0));                                        // Uranus
        col=mix(vec3(0.58,0.83,0.86),vec3(0.72,0.92,0.93),0.5+0.5*b); }
  else if(u_style==8){ float warp=fbm(p*vec3(3.0,6.0,3.0));                                     // Neptune
        float b=sin(lat*9.0+1.2*warp); col=mix(vec3(0.18,0.34,0.78),vec3(0.30,0.46,0.88),0.5+0.5*b);
        float lon=atan(p.y,p.x); col=mix(col,vec3(0.10,0.16,0.40),1.0-smoothstep(0.0,0.14,length(vec2(lon+1.0,(lat-0.3)*2.0)))); }
  // Real IAU albedo units multiplied over the procedural detail. 0.5 is the neutral level, so
  // an empty map is a no-op; 2.0 maps a fully bright patch to double and a dark one to zero.
  // The procedural crater field is deliberately damped toward the base colour first: on its own
  // it is high-contrast enough to swamp the maria, and where real mapped geography exists it
  // should lead, with the noise surviving only as surface texture under it.
  if(u_useTex==1&&u_texMode==1){
    col=mix(col,u_base,0.55);
    col*=texture(u_tex,vec2(uu,vv)).rgb*2.0;
  }
  float lambert=max(dot(N,normalize(u_light)),0.0);
  float shade=0.05+0.95*lambert;
  col*=shade;
  // Ring shadow on the planet: march from this surface point toward the Sun in the BODY frame
  // (the rings live in the equatorial z=0 plane there) and darken by the ring's own optical
  // depth where the ray crosses the annulus. The march starts from the OBLATE surface point —
  // p is the unit-sphere coordinate, but the rendered surface is squashed by rPol/rEq along z,
  // and starting a Saturn ray ~10% too high shifted every shadow boundary on the globe.
  if(u_ringRad.y>0.0){
    vec3 q=vec3(p.xy,p.z*u_oblate);
    vec3 lo=normalize(u_lightObj);
    if(abs(lo.z)>1e-4){
      float s=-q.z/lo.z;
      if(s>0.0){
        float rr=length(q.xy+lo.xy*s);
        float f=(rr-u_ringRad.x)/(u_ringRad.y-u_ringRad.x);
        if(f>0.0&&f<1.0){
          // Soft annulus mask: CLAMP_TO_EDGE LINEAR cannot interpolate toward transparency
          // past the first/last texel, so without this the shadow cut on at the boundary.
          float m=smoothstep(0.0,0.015,f)*(1.0-smoothstep(0.985,1.0,f));
          col*=1.0-0.72*m*texture(u_ringTex,vec2(f,0.5)).r;
        }
      }
    }
  }
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
uniform mat4 u_mvp; uniform mat4 u_model; out vec4 v_col; out float v_frac; out vec3 v_world;
void main(){ v_col=a_col; v_frac=a_frac; v_world=(u_model*vec4(a_pos,1.0)).xyz; gl_Position=u_mvp*vec4(a_pos,1.0); }`;
export const RING_FS = `#version 300 es
precision highp float; in vec4 v_col; in float v_frac; in vec3 v_world; out vec4 o;
uniform int u_useTex; uniform sampler2D u_tex;
// u_center/u_light/u_prad: the planet's world position, the unit direction from it toward the
// Sun, and its display radius — for the planet's shadow across the rings.
uniform vec3 u_center; uniform vec3 u_light; uniform float u_prad;
void main(){ vec4 c=v_col; if(u_useTex==1){ vec4 t=texture(u_tex, vec2(v_frac,0.5)); c=vec4(t.rgb*1.05, t.a); } if(c.a<0.02) discard;
  // The planet blocks sunlight over the part of the ring behind it (sun at infinity → a
  // shadow cylinder along -u_light). Soft-edged, strongly darkened but not black — the rings
  // scatter light into the shadow in reality, and a hint of structure should survive.
  vec3 d=v_world-u_center;
  float t=dot(d,-u_light);
  if(t>0.0){
    float axis=length(d+u_light*t);
    c.rgb*=1.0-0.82*(1.0-smoothstep(u_prad*0.97,u_prad*1.06,axis));
  }
  o=c; }`;

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
  float a=mix(step(d,1.0), 1.0-smoothstep(0.0,1.0,d), u_soft); o=vec4(v_col.rgb, v_col.a*a); }`;

export const GLOW_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform mat4 u_vp; uniform vec3 u_center; uniform vec3 u_right; uniform vec3 u_up; uniform float u_size;
out vec2 v_uv; void main(){ v_uv=a_corner; vec3 w=u_center+(a_corner.x*u_right+a_corner.y*u_up)*u_size;
  gl_Position=u_vp*vec4(w,1.0); }`;
export const GLOW_FS = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o; uniform vec3 u_color; uniform float u_pow;
void main(){ float r=length(v_uv); if(r>1.0) discard; float a=pow(1.0-r,u_pow); o=vec4(u_color*a,a); }`;
