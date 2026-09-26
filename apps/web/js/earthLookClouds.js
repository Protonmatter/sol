// Recovered from SOL Planet Look Lab v7, source 12f633b27e435479f4b2322b613f8dd204847d2e.
// Display recipe only; not measured weather or optical transport.
// Shared display geometry. These are illustrative choices, not retrieved weather.
export const EARTH_CLOUD_RADIUS = 1 + 8 / 6378.137;
const clamp = (v) => Math.max(0, Math.min(1, v));
export function cloudShellPoint(x, y) {
    const z2 = EARTH_CLOUD_RADIUS ** 2 - x * x - y * y;
    return z2 < 0 ? null : [x / EARTH_CLOUD_RADIUS, y / EARTH_CLOUD_RADIUS, Math.sqrt(z2) / EARTH_CLOUD_RADIUS];
}
export function cloudShadowPoint(p, light) {
    const a = light.reduce((v, n) => v + n * n, 0), b = p.reduce((v, n, i) => v + n * light[i], 0);
    const c = p.reduce((v, n) => v + n * n, 0) - EARTH_CLOUD_RADIUS ** 2;
    const root = Math.sqrt(Math.max(0, b * b - a * c));
    const t = b >= 0 ? -c / Math.max(root + b, 1e-12) : (root - b) / Math.max(a, 1e-12);
    return p.map((v, i) => (v + light[i] * t) / EARTH_CLOUD_RADIUS);
}
export function advanceEarthCloudPhase(phase, dt, speed, rotation, reducedMotion = false) {
    if (!rotation || reducedMotion || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(speed) || speed === 0)
        return phase;
    // Accelerated display drift: visible against coastlines in a short viewing session.
    // This is a uniform translation of the archive map, not weather evolution.
    const step = Math.min(dt, .1) * Math.max(-20, Math.min(20, speed)) * .055 / (2 * Math.PI) * .35;
    return ((phase + step) % 1 + 1) % 1;
}
export function gradeOcean(c, ocean) {
    const blue = Math.max(0, c[2] - Math.max(c[0], c[1])), bright = Math.max(...c);
    const weight = ocean * Math.min(1, blue / .03) * clamp((.25 - bright) / .1);
    const luminance = c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    return c.map(v => v * (1 - weight) + (v * .8 + luminance * .2) * .55 * weight);
}
// Stage 1: an illustrative volume constrained by the historical coverage map.
// Coverage is NOT a measurement of cloud height. Future weather fields can
// replace the density provider without changing the ray/lighting integration.
export const CLOUD_BASE = 1 + 1 / 6378.137;
export const CLOUD_TOP = 1 + 12 / 6378.137;
const CLOUD_THICKNESS = CLOUD_TOP - CLOUD_BASE;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// The archive alpha was fitted for a flat composite, not optical depth.
// Remove weak haze and lower mid-density coverage before volume integration.
// Share the same remap with sunlight/shadows and sharp fallback reconstruction.
const CLOUD_HAZE_FLOOR = .08, CLOUD_COVERAGE_POWER = 1.5, CLOUD_OPACITY_MAX = .9;
export function volumeCloudOpacity(coverage) {
    return CLOUD_OPACITY_MAX * Math.pow(clamp((coverage - CLOUD_HAZE_FLOOR) / (1 - CLOUD_HAZE_FLOOR)), CLOUD_COVERAGE_POWER);
}
// Local, soft relief inferred from the archive's cloud detail. This changes
// illumination only: shell geometry, optical density and ground shadows stay intact.
// Sample in a spherical Sun-tangent direction to avoid UV seams/pole axes.
export function cloudTextureLighting(n, light, coverage, footprint = .003) {
    const mu = n[0] * light[0] + n[1] * light[1] + n[2] * light[2];
    if (mu <= 0)
        return 1;
    const tangent = [light[0] - n[0] * mu, light[1] - n[1] * mu, light[2] - n[2] * mu];
    const len = Math.hypot(...tangent);
    if (len < 1e-5)
        return 1;
    const step = Math.max(.003, Math.min(.025, footprint));
    const sample = (offset) => {
        const t = offset / len, inv = 1 / Math.sqrt(1 + offset * offset);
        return volumeCloudOpacity(coverage([(n[0] + tangent[0] * t) * inv, (n[1] + tangent[1] * t) * inv, (n[2] + tangent[2] * t) * inv]));
    };
    const center = volumeCloudOpacity(coverage(n)), nearPlus = sample(step), nearMinus = sample(-step), farPlus = sample(step * 3), farMinus = sample(-step * 3);
    const slope = 2.2 * (nearPlus - nearMinus) + .6 * (farPlus - farMinus);
    const facing = Math.max(0, (mu - slope * len) / Math.sqrt(1 + slope * slope));
    const valley = Math.max(0, (nearPlus + nearMinus + farPlus + farMinus) * .25 - center);
    const relief = (.2 + .8 * facing) / (.2 + .8 * mu) * (1 - .45 * smooth(.02, .25, valley));
    return 1 + (Math.max(.42, Math.min(1.18, relief)) - 1) * smooth(0, .18, mu) * smooth(.04, .3, len);
}
export function cloudDensity(radius, coverage) {
    const h = (radius - CLOUD_BASE) / CLOUD_THICKNESS;
    if (h <= 0 || h >= 1 || coverage <= .001)
        return 0;
    const a = volumeCloudOpacity(coverage);
    if (a <= .001)
        return 0;
    const top = .32 + .65 * Math.sqrt(a);
    const profile = smooth(0, .12, h) * (1 - smooth(top - .2, top, h));
    return -Math.log(1 - a) * profile / (CLOUD_THICKNESS * (top - .16));
}
function densityAt(p, coverage) {
    const r = Math.hypot(...p);
    if (r <= CLOUD_BASE || r >= CLOUD_TOP)
        return 0;
    return cloudDensity(r, coverage([p[0] / r, p[1] / r, p[2] / r]));
}
export function cloudTransmission(p, light, coverage, steps = 4) {
    const b = p[0] * light[0] + p[1] * light[1] + p[2] * light[2], r2 = p[0] ** 2 + p[1] ** 2 + p[2] ** 2;
    if (b < 0 && r2 - b * b < 1)
        return 0; // Earth eclipses the Sun for this sample.
    const end = -b + Math.sqrt(Math.max(0, b * b + CLOUD_TOP * CLOUD_TOP - r2));
    const start = r2 < CLOUD_BASE * CLOUD_BASE ? Math.max(0, -b + Math.sqrt(Math.max(0, b * b + CLOUD_BASE * CLOUD_BASE - r2))) : 0;
    if (end <= start)
        return 1;
    const step = (end - start) / steps;
    let tau = 0;
    for (let i = 0; i < steps; i++) {
        const t = start + (i + .5) * step;
        tau += densityAt([p[0] + light[0] * t, p[1] + light[1] * t, p[2] + light[2] * t], coverage) * step;
    }
    return Math.exp(-tau);
}
export function sampleCloudVolume(x, y, light, coverage, steps = 12, lightSteps = 4) {
    const rr = x * x + y * y;
    if (rr >= CLOUD_TOP * CLOUD_TOP)
        return { opacity: 0, radiance: 0 };
    const front = Math.sqrt(CLOUD_TOP * CLOUD_TOP - rr), inner = Math.sqrt(Math.max(0, CLOUD_BASE * CLOUD_BASE - rr));
    const step = (front - inner) / steps;
    let transmittance = 1, radiance = 0;
    for (let i = 0; i < steps * (rr < 1 ? 1 : 2); i++) {
        const z = i < steps ? front - (i + .5) * step : -inner - (i - steps + .5) * step;
        const p = [x, y, z], density = densityAt(p, coverage);
        if (density === 0)
            continue;
        const opacity = 1 - Math.exp(-density * step), r = Math.hypot(...p);
        const daylight = smooth(-.08, .18, (p[0] * light[0] + p[1] * light[1] + p[2] * light[2]) / r);
        const lightThrough = cloudTransmission(p, light, coverage, lightSteps);
        const cosine = Math.max(0, (p[0] * light[0] + p[1] * light[1] + p[2] * light[2]) / r);
        const illumination = .012 + daylight * (.1 + .95 * Math.pow(cosine, .45) * lightThrough);
        radiance += transmittance * opacity * illumination;
        transmittance *= 1 - opacity;
        if (transmittance < .005)
            break;
    }
    return { opacity: 1 - transmittance, radiance };
}
export const EARTH_VOLUME_GLSL = `
const float CLOUD_BASE=${CLOUD_BASE.toFixed(12)};
const float CLOUD_TOP=${CLOUD_TOP.toFixed(12)};
float volumeCloudOpacity(float coverage){
 return ${CLOUD_OPACITY_MAX}*pow(clamp((coverage-${CLOUD_HAZE_FLOOR})/${1 - CLOUD_HAZE_FLOOR},0.,1.),${CLOUD_COVERAGE_POWER});
}
float volumeCoverage(vec3 p){
 vec3 q=local(p);float a=earthCloud(p);
 float poleDistance=acos(clamp(abs(q.y),0.,1.))*1024./PI;
 float blend=smoothstep(0.,2.,poleDistance);
 return mix(q.y>0.?.317266008:.941530714,a,blend);
}
float cloudTextureLighting(vec3 n,vec3 light){
 float mu=dot(n,light);if(mu<=0.)return 1.;
 vec3 tangent=light-n*mu;float len=length(tangent);if(len<1e-5)return 1.;
 tangent/=len;
 float stepSize=clamp(3.6/(min(uResolution.x,uResolution.y)*uZoom),.003,.025);
 float center=volumeCloudOpacity(volumeCoverage(n));
 float nearPlus=volumeCloudOpacity(volumeCoverage(normalize(n+tangent*stepSize)));
 float nearMinus=volumeCloudOpacity(volumeCoverage(normalize(n-tangent*stepSize)));
 float farPlus=volumeCloudOpacity(volumeCoverage(normalize(n+tangent*stepSize*3.)));
 float farMinus=volumeCloudOpacity(volumeCoverage(normalize(n-tangent*stepSize*3.)));
 float slope=2.2*(nearPlus-nearMinus)+.6*(farPlus-farMinus);
 float facing=max(0.,(mu-slope*len)/sqrt(1.+slope*slope));
 float valley=max(0.,(nearPlus+nearMinus+farPlus+farMinus)*.25-center);
 float relief=(.2+.8*facing)/(.2+.8*mu)*(1.-.45*smoothstep(.02,.25,valley));
 return mix(1.,clamp(relief,.42,1.18),smoothstep(0.,.18,mu)*smoothstep(.04,.3,len));
}
float volumeDensity(vec3 p){
 float radius=length(p),h=(radius-CLOUD_BASE)/(CLOUD_TOP-CLOUD_BASE);
 if(h<=0.||h>=1.)return 0.;
 float a=volumeCloudOpacity(volumeCoverage(p/radius));if(a<=.001)return 0.;
 float top=.32+.65*sqrt(a);
 float profile=smoothstep(0.,.12,h)*(1.-smoothstep(top-.2,top,h));
 return -log(1.-a)*profile/((CLOUD_TOP-CLOUD_BASE)*(top-.16));
}
float volumeTransmission(vec3 p,vec3 light){
 float b=dot(p,light),r2=dot(p,p);if(b<0.&&r2-b*b<1.)return 0.;
 float end=-b+sqrt(max(0.,b*b+CLOUD_TOP*CLOUD_TOP-r2));
 float start=r2<CLOUD_BASE*CLOUD_BASE?max(0.,-b+sqrt(max(0.,b*b+CLOUD_BASE*CLOUD_BASE-r2))):0.;
 if(end<=start)return 1.;
 float stepSize=(end-start)/4.,tau=0.;
 for(int j=0;j<4;j++){float t=start+(float(j)+.5)*stepSize;tau+=volumeDensity(p+light*t)*stepSize;}
 return exp(-tau);
}
vec2 cloudVolume(vec2 p,vec3 light){
 float rr=dot(p,p);if(rr>=CLOUD_TOP*CLOUD_TOP)return vec2(0.);
 float front=sqrt(CLOUD_TOP*CLOUD_TOP-rr),inner=sqrt(max(0.,CLOUD_BASE*CLOUD_BASE-rr));
 float stepSize=(front-inner)/12.,transmittance=1.,radiance=0.;
 for(int i=0;i<24;i++){
  if(i>=12&&rr<1.)break;
  float z=i<12?front-(float(i)+.5)*stepSize:-inner-(float(i)-12.+.5)*stepSize;
  vec3 point=vec3(p,z);float density=volumeDensity(point);
  if(density>.0){
   float opacity=1.-exp(-density*stepSize),daylight=smoothstep(-.08,.18,dot(normalize(point),light));
   float illumination=.012+daylight*(.1+.95*pow(max(0.,dot(normalize(point),light)),.45)*volumeTransmission(point,light));
   radiance+=transmittance*opacity*illumination;transmittance*=1.-opacity;
   if(transmittance<.005)break;
  }
 }
 return vec2(radiance,1.-transmittance);
}
`;
export const EARTH_GLSL = `
const float CLOUD_RADIUS=${EARTH_CLOUD_RADIUS.toFixed(12)};
vec3 cloudShadowPoint(vec3 p,vec3 light){
 float a=dot(light,light),b=dot(p,light),c=dot(p,p)-CLOUD_RADIUS*CLOUD_RADIUS;
 float root=sqrt(max(0.,b*b-a*c));
 float t=b>=0. ? -c/max(root+b,1e-12) : (root-b)/max(a,1e-12);
 return (p+light*t)/CLOUD_RADIUS;
}
vec3 gradeOcean(vec3 c,float ocean){
 float blue=max(0.,c.b-max(c.r,c.g)),bright=max(c.r,max(c.g,c.b));
 float weight=ocean*min(1.,blue/.03)*clamp((.25-bright)/.1,0.,1.);
 float luminance=dot(c,vec3(.2126,.7152,.0722));
 return c*(1.-weight)+(c*.8+vec3(luminance)*.2)*.55*weight;
}
`;
