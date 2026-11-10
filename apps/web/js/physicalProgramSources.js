// Compile-time selection of a predicate fixed by the admitted reference profile.
// Generic shaders remain unchanged numerical oracles. No coefficients, samples,
// coordinates, transfer formulas or run-time uniforms are approximated here.
import {getAtmosphereProfile} from './atmosphereOptics.js';
import {SCATTERING_SPHERE_VS,SCATTERING_SPHERE_FS} from './orreryShaders.js';
import {ATMOSPHERE_VS} from './atmosphereShaders.js';
import {ATMOSPHERE_SCATTERING_FS,SCATTERING_GENERATOR_VS,SCATTERING_GENERATOR_FS,SCATTERING_NUMERATOR_FS,SCATTERING_RESOLVE_FS} from './atmosphereScattering.js';

export const PHYSICAL_PROGRAM_ROLES=Object.freeze(['physicalSphere','atmosphere','scatteringNumerator','scatteringResolve']);
const BODIES=Object.freeze(['Earth','Mars']);
function profile(body){
  if(!BODIES.includes(body))throw new TypeError('Unsupported physical program body/profile');
  return getAtmosphereProfile(body);
}

/** Resolve only the exact scale-height predicate used by these shader oracles.
 * Binary32 comparison matches the values actually uploaded by WebGL.
 * @param {string} source @param {string} body */
export function specializeScatteringSource(source,body){
  const p=profile(body),equal=Math.fround(p.rayleighScaleHeightKm)===Math.fround(p.aerosolScaleHeightKm);
  const same='u_atmosphereDensityScaleKm.x==u_atmosphereDensityScaleKm.y';
  const different='u_atmosphereDensityScaleKm.x!=u_atmosphereDensityScaleKm.y';
  if(typeof source!=='string'||!source.includes(same)&&!source.includes(different))
    throw new Error('Physical shader source predicate changed');
  return source.replaceAll(same,String(equal)).replaceAll(different,String(!equal));
}

/** @param {string} body @param {string} role */
export function physicalProgramKey(body,role){
  profile(body);
  if(!PHYSICAL_PROGRAM_ROLES.includes(role)&&role!=='scatteringGenerator')throw new TypeError('Unsupported physical program role');
  return `${body}:${role}`;
}

const SOURCES=Object.freeze(Object.fromEntries(BODIES.map(body=>[body,Object.freeze(Object.fromEntries([
  ['physicalSphere',SCATTERING_SPHERE_VS,SCATTERING_SPHERE_FS],
  ['atmosphere',ATMOSPHERE_VS,ATMOSPHERE_SCATTERING_FS],
  ['scatteringGenerator',SCATTERING_GENERATOR_VS,SCATTERING_GENERATOR_FS],
  ['scatteringNumerator',SCATTERING_GENERATOR_VS,SCATTERING_NUMERATOR_FS],
  ['scatteringResolve',SCATTERING_GENERATOR_VS,SCATTERING_RESOLVE_FS],
].map(([role,vertex,fragment])=>[role,Object.freeze({vertex,fragment:specializeScatteringSource(fragment,body)})])))])));

/** @param {string} body */
export function physicalProgramSources(body){profile(body);return SOURCES[body];}
