// Input export for the optional offscreen GLES diagnostic. Run through render_enhanced_earth_probe.py.
import fs from 'node:fs';
import * as sh from '../apps/web/js/orreryShaders.js';
import {buildSphere,lookAt,perspective,mul,scaleM,norm} from '../apps/web/js/orreryMath.js';
import {BODY} from '../apps/web/js/bodyData.js';
import {hazeUniformValues} from '../apps/web/js/illustrativeHaze.js';
import {getAtmosphereProfile} from '../apps/web/js/atmosphereOptics.js';
import {oceanMaskPixels,EARTH_CLOUD_HEIGHT_KM} from '../apps/web/js/enhancedEarth.js';
const eye=[2.3,-2.3,1],oblate=BODY.Earth.polarKm/BODY.Earth.radiusKm,cloudScale=1+EARTH_CLOUD_HEIGHT_KM/BODY.Earth.radiusKm;
const vp=mul(perspective(42*Math.PI/180,1,.01,100),lookAt(eye,[0,0,0],[0,0,1]));
const model=scaleM([1,1,oblate]),cloudModel=scaleM([cloudScale,cloudScale,cloudScale*oblate]),mesh=buildSphere(48,96);
const output={programs:{base:[sh.BASE_SPHERE_VS,sh.BASE_SPHERE_FS],physical:[sh.SCATTERING_SPHERE_VS,sh.SCATTERING_SPHERE_FS]},mesh:{pos:[...mesh.pos],idx:[...mesh.idx]},mask:[...oceanMaskPixels()],cloudModel,cloudMvp:mul(vp,cloudModel),uniforms:{
 u_mvp:mul(vp,model),u_model:model,u_nmat:[1,0,0,0,1,0,0,0,1/oblate],u_cam:eye,u_light:norm([1,-.15,.2]),u_lightObj:norm([1,-.15,.2]),u_oblate:oblate,u_bodyRadiusKm:BODY.Earth.radiusKm,u_map:[.5,1,2,0],u_mapLat:[-Math.PI/2,Math.PI/2,-Math.PI/2,Math.PI/2],u_mapWindow:[1,1,0,0],u_mapNoData:0,u_useTex:1,u_texMode:3,u_tex:0,u_textureLinear:1,u_weatherTex:3,u_nightTex:2,u_iceTex:4,u_oceanMask:11,u_ringTex:1,u_terrainHeight:5,u_atmosphereIncidentField:6,u_atmosphereColumnField:7,u_atmosphereOzoneField:10,u_style:-1,u_mode:0,u_earthWeather:1,u_earthNight:0,u_earthIce:0,u_earthEnhanced:0,u_earthCloudShadow:0,u_cloudScale:cloudScale,u_cloudPhase:0,u_linearOutput:0,u_atmosphereEnabled:0,u_terrainShadowEnabled:0,u_atmo:[.35,.6,1],u_base:[.2,.2,.2],...hazeUniformValues(getAtmosphereProfile('Earth'))}};
fs.writeFileSync(process.argv[2],JSON.stringify(output));
