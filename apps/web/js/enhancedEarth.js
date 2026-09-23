// Illustrative presentation only. Source images, epochs and ephemerides are immutable.
import {OCEAN_MASK_WIDTH,OCEAN_MASK_HEIGHT,OCEAN_MASK_RUNS} from './earthOceanMask.js';
import {rotationDisplayStepSeconds} from './orreryTime.js';

export const EARTH_CLOUD_HEIGHT_KM=8;
export const ENHANCED_EARTH_UNIFORMS=['u_earthEnhanced','u_earthCloudShadow','u_cloudPhase','u_cloudScale','u_oceanMask'];

export function enhancedEarthSelected(state){
  return state.earthEnhanced===true&&state.useTextures!==false&&state.earthCloudSource!=='daily'&&state.earthIce!==true&&!state.galaxy;
}

export function advanceEarthCloudPhase(phase,realSeconds,simulatedSeconds,rotationHours,enabled){
  if(!enabled||!Number.isFinite(realSeconds)||realSeconds<=0)return phase;
  const seconds=rotationDisplayStepSeconds(realSeconds,simulatedSeconds,rotationHours);
  if(seconds===0)return phase;
  const drift=seconds/(Math.abs(rotationHours)*3600)*.03;
  if(!Number.isFinite(drift))return phase;
  const step=Math.sign(drift)*Math.min(Math.abs(drift),.002*realSeconds);
  return ((phase+step)%1+1)%1;
}

export function oceanMaskPixels(){
  const pixels=new Uint8Array(OCEAN_MASK_WIDTH*OCEAN_MASK_HEIGHT);
  let offset=0,value=0;
  for(const run of OCEAN_MASK_RUNS){pixels.fill(value,offset,offset+run);offset+=run;value=255-value;}
  return pixels;
}

export function uploadOceanMask(gl){
  const texture=gl.createTexture();
  if(!texture)throw new Error('Ocean mask allocation failed');
  try{
    gl.activeTexture(gl.TEXTURE0+11);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,OCEAN_MASK_WIDTH,OCEAN_MASK_HEIGHT,0,gl.RED,gl.UNSIGNED_BYTE,oceanMaskPixels());
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(gl.getError()!==gl.NO_ERROR)throw new Error('Ocean mask upload failed');
    return texture;
  }catch(error){gl.deleteTexture(texture);throw error;}
  finally{gl.activeTexture(gl.TEXTURE0);}
}

// Input p is on the unit sphere before oblate scaling. Return a point on the
// homothetic cloud ellipsoid in those same unflattened coordinates. The rational
// root avoids subtractive cancellation for a thin shell and an overhead Sun.
export const EARTH_CLOUD_GEOMETRY_GLSL=`
vec3 earthCloudHit(vec3 p,vec3 light,float oblate,float shell){
  vec3 d=vec3(light.xy,light.z/oblate);
  float a=dot(d,d),b=dot(p,d),c=dot(p,p)-shell*shell;
  float root=sqrt(max(0.0,b*b-a*c));
  float t=b>=0.0 ? -c/max(root+b,1e-12) : (root-b)/max(a,1e-12);
  return p+d*t;
}
`;

// The mask excludes coarse land/ice/coastal margins. Dark-blue gating additionally
// protects bright ice, land-like colors and islands omitted by the coarse vectors.
export const EARTH_OCEAN_GLSL=`
vec3 enhancedOceanColor(vec3 c,float ocean){
  float blue=max(0.0,c.z-max(c.x,c.y));
  float bright=max(c.x,max(c.y,c.z));
  float weight=ocean*min(1.0,blue/.03)*min(1.0,max(0.0,(.25-bright)/.1));
  float luminance=dot(c,vec3(.2126,.7152,.0722));
  return c*(1.0-weight)+(c*.8+vec3(luminance)*.2)*.55*weight;
}
`;
