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
// procedural shading so crater and granulation detail survives beneath real macro-geography;
// 2 = MOON MOSAIC (a USGS global mosaic browse rendering), which is REPLACE divided by the
// map's own mean level — see the branch below for why that division is the honest form.
uniform int u_useTex; uniform int u_texMode; uniform sampler2D u_tex;
// u_sunA: the SDO disk-centre direction (Sun→Earth at capture time) in the SUN'S BODY FRAME —
// see sunDiskBasis() in orrery.js. Body-frame, not camera: the image must co-rotate with the
// Sun's real spin, not follow the eye around.
uniform vec3 u_sunA;
// Ring-shadow inputs: light direction in the body frame, the annulus radii in units of the
// equatorial radius ((0,0) = the body has no rings), the polar/equatorial ratio (the ray must
// start from the OBLATE surface, not the unit sphere), and the 1-D radial opacity profile
// baked from the same model that colours the drawn ring (ringOpacityProfile) — so each band's
// shadow is exactly as dark as the band is optically thick, and the Cassini Division lets
// sunlight through for free.
uniform vec3 u_lightObj; uniform vec2 u_ringRad; uniform float u_oblate; uniform sampler2D u_ringTex;
// Moon transit shadows — Io and Europa crossing Jupiter's disc, as in a telescope. Everything
// here is in the planet's BODY frame and in units of its EQUATORIAL radius, which is what makes
// the shadow honest on an exaggerated globe: the moon positions come from moonshadows.js, which
// computes them from PHYSICAL planetocentric offsets, never from the inflated ones the markers
// are drawn at. Fractional-radius coordinates are scale-invariant, so the same numbers land the
// shadow in the right place on a disc drawn 26x too large and on the true-scale one.
//   u_moonShadowPos[i]  = (moon centre, equatorial radii ; moon radius, equatorial radii)
//   u_moonShadowAxis[i] = (unit Sun->moon direction        ; Sun's angular radius from it, rad)
// The axis is per-moon and is NOT u_lightObj: a transiting Io sits up to 9.2e-5 rad off the
// planet->Sun line, worth ~30 km of shadow displacement, systematically away from the sub-solar
// point. u_moonShadowCount is 0 whenever no transit is in progress — which is the overwhelming
// majority of frames — and the whole block below is skipped.
const int MOON_SHADOWS=4;
uniform int u_moonShadowCount; uniform vec4 u_moonShadowPos[MOON_SHADOWS]; uniform vec4 u_moonShadowAxis[MOON_SHADOWS];
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
    // Warm-white visible-light display. The photosphere is white in space; the slight warmth
    // preserves surface contrast against the pure-white UI without presenting an observation
    // palette as the Sun's natural colour.
    vec3 c=mix(vec3(0.82,0.79,0.72),vec3(1.0,0.98,0.92),0.45+0.6*g);
    c+=vec3(0.08,0.075,0.06)*smoothstep(0.6,0.95,fac); // faculae — subtle, not cream blotches
    c=mix(c,vec3(0.20,0.18,0.15),spot*0.9);
    float limb=pow(clamp(dot(N,V),0.0,1.0),0.45); c*=0.72+0.45*limb;
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
      // HMIIC's browse JPEG is orange-colourised observation data, not a natural-colour
      // photograph. Retain its measured intensity/sunspot structure, discard the assigned
      // palette, and render it in the same warm-white visible-light palette as the far side.
      float solarLuma=dot(sc,vec3(0.299,0.587,0.114));
      // 1.35 lifts the browse frame without flattening its bright photospheric detail:
      // 1.45 clipped a material part of the committed HMI disk before final shading.
      sc=vec3(clamp(solarLuma*1.35,0.0,1.0))*vec3(1.0,0.97,0.90);
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
  // How much relief the procedural moon styles are allowed to add. u_base for a moon is its
  // catalogue HUE scaled to its published geometric albedo (moonAppearance.js), so its own
  // luminance IS the albedo scale — reusing it here means the crater field on charcoal-dark
  // Phobos is a fifth of the amplitude it has on Enceladus, instead of every moon carrying an
  // identical absolute crater contrast regardless of how much light it reflects.
  float relief=dot(u_base,vec3(0.299,0.587,0.114));
  if(u_useTex==1&&u_texMode==0){ col=texture(u_tex,vec2(uu,vv)).rgb; }
  else if(u_useTex==1&&u_texMode==2){ // real USGS moon mosaic
    // The mosaic is a browse rendering: contrast-stretched per product, single-band, with no
    // absolute photometry — Callisto's mean sits at 0.18 and Europa's at 0.57 for reasons of
    // publication, not reflectance. Only its STRUCTURE is data. So divide by the map's own
    // mean, which the 1x1 mip level gives for free, and hand the resulting pure relative-albedo
    // field to u_base, where the published geometric albedo and the catalogue hue already live.
    // The clamp stops the brightest few texels of a low-mean map from blowing out.
    vec3 avg=textureLod(u_tex,vec2(0.5,0.5),20.0).rgb;
    float mean=max(dot(avg,vec3(0.299,0.587,0.114)),0.02);
    float here=dot(texture(u_tex,vec2(uu,vv)).rgb,vec3(0.299,0.587,0.114));
    // The 0.6 exponent softens the map's OWN contrast, and it is load-bearing rather than
    // cosmetic. Each browse rendering is stretched independently — Callisto's sits at mean
    // 0.18 with a full-scale tail, Europa's at 0.57 with a narrow one — so at full strength
    // the publisher's stretch, not the measured albedo, decides which moon looks brightest:
    // it put Ganymede (0.43) above Europa (0.67) on screen, the exact inversion this release
    // exists to remove. pow() leaves 1.0 fixed, so the DISK-MEAN brightness still lands
    // exactly on the albedo; only the excursions around it are damped. The cap stops a
    // handful of blown texels in a low-mean map from carrying the whole moon.
    col=u_base*min(pow(clamp(here/mean,0.0,6.0),0.6),1.8);
  }
  else if(u_style==1){ col=vec3(0.55,0.51,0.46)*(0.75+0.5*fbm(p*6.0)); col+=craters(p,7.0); }       // Mercury
  else if(u_style==9){ float mare=1.0-smoothstep(0.46,0.52,fbm(p*2.4+vec3(3.0)));               // Moon
        col=mix(vec3(0.62,0.61,0.58),vec3(0.30,0.30,0.31),mare); col+=craters(p,8.0); }
  // Styles 10/11 exist because 1 (Mercury) and 2 (Venus) OVERWRITE col with their own hard-coded
  // colours. Reusing them for moons silently discarded every per-moon colour from the catalogue —
  // Io came out Mercury-grey rather than sulphur-yellow. These modulate u_base instead of
  // replacing it, so the texture is shared but the colour is the body's own.
  // craters() is not zero-mean: averaged over the sphere its bright rims outweigh its dark
  // floors by +0.127 at scale 7 and +0.121 at scale 9 (Monte-Carlo over 60k uniform directions
  // on this exact function). Added raw, that is a flat 12% brightening on top of whatever
  // brightness the albedo just set — enough to undo the ordering this release is here to fix.
  // Subtracting the measured mean turns the crater field back into what it is meant to be:
  // relief around the body's own level, not extra light.
  else if(u_style==10){ col=u_base*(0.78+0.44*fbm(p*6.0));                                       // rocky/icy moon
        col+=(craters(p,7.0)-0.127)*0.95*relief; }
  else if(u_style==11){ float c=fbm(p*4.0+vec3(u_time*0.03,0,0));                                // hazy moon (Titan)
        col=u_base*(0.82+0.36*c); }
  else if(u_style==12){                                                                          // smooth bright ice (Europa)
    // Europa is not a cratered iceball and must not be drawn as one. Its surface is the youngest
    // in the outer solar system — crater counts give ~40–90 Myr, and only ~24 impact craters
    // larger than 5 km are known on the whole moon (Bierhaus, Zahnle & Chapman 2009, "Europa's
    // crater distributions and surface ages", in *Europa*, Univ. Arizona Press, pp. 161–180) —
    // so the shared moon style's saturated crater field is qualitatively wrong for it.
    // The dark banding here is ILLUSTRATIVE. Europa's lineae are real, mapped features, but this
    // is procedural noise shaped to read like them, NOT the mapped network: no position in it
    // means anything. The USGS Voyager/Galileo mosaic fetched by tools/fetch_textures.py is the
    // honest surface; this branch only runs when that file is absent or Photo textures are off.
    // Bands are deliberately THIN. A wide threshold here does not just look wrong, it darkens
    // the disc average — an early version pulled ~80% of the surface toward the band colour and
    // cost Europa 14% of the brightness its albedo had just been used to set.
    float mott=fbm(p*5.0);
    float lin=abs(fbm(p*vec3(2.0,9.0,2.0))-0.5);
    float band=1.0-smoothstep(0.004,0.028,lin);
    col=u_base*(0.995+0.10*mott);
    col=mix(col,u_base*0.72,band);
    col+=(craters(p,9.0)-0.121)*0.14*relief; }
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
        // Polar caps at their CATALOGUED extents, replacing the symmetric eyeballed band that
        // used to sit here (a cap from ~59° to ~72° in both hemispheres, which is neither).
        // Source: IAU/USGS Gazetteer of Planetary Nomenclature, target Mars — the same register
        // tools/fetch_geography.py already draws the Moon's maria from. Two approved features
        // (both 1976) carry the polar deposits, and their bounding latitudes are used verbatim:
        //   Planum Boreum  (id 4754, D = 354.63 km, centre 87.32°N) spans  80.59°N → 90°N
        //   Planum Australe(id 4753, D = 1429.87 km, centre 83.35°S) spans 71.73°S → 90°S
        // These are the PERENNIAL ice plateaus. The seasonal CO2 frost reaches far further —
        // past 50° in midwinter — but this branch has no season, so painting a seasonal cap
        // would be picking an epoch and calling it Mars. Comparing the two entries is also why
        // the caps are drawn so unequal: the southern plateau is four times the northern one.
        // sin() of each boundary, with a ±2° feather because a real ice margin is gradational.
        float capN=smoothstep(0.9802,0.9916,lat);      // sin 78.6° .. sin 82.6°  (80.59°N ±2°)
        float capS=smoothstep(0.9382,0.9599,-lat);     // sin 69.7° .. sin 73.7°  (71.73°S ±2°)
        // The north cap is bright water ice; the southern plateau is dustier ice with only a
        // small residual CO2 patch actually snow-white, so it is mixed in a touch weaker.
        col=mix(col,vec3(0.95,0.95,0.97),capN);
        col=mix(col,vec3(0.90,0.89,0.90),capS*0.88); }
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
  // How much of the Sun this surface point can still see past any transiting moon. 1 = none in
  // the way. Drop a perpendicular from the point onto each shadow axis and compare with the
  // cone's radius there: r = R_moon -/+ t*alpha, umbra and penumbra (derivation in
  // moonshadows.js). The march starts from the OBLATE surface — p is the unit-sphere object
  // coordinate and the drawn body is squashed by rPol/rEq along z, the same correction the ring
  // shadow below already makes.
  float sunVis=1.0;
  if(u_moonShadowCount>0){
    vec3 sp=vec3(p.xy,p.z*u_oblate);
    for(int i=0;i<MOON_SHADOWS;i++){
      if(i>=u_moonShadowCount) break;
      vec3 w=sp-u_moonShadowPos[i].xyz;
      float t=dot(w,u_moonShadowAxis[i].xyz);
      if(t<=0.0) continue;                       // point is sunward of the moon: nothing cast
      float perp=length(w-u_moonShadowAxis[i].xyz*t);
      float half_=u_moonShadowAxis[i].w*t;       // t*alpha: the penumbra's half-width growth
      float ru=max(u_moonShadowPos[i].w-half_,0.0);
      float rp=u_moonShadowPos[i].w+half_;
      // edge0<edge1 always: rp-ru is 2*t*alpha (>0, t guarded above) or rp itself when the umbra
      // clamps to zero. smoothstep stands in for the occulted fraction of the solar disc.
      sunVis=min(sunVis,smoothstep(ru,rp,perp));
    }
  }
  // The shadow removes DIRECT sunlight only. The 0.05 floor is the light a planet's own
  // atmosphere scatters into it, which is why Io's shadow reads as very dark grey rather than
  // as a hole in the planet.
  float shade=0.05+0.95*lambert*sunVis;
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
