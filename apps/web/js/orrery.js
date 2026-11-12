// "3-D View": a real, lit, textured 3-D solar system. Dependency-free, rendered with WebGL2
// (hardware-accelerated through ANGLE → Direct3D 11 on Windows, Metal on macOS, GL/Vulkan on
// Linux; arm64 + x86_64). Positions come from the same VSOP2013 system_snapshot as the other
// surfaces; the bodies are drawn as proper spheres with:
//   • correct size & oblateness, axial tilt and sidereal rotation (IAU WGCCRE 2015 pole + W),
//   • registered mission reference imagery with dated source/coverage disclosures,
//     Lambert lighting from the Sun so every body shows its geometric phase/terminator,
//   • Saturn / Uranus / Neptune ring systems with real radii and the Cassini Division,
//   • registered NASA/SDO EUV reference frames with explicitly modeled elevated emission;
//     the unobserved hemisphere stays self-luminous at the observed radial median,
//   • dimensioned reference optical transfer where qualified, disclosed halos otherwise,
//   • the real sky as a backdrop: ~1700 catalogue-weighted stars, the Milky Way band, headline
//     constellation figures, and the true positions of seven pulsars + eight galaxies / the
//     galactic centre — the fixed reference points that orient the whole scene on the sky.
// Orbits are drawn at their true inclinations against the ecliptic reference plane.

import { store } from "./store.js";
import {writeText,writeAttribute,writeBoolean} from "./domWrites.js";
import {createFrameScheduler} from "./frameScheduler.js";
import {createRenderQuality,effectiveRenderDpr} from "./renderQuality.js";
import { createShaderPrograms } from "./shaderPrograms.js";
import {createSphereMeshPool} from "./sphereMeshPool.js";
import {sphereMeshEligible,sphereOutsideClip} from "./sphereMeshPolicy.js";
import { PHYSICAL_PROGRAM_ROLES,physicalProgramSources,physicalProgramKey } from "./physicalProgramSources.js";
import { createProfiledScatteringTargets } from "./profiledScatteringTargets.js";
import { linearFilterReference } from './materialColor.js';
import { createHdrPresentation } from './hdrPresentation.js';
import { srgbToLinear } from './surfaceMapping.js';
import { appearanceReference, appearanceReferences, appearanceUniforms, appearanceFallbackColor, earthLayerDescription, earthCloudRole, surfaceReferenceShown } from "./planetAppearance.js";
import {ILLUSTRATIVE_ASSETS,MAX_ILLUSTRATIVE_TEXTURES,illustrativeSelected,illustrativeReplacesSurface,venusAtmosphereOverlay,venusAtmosphereShellScale,planIllustrativeDemand,decodeIllustrativeMap,saturnLookLight} from './illustrativeAppearance.js';
import {EARTH_LOOK_ASSET,EARTH_LOOK_EXPOSURE,earthLookSelected,earthLookDescription,advanceSolEarthCloudPhase,uploadEarthOceanMask} from './earthLook.js';
import {EARTH_LOOK_VS,EARTH_LOOK_FS} from './earthLookShaders.js';
import { requestReferenceImage } from "./referenceImageLoader.js";
import { planTextureDisplay, MAX_REFERENCE_GPU_BYTES, MAX_REFERENCE_PENDING_BYTES } from "./textureDisplayBudget.js";
import { referencePixelDiameter, planReferenceDemand, MAX_REFERENCE_TEXTURES, MAX_REFERENCE_REQUESTS } from "./referenceDemand.js";
import {terrainReference,terrainExtentKm,terrainSummary} from './terrainAssets.js';
import {requestTerrainMesh} from './terrainWorkerClient.js';
import {createTerrainPreparationQueue,terrainResourceEstimate,uploadTerrainMesh} from './terrainResources.js';
import {physicalCameraPosition,terrainDetailLevel,advanceReferencePlayback,createDetailCache} from './physicalRendering.js';
import {getAtmosphereProfile,ATMOSPHERE_UNIFORMS,setAtmosphereUniforms,serializeAtmosphereProfile} from './atmosphereOptics.js';
import {setHazeUniforms} from './illustrativeHaze.js';
import {INCIDENT_FIELD_UNIFORMS} from './atmosphereIncident.js';
import {ATMOSPHERE_VS} from './atmosphereShaders.js';
import {loadAtmosphereFields,loadAtmosphereOzoneColumns,packAtmosphereOpticalField} from './atmosphereColumnField.js';
import {ATMOSPHERE_COLUMN_FIELDS} from './atmosphereColumnManifest.js';
import {ATMOSPHERE_SCATTERING_FS as ATMOSPHERE_FS,SCATTERING_GENERATOR_VS,SCATTERING_GENERATOR_FS,
  SCATTERING_UNIFORMS,planAtmosphereScattering,validScatteringPlanBudget} from './atmosphereScattering.js';
import {createScatteringTargets} from './scatteringTargets.js';
import {SOLAR_APPEARANCE,SOLAR_SOURCE_UNIX,SOLAR_QUIET_BINS,SOLAR_EUV_DISPLAY_GAIN,solarReferenceRotation,solarRenderUniforms,solarPlayback,solarAtlasQuietProfiles,solarQuietBytes,solarPhotosphereSpots,solarActivityDays} from './solarAppearance.js';
import {SOLAR_VS,SOLAR_FS} from './solarVolumeShaders.js';
import {SUN_LOOK_EXTENT,sunLookResolution,sunLookDescription,sunLookRotation,planSunLook} from './sunLook.js';
import {createSunLookRenderer} from './sunLookRenderer.js';
import {loadSolarAtlas} from './solarAssetLoader.js';
import {createPhysicalPresenter} from './physicalPresenter.js';
import { syncObjectRows, matchesObject } from "./objectBrowser.js";
import {createLabelPresenter} from "./labelPresenter.js";
import { projectOpaqueDisc } from "./labelOcclusion.js";
import { resolveSystemDisplayPolicy } from "./systemDisplayPolicy.js";
import { fitOrbitDistance, minimumOrbitDistance, orbitNearPlane } from "./orbitCamera.js";
import { projectOrbitLines } from "./orbitLines.js";
import { resolveSystemPresentation } from "./presentationState.js";
import { loadSkyEngine, systemPositions, SYSTEM_POSITIONS_ORDER } from "./skyEngine.js";
import { projectSystemPositions, validateSystemRequest } from "./systemContract.js";
import { requestSystemSnapshot, cancelSystemSnapshot } from "./systemWorkerClient.js";
import { BODY, PLANET_ORDER, AU_KM, poleVector, equToEcl } from "./bodyData.js";
import { buildCelestial } from "./celestial.js";
import { DWARFS, COMETS, PROBES, asOrbit, bodyXYZ, probeXYZ, buildBelts } from "./smallbodies.js";
import { epochAccuracyAtUnix, renderedEpochLabel } from "./accuracy.js";
import {
  perspective, lookAt, mul, sub, add, cross, dot, norm, translate, scaleM, normalMat3,
  iauRotation, buildSphere, buildRing, ringOpacityProfile,
} from "./orreryMath.js";
import {
  SCATTERING_SPHERE_VS as SPHERE_VS, SCATTERING_SPHERE_FS as SPHERE_FS,
  BASE_SPHERE_VS, BASE_SPHERE_FS, LINE_VS, LINE_FS, RING_VS, RING_FS, PT_VS, PT_FS, GLOW_VS, GLOW_FS,
} from "./orreryShaders.js";
import {
  GAL_SUN_R, GAL_THETA0, GAL_OMEGA, GAL_SHEAR_K, GAL_SHEAR_RC,
  galShear, sunGalacticPos, buildGalaxyModel, buildGalObjectList,
  buildCatalogStarsGalactic, buildNeighbourhoodModel, neighbourhoodPos,
} from "./orreryGalaxy.js";
import { renderDetail, renderMoonDetail, renderSmallDetail, updateSmallDetailFacts, updateLiveDetailFacts, updateDetailAppearance } from "./orreryDetail.js";
import { renderStarDetail } from "./starDetail.js";
import { buildEarthMapSliced, buildFeatureMap } from "./surfacemap.js";
import { resolveDisplayRadii, moonGuideVisible } from "./displayGeometry.js";
import { textureEligible, missingDetailColor } from "./visualAssets.js";
import { catalogueDemand } from "./catalogueDemand.js";
import { createCatalogueLoader, createDocumentRecovery } from "./catalogueLoader.js";
import { moonOffsetAU, moonOrbitPath, systemScale, satelliteSystemExtent, withinMoonValidity, aliasedByClock, synchronousMoonRotation } from "./moonorbits.js";
import { MAX_MOON_SHADOWS, moonShadowsOnPlanet, packMoonShadows, sunlightOnMoon } from "./moonshadows.js";
import * as moonCatalogue from "./moons.js";
import { MOON_TEXTURE_FILES, moonBaseColor, moonAtmosphereColor } from "./moonAppearance.js";
import { elpMoonAliased,
  DAYS_PER_YEAR, SOLAR_SPEED_DEFAULT_YPS, solarSpeedFromSlider, solarSliderFromSpeed,
  rotationDisplayIsLimited, rotationDisplayStepSeconds, solarStepSeconds,
} from "./orreryTime.js";

// Update the heliocentric-accuracy readout for the current epoch offset.
function updateOrreryAccuracy() {
  updateLiveDetailFacts(state.bodies.find(body=>body.name===state.selected), state.bodies);
  updateDetailAppearance(state);
  state.presentation = resolveSystemPresentation({ renderUnix: state.renderUnix, scene: state.galaxy ? "galaxy" : "system", selected: state.selected, hasSnapshot: state.bodies.length===9, error: state.engineError });
  window.dispatchEvent(new Event("sol:presentation"));
  const node = document.getElementById("orreryAccuracy"); if (!node) return;
  const a = epochAccuracyAtUnix(state.renderUnix, "helio");
  writeAttribute(node,"class","epoch-accuracy acc-"+a.level);
  // Data availability and independent accuracy are different claims. Always disclose
  // a hidden moon layer without extending a recorded parity sample across the slider.
  const moonNote = state.showMoons && state.moonsHiddenReason ? ` ${state.moonsHiddenReason}` : "";
  // Same honesty for spin: at high time speeds physical rotation outpaces a display's sampling
  // rate. Keep the bodies moving continuously, but disclose the visible-rate cap.
  const spinNote = state.animate && !state.galaxy && state.spinLimitedCount
    ? " Rotation display rate-limited to one visible turn/5s; orbital time remains exact."
    : "";
  // Earth's Moon is positioned by the ELP engine, not the catalogued-moon layer, so it kept
  // moving silently past the same Nyquist limit that hides the other 21 with a notice. It is
  // deliberately NOT hidden - its positions stay exact and it is the one moon a newcomer will
  // look for - but the un-sampleable motion is disclosed like every other suppression here.
  const lunarNote = state.animate && !state.galaxy && elpMoonAliased(state.simStepSeconds)
    ? " The Moon's drawn motion is under-sampled at this speed (positions stay exact)."
    : "";
  writeText(node,`${state.galaxy ? "Galaxy illustration — separate model clock" : renderedEpochLabel(state.renderUnix)} — ${a.text}${moonNote}${spinNote}${lunarNote}${state.engineError ? ` ${state.engineError}` : ""}`);
  const metadata = document.getElementById("orreryMetadataEpoch");
  if(metadata) writeText(metadata,state.metadataUnix==null ? "Orbital elements and phase metadata loading on your device…" : `Orbit curves and phase metadata sampled at ${renderedEpochLabel(state.metadataUnix)}. Position markers use the rendered instant above; metadata refresh is asynchronous.`);
  const retry=document.getElementById("orreryRetry");if(retry)writeBoolean(retry,'hidden',!state.engineError);
  const scale = document.getElementById("orreryScaleStatus");
  const sizeControl = /** @type {HTMLInputElement|null} */ (document.getElementById("orrerySize"));
  const policy = sceneDisplayPolicy();
  if(sizeControl)writeBoolean(sizeControl,'disabled',!policy.canEnlarge);
  updateFocusSystemControl();
  if (scale) writeText(scale,state.galaxy ? state.localView ? "Solar neighbourhood · light-years · static catalogue epoch" : `Illustrative galaxy · kiloparsecs · ${(state.galYears / 1e6).toFixed(2)} million model years`
    : policy.physicalGeometry ? `${policy.framing === "inspect-system" ? "Satellite system" : policy.framing === "inspect-body" ? "Body inspection" : "Physical scale"} — physical relative sizes and distances; small bodies may be sub-pixel` : "Enlarged for visibility — body sizes capped for clearance; moon systems uniformly scaled; physical data unchanged");
  const live = document.getElementById("orrerySelectedEpoch");
  if (live) writeText(live,state.selectedStar ? "Star catalogue facts; not an independently validated apparent place"
    : `${state.selected || "No selection"} · ${renderedEpochLabel(state.renderUnix)}${moonSet.MOONS.some(m=>m.n===state.selected) && !withinMoonValidity(state.renderUnix,moonSet.MOON_VALID_MIN_JD,moonSet.MOON_VALID_MAX_JD) ? " · position unavailable outside the moon table interval" : ""}`);
}

const SYSTEM_VIEW_HINT = "Planet positions follow VSOP2013. Choose Illustrative look or Source-qualified in View; body cards identify imagery, its limits and any low-detail fallback. Sizes are enlarged for visibility or shown at physical scale. Drag to orbit, scroll to zoom, click a body to inspect it. Keyboard: arrows orbit, +/− zoom.";

const FOVY = (42 * Math.PI) / 180;
const YR = DAYS_PER_YEAR * 86400;

// Perceptual display radii (AU) in "visible" mode — true radii are sub-pixel at AU scale, so the
// bodies are ranked by real size but enlarged to be legible (as in NASA's Eyes). "True scale"
// switches to the real radius/AU; an exaggeration slider scales the visible sizes.
const VIS_RADIUS_AU = {
  Sun: 0.20, Mercury: 0.045, Venus: 0.075, Earth: 0.080, Mars: 0.058,
  Jupiter: 0.170, Saturn: 0.140, Uranus: 0.100, Neptune: 0.100, Moon: 0.022,
};

// Real planetary surface maps (apps/web/textures/, fetched by tools/fetch_textures.py). Loaded
// same-origin so WebGL can use them; any that are missing fall back to the procedural shader.
// The moon mosaics ride in the SAME table: they load, fail and get toggled by exactly the same
// code, and no catalogued moon shares a name with a planet (Earth's satellite is "Moon", which
// is a drawn body here, not one of the 21). Keeping two tables would have meant two copies of
// the missing-file handling, which is the part that has to stay identical.
const TEXTURE_FILES = {
  Mercury: "mercury.jpg", Venus: "venus.jpg", Earth: "earth.jpg", Mars: "mars.jpg",
  Jupiter: "jupiter.jpg", Saturn: "saturn.jpg", Uranus: "uranus.jpg", Neptune: "neptune.jpg", Moon: "moon.jpg",
  ...MOON_TEXTURE_FILES,
};

// Registered on the shared store (store.orrery) so this surface's state is inspectable
// from one place like the rest of the app — the same object, no copies. Rendering-internal
// GL handles stay module-local below; this holds the user-facing/scene state.
// Overview framing: high enough off the ecliptic that Mercury and Venus do not
// sit inside the enlarged Sun disc after a source-facing Sun inspection.
const OVERVIEW_AZ = 0.7;
const OVERVIEW_EL = 0.45;
const OVERVIEW_RADIUS = 26;

const renderQuality=createRenderQuality();
const state = (store.orrery = {
  az: OVERVIEW_AZ, el: OVERVIEW_EL, radius: OVERVIEW_RADIUS, savedRadius: OVERVIEW_RADIUS, offsetYears: 0,
  presentation: /** @type {any} */ (null),
  active: false, entering: false, exaggeration: 1, trueScale: false, animate: true,
  focusMode: "overview",
  renderQuality:renderQuality.current,
  // Solar-system animation rate (sim years per real second). The close-up default is one
  // simulated hour per real second: Earth turns visibly (~15°/s) without completing a full
  // revolution during an ordinary camera drag. Faster orbital-motion presets remain explicit.
  yearsPerSec: SOLAR_SPEED_DEFAULT_YPS,
  galSpeed: 2,      // galaxy-view rate (millions of years per real second), decoupled from the planetary rate
  showOrbits: true, showSky: true, showConst: false, showLabels: true, showSunEq: false, useTextures: true, galaxy: false,
  earthNight: true, earthWeather: true, earthIce: false, earthCloudSource: 'composite', venusRadar: false,
  appearanceStatus: {}, planetLook: 'illustrative', illustrativeStatus: {},
  textureBudget:{residentBytes:0,pendingBytes:0},
  catalogueStatus: {stars:'idle',moons:'idle'},
  orbitCurveStatus:{vertices:0,capped:false},
  saturnLighting: 'sun-directed',
  illustrativeDemandBodies: /** @type {string[]} */ ([]),
  illustrativeVisibleFocused: /** @type {string[]} */ ([]),
  earthLookStatus: 'deferred', earthLookPhase: 0,
  terrainEnabled:true, opticsEnabled:true, terrainStatus:{}, terrainRendered:{}, opticsStatus:{}, scatteringStatus:{}, scatteringFrame:null,
  programStatus:{base:'deferred',physical:'deferred'},programDiagnostics:{},
  // Qualification candidate only; default enablement requires integrated/native gates.
  hdrEnabled:false, hdrStatus:{state:'deferred',reason:'HDR candidate disabled.'}, hdrFrame:null,
  solarMode:'illustrative',sunLookResolution:1024,sunLookStatus:'deferred',sunLookReason:'',sunLookPlaying:true,sunLookProminences:false, solarStatus:'deferred', solarInspection:false, solarPlayback:{seconds:0,duration:20,playing:false},
  showSmall: false, // belts + dwarf planets + comets + spacecraft (the illustrative small-body layer)
  moonGuideMode: "context", // advanced callers may explicitly choose all or off
  showMoons: true, // the 21 major moons of Mars, Jupiter, Saturn, Uranus and Neptune
  galDeepSky: true, // nebulae / pulsars / black holes / nearby stars in the Milky-Way view
  localView: false, // light-year-scale solar-neighbourhood sub-view of the galaxy mode
  selectedStar: null, // catalogue star pinned in the detail panel (null = show the body card)
  topDown: false, preTopRadius: 0, // "Top-down map" view — folds in the former standalone 2-D Solar System surface
  // Camera: orbit around `anchor` (a body name; "Sun" = origin) or a free-fly camera (WASD + look).
  anchor: "Sun", freeFly: false, freePos: [18, 18, 12], yaw: -2.3, pitch: -0.4, flySpeed: 4, keys: new Set(),
  renderUnix: Date.now() / 1000, simElapsed: 0, galYears: 0, selected: null, backend: "",
  simStepSeconds: 0, // simulated seconds covered by the last frame (0 when paused)
  moonsHiddenReason: "", // why the moon layer is suppressed, surfaced in the accuracy line
  spinLimitedCount: 0, // bodies whose visible spin is capped this frame (accuracy-line note)
  // Fetch epoch of textures/sun.jpg (from sun.jpg.json), used as the documented upper-bound
  // approximation to the frame's capture epoch; null = unknown/procedural.
  sunImageUnix: null,
  moonsAliasedCount: 0, // accumulated across every visible parent system in one paint
  bodies: [], lastTick: 0,
  objectQuery: "", objectGroup: "all",
  metadataUnix: null, engineError: "",
});

const DRAW_LIST = ["Sun", ...PLANET_ORDER, "Moon"];

// (mat/vec helpers, the IAU orientation, and the sphere/ring/ellipse geometry builders
// live in orreryMath.js; GLSL sources in orreryShaders.js — both imported above.)

// ---------------------------------------------------------------- WebGL2 renderer
let gl, P = {}, sphere, quadBuf, cel, celBufs = {}, particles = null;
// Capabilities are fixed for a live context; refresh explicitly after restoration.
const textureLimits = new WeakMap();
let shaderPrograms=null,programContextGeneration=0;
let firstFrameOwner=null;
/** @type {ReturnType<typeof createSphereMeshPool>|null} */
let sphereMeshPool=null;
/** @type {WebGL2RenderingContext|null} */
let sphereContext=null;
let hdrPresentation=null,hdrFailure=null,contextGeneration=0,sceneSerial=0,linearFrame=false,graphicsLifecycle=0;
let scatteringTargets=null,scatteringFrame=null;
// The scene pass draws into one target at one viewport for the whole frame. Both are
// fixed in beginSceneFrame so the scattering prepass can assert them, not query them.
let sceneFramebuffer=null;
/** @type {[number,number,number,number]} */
let sceneViewport=[0,0,1,1];
const PHYSICAL_PROGRAMS=PHYSICAL_PROGRAM_ROLES;
let bodyBuf, ringBufs = {}, sceneLineBuf, sceneRanges = [], dropLineBuf, dropRanges = [];
let orbitLineBuf,orbitLineCount=0,orbitLineKey='',orbitLineRevision=0,orbitDefinitions=[];
const LINE_IDENTITY=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
// uniformMatrix copies immediately. Reuse only the GPU upload staging array;
// camera/projection math and label positions retain their double precision.
const MATRIX_UPLOAD=new Float32Array(16);
function matrixUpload(matrix){MATRIX_UPLOAD.set(matrix);return MATRIX_UPLOAD;}
let textures = {}, ringTex = { ready: false, tex: null }, whiteTex = null, texturesStarted = false;
let referenceTextures = {}, textureGeneration = 0;
let referenceDemand = [], referenceVisible = new Map(), referenceUseSerial = 0;
let referenceViewport = {width:0,height:0};
let illustrativeDetails=null,illustrativeDemand=[];
let earthLookDetails=null,earthLookWanted=false;
let terrainDetails=null,terrainDemand={};
let incidentFields=null,incidentDemand='';
let retryTerrainFailures=false;
let solarDetail=null,solarRotation=null;
let ringShadowTex = {}; // per-planet 1-D radial ring-opacity profiles for the ring-shadow lookup
let sunLook=null,sunLookDrawn=false;
let sunTex = { ready: false, tex: null }; // the latest real SDO disk, for the 3-D Sun's surface
let galaxy = null;
let smallBodies = []; // per-frame small-body markers: {name, pos, col, kind, note}

// Surface maps rasterised from the committed geography (geography.js -> surfacemap.js). These
// are what ships: before the textures became a committed baseline every deployment fell back
// to the procedural shader and Earth's "continents" were value noise. A real fetched photo map
// still wins where one exists — see drawBody.
let genTex = {}, genStarted = false;

// The 21 curated moons are a correctness and accessibility dependency: Focus and the canvas
// text alternative promise them on first entry. Keep only the much larger geography/star
// enrichment lazy; making this compact catalogue dynamic left those controls scheduler-bound.
let moonSet = moonCatalogue;
// Identity is static; the knots arrive with moonelements.js. Anything that computes a POSITION
// waits on this, while name/size/period lookups can run immediately.
let moonElementsReady = false;
let moonElementsPromise = null;
let starCataloguePromise = null;
const catalogueRetryOwners=new Set();
let catalogueRetryGeneration=0,catalogueRecoveryNotice=false;
let catalogueFocusIntent=null;
// "Retry catalogue downloads" re-imports first. If the browser still holds the earlier
// failure and the catalogue is reachable again, the page reloads into Solar System.
const reloadWhenReachable=path=>createDocumentRecovery({urls:()=>[new URL(path,import.meta.url).href],graphUrl:()=>new URL("../module-dependencies.v1.json",import.meta.url).href});
const moonLoader=createCatalogueLoader({recover:reloadWhenReachable("./moonelements.js"),load:async()=>{
  const module=await import("./moonelements.js");
  if(!moonSet.MOONS.every(m=>Array.isArray(module.MOON_ELEMENTS?.[m.n]?.el)&&module.MOON_ELEMENTS[m.n].el.length>0))throw new Error('Moon orbital catalogue is incomplete');
  return module;
}});
const starLoader=createCatalogueLoader({recover:reloadWhenReachable("./starcatalog.js"),load:async()=>{
  const module=await import("./starcatalog.js");
  if(!Array.isArray(module.NAMED_STARS)||!module.NAMED_STARS.length||!Number.isSafeInteger(module.STAR_COUNT)||module.STAR_COUNT<=0
      ||!Number.isSafeInteger(module.STAR_STRIDE)||module.STAR_STRIDE<3||module.STARS_PACKED?.length!==module.STAR_COUNT*module.STAR_STRIDE)throw new Error('Named-star catalogue is incomplete');
  return module;
}});

const MOON_DEFERRED_NOTE='Moon orbital data loads when a satellite system is viewed.';
const MOON_LOADING_NOTE='Moons hidden — orbital data is loading.';
const MOON_FAILED_NOTE='Moons hidden — their orbital elements failed to load. Retry the catalogue download.';
function moonAvailabilityNote(){
  if(moonElementsReady)return '';
  return moonLoader.status==='failed'?MOON_FAILED_NOTE:moonLoader.status==='loading'?MOON_LOADING_NOTE:MOON_DEFERRED_NOTE;
}

function updateCatalogueStatus(){
  const phase=(loader,installed)=>installed?'ready':loader.status==='ready'?'loading':loader.status;
  state.catalogueStatus={stars:phase(starLoader,!!starCat),moons:phase(moonLoader,moonElementsReady)};
  if(!moonElementsReady)state.moonsHiddenReason=state.showMoons?moonAvailabilityNote():'';
  else if([MOON_DEFERRED_NOTE,MOON_LOADING_NOTE,MOON_FAILED_NOTE].includes(state.moonsHiddenReason))state.moonsHiddenReason='';
  const {stars,moons}=state.catalogueStatus;
  const failed=stars==='failed'||moons==='failed';
  if(failed)catalogueRecoveryNotice=true;
  const messages=[moons==='failed'?'Additional moon positions unavailable.':moons==='loading'?'Loading additional moon positions…':'',
    stars==='failed'?'Named stars unavailable.':stars==='loading'?'Loading named stars…':''].filter(Boolean);
  const message=messages.join(' ')||(catalogueRecoveryNotice?'Requested catalogue data is available.':'');
  const panel=document.getElementById('orreryCataloguePanel'),status=document.getElementById('orreryCatalogueStatus');
  const retry=/** @type {HTMLButtonElement|null} */(document.getElementById('orreryCatalogueRetry'));
  if(panel)panel.hidden=!state.active||!message;
  if(status&&status.textContent!==message)status.textContent=message;
  if(retry){retry.hidden=!state.active||(!failed&&!catalogueRetryOwners.size);retry.disabled=!failed&&catalogueRetryOwners.size>0;}
  if(!state.active)return;
  updateOrreryPositions();updateOrreryAccuracy();
}

function syncCatalogueDemand(retry=false) {
  const demand=catalogueDemand(state,{visible:referenceVisible,moons:moonSet.MOONS,
    withinValidity:withinMoonValidity(state.renderUnix,moonSet.MOON_VALID_MIN_JD,moonSet.MOON_VALID_MAX_JD),hidden:document.hidden});
  if(demand.moons && !moonElementsReady && (moonLoader.status==='idle'||retry&&moonLoader.status==='failed'))void loadMoonCatalogue();
  if(demand.stars && !starCat && (starLoader.status==='idle'||retry&&starLoader.status==='failed'))void loadStarCatalogue();
}

function cancelCatalogueWork(){
  catalogueRetryGeneration++;catalogueRetryOwners.clear();catalogueFocusIntent=null;
  moonElementsPromise=null;starCataloguePromise=null;
  moonLoader.cancel();starLoader.cancel();updateCatalogueStatus();
}

function retryCatalogues(){
  if(!state.active)return;
  const jobs=[];
  if(moonLoader.status==='failed')jobs.push(loadMoonCatalogue);
  if(starLoader.status==='failed')jobs.push(loadStarCatalogue);
  if(!jobs.length)return;
  const generation=catalogueRetryGeneration,button=document.getElementById('orreryCatalogueRetry');
  catalogueFocusIntent=button&&document.activeElement===button?{generation}:null;
  for(const load of jobs){
    const pending=load(true);catalogueRetryOwners.add(pending);
    void pending.finally(()=>{
      if(generation!==catalogueRetryGeneration||!state.active)return;
      catalogueRetryOwners.delete(pending);updateCatalogueStatus();
      // Disabling a focused button can move native focus to body. Retain only
      // this retry's intent; subsequent focus, pointer or keyboard actions revoke it.
      if(catalogueFocusIntent?.generation===generation&&!document.hidden&&button
          &&(document.activeElement===button||document.activeElement===document.body)){
        if(button.hidden){catalogueFocusIntent=null;document.getElementById('orreryCatalogueStatus')?.focus();}
        else if(!/** @type {HTMLButtonElement} */(button).disabled&&document.activeElement!==button)button.focus();
      }
    });
  }
  updateCatalogueStatus();
}
let enterPromise = null;
// Per-frame moon markers, rebuilt during the body pass so labels and picking agree with what
// was actually drawn — including the zoom cut-off, so you cannot click an invisible moon.
let moonMarkers = [];
let moonGuideQueue = [];
let moonPathBuf = null; // GL buffer for the moon orbit polylines (rebuilt per frame; they move)

function makeTexture(img, repeatS, nearest = false, premultiplyAlpha = false, linearFilter = false) {
  if (linearFilter && (nearest || premultiplyAlpha)) throw new Error('Linear filtering requires an opaque display reference.');
  const maxSize = textureLimits.get(gl);
  let pixels = img;
  if (Number.isFinite(maxSize) && (img.width > maxSize || img.height > maxSize)) {
    if (nearest) throw new Error('Device cannot preserve the scientific palette grid.');
    // Preserve the full geographic extent on smaller GPUs. This is image
    // resampling only; no feature, cloud or coverage is synthesized.
    const ratio = maxSize / Math.max(img.width, img.height);
    const reduced = document.createElement('canvas');
    reduced.width = Math.max(1, Math.floor(img.width * ratio));
    reduced.height = Math.max(1, Math.floor(img.height * ratio));
    const ctx = reduced.getContext('2d');
    if (!ctx) throw new Error('Reference image downsampling unavailable.');
    ctx.drawImage(img, 0, 0, reduced.width, reduced.height);
    pixels = reduced;
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // Filter covered source colors independently of transparent no-data RGB.
  // Set this for every upload so a masked map cannot affect the next material.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha);
  gl.texImage2D(gl.TEXTURE_2D, 0, linearFilter ? gl.SRGB8_ALPHA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatS ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (!nearest) gl.generateMipmap(gl.TEXTURE_2D);
  const error = gl.getError();
  if (Number.isFinite(error) && error !== gl.NO_ERROR) {
    gl.deleteTexture(t); throw new Error('GPU rejected the reference image upload.');
  }
  return t;
}

function initIncidentResources(){
  incidentFields?.dispose();incidentDemand='';
  const context=gl;
  const cache=createDetailCache({capacity:2,load:async(body,signal)=>{
    const [field,columns]=await loadAtmosphereFields(body,{signal});
    if(signal.aborted||incidentFields!==cache||incidentBodyDemand()!==body||incidentDemand!==body||gl!==context||context.isContextLost())throw new Error('Incident field graphics demand changed');
    let texture=null,columnTexture=null,ozoneTexture=null;
    const uploadField=(unit,handle,internal,format,pixels,width,height)=>{
      context.activeTexture(context.TEXTURE0+unit);context.bindTexture(context.TEXTURE_2D,handle);
      context.texImage2D(context.TEXTURE_2D,0,internal,width,height,0,format,context.FLOAT,pixels);
      for(const parameter of [context.TEXTURE_MIN_FILTER,context.TEXTURE_MAG_FILTER])context.texParameteri(context.TEXTURE_2D,parameter,context.NEAREST);
      for(const parameter of [context.TEXTURE_WRAP_S,context.TEXTURE_WRAP_T])context.texParameteri(context.TEXTURE_2D,parameter,context.CLAMP_TO_EDGE);
    };
    try{
    texture=context.createTexture();context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL,false);context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    uploadField(6,texture,context.RGBA32F,context.RGBA,field.values,field.width,field.height);
    columnTexture=context.createTexture();
    uploadField(7,columnTexture,context.RG32F,context.RG,columns.values,columns.width,columns.height);
    ozoneTexture=context.createTexture();
    const ozone=columns.width===512&&columns.height===512
      ?await loadAtmosphereOzoneColumns(getAtmosphereProfile(body),{signal})
      :new Float32Array(columns.width*columns.height);
    uploadField(10,ozoneTexture,context.RGBA32F,context.RGBA,packAtmosphereOpticalField(columns.values,ozone),columns.width,columns.height);
    if(context.getError()!==context.NO_ERROR)throw new Error('GPU rejected optical fields');
    return {texture,columnTexture,ozoneTexture,height:[field.domain.minHeightKm,field.domain.maxHeightKm,Number(field.domain.quadratic)]};
    }catch(error){if(texture)context.deleteTexture(texture);if(columnTexture)context.deleteTexture(columnTexture);if(ozoneTexture)context.deleteTexture(ozoneTexture);throw error;}
    finally{context.activeTexture(context.TEXTURE0);}
  },release:value=>{if(value){context.deleteTexture(value.texture);context.deleteTexture(value.columnTexture);if(value.ozoneTexture)context.deleteTexture(value.ozoneTexture);}},onChange:body=>{
    queueMicrotask(()=>{if(incidentFields!==cache||gl!==context)return;
      state.opticsStatus[body]=opticalReadiness(body);updatePhysicalAppearance();if(state.active&&!document.hidden&&!state.animate)paint();});
  }});
  incidentFields=cache;
}

// The body whose optical transfer the renderer owns. Inspecting a moon of an
// atmospheric planet keeps the anchor's atmosphere resident, so the status panel
// must describe the same body the renderer is actually preparing.
function opticalSubject(){
  if(!state.active||state.galaxy||state.selectedStar)return '';
  if(getAtmosphereProfile(state.selected))return state.selected;
  return getAtmosphereProfile(state.anchor)?state.anchor:'';
}

function incidentBodyDemand(){
  if(!state.opticsEnabled||document.hidden)return '';
  if(opticalSubject()==='Earth'&&earthLookSelected(state))return '';
  return opticalSubject();
}

function syncIncidentDemand(){
  const demand=incidentBodyDemand();
  if(demand!==incidentDemand){
    incidentFields?.abortPending();scatteringTargets?.cancel();state.scatteringStatus={};
    if(demand)scatteringTargets?.retry(demand);
    incidentDemand=demand;if(!demand&&state.programStatus.base==='ready')cancelPendingPrograms();
  }
}

function bindIncidentField(body,profile,locations=P.sphereU){
  const field=profile?incidentFields?.get(body):null;
  gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,field?.texture||whiteTex);
  gl.uniform1i(locations.u_incidentField,6);gl.uniform1i(locations.u_incidentFieldReady,field?1:0);
  gl.uniform3fv(locations.u_incidentFieldHeight,field?.height||[0,16,1]);gl.activeTexture(gl.TEXTURE0);
}

function bindAtmosphereColumns(body,locations){
  const field=incidentFields?.get(body);
  gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,field?.columnTexture||whiteTex);
  gl.uniform1i(locations.u_atmosphereColumnField,7);
  gl.activeTexture(gl.TEXTURE0+10);gl.bindTexture(gl.TEXTURE_2D,field?.ozoneTexture||whiteTex);
  if(locations.u_atmosphereOzoneField)gl.uniform1i(locations.u_atmosphereOzoneField,10);
  gl.activeTexture(gl.TEXTURE0);
}

function initTerrainResources() {
  terrainDetails?.dispose();
  terrainDemand={};
  if(typeof Worker!=='function'){terrainDetails=null;state.terrainStatus={Moon:'unavailable',Mars:'unavailable'};return;}
  const context=gl;
  const preparation=createTerrainPreparationQueue();
  const cache=createDetailCache({capacity:2,load:(key,signal)=>preparation.run(signal,async()=>{
    const [body,rawLevel]=key.split(':');const phys=BODY[body];
    const reference=terrainReference(body);
    const estimate=terrainResourceEstimate(reference,Number(rawLevel));
    if(reference.width>textureLimits.get(context)||reference.height>textureLimits.get(context))throw new Error('Terrain exceeds device texture dimensions');
    const mesh=await requestTerrainMesh(body,Number(rawLevel),{equatorialRadiusKm:phys.radiusKm,polarRadiusKm:phys.polarKm},{signal});
    if(signal.aborted||!state.active||gl!==context||context.isContextLost())throw new Error('Terrain graphics generation changed');
    return {...uploadTerrainMesh(context,mesh),body,level:Number(rawLevel),resourceBytes:estimate};
  }),release:mesh=>{if(mesh){context.deleteBuffer(mesh.pos);context.deleteBuffer(mesh.idx);context.deleteTexture(mesh.heightTex);}},
  onChange:key=>{
    queueMicrotask(()=>{
      if(terrainDetails!==cache||gl!==context)return;
      const body=key.split(':')[0];
      state.terrainStatus[body]=terrainDemand[body]?cache.status(terrainDemand[body]):'deferred';
      updatePhysicalAppearance();if(state.active&&gl===context&&!state.animate)paint();
    });
  }});
  terrainDetails=cache;
}

function detailMesh(body,pixels) {
  if(illustrativeSelected(body,state)||!state.terrainEnabled||!terrainReference(body)||!terrainDetails||state.galaxy)return null;
  const level=terrainDetailLevel(pixels);
  const focused=!state.selectedStar&&(state.selected===body||state.anchor===body);
  if(focused&&!level){terrainDemand[body]='';state.terrainStatus[body]='deferred';}
  if(!level)return null;
  if(focused){
    const key=`${body}:${level}`;
    terrainDemand[body]=key;
    if(retryTerrainFailures&&terrainDetails.status(key)==='unavailable')terrainDetails.retry(key);
    else terrainDetails.request(key);
    // The demanded level owns status even while a lower ready mesh is drawn.
    state.terrainStatus[body]=terrainDetails.status(key);
  }
  for(let n=level;n>0;n--){const mesh=terrainDetails.get(`${body}:${n}`);if(mesh)return mesh;}
  return null;
}

function bindBodyMesh(mesh=sphere) {
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pos);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,mesh.interleaved?24:0,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,mesh.interleaved?24:0,mesh.interleaved?12:0);
  gl.disableVertexAttribArray(2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.idx);
}

const physicalPresenter=createPhysicalPresenter({document,state,opticalSubject,solarEuvActive,solarPlaybackAvailable,
  linearFrame:()=>linearFrame});
function updatePhysicalAppearance(){physicalPresenter.present();}
function syncSolarPlaybackControls(){physicalPresenter.syncSolarPlaybackControls();}

// Reconstructed EUV is a science view of the Sun as the subject: it applies while the
// Sun is inspected or explicitly selected. The default overview anchors on the Sun, and
// In reference modes, context draws the visible photosphere. The independently
// disclosed illustrative mode also applies to the ordinary Solar System overview.
function solarSubject() {
  return (state.selected||state.anchor)==='Sun'&&(state.solarInspection||state.selected==='Sun');
}

function solarEuvActive() {
  return state.solarMode==='reconstructed-euv'&&solarSubject();
}

function solarPlaybackAvailable() {
  return state.active&&!state.galaxy&&!state.selectedStar&&state.useTextures&&solarEuvActive()
    &&state.solarStatus==='ready';
}

function sourceSolarRotation() {
  if(!solarRotation){
    const positions=systemPositions(SOLAR_SOURCE_UNIX),i=SYSTEM_POSITIONS_ORDER.indexOf('Earth')*3;
    const pole=iauRotation(BODY.Sun,SOLAR_SOURCE_UNIX);
    solarRotation=solarReferenceRotation(Array.from(positions.slice(i,i+3)),[pole[8],pole[9],pole[10]]);
  }
  return solarRotation;
}

/** Column-major mat3: IAU body frame to the frame-0 source basis of the EUV model. */
function bodyToSolarSource(bodyRotation) {
  const source=sourceSolarRotation(),out=[];
  for(let j=0;j<3;j++) for(let i=0;i<3;i++) {
    out.push(source[i*4]*bodyRotation[j*4]+source[i*4+1]*bodyRotation[j*4+1]+source[i*4+2]*bodyRotation[j*4+2]);
  }
  return out;
}

function bitmapPixels(bitmap) {
  const canvas=document.createElement('canvas');
  canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Solar quiet profile unavailable');
  ctx.drawImage(bitmap,0,0);
  return ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
}

function makeQuietTexture(context,bytes) {
  const tex=context.createTexture(),alignment=context.getParameter(context.UNPACK_ALIGNMENT);
  context.bindTexture(context.TEXTURE_2D,tex);
  context.pixelStorei(context.UNPACK_ALIGNMENT,1);
  context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL,false);
  context.texImage2D(context.TEXTURE_2D,0,context.R8,SOLAR_QUIET_BINS,2,0,context.RED,context.UNSIGNED_BYTE,bytes);
  context.pixelStorei(context.UNPACK_ALIGNMENT,alignment);
  context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MIN_FILTER,context.LINEAR);
  context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MAG_FILTER,context.LINEAR);
  context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_S,context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE);
  return tex;
}

function initSolarResources() {
  solarDetail?.dispose();solarDetail=null;state.solarStatus='deferred';
  if(typeof createImageBitmap!=='function')return;
  const context=gl;
  solarDetail=createDetailCache({capacity:1,load:async(_key,signal)=>{
    const bitmap=await loadSolarAtlas({signal});
    try{
      if(signal.aborted||!state.active||gl!==context||context.isContextLost())throw new Error('Solar graphics generation changed');
      if(textureLimits.get(context)<bitmap.width)throw new Error('Solar reference exceeds device texture limit');
      const pixels=bitmapPixels(bitmap);
      const quietBytes=solarQuietBytes(solarAtlasQuietProfiles(pixels,bitmap.width,bitmap.height));
      const tex=makeTexture(bitmap,false);
      // Atlas frames have no mip chain blending and no implicit color conversion.
      context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MIN_FILTER,context.LINEAR);
      const quiet=makeQuietTexture(context,quietBytes);
      return {tex,quiet};
    }finally{bitmap.close();}
  },release:value=>{if(value){context.deleteTexture(value.tex);context.deleteTexture(value.quiet);}},onChange:(_key,status)=>{
    state.solarStatus=status;
    queueMicrotask(()=>{updatePhysicalAppearance();if(state.active&&gl===context){window.dispatchEvent(new Event('sol:presentation'));if(!state.animate)paint();armSolarFlow();}});
  }});
}

function resetSunLook(contextLost=false){
  if(contextLost){const old=sunLook;sunLook=null;old?.dispose();}
  else sunLook?.suspend({retry:true});
  sunLookDrawn=false;
  state.sunLookStatus='deferred';state.sunLookReason='';
}
function drawApprovedSun(vp,eye,pos,radius,pixels){
  if(state.solarMode!=='illustrative'||!state.useTextures||state.galaxy)return false;
  const rotation=sunLookRotation(iauRotation(BODY.Sun,rotationDisplayUnix.Sun??state.renderUnix));
  const plan=planSunLook({vp,rotation,position:pos,radius,eye,resolution:state.sunLookResolution,pixels});
  if(!plan){
    sunLook?.suspend();const status=sunLook?.status();
    state.sunLookStatus=status?.state||'deferred';state.sunLookReason=status?.reason||'';return false;
  }
  if(!sunLook){
    const context=gl;
    const owner=createSunLookRenderer(context,{shaderOptions:{now:()=>performance.now(),
      schedule:callback=>requestAnimationFrame(callback),cancel:handle=>cancelAnimationFrame(handle)},onChange:(status,reason)=>{
      queueMicrotask(()=>{
        if(sunLook!==owner||gl!==context||!state.active)return;
        state.sunLookStatus=status;state.sunLookReason=reason;
        updatePhysicalAppearance();updateOrreryAccuracy();
        if(!document.hidden){paint();armSolarFlow();}
      });
    }});
    sunLook=owner;
  }
  const owner=sunLook;
  if(!owner.render(plan,{seconds:solarActivitySeconds(),prominences:state.sunLookProminences,
    framebuffer:sceneFramebuffer,viewport:sceneViewport}))return false;
  state.sunLookStatus='ready';sunLookDrawn=true;
  owner.draw(plan,1,{linear:linearFrame});
  queueTransparent(pos,eye,()=>{
    if(sunLook!==owner)return;
    gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);owner.draw(plan,2,{linear:linearFrame});
    gl.depthMask(true);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  });
  return true;
}

function drawSolarReference(vp,eye,pos,radius,pixels,pass=0) {
  if(!solarEuvActive()||!state.useTextures||!solarDetail)return false;
  if(pixels>=12)solarDetail.request('reference');
  const detail=solarDetail.get('reference');if(!detail)return false;
  const rot=sourceSolarRotation(),model=mul(translate(pos),mul(rot,scaleM([radius,radius,radius])));
  const values=solarRenderUniforms(state.solarPlayback.seconds,{reducedMotion:prefersReducedMotion(),flowSeconds:solarActivitySeconds()});
  const cam=physicalCameraPosition(eye,pos,rot,radius,1);
  gl.useProgram(P.solar);gl.uniformMatrix4fv(P.solarU.u_mvp,false,new Float32Array(mul(vp,model)));
  gl.uniform1i(P.solarU.u_pass,pass);
  gl.uniform3fv(P.solarU.u_camObj,new Float32Array(cam));
  for(const [uniform,key] of [['u_extent','extent'],['u_frameMix','frameMix'],['u_phase','phase']])gl.uniform1f(P.solarU[uniform],values[key]);
  for(const key of ['sourceBasis0','sourceBasis1'])gl.uniformMatrix3fv(P.solarU['u_'+key],false,new Float32Array(values[key]));
  for(const key of ['projection0','projection1'])gl.uniform4fv(P.solarU['u_'+key],new Float32Array(values[key]));
  gl.uniform2fv(P.solarU.u_observerRadii,new Float32Array(values.observerRadii));
  gl.uniform4fv(P.solarU['u_loopNormal[0]'],new Float32Array(values.loopNormal));
  gl.uniform4fv(P.solarU['u_loopTangent[0]'],new Float32Array(values.loopTangent));
  gl.uniform1fv(P.solarU['u_loopGain[0]'],new Float32Array(values.loopGain));
  gl.uniform1f(P.solarU.u_displayGain,SOLAR_EUV_DISPLAY_GAIN);
  gl.uniform1f(P.solarU.u_coronaGlow,1);
  gl.uniform1f(P.solarU.u_cmeProgress,values.cme.progress);
  gl.uniform3fv(P.solarU.u_cmeAxis,new Float32Array(values.cme.axis));
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,detail.tex);gl.uniform1i(P.solarU.u_atlas,0);
  gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,detail.quiet);gl.uniform1i(P.solarU.u_quiet,4);
  gl.activeTexture(gl.TEXTURE0);
  bindBodyMesh();gl.enable(gl.CULL_FACE);gl.cullFace(Math.hypot(...cam)<values.extent?gl.FRONT:gl.BACK);
  gl.drawElements(gl.TRIANGLES,sphere.count,gl.UNSIGNED_SHORT,0);gl.disable(gl.CULL_FACE);
  return true;
}

function bindTerrainShadow(mesh,physicalRadius,locations=P.sphereU) {
  gl.uniform1f(locations.u_bodyRadiusKm,physicalRadius);
  gl.uniform1i(locations.u_terrainShadowEnabled,mesh.heightTex?1:0);
  gl.activeTexture(gl.TEXTURE0+5);gl.bindTexture(gl.TEXTURE_2D,mesh.heightTex||whiteTex);gl.uniform1i(locations.u_terrainHeight,5);
  if(mesh.heightTex){gl.uniform4fv(locations.u_terrainShape,new Float32Array(mesh.shadow.shape));gl.uniform2fv(locations.u_terrainPoles,new Float32Array(mesh.shadow.poles));}
  gl.activeTexture(gl.TEXTURE0);
}

// Kick off async loads of the real surface maps; each appears as soon as it decodes. Missing files
// (fetch_textures.py not run) just leave the body on its procedural shader.
// A missing map used to vanish into an empty onerror while the UI kept promising photographic
// surfaces. Say so — once in the console per file, and once in the panel for the whole build.
let texNoteShown = false;
const MAPPED_FAILURE_NOTE = " (Some mapped reference images are unavailable; those surfaces are simplified. Reopen this view to retry.)";
function updateReferenceNotice() {
  const insight = document.getElementById("orreryInsight");
  if (!insight) return;
  const base = insight.textContent.replace(MAPPED_FAILURE_NOTE, '');
  const next = base + (Object.values(state.appearanceStatus).includes('unavailable') ? MAPPED_FAILURE_NOTE : '');
  if (insight.textContent !== next) insight.textContent = next;
}
function texMissing(file, mapped = false) {
  console.warn(`Reference image unavailable: ${file}; showing the documented simplified surface.`);
  if (mapped) { updateReferenceNotice(); return; }
  if (texNoteShown) return;
  texNoteShown = true;
  const insight = document.getElementById("orreryInsight");
  if (insight) {
    insight.textContent += " (Some reference images are unavailable; those surfaces are simplified.)";
  }
}

function updateTextureBudget() {
  const entries=Object.values(referenceTextures);
  state.textureBudget={residentBytes:entries.reduce((sum,e)=>sum+(e.ready?e.plan.bytes:0),0),
    pendingBytes:entries.reduce((sum,e)=>sum+(e.loading?(e.pendingPlan||e.plan).decodedBytes:0),0)};
}

function requestReferenceTextures() {
  if (!gl || !state.active || !state.useTextures || state.galaxy) return;
  const generation=textureGeneration;let changed=false;
  for(const asset of referenceDemand) {
    const entries=Object.values(referenceTextures);
    if(entries.filter(e=>e.loading).length>=MAX_REFERENCE_REQUESTS)break;
    if(['loading','unavailable'].includes(state.appearanceStatus[asset.id]))continue;
    let plan;
    try {plan=planTextureDisplay(asset,referenceVisible.get(asset.body)||0,window.devicePixelRatio||1,textureLimits.get(gl));}
    catch {state.appearanceStatus[asset.id]='unavailable';changed=true;continue;}
    const previous=referenceTextures[asset.id];
    if(previous?.ready && (previous.plan.width>=plan.width || previous.failedWidth>=plan.width))continue;
    if(entries.reduce((sum,e)=>sum+(e.loading?(e.pendingPlan||e.plan).decodedBytes:0),0)+plan.decodedBytes>MAX_REFERENCE_PENDING_BYTES)continue;
    const attempt={tex:previous?.tex||null,ready:!!previous?.ready,loading:true,used:++referenceUseSerial,abort:new AbortController(),bitmap:null,plan:previous?.plan||plan,pendingPlan:plan,previous};
    referenceTextures[asset.id]=attempt;state.appearanceStatus[asset.id]='loading';changed=true;
    const current=()=>generation===textureGeneration && referenceTextures[asset.id]===attempt && attempt.loading && !attempt.abort.signal.aborted;
    requestReferenceImage(asset,{plan,signal:attempt.abort.signal,onReady:bitmap=>{
      if(!current()){bitmap.close();return;}
      attempt.bitmap=bitmap;paint();
    },onError:()=>{
      if(!current())return;
      attempt.abort.abort();
      if(previous?.ready){previous.failedWidth=plan.width;referenceTextures[asset.id]=previous;state.appearanceStatus[asset.id]='ready';}
      else {delete referenceTextures[asset.id];state.appearanceStatus[asset.id]='unavailable';}
      texMissing(asset.path,true);updateEarthLayerStatus();updateOrreryAccuracy();
      updateTextureBudget();paint();
    }});
  }
  updateTextureBudget();return changed;
}

// At most one source-image upload per scheduled frame. Decode callbacks only
// transfer ownership; they cannot burst synchronous GPU uploads in a microtask.
function uploadReadyReferenceTexture() {
  const entry=Object.entries(referenceTextures).find(([,e])=>e.loading&&e.bitmap);
  if(!entry || !gl)return;
  const [id,attempt]=entry,asset=referenceDemand.find(a=>a.id===id);
  if(!asset)return;
  try {
    let ready=Object.entries(referenceTextures).filter(([key,e])=>e.ready&&key!==id);
    while(ready.length>=MAX_REFERENCE_TEXTURES || ready.reduce((sum,[,e])=>sum+e.plan.bytes,0)+attempt.pendingPlan.bytes>MAX_REFERENCE_GPU_BYTES) {
      const victim=ready.filter(([key])=>!referenceDemand.some(a=>a.id===key)).sort(([,a],[,b])=>a.used-b.used)[0];
      if(!victim)throw Error('Reference texture budget exhausted');
      gl.deleteTexture(victim[1].tex);delete referenceTextures[victim[0]];state.appearanceStatus[victim[0]]='deferred';
      ready=ready.filter(([key])=>key!==victim[0]);
    }
    const linearFilter=linearFilterReference(asset);
    gl.activeTexture(gl.TEXTURE0);
    attempt.tex=makeTexture(attempt.bitmap,true,attempt.pendingPlan.exact,asset.nodata==='alpha'&&!attempt.pendingPlan.exact,linearFilter);
    if(attempt.previous?.ready)gl.deleteTexture(attempt.previous.tex);
    attempt.plan=attempt.pendingPlan;attempt.previous=null;
    attempt.ready=true;attempt.loading=false;attempt.linearFilter=linearFilter;attempt.used=++referenceUseSerial;
    state.appearanceStatus[id]='ready';updateReferenceNotice();
  } catch {attempt.abort.abort();
    if(attempt.previous?.ready){attempt.previous.failedWidth=attempt.pendingPlan.width;referenceTextures[id]=attempt.previous;state.appearanceStatus[id]='ready';}
    else {delete referenceTextures[id];state.appearanceStatus[id]='unavailable';}
    texMissing(asset.path,true);}
  finally {attempt.bitmap.close();attempt.bitmap=null;updateTextureBudget();updateEarthLayerStatus();updateOrreryAccuracy();paint();}
}

function cancelPendingReferenceTextures(keep = []) {
  let changed=false;
  for(const [id,entry] of Object.entries(referenceTextures)) {
    if(!entry.loading || keep.some(a=>a.id===id))continue;
    changed=true;
    if(entry.previous?.ready){referenceTextures[id]=entry.previous;state.appearanceStatus[id]='ready';}
    else {delete referenceTextures[id];state.appearanceStatus[id]='deferred';}
    entry.abort.abort();entry.bitmap?.close();entry.bitmap=null;
  }
  updateTextureBudget();return changed;
}

// Artistic materials have a separate cache and never enter the source-qualified inventory.
function resetIllustrativeResources() {
  resetEarthLookResources();
  shaderPrograms?.retry('earthLook');
  const prior=illustrativeDetails;illustrativeDetails=null;illustrativeDemand=[];
  prior?.dispose();state.illustrativeStatus={};
  state.illustrativeDemandBodies=[];state.illustrativeVisibleFocused=[];
}
function resetEarthLookResources(){
  const prior=earthLookDetails;earthLookDetails=null;earthLookWanted=false;
  prior?.dispose();state.earthLookStatus='deferred';
}
function admitEarthLookProgram(){
  if(shaderPrograms?.status('earthLook')==='ready'&&!P.earthLook){
    P.earthLook=shaderPrograms.get('earthLook');
    P.earthLookU=uloc(P.earthLook,['u_mvp','u_camObj','u_lightObj','u_oblate','uCloudPhase','u_pixelDiameter',
      'u_earthLookExposure','u_earthLookPass','u_earthWeather','u_earthNight','u_earthAtmosphere',
      'u_tex','uCloudMap','u_nightTex','u_oceanMask','u_linearOutput']);
  }
}
function syncEarthLookDemand(){
  const wanted=state.active&&!document.hidden&&earthLookSelected(state)&&(referenceVisible.get('Earth')||0)>=8;
  if(!wanted){if(earthLookDetails)resetEarthLookResources();return;}
  earthLookWanted=true;
  if(!gl||!shaderPrograms)return;
  shaderPrograms.request('earthLook',EARTH_LOOK_VS,EARTH_LOOK_FS);admitEarthLookProgram();
  if(!earthLookDetails){
    const context=gl;
    const cache=createDetailCache({capacity:1,load:async(_key,signal)=>{
      const image=await decodeIllustrativeMap(EARTH_LOOK_ASSET,signal,{maxDimension:Math.min(2048,textureLimits.get(context))});let tex=null,mask=null;
      try{
        if(signal.aborted||earthLookDetails!==cache||gl!==context||context.isContextLost()
          ||!earthLookWanted||!state.active||!earthLookSelected(state))throw new Error('Earth look demand changed');
        context.activeTexture(context.TEXTURE0);tex=makeTexture(image,true);mask=uploadEarthOceanMask(context);
        return {tex,mask};
      }catch(error){if(tex)context.deleteTexture(tex);if(mask)context.deleteTexture(mask);throw error;}
      finally{image.close();}
    },release:value=>{context.deleteTexture(value.tex);context.deleteTexture(value.mask);},onChange:()=>{
      queueMicrotask(()=>{if(earthLookDetails!==cache||gl!==context)return;
        updateEarthLookReadiness();updateEarthLayerStatus();updateOrreryAccuracy();
        if(state.active&&!document.hidden&&!state.animate)paint();});
    }});
    earthLookDetails=cache;
  }
  earthLookDetails.request('Earth');updateEarthLookReadiness();
  if(state.earthLookStatus==='ready')state.opticsStatus.Earth='deferred';
}
function updateEarthLookReadiness(){
  const asset=earthLookDetails?.status('Earth'),program=shaderPrograms?.status('earthLook');
  state.earthLookStatus=asset==='unavailable'||program==='unavailable'?'unavailable'
    :asset==='ready'&&program==='ready'?'ready':earthLookWanted?'loading':'deferred';
}
function syncIllustrativeDemand() {
  const demand=planIllustrativeDemand(referenceVisible,state);
  if(!gl)return;
  if(!illustrativeDetails&&demand.length){
    const context=gl;
    const cache=createDetailCache({capacity:MAX_ILLUSTRATIVE_TEXTURES,load:async(body,signal)=>{
      const asset=ILLUSTRATIVE_ASSETS.find(a=>a.body===body);
      const image=await decodeIllustrativeMap(asset,signal);
      try {
        if(signal.aborted||illustrativeDetails!==cache||gl!==context||context.isContextLost()
            ||!state.active||!illustrativeSelected(body,state)||!illustrativeDemand.includes(body))
          throw new Error('Illustrative graphics demand changed');
        return {tex:makeTexture(image,true)};
      } finally {image.close();}
    },release:value=>context.deleteTexture(value.tex),onChange:(body,status)=>{
      queueMicrotask(()=>{
        if(illustrativeDetails!==cache||gl!==context)return;
        // A failed source needs an explicit mode/texture retry even after eviction.
        if(status!=='deferred'||state.illustrativeStatus[body]!=='unavailable')state.illustrativeStatus[body]=status;
        updateEarthLayerStatus();updateOrreryAccuracy();
        if(state.active&&!state.animate&&(status==='ready'||status==='unavailable'))paint();
      });
    }});
    illustrativeDetails=cache;
  }
  const next=demand.map(a=>a.body);
  if(next.join(',')!==illustrativeDemand.join(','))illustrativeDetails?.abortPending();
  illustrativeDemand=next;
  for(const body of next){
    if(state.illustrativeStatus[body]==='unavailable')continue;
    illustrativeDetails.request(body);
    state.illustrativeStatus[body]=illustrativeDetails.status(body);
  }
  state.illustrativeDemandBodies=next;
  state.illustrativeVisibleFocused=[...referenceVisible].filter(([body,pixels])=>
    illustrativeSelected(body,state)&&pixels>=8&&(state.selected===body||state.anchor===body)).map(([body])=>body);
}

function syncReferenceDemand() {
  syncCatalogueDemand();
  syncIllustrativeDemand();
  syncEarthLookDemand();
  referenceDemand = planReferenceDemand(referenceVisible, state);
  const nextRequests = referenceDemand.filter(asset=>!['ready','unavailable'].includes(state.appearanceStatus[asset.id]))
    .slice(0,MAX_REFERENCE_REQUESTS);
  let changed=cancelPendingReferenceTextures(nextRequests);
  for (const asset of appearanceReferences()) {
    const wanted = referenceDemand.some(a=>a.id===asset.id);
    const status = state.appearanceStatus[asset.id];
    if (!status || status === 'queued' || status === 'deferred') {
      const next=wanted?'queued':'deferred';
      if(status!==next){state.appearanceStatus[asset.id]=next;changed=true;}
    }
    if (wanted && referenceTextures[asset.id]?.ready) referenceTextures[asset.id].used = ++referenceUseSerial;
  }
  uploadReadyReferenceTexture();
  changed=requestReferenceTextures()||changed;
  updateEarthLayerStatus(); updateReferenceNotice();
  // Demand admission occurs after label/accuracy presentation. A paused frame
  // must disclose its newly loading map even before decode schedules a redraw.
  if(changed)updateDetailAppearance(state);
}

function loadTextures() {
  if (!gl) return;
  resetIllustrativeResources();
  // This entry point is only used for explicit re-entry, re-enable or restore.
  // Ordinary paints request new demand but never retry failed pinned imagery.
  for (const asset of appearanceReferences()) {
    if(referenceTextures[asset.id])referenceTextures[asset.id].failedWidth=0;
    if (state.appearanceStatus[asset.id] === 'unavailable') state.appearanceStatus[asset.id] = 'deferred';
  }
  if (texturesStarted) return;
  textureGeneration++;
  const repaint = () => { if (state.active && !state.animate) paint(); };
  texturesStarted = true;
  for (const [name, file] of Object.entries(TEXTURE_FILES)) {
    if (!textureEligible(name)) continue;
    const img = new Image();
    img.onload = () => { try { textures[name] = { tex: makeTexture(img, true), ready: true }; repaint(); } catch (e) { console.warn("texture", name, e.message); } };
    img.onerror = () => texMissing(file);
    img.src = "textures/" + file + ""; // Immutable release namespace versions this asset.
  }
  if (textureEligible("saturn_ring", "ring-profile")) {
  const ring = new Image();
  // The alpha profile rides with the photo ring: when the textured ring is what's drawn, its
  // shadow must be cast from the SAME radial density, or toggling Photo textures would change
  // the ring without changing its shadow (and the photo's fine gaps would not shadow at all).
  ring.onload = () => { try { ringTex = { tex: makeTexture(ring, false), ready: true, alphaProfile: ringImageAlphaProfile(ring) }; repaint(); } catch (e) {} };
  ring.onerror = () => texMissing("saturn_ring.png");
  ring.src = "textures/saturn_ring.png";
  }
  // The real Sun (NASA SDO HMI continuum) for the 3-D Sun's surface — served same-origin from
  // textures/ (sdo.gsfc.nasa.gov sends no CORS header, so a remote image can't be a WebGL texture).
  // tools/fetch_textures.py downloads the latest disk to textures/sun.jpg; absent → procedural shader.
  // Its fetch-epoch metadata (sun.jpg.json, written by the same script) must resolve FIRST:
  // sunDiskBasis freezes the disk basis on first use, so the epoch has to be known before the
  // texture can render — a committed baseline frame may be days or months old, and mapping it
  // as if it were captured "now" would put its sunspots at the wrong solar longitudes.
  if (!textureEligible("Sun", "observed-disk")) return;
  const sun = new Image();
  sun.onload = () => {
    try {
      sunTex = { tex: makeTexture(sun, false), ready: true };
      repaint();
    } catch (e) { console.warn("sun texture", e.message); }
  };
  sun.onerror = () => texMissing("sun.jpg");
  fetch("textures/sun.jpg.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((meta) => {
      state.sunImageUnix = meta && Number.isFinite(meta.fetched_unix) ? meta.fetched_unix : null;
      sun.src = "textures/sun.jpg";
    });
}

// Build the generated surface maps from the committed geography. One body per idle slice: the
// Earth map is 2048x1024 with a per-pixel tint pass, and doing all four in one go would drop
// frames on the very first render of the view.
// Drive a slice-yielding generator to completion, returning to the event loop between slices
// so a long pixel pass cannot hold the frame.
function runSliced(it, idle) {
  return new Promise((resolve) => {
    const pump = () => {
      const r = it.next();
      if (r.done) { resolve(r.value); return; }
      idle(pump);
    };
    pump();
  });
}

async function buildGeneratedMaps() {
  if (genStarted || !gl) return;
  genStarted = true;
  if (!["Earth", "Moon"].some(name => textureEligible(name, "generated-map"))) return;
  try {
    // Geography no longer waits on the moons. The pairing existed so the Focus and moon
    // controls could not be starved by the larger geography download, but moons.js is static
    // now and answers those controls on its own; only the ~1 MB element knots are deferred,
    // and nothing here needs them. Awaiting them would put a megabyte in front of Earth's
    // coastline texture — which is exactly what browser_validation's blue-Earth assertion
    // caught when this ran as a Promise.all.
    const geo = await import("./geography.js");
    // Only Earth and the Moon. Mars and Mercury have real, catalogued features too, but nothing
    // in that catalogue says which of them are dark — see tools/fetch_geography.py — so they
    // keep the procedural shader rather than a guess. fetch_textures.py still supplies real
    // photographic maps for every body to anyone who wants them locally.
    /** @type {[string, () => any, number][]} */
    const jobs = [
      ["Earth", () => buildEarthMapSliced(geo.EARTH, geo.decodeRing), 0],
      ["Moon", () => buildFeatureMap(geo.FEATURES.Moon, BODY.Moon.radiusKm), 1],
    ];
    const idle = typeof requestIdleCallback === "function"
      ? (fn) => requestIdleCallback(fn, { timeout: 500 })
      : (fn) => setTimeout(fn, 0);
    for (const [name, build, texMode] of jobs) {
      if (!textureEligible(name, "generated-map")) continue;
      await new Promise((resolve) => idle(() => {
        // The context can die (or the view close) between slices; bail rather than throw.
        if (!gl || gl.isContextLost()) { resolve(); return; }
        try {
          // Earth's builder is a generator that hands control back every few hundred rows;
          // the feature maps are cheap enough to return a canvas outright.
          const made = build();
          const canvas = made && typeof made.next === "function" ? runSliced(made, idle) : made;
          if (canvas && typeof canvas.then === "function") {
            canvas.then((cv) => {
              try { genTex[name] = { tex: makeTexture(cv, true), ready: true, texMode }; } catch (e) { console.warn("surface map", name, e.message); }
              if (state.active && !state.animate) paint();
              resolve();
            });
            return;
          }
          genTex[name] = { tex: makeTexture(canvas, true), ready: true, texMode };
          if (state.active && !state.animate) paint();
        } catch (e) { console.warn("surface map", name, e.message); }
        resolve();
      }));
    }
  } catch (e) { console.warn("geography unavailable:", e.message); }
}

/**
 * Pull in the element knots and hang them on the identity records.
 *
 * moons.js stays a static import so Focus and the accessible positions list have their 21 moons
 * the instant the view opens — that guarantee is why it was made static in the first place. Only
 * the knots are deferred, and they are ~99% of the bytes, so the first-paint cost of widening the
 * validated window is a few KB rather than a megabyte.
 */
function loadMoonCatalogue(explicitRetry=false) {
  if(moonElementsReady)return Promise.resolve(moonSet);
  if (moonElementsPromise) return moonElementsPromise;
  // Retry retains the immutable release URL. The loader bounds logical ownership;
  // the browser may share an existing physical import with a later attempt.
  const request=moonLoader.request({recover:explicitRetry});
  const pending = request
    .then((mod) => {
      if(moonElementsPromise!==pending)return moonSet;
      for (const m of moonSet.MOONS) Object.assign(m, mod.MOON_ELEMENTS[m.n]);
      moonElementsReady = moonSet.MOONS.every((m) => Array.isArray(m.el));
      // Nothing else will ask for a frame: with Animate off — which prefers-reduced-motion
      // forces — the loop idles after entry, so without this the moons never appear at all.
      if (state.active && !state.animate) paint();
      return moonSet;
    })
    .catch((e) => {
      if(moonElementsPromise===pending&&e.name!=='AbortError')console.warn("moon elements unavailable:", e.message);
      return moonSet;
    }).finally(()=>{if(moonElementsPromise===pending){moonElementsPromise=null;updateCatalogueStatus();}});
  moonElementsPromise=pending;updateCatalogueStatus();
  return moonElementsPromise;
}

function loadStarCatalogue(explicitRetry=false){
  if(starCat)return Promise.resolve(starCat);
  if(starCataloguePromise)return starCataloguePromise;
  const request=starLoader.request({recover:explicitRetry});
  const pending=request.then(catalogue=>{
    if(starCataloguePromise!==pending)return null;
    starCat=catalogue;updateOrreryPositions();
    if(gl&&P.sphereU&&!gl.isContextLost()){buildCelestialBuffers();buildGalaxyBuffers();}
    if(state.active)paint();
    return starCat;
  }).catch(error=>{if(starCataloguePromise===pending&&error.name!=='AbortError')console.warn('star catalogue unavailable:',error.message);return null;})
    .finally(()=>{if(starCataloguePromise===pending){starCataloguePromise=null;updateCatalogueStatus();}});
  starCataloguePromise=pending;updateCatalogueStatus();return pending;
}

function uloc(p, names) { const m = {}; for (const n of names) m[n] = gl.getUniformLocation(p, n); return m; }

// The optional pool owns only its six buffers. The renderer owns the base.
// Retain a failed cleanup owner for explicit retry; never grow another pool over it.
function releaseSphereMeshes(lost=false){
  if(sphereMeshPool){
    const result=lost?sphereMeshPool.abandon():sphereMeshPool.dispose();
    if(result.pendingBuffers)return result;
    sphereMeshPool=null;
  }
  if(!lost&&sphereContext&&!sphereContext.isContextLost()&&sphere){
    for(const buffer of [sphere.pos,sphere.idx])if(buffer&&sphereContext.isBuffer(buffer))sphereContext.deleteBuffer(buffer);
    const error=sphereContext.getError();
    if(error!==sphereContext.NO_ERROR)throw new Error(`Base sphere cleanup failed (0x${error.toString(16)})`);
  }
  sphere=null;sphereContext=null;
  return {pendingBuffers:0,cleanupErrors:[]};
}

function initGL(canvas) {
  const prior=releaseSphereMeshes();
  if(prior.pendingBuffers)throw new Error('Prior sphere buffer cleanup is incomplete; retry graphics or reload.');
  // No preserveDrawingBuffer: nothing reads the framebuffer back, and keeping it costs
  // a full-framebuffer copy per composite on many GPUs.
  gl = canvas.getContext("webgl2", { antialias: true, depth: true, alpha: false, premultipliedAlpha: false });
  if (!gl) return null;
  textureLimits.set(gl,gl.getParameter(gl.MAX_TEXTURE_SIZE));
  resetSunLook();contextGeneration++;sceneSerial=0;
  scatteringTargets?.dispose();scatteringTargets=null;scatteringFrame=null;state.scatteringFrame=null;state.scatteringStatus={};
  shaderPrograms?.dispose();P={};state.programStatus={base:'loading',physical:'deferred'};state.programDiagnostics={};
  const context=gl;
  const manager=createShaderPrograms(context,{generation:++programContextGeneration,capacity:15,
    now:()=>performance.now(),schedule:callback=>requestAnimationFrame(callback),cancel:handle=>cancelAnimationFrame(handle),
    onChange:(key,status)=>{
      if(shaderPrograms!==manager||gl!==context)return;
      state.programDiagnostics[key]=manager.diagnostic(key);
      const [physicalBody,physicalRole]=key.split(':');
      const physicalKey=['Earth','Mars'].includes(physicalBody)&&PHYSICAL_PROGRAMS.includes(physicalRole);
      if(physicalKey&&physicalBody===incidentDemand)state.programDiagnostics[physicalRole]={...manager.diagnostic(key),body:physicalBody};
      // Synchronous fallback admission happens at the call site. Only parallel
      // terminal transitions need a repaint, after the polling stack unwinds.
      if(!manager.parallel||status==='loading')return;
      queueMicrotask(()=>{
        if(shaderPrograms!==manager||gl!==context)return;
        if(key==='earthLook'){
          admitEarthLookProgram();updateEarthLookReadiness();updateOrreryAccuracy();
          if(state.active&&!document.hidden&&P.sphereU)paint();
        }else if(physicalKey){
          // Read current state: an explicit retry may precede this notification.
          // A failure in one profile must not cancel another profile's work.
          admitPhysicalPrograms(physicalBody);updatePhysicalAppearance();
          if(state.active&&!document.hidden&&P.sphereU)paint();
        }else if(manager.status(key)==='unavailable')manager.cancelPending();
      });
    }});
  shaderPrograms=manager;
  const definitions=[['sphere',BASE_SPHERE_VS,BASE_SPHERE_FS],['line',LINE_VS,LINE_FS],['ring',RING_VS,RING_FS],
    ['pt',PT_VS,PT_FS],['glow',GLOW_VS,GLOW_FS],['solar',SOLAR_VS,SOLAR_FS]];
  const requests=definitions.map(([key,vertex,fragment])=>manager.request(key,vertex,fragment));
  const finish=()=>{
    if(shaderPrograms!==manager||gl!==context||!state.active||context.isContextLost())return null;
    if(definitions.some(([key])=>manager.status(key)!=='ready')){
      const failure=definitions.map(([key])=>manager.diagnostic(key)).find(record=>record.status==='unavailable');
      state.programStatus.base='unavailable';console.error('orrery shader error:',failure?.error||'Shader preparation cancelled');
      manager.dispose();shaderPrograms=null;gl=null;P={};return null;
    }
    for(const [key] of definitions)P[key]=manager.get(key);
    try{return finishGL();}
    catch(error){
      const failures=[];
      if(shaderPrograms===manager&&gl===context){
        try{const result=releaseSphereMeshes();if(result.pendingBuffers)failures.push(new Error('Sphere buffer cleanup remains pending.'));}
        catch(problem){failures.push(problem);}
        shaderPrograms=null;gl=null;P={};state.programStatus.base='unavailable';
      }
      try{manager.dispose();}catch(problem){failures.push(problem);}
      if(failures.length)throw new AggregateError([error,...failures],'Graphics setup failed; resource cleanup is incomplete.');
      throw error;
    }
  };
  // SwiftShader/no-KHR keeps the supported synchronous completion path. Native
  // KHR polling yields the main thread while mandatory base programs complete.
  return manager.parallel?Promise.all(requests.map(request=>request.done)).then(finish):finish();
}

function finishGL(){
  // Array uniforms are queried at element 0 — the location uniform4fv() needs to upload the
  // whole array in one call. GLSL ES 3.00 accepts the bare name for that too, but "[0]" is the
  // form the WebGL spec guarantees, and a silently null location would just skip the upload.
  P.sphereU = uloc(P.sphere, ["u_mvp", "u_model", "u_nmat", "u_style", "u_mode", "u_time", "u_activity", "u_activityFrame", "u_activityDays", "u_spot[0]", "u_base", "u_light", "u_cam", "u_atmo", "u_atmoStr", "u_useTex", "u_texMode", "u_tex", "u_sunA", "u_lightObj", "u_ringRad", "u_oblate", "u_ringTex", "u_moonShadowCount", "u_moonShadowPos[0]", "u_moonShadowAxis[0]", "u_map", "u_mapLat", "u_mapWindow", "u_mapNoData", "u_earthNight", "u_earthWeather", "u_earthIce", "u_nightTex", "u_weatherTex", "u_iceTex",
    "u_hazeRayleighTau", "u_hazeAerosol"]);
  P.lineU = uloc(P.line, ["u_vp", "u_alpha"]);
  P.ringU = uloc(P.ring, ["u_mvp", "u_model", "u_useTex", "u_tex", "u_center", "u_light", "u_prad"]);
  P.ptU = uloc(P.pt, ["u_vp", "u_dpr", "u_soft", "u_shearT", "u_shearK", "u_shearRc"]);
  P.glowU = uloc(P.glow, ["u_vp", "u_center", "u_right", "u_up", "u_size", "u_color", "u_pow"]);
  Object.assign(P.sphereU,uloc(P.sphere,[...ATMOSPHERE_UNIFORMS,...INCIDENT_FIELD_UNIFORMS,'u_atmosphereColumnField','u_atmosphereOzoneField','u_bodyRadiusKm','u_terrainHeight','u_terrainShadowEnabled','u_terrainShape','u_terrainPoles']));
  P.solarU=uloc(P.solar,['u_mvp','u_camObj','u_pass','u_extent','u_atlas','u_quiet','u_frameMix','u_phase','u_displayGain','u_coronaGlow','u_cmeProgress','u_cmeAxis','u_sourceBasis0','u_sourceBasis1','u_projection0','u_projection1','u_observerRadii','u_loopNormal[0]','u_loopTangent[0]','u_loopGain[0]']);
  Object.assign(P.sphereU,uloc(P.sphere,['u_textureLinear','u_illustrativeLinear','u_saturnLook']));
  for(const name of ['sphere','line','ring','pt','glow','solar'])
    Object.assign(P[`${name}U`],uloc(P[name],['u_linearOutput']));

  const s = buildSphere(48, 96);
  sphere = { pos: gl.createBuffer(), idx: gl.createBuffer(), count: s.idx.length };
  sphereContext=gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, sphere.pos); gl.bufferData(gl.ARRAY_BUFFER, s.pos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, s.idx, gl.STATIC_DRAW);
  sphereMeshPool=createSphereMeshPool({gl,base:sphere,baseGeometry:s,buildSphere,generation:programContextGeneration});
  sphereMeshPool.initialize();
  initTerrainResources();
  initIncidentResources();
  initSolarResources();

  quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

  sceneLineBuf = gl.createBuffer();
  orbitLineBuf = gl.createBuffer();orbitLineKey='';orbitLineCount=0;
  dropLineBuf = gl.createBuffer();
  bodyBuf = gl.createBuffer();
  for (const name of ["bg", "mw", "bright", "marker", "wind", "galaxy", "galGuide", "galTrail", "beltA", "beltK", "smallMark", "galObj", "catStars", "nbhd", "nbhdGuide"]) celBufs[name] = gl.createBuffer();

  // 1×1 white fallback so the sphere/ring sampler always has a valid texture bound.
  whiteTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, whiteTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

  buildCelestialBuffers();
  buildGalaxyBuffers();
  buildSmallBuffers();

  let label = "WebGL2";
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  if (dbg) { const r = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL); if (r) label += " · " + r; }
  state.programStatus.base='ready';
  return { label };
}

function physicalProgramState(body){
  if(!shaderPrograms||!['Earth','Mars'].includes(body))return 'deferred';
  const states=PHYSICAL_PROGRAMS.map(role=>shaderPrograms.status(physicalProgramKey(body,role)));
  return states.every(status=>status==='ready')?'ready':states.includes('unavailable')?'unavailable':states.includes('loading')?'loading':'deferred';
}

function admitPhysicalPrograms(body=incidentDemand){
  if(!shaderPrograms||!P.sphereU)return;
  P.physicalSets??={};
  const states=['Earth','Mars'].includes(body)?PHYSICAL_PROGRAMS.map(role=>shaderPrograms.status(physicalProgramKey(body,role))):[];
  if(states.length&&states.every(status=>status==='ready')){
    if(!P.physicalSets[body]){
      const record={physicalSphere:shaderPrograms.get(physicalProgramKey(body,'physicalSphere')),
        atmosphere:shaderPrograms.get(physicalProgramKey(body,'atmosphere')),
        scatteringGenerator:shaderPrograms.get(physicalProgramKey(body,'scatteringResolve')),
        scatteringNumerator:shaderPrograms.get(physicalProgramKey(body,'scatteringNumerator'))};
      record.physicalSphereU=uloc(record.physicalSphere,[...Object.keys(P.sphereU),...SCATTERING_UNIFORMS,'u_scatteringReferenceHeightKm']);
      record.atmosphereU=uloc(record.atmosphere,['u_mvp',...ATMOSPHERE_UNIFORMS,...SCATTERING_UNIFORMS,'u_atmosphereColumnField','u_atmosphereOzoneField','u_linearOutput']);
      record.scatteringGeneratorU=uloc(record.scatteringGenerator,[...ATMOSPHERE_UNIFORMS,...SCATTERING_UNIFORMS,'u_atmosphereColumnField','u_atmosphereOzoneField','u_scatteringPass','u_scatteringNumerator']);
      record.scatteringNumeratorU=uloc(record.scatteringNumerator,[...ATMOSPHERE_UNIFORMS,...SCATTERING_UNIFORMS,'u_atmosphereColumnField','u_atmosphereOzoneField','u_scatteringPass']);
      P.physicalSets[body]=record;
    }
    if(!scatteringTargets){
      const context=gl,programs=shaderPrograms,generation=programContextGeneration;
      scatteringTargets=createProfiledScatteringTargets((ownerBody,capacity)=>{
        const expectedProfile=serializeAtmosphereProfile(getAtmosphereProfile(ownerBody));
        return createScatteringTargets(context,{contextGeneration,programGeneration:generation,capacity,
          programs,generatorKey:physicalProgramKey(ownerBody,'scatteringResolve'),generatorUniforms:P.physicalSets[ownerBody].scatteringGeneratorU,
          numeratorKey:physicalProgramKey(ownerBody,'scatteringNumerator'),numeratorUniforms:P.physicalSets[ownerBody].scatteringNumeratorU,
          admitPlan:(plan,profile,options)=>profile.body===ownerBody&&serializeAtmosphereProfile(profile)===expectedProfile
            &&validScatteringPlanBudget(plan)&&serializeAtmosphereProfile(plan)===serializeAtmosphereProfile(planAtmosphereScattering(profile,options))});
      });
    }
    scatteringTargets.register(body);
  }
  state.programStatus.physical=physicalProgramState(incidentDemand);
}

function requestPhysicalPrograms(body){
  if(!shaderPrograms||state.programStatus.base!=='ready')return;
  if(PHYSICAL_PROGRAMS.some(role=>shaderPrograms.status(physicalProgramKey(body,role))==='unavailable'))return;
  const sources=physicalProgramSources(body),startedAt=performance.now();
  for(const role of PHYSICAL_PROGRAMS){const source=sources[role];shaderPrograms.request(physicalProgramKey(body,role),source.vertex,source.fragment,{startedAt});}
  admitPhysicalPrograms(body);
}

function cancelPendingPrograms(){
  scatteringTargets?.cancel();scatteringFrame=null;state.scatteringFrame=null;state.scatteringStatus={};
  if(!shaderPrograms)return;
  if(state.programStatus.base==='loading'){
    // Discarding an in-flight base compile supersedes the entry awaiting it.
    graphicsLifecycle++;
    shaderPrograms.dispose();shaderPrograms=null;gl=null;P={};state.programStatus={base:'deferred',physical:'deferred'};
  }else{shaderPrograms.cancelPending();admitPhysicalPrograms();}
}

function opticalReadiness(body){
  const fields=incidentFields?.status(body)||'unavailable',program=physicalProgramState(body);
  const scattering=state.scatteringStatus[body];
  return fields==='unavailable'||program==='unavailable'||scattering?.state==='unavailable'?'unavailable':
    fields==='ready'&&program==='ready'&&scattering?.state==='submitted'
    &&scattering.submission?.sceneSerial===scatteringFrame?.sceneSerial?'ready':'loading';
}

function buildCelestialBuffers() {
  cel = buildCelestial(starCat);
  // Background stars arrive pre-packed in the point-shader layout [x,y,z,size,r,g,b,a] —
  // the real Hipparcos naked-eye catalogue with per-star B−V colour (see celestial.js).
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.bg); gl.bufferData(gl.ARRAY_BUFFER, cel.bgStars.packed, gl.STATIC_DRAW);
  celBufs.bgCount = cel.bgStars.count;

  // Milky Way band points: cel.milkyWay = [x,y,z,w]*
  const mwN = cel.milkyWay.length / 4, mw = new Float32Array(mwN * 8);
  for (let i = 0; i < mwN; i++) {
    const w = cel.milkyWay[i * 4 + 3];
    mw.set([cel.milkyWay[i * 4], cel.milkyWay[i * 4 + 1], cel.milkyWay[i * 4 + 2], 1.6, 0.80, 0.84, 1.0, 0.10 * w], i * 8);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.mw); gl.bufferData(gl.ARRAY_BUFFER, mw, gl.STATIC_DRAW);
  celBufs.mwCount = mwN;

  // bright catalogue stars
  const bs = cel.brightStars, bsa = new Float32Array(bs.length * 8);
  bs.forEach((s, i) => bsa.set([s.pos[0], s.pos[1], s.pos[2], Math.max(2.2, 5.5 - 0.7 * s.m), 1.0, 0.98, 0.92, 1.0], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.bright); gl.bufferData(gl.ARRAY_BUFFER, bsa, gl.STATIC_DRAW);
  celBufs.brightCount = bs.length;

  // pulsars (cyan) + galaxies (violet) markers
  const marks = [];
  for (const p of cel.pulsars) marks.push([p.pos, 5.0, [0.45, 0.95, 1.0]]);
  for (const g of cel.deepsky) marks.push([g.pos, 4.5, g.kind === "gc" ? [1.0, 0.7, 0.3] : [0.85, 0.7, 1.0]]);
  const ma = new Float32Array(marks.length * 8);
  marks.forEach((m, i) => ma.set([m[0][0], m[0][1], m[0][2], m[1], m[2][0], m[2][1], m[2][2], 1.0], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.marker); gl.bufferData(gl.ARRAY_BUFFER, ma, gl.STATIC_DRAW);
  celBufs.markerCount = marks.length;

  // constellation + Milky-Way nothing; constellation lines → line buffer [x,y,z,r,g,b]
  const cl = cel.constLines, clp = new Float32Array(cl.length / 3 * 6);
  for (let i = 0; i < cl.length / 3; i++) clp.set([cl[i * 3], cl[i * 3 + 1], cl[i * 3 + 2], 0.40, 0.52, 0.78], i * 6);
  celBufs.constLine = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.constLine); gl.bufferData(gl.ARRAY_BUFFER, clp, gl.STATIC_DRAW);
  celBufs.constCount = cl.length / 3;
}

// ---------------------------------------------------------------- Milky Way (galactic-scale view)
// (The galaxy MODEL — constants, the Sun's orbit, differential-rotation shear, and the
// procedural point-cloud/guide-ring/label generation — lives in orreryGalaxy.js, imported
// above. This file only uploads the returned arrays and draws them.)
// Galactic years advanced per real second while animating (reuses the Time-speed slider, scaled to Myr).
function galYearsPerSec() { return state.galSpeed * 1e6; }       // galSpeed is in Myr/s; default 2 ⇒ a lap in ~110 s
// Move the Sun along its galactic orbit for the current galactic time, and update its travelling label.
function updateGalaxySun() {
  if (!galaxy) return;
  const yrs = state.offsetYears + state.galYears;
  galaxy.sunPos = sunGalacticPos(yrs);
  const lbl = galaxy.labels.find((l) => l.sun);
  if (lbl) {
    lbl.p = galaxy.sunPos;
    const orbits = (GAL_OMEGA * yrs) / (2 * Math.PI);
    lbl.name = Math.abs(state.galYears) < 1e4
      ? "☉ Sun — you are here (~26,700 ly out)"
      : `☉ Sun · ${yrs >= 0 ? "+" : "−"}${Math.abs(yrs / 1e6).toFixed(1)} Myr · ${Math.abs(orbits).toFixed(2)} galactic orbits`;
  }
}

// Upload the procedural galaxy model (points, guide rings, labels) and the deep-sky
// landmark objects — generation is pure and lives in orreryGalaxy.js.
let galObjects = [];
let nbhd = null; // solar-neighbourhood model (points + rings + named labels)
// The 370 KB star-catalogue data module, loaded ON DEMAND when this view first opens
// (in parallel with the WASM engine fetch) — deliberately NOT a static import, so the
// Sun / My Sky surfaces never pay for it at first paint. Cached for the session.
let starCat = null;
function buildGalaxyBuffers() {
  const model = buildGalaxyModel();
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galaxy);
  gl.bufferData(gl.ARRAY_BUFFER, model.points, gl.STATIC_DRAW);
  celBufs.galaxyCount = model.count;
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galGuide);
  gl.bufferData(gl.ARRAY_BUFFER, model.guide, gl.STATIC_DRAW);
  galaxy = { sunPos: model.sunPos, ranges: model.ranges, labels: model.labels };
  updateGalaxySun(); // Rebuilds retain the existing galactic clock and travelling label.

  const list = buildGalObjectList();
  galObjects = list.objects;
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galObj); gl.bufferData(gl.ARRAY_BUFFER, list.packed, gl.STATIC_DRAW);
  celBufs.galObjCount = galObjects.length;

  // The real naked-eye catalogue at true galactic positions (clusters at the Sun — honest
  // scale), plus the light-year-scale solar-neighbourhood model where it resolves.
  const cat = buildCatalogStarsGalactic(starCat);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.catStars); gl.bufferData(gl.ARRAY_BUFFER, cat.points, gl.STATIC_DRAW);
  celBufs.catStarsCount = cat.count;
  nbhd = buildNeighbourhoodModel(starCat);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.nbhd); gl.bufferData(gl.ARRAY_BUFFER, nbhd.points, gl.STATIC_DRAW);
  celBufs.nbhdCount = nbhd.count;
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.nbhdGuide); gl.bufferData(gl.ARRAY_BUFFER, nbhd.guide, gl.STATIC_DRAW);
}

// ---------------------------------------------------------------- small bodies (belts, dwarfs, comets, probes)
let belts = null;
function buildSmallBuffers() {
  belts = buildBelts();
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.beltA); gl.bufferData(gl.ARRAY_BUFFER, belts.asteroid.data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.beltK); gl.bufferData(gl.ARRAY_BUFFER, belts.kuiper.data, gl.STATIC_DRAW);
}

// Recompute every small-body marker for the current `renderUnix`, and upload them as one point buffer.
function rebuildSmallBodies() {
  smallBodies = [];
  const jy2k = timeJy2k(state.renderUnix);
  // `el` carries the source record so the detail card can show the orbit (a, e, i, period).
  for (const b of DWARFS) smallBodies.push({ name: b.n, pos: bodyXYZ(b, jy2k), col: b.col, kind: "dwarf", note: b.note, el: b });
  for (const c of COMETS) smallBodies.push({ name: c.n, pos: bodyXYZ(c, jy2k), col: c.col, kind: "comet", note: c.note, el: c });
  for (const p of PROBES) smallBodies.push({ name: p.n, pos: probeXYZ(p), col: p.col, kind: "probe", note: p.note, el: p });
  updateSmallDetailFacts(smallBodies.find(body=>body.name===state.selected));
  if (!gl||!P.sphereU) return; // CPU facts still follow time changes while graphics prepare.
  // The CPU-side list above is ALWAYS built: the Focus dropdown and the detail panel resolve
  // small bodies through it even while the drawn layer is hidden. Only the GPU markers are
  // gated on the checkbox (drawSmallBodies/pick/labels each gate themselves).
  if (!state.showSmall) { celBufs.smallMarkCount = 0; return; }
  const a = new Float32Array(smallBodies.length * 8);
  smallBodies.forEach((s, i) => a.set([s.pos[0], s.pos[1], s.pos[2], s.kind === "probe" ? 6 : 7, s.col[0], s.col[1], s.col[2], 1.0], i * 8));
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.smallMark); gl.bufferData(gl.ARRAY_BUFFER, a, gl.DYNAMIC_DRAW);
  celBufs.smallMarkCount = smallBodies.length;
}

// Julian years from J2000 for a Unix time (TT≈UTC at this precision — fine for the illustrative layer).
function timeJy2k(unixSeconds) { return (unixSeconds / 86400 + 2440587.5 - 2451545.0) / 365.25; }

// Solar-wind particle system (radial streamers from the Sun, Parker-spiral curl).
function initParticles() {
  const N = 520; particles = { N, p: new Float32Array(N * 3), v: new Float32Array(N * 3), age: new Float32Array(N), data: new Float32Array(N * 8) };
  for (let i = 0; i < N; i++) spawnParticle(i);
}
function spawnParticle(i) {
  const u = Math.random() * 2 - 1, th = Math.random() * 2 * Math.PI, r = Math.sqrt(1 - u * u);
  const dir = [r * Math.cos(th), r * Math.sin(th), u];
  const start = 0.22 + Math.random() * 0.05; // emanate from just outside the (capped) solar disc
  particles.p.set([dir[0] * start, dir[1] * start, dir[2] * start], i * 3);
  const speed = 0.18 + Math.random() * 0.12;
  particles.v.set([dir[0] * speed, dir[1] * speed, dir[2] * speed], i * 3);
  particles.age[i] = Math.random() * 60;
}
function stepParticles(dt) {
  if (!particles || !gl) return;
  for (let i = 0; i < particles.N; i++) {
    const x = particles.p[i * 3], y = particles.p[i * 3 + 1], z = particles.p[i * 3 + 2];
    const rr = Math.hypot(x, y, z) || 1e-6;
    // Parker-spiral curl: a small azimuthal nudge (rotation about z) growing with radius.
    const curl = 0.45 * dt;
    const nx = x - y * curl, ny = y + x * curl;
    particles.p[i * 3] = nx + particles.v[i * 3] * dt * 6;
    particles.p[i * 3 + 1] = ny + particles.v[i * 3 + 1] * dt * 6;
    particles.p[i * 3 + 2] = z + particles.v[i * 3 + 2] * dt * 6;
    particles.age[i] += dt;
    if (rr > 4.0 || particles.age[i] > 70) spawnParticle(i);
    const fade = Math.max(0, 1 - rr / 4.0);
    particles.data.set([particles.p[i * 3], particles.p[i * 3 + 1], particles.p[i * 3 + 2], 2.0, 1.0, 0.85, 0.55, 0.5 * fade], i * 8);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.wind); gl.bufferData(gl.ARRAY_BUFFER, particles.data, gl.DYNAMIC_DRAW);
}

// ---------------------------------------------------------------- per-frame data
function effectiveBaseUnix(offsetYears=state.offsetYears) { return Date.now() / 1000 + offsetYears * YR; }

let lastPosUpdate = 0;
let lastFullSnapshot = 0;
let systemGeneration = 0, metadataPending = false, metadataFailed = false;

async function refreshSystemMetadata() {
  if(metadataPending||metadataFailed||!state.active||document.hidden)return;
  const generation=systemGeneration,unix=state.renderUnix;
  metadataPending=true;
  try {
    const snapshot=await requestSystemSnapshot(unix);
    if(generation!==systemGeneration||!state.active)return;
    const projected=projectSystemPositions(snapshot.bodies,systemPositions(state.renderUnix));
    state.bodies=projected;
    state.metadataUnix=unix;state.engineError="";lastFullSnapshot=performance.now();
    // Never replace current-time marker coordinates with a delayed metadata epoch.
    rebuildPositions();buildSceneLines();
    updateOrreryAccuracy();
    if(!state.animate)paint();
  } catch(error) {
    if(generation===systemGeneration&&state.active){metadataFailed=true;state.engineError=`Orbital metadata unavailable: ${error.message}; prior metadata retained. Retry explicitly to resume metadata updates.`;updateOrreryAccuracy();}
  } finally {if(generation===systemGeneration)metadataPending=false;}
}

function cancelSystemWork(){
  systemGeneration++;metadataPending=false;
  // Cancellation releases the old entry immediately; its finally handler must
  // not own a replacement started before the rejected promise settles.
  enterPromise=null;state.entering=false;
  cancelSystemSnapshot();
}

function rebuildPositions() {
  try {
    // Fixed 27-f64 calculation is the measured main-thread exception. Full JSON,
    // orbital-element and phase metadata computation runs only in a separate worker.
    state.bodies=projectSystemPositions(state.bodies,systemPositions(state.renderUnix));
  } catch (e) {state.engineError=e.message;return false;}
  finishPositionUpdate();
  return true;
}

function finishPositionUpdate() {
  if(performance.now()-lastFullSnapshot>800)void refreshSystemMetadata();
  buildDropLines();
  rebuildSmallBodies();
  // Refresh the text "Positions" list (a11y), throttled so animation doesn't thrash the DOM.
  const now = performance.now();
  if (now - lastPosUpdate > 800) { updateOrreryPositions(); lastPosUpdate = now; }
}

function applySystemTime(offsetYears, resetGalaxy=false) {
  cancelSystemWork();
  try {
    if(!Number.isFinite(offsetYears))throw new Error("Invalid System time offset");
    const {unix}=validateSystemRequest({unix:effectiveBaseUnix(offsetYears)});
    const bodies=projectSystemPositions(state.bodies,systemPositions(unix));
    // Publish one complete intent only after every coordinate and distance validates.
    Object.assign(state,{bodies,renderUnix:unix,offsetYears,simElapsed:0,engineError:""});
    if(resetGalaxy)state.galYears=0;
    metadataFailed=false;lastFullSnapshot=0;
    resetRotationDisplay();finishPositionUpdate();
    if(state.galaxy||resetGalaxy)updateGalaxySun();
    paint();
  } catch(error) {
    metadataFailed=true;
    state.engineError=`System time change unavailable: ${error.message}; prior rendered time and coordinates retained. Retry or choose another time.`;
  }
  const slider=/** @type {HTMLInputElement|null} */ (document.getElementById("orreryTime"));
  if(slider)slider.value=String(state.offsetYears);
  updateOrreryAccuracy();
}

// Text alternative to the canvas (accessibility): every body's heliocentric distance + ecliptic
// longitude — the content the standalone top-down "Solar System" surface used to provide.
function updateOrreryPositions() {
  const list = document.getElementById("orreryPositions");
  if (!list) return;
  const rows = [];
  // Rows are BUTTONS, not text. This panel is the canvas's stated text alternative, so anything
  // you can click in the 3-D view has to be reachable here too — otherwise the moons would exist
  // only for pointer users, since the label overlay is aria-hidden and hit-testing is by cursor.
  const select = (name) => {
    state.selectedStar = starCat?.NAMED_STARS.find(s=>`star:${s.hip}` === name) || null;
    state.selected = name;
    if (typeof CustomEvent === "function") window.dispatchEvent?.(new CustomEvent("sol:object-selected", { detail: { surface: "orrery" } }));
    showDetail(name);
    updateOrreryPositions();
    const focus = document.getElementById("orreryFocusSelected");
    if (focus) focus.toggleAttribute("disabled", !!state.selectedStar);
    if (!state.animate) paint();
    armSolarFlow();
  };
  const addRow = (name, text, kind, searchName = name) => {
    if (!matchesObject({name:searchName,kind},state.objectQuery,state.objectGroup)) return;
    rows.push({ id: name, label: text, selected: state.selected === name, className: kind === "moon" ? "sky-row orrery-pos-moon" : "sky-row" });
  };
  addRow("Sun", "Sun · heliocentric origin", "planet");
  for (const b of state.bodies) {
    if (b.x_au == null || b.dist_au == null) continue;
    const lon = (((Math.atan2(b.y_au, b.x_au) * 180) / Math.PI) + 360) % 360;
    addRow(b.name, `${b.name}: ${b.dist_au.toFixed(2)} AU from the Sun, ecliptic longitude ${lon.toFixed(0)}°`, b.name === "Moon" ? "moon" : "planet");
    // Its moons directly beneath it, so the hierarchy is audible in reading order.
    for (const m of moonSet.moonsOf(b.name)) {
      const period = m.P < 1 ? `${(m.P * 24).toFixed(1)} h` : `${m.P.toFixed(2)} d`;
      addRow(m.n, `↳ ${m.n}: moon of ${b.name}, ${Math.round(m.a).toLocaleString()} km out, `
        + `orbit ${period}, radius ${Math.round(m.r).toLocaleString()} km`
        + (!withinMoonValidity(state.renderUnix,moonSet.MOON_VALID_MIN_JD,moonSet.MOON_VALID_MAX_JD) ? " · position unavailable at this epoch"
          : !moonElementsReady ? (moonLoader.status==='failed'?' · orbital positions unavailable':moonLoader.status==='loading'?' · orbital positions loading':' · orbital positions load when viewed') : !state.showMoons ? " · visual layer hidden" : ""), "moon");
    }
  }
  for (const s of smallBodies) addRow(s.name, `${s.name} · ${s.kind} · illustrative orbit${state.showSmall ? "" : " · visual layer hidden"}`, "small");
  for (const s of starCat?.NAMED_STARS || []) addRow(`star:${s.hip}`, `${s.name} · star · catalogue magnitude ${s.mag}`, "star", s.name);
  const count = document.getElementById("orreryObjectCount");
  if (count) count.textContent = `${rows.length} matching objects${rows.length > 100 ? " · showing first 100; refine search for any object" : ""}${starCat ? "" : starLoader.status==='failed'?" · named-star catalogue unavailable":starLoader.status==='loading'?" · named-star catalogue loading":" · search or choose Named stars to load their catalogue"}. Label suppression does not remove objects from search.`;
  syncObjectRows(list, rows.slice(0,100), select);
}

// Static reference grids, plus orbit definitions refreshed with the elements.
// Orbit vertices are cached separately for the current view and viewport size.
function buildSceneLines() {
  if (!gl||!P.sphereU) return; // context lost mid-animation — tick()/handlers survive until restore
  const v = []; sceneRanges = [];
  orbitDefinitions=[];orbitLineRevision++;
  const push = (pts, col, mode) => {
    const first = v.length / 6; for (const p of pts) v.push(p[0], p[1], p[2], col[0], col[1], col[2]);
    sceneRanges.push({ first, count: pts.length, mode });
  };
  if (state.showOrbits) {
    for (const b of state.bodies) {
      if (b.a_au == null) continue;
      const c = BODY[b.name] ? BODY[b.name].color : [1, 1, 1];
      orbitDefinitions.push({body:b,color:[c[0]*0.6,c[1]*0.6,c[2]*0.6]});
    }
  }
  // Dwarf-planet + comet orbits — the illustrative small-body layer, drawn dimmer than the planets.
  if (state.showSmall && state.showOrbits) {
    for (const d of DWARFS) orbitDefinitions.push({body:asOrbit(d),color:[d.col[0]*0.4,d.col[1]*0.4,d.col[2]*0.45]});
    for (const c of COMETS) orbitDefinitions.push({body:asOrbit(c),color:[0.34,0.5,0.62]});
  }
  // Optional ecliptic reference plane: concentric rings + spokes.
  if (state.showSunEq) {
    const G = [0.18, 0.22, 0.30];
    for (const rad of [1, 5, 10, 20, 30]) {
      const ring = []; for (let k = 0; k <= 96; k++) { const a = (k / 96) * 2 * Math.PI; ring.push([Math.cos(a) * rad, Math.sin(a) * rad, 0]); }
      push(ring, G, "strip");
    }
    for (let s = 0; s < 12; s++) { const a = (s / 12) * 2 * Math.PI; push([[0, 0, 0], [Math.cos(a) * 31, Math.sin(a) * 31, 0]], G, "lines"); }

  }

  // The Sun's equatorial plane — tilted 7.25° to the ecliptic (its spin axis is the real IAU pole).
  // Gold rings + the spin axis make the offset between the Sun's equator and the planets' plane explicit.
  if (state.showSunEq) {
    const pole = norm(poleVector(BODY.Sun, state.renderUnix));
    let u = norm(cross([0, 0, 1], pole)); if (!isFinite(u[0]) || u[0] * u[0] + u[1] * u[1] + u[2] * u[2] < 1e-9) u = [1, 0, 0];
    const vv = cross(pole, u);
    const GOLD = [0.52, 0.40, 0.13];
    for (const rad of [1, 5, 10, 20, 30]) {
      const ring = [];
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * 2 * Math.PI, cs = Math.cos(a) * rad, sn = Math.sin(a) * rad;
        ring.push([u[0] * cs + vv[0] * sn, u[1] * cs + vv[1] * sn, u[2] * cs + vv[2] * sn]);
      }
      push(ring, GOLD, "strip");
    }
    push([[-pole[0] * 1.7, -pole[1] * 1.7, -pole[2] * 1.7], [pole[0] * 1.7, pole[1] * 1.7, pole[2] * 1.7]], [0.85, 0.62, 0.22], "lines");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, sceneLineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
}

function drawOrbitLines(vp,width,height) {
  if(state.solarInspection || !orbitDefinitions.length) return;
  const key=[orbitLineRevision,width,height,...vp].join(',');
  if(key!==orbitLineKey) {
    const vertices=[];let capped=false;
    for(const {body,color} of orbitDefinitions) {
      const result=projectOrbitLines(body,vp,width,height);capped||=result.capped;
      for(let k=0;k<result.positions.length;k+=3)
        vertices.push(result.positions[k],result.positions[k+1],result.positions[k+2],...color);
    }
    orbitLineCount=vertices.length/6;
    gl.bindBuffer(gl.ARRAY_BUFFER,orbitLineBuf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);
    orbitLineKey=key;
    state.orbitCurveStatus={vertices:orbitLineCount,capped};
  }
  gl.uniformMatrix4fv(P.lineU.u_vp,false,LINE_IDENTITY);
  bindLine(orbitLineBuf);gl.drawArrays(gl.LINES,0,orbitLineCount);
  gl.uniformMatrix4fv(P.lineU.u_vp,false,matrixUpload(vp));
}

// The ONLY per-frame line geometry: one drop-line per body from its position to the
// ecliptic plane (2 points each — trivial next to the ~2k vertices the old combined
// rebuild re-tessellated and re-uploaded every animation frame).
function buildDropLines() {
  if (!gl||!P.sphereU) return;
  const v = []; dropRanges = [];
  let first = 0;
  for (const b of state.showSunEq ? state.bodies : []) {
    if (b.x_au == null) continue;
    for (const pt of [[b.x_au, b.y_au, b.z_au], [b.x_au, b.y_au, 0]]) {
      v.push(pt[0], pt[1], pt[2], 0.42, 0.47, 0.58);
    }
    dropRanges.push({ first, count: 2, mode: "lines" });
    first += 2;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, dropLineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STREAM_DRAW);
}

let displayPolicyCache=null;
function sceneDisplayPolicy() {
  const key=`${state.trueScale}:${state.galaxy}:${state.topDown}:${state.focusMode}:${state.anchor}`;
  if(!displayPolicyCache||displayPolicyCache.key!==key||displayPolicyCache.moons!==moonSet.MOONS){
    displayPolicyCache={key,moons:moonSet.MOONS,value:resolveSystemDisplayPolicy({
      trueScale:state.trueScale,galaxy:state.galaxy,topDown:state.topDown,focus:state.focusMode,anchor:state.anchor,
      inspectable:!!BODY[state.anchor]||moonSet.MOONS.some(m=>m.n===state.anchor)})};
  }
  return displayPolicyCache.value;
}

let displayRadiusCache = null;
function displayRadiusAU(name) {
  const sunExtent=state.solarMode==='illustrative'&&state.useTextures?SUN_LOOK_EXTENT:1.35;
  const physicalScale = sceneDisplayPolicy().physicalGeometry;
  const key = `${state.renderUnix}:${physicalScale}:${state.exaggeration}:${moonElementsReady}:${sunExtent}`;
  if (!displayRadiusCache || displayRadiusCache.key !== key || displayRadiusCache.bodies !== state.bodies) {
    const records = [{ name: "Sun", x_au: 0, y_au: 0, z_au: 0 }, ...state.bodies.filter(b => b.name !== "Sun" && b.name !== "Moon")];
    const inputs = records.filter(b => BODY[b.name]).map(b => {
      const phys = BODY[b.name], requestedRadius = (VIS_RADIUS_AU[b.name] || .05) * state.exaggeration;
      let extentRatio = phys.rings ? phys.rings.outerKm / phys.radiusKm : 1;
      const terrain=terrainExtentKm(b.name);
      if(terrain)extentRatio=Math.max(extentRatio,terrain.maxRadiusKm/phys.radiusKm);
      const optical=getAtmosphereProfile(b.name);if(optical)extentRatio=Math.max(extentRatio,1+optical.topKm/phys.radiusKm);
      if(b.name==='Sun')extentRatio=Math.max(extentRatio,sunExtent);
      // Bound the whole displayed system envelope before computing uniform moon scaling.
      if (b.name === "Earth") extentRatio = Math.max(extentRatio, 3.4);
      if (moonElementsReady) {
        const moons = moonSet.moonsOf(b.name);
        const scale = systemScale(moons, requestedRadius, false, requestedRadius * extentRatio,
          m => requestedMoonRadius(m, phys.radiusKm, requestedRadius));
        for (const m of moons) extentRatio = Math.max(extentRatio,
          ((m.a * (1 + m.e) / AU_KM) * scale + requestedMoonRadius(m, phys.radiusKm, requestedRadius)) / requestedRadius);
      }
      return { name: b.name, pos: [b.x_au,b.y_au,b.z_au], physicalRadius: phys.radiusKm / AU_KM, requestedRadius, extentRatio };
    });
    const radii = resolveDisplayRadii(inputs, physicalScale);
    radii.Moon = physicalScale ? BODY.Moon.radiusKm / AU_KM
      : Math.max(BODY.Moon.radiusKm / AU_KM, (radii.Earth || .08) * VIS_RADIUS_AU.Moon / VIS_RADIUS_AU.Earth);
    displayRadiusCache = { key, bodies: state.bodies, radii };
  }
  return displayRadiusCache.radii[name] ?? BODY[name].radiusKm / AU_KM;
}

function bodyWorldPos(b) {
  if (b.name === "Sun") return [0, 0, 0];
  if (b.name === "Moon") return moonDisplayPos(b);
  return [b.x_au, b.y_au, b.z_au];
}

// The Moon sits ~0.0026 AU from Earth — invisible beside Earth's exaggerated "visible" disc. Keep
// its real direction & phase, but in visible mode push it just clear of Earth's enlarged sphere.
function moonDisplayPos(moon) {
  const earth = state.bodies.find((x) => x.name === "Earth");
  if (!earth) return [moon.x_au, moon.y_au, moon.z_au];
  const e = [earth.x_au, earth.y_au, earth.z_au];
  const off = [moon.x_au - e[0], moon.y_au - e[1], moon.z_au - e[2]];
  const len = Math.hypot(off[0], off[1], off[2]) || 1e-9;
  if (sceneDisplayPolicy().physicalGeometry) return [moon.x_au, moon.y_au, moon.z_au];
  const sep = displayRadiusAU("Earth") * 2.4 + displayRadiusAU("Moon") * 1.5;
  const k = Math.max(len, sep) / len;
  return [e[0] + off[0] * k, e[1] + off[1] * k, e[2] + off[2] * k];
}

function displayDpr(){return effectiveRenderDpr(window.devicePixelRatio,renderQuality.current);}
function syncRenderQuality(){
  state.renderQuality=renderQuality.current;
  const {mode,tier}=state.renderQuality,description=tier[0].toUpperCase()+tier.slice(1);
  const control=/** @type {HTMLSelectElement|null} */(document.getElementById('orreryQuality'));
  if(control&&control.value!==mode)control.value=mode;
  const status=document.getElementById('orreryQualityStatus');
  if(status)writeText(status,`${mode==='auto'?'Auto · ':''}${description} display resolution`);
}
function ensureSized(canvas) {
  const dpr = displayDpr();
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  // Assigning an unchanged dimension still resets the drawing buffer.
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return [w, h];
}

// A moon's DISPLAYED world position — the same parent + offset·systemScale arithmetic drawMoons
// uses, so the camera can anchor a moon before (and regardless of whether) its markers were built
// this frame. Returns null when the catalogue hasn't loaded, the epoch is outside the validated
// window, or the parent is missing.
function moonWorldPos(name) {
  if (!moonElementsReady) return null;
  const m = moonSet.MOONS.find((x) => x.n === name);
  if (!m) return null;
  if (!withinMoonValidity(state.renderUnix, moonSet.MOON_VALID_MIN_JD, moonSet.MOON_VALID_MAX_JD)) return null;
  const parent = state.bodies.find((x) => x.name === m.p);
  if (!parent || parent.x_au == null) return null;
  const phys = BODY[m.p];
  const parentDisplayAU = displayRadiusAU(m.p);
  const ringOuterAU = phys.rings ? (phys.rings.outerKm / phys.radiusKm) * parentDisplayAU : 0;
  const scale = systemScale(moonSet.moonsOf(m.p), parentDisplayAU, sceneDisplayPolicy().physicalGeometry, ringOuterAU, moon => requestedMoonRadius(moon, phys.radiusKm, parentDisplayAU));
  const off = moonOffsetAU(m, state.renderUnix);
  return [parent.x_au + off[0] * scale, parent.y_au + off[1] * scale, parent.z_au + off[2] * scale];
}

// The point the orbit camera looks at: the Sun (origin), the selected anchor body — a planet,
// a moon, or a small-body marker — or the origin in galaxy mode, where solar anchors don't apply.
function anchorPos() {
  if (state.galaxy || state.anchor === "Sun" || !state.anchor) return [0, 0, 0];
  const b = state.bodies.find((x) => x.name === state.anchor);
  if (b) return bodyWorldPos(b);
  const mp = moonWorldPos(state.anchor);
  if (mp) return mp;
  // An anchored moon whose epoch has left the validated window (moonWorldPos → null): follow
  // its PARENT rather than snapping a tightly-zoomed camera to the Sun — the moon layer is
  // hidden at these epochs and the accuracy line already says why.
  const m = moonSet.MOONS.find((x) => x.n === state.anchor);
  if (m) {
    const parent = state.bodies.find((x) => x.name === m.p);
    if (parent && parent.x_au != null) return [parent.x_au, parent.y_au, parent.z_au];
  }
  const sb = smallBodies.find((s) => s.name === state.anchor);
  return sb ? sb.pos : [0, 0, 0];
}

// Free-fly forward direction from yaw (about world +z) and pitch.
function flyForward() {
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch), cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
  return [cp * cy, cp * sy, sp];
}

// The orbit camera's eye position (used to seed free-fly so toggling it never jumps).
function orbitEye() {
  const t = anchorPos();
  return [t[0] + state.radius * Math.cos(state.el) * Math.cos(state.az),
    t[1] + state.radius * Math.cos(state.el) * Math.sin(state.az),
    t[2] + state.radius * Math.sin(state.el)];
}

// Only an explicit body/moon focus opts into adaptive framing. Keep the nominal
// fit separate from state.radius so ordinary paints never undo deliberate zoom.
/** @type {{anchor: string, distance: number} | null} */
let orbitFocusFit = null;
function reconcileOrbitFocus(aspect) {
  if (state.freeFly || state.galaxy || state.topDown || !orbitFocusFit) return;
  if (orbitFocusFit.anchor !== state.anchor) { orbitFocusFit = null; return; }
  const extent = anchorDisplayExtent();
  if (!extent) { orbitFocusFit = null; return; }
  const worldDistance = Math.hypot(...anchorPos());
  const fit = fitOrbitDistance(extent, aspect, FOVY, worldDistance);
  // Display-scale changes, a moon falling back to its parent, and portrait
  // resizing all change the fit. Preserve zoom relative to it, then enforce the
  // current enclosing-surface/numerical floor before constructing the eye.
  if (fit !== orbitFocusFit.distance) state.radius *= fit / orbitFocusFit.distance;
  // System framing and body inspection share the same enclosing-surface floor;
  // ordinary paints never pull a deliberate close-up back to the system envelope.
  state.radius = Math.max(state.radius, minimumOrbitDistance(anchorNearExtent() || extent, worldDistance));
  orbitFocusFit.distance = fit;
}

function cameraMatrices(w, h) {
  reconcileOrbitFocus(w / h);
  let eye, view;
  if (state.freeFly) {
    eye = state.freePos;
    const fwd = flyForward();
    view = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 0, 1]);
  } else if (state.topDown && !state.galaxy) {
    // Straight down onto the ecliptic — the top-down orbit map. Drag (az) spins the map; el is unused.
    const t = anchorPos();
    eye = [t[0], t[1], t[2] + state.radius];
    view = lookAt(eye, t, [Math.sin(state.az), Math.cos(state.az), 0]);
  } else {
    const t = anchorPos();
    eye = orbitEye();
    view = lookAt(eye, t, [0, 0, 1]);
  }
  const proj = perspective(FOVY, w / h, state.freeFly || state.galaxy ? .008 : orbitNearPlane(state.radius, anchorNearExtent() || 0), 800);
  const vp = mul(proj, view);
  const skyView = view.slice(); skyView[12] = 0; skyView[13] = 0; skyView[14] = 0;
  const skyVp = mul(proj, skyView);
  return { eye, vp, skyVp };
}

// Draw the belts (additive dust) and the dwarf/comet/probe markers (alpha), depth-tested with the scene.
function drawSmallBodies(vp, dpr) {
  if (!state.showSmall || !belts) return;
  gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive — the belts read as faint dust
  drawPoints(celBufs.beltA, belts.asteroid.count, vp, dpr, 0.9);
  drawPoints(celBufs.beltK, belts.kuiper.count, vp, dpr, 0.9);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // solid markers so their colour reads
  drawPoints(celBufs.smallMark, celBufs.smallMarkCount || 0, vp, dpr, 0.85);
  gl.depthMask(true);
}

// Transparent objects do not write depth. Opaque bodies/moons are submitted first, then
// these callbacks from far to near. Display clearance separates the body envelopes
// (including the selected Sun envelope), so another body cannot lie inside the corona.
let transparentPasses=[];
function queueTransparent(pos,eye,draw) {
  transparentPasses.push({distance:Math.hypot(...sub(pos,eye)),draw});
}

function beginSceneFrame(width,height){
  if(sunLook&&(state.galaxy||state.solarMode!=='illustrative'||!state.useTextures))sunLook.suspend();
  sunLookDrawn=false;
  linearFrame=false;state.hdrFrame=null;
  scatteringFrame={contextGeneration,sceneSerial:++sceneSerial,epoch:state.renderUnix};
  state.scatteringFrame={...scatteringFrame};
  // Failed state capture has no owner diagnostic to retain. Keep its terminal
  // cause until explicit demand/optics retry, without retrying on every repaint.
  state.scatteringStatus=Object.fromEntries(Object.entries(state.scatteringStatus).filter(([,status])=>status.preparationFailed===true));
  scatteringTargets?.beginFrame(scatteringFrame);
  if(!state.hdrEnabled||state.earthIce){
    hdrPresentation?.dispose();hdrPresentation=null;
    state.hdrStatus={state:'deferred',reason:state.earthIce?'Scientific palette selected; SDR composition preserved.':'HDR candidate disabled.'};
  }else{
    if(!hdrPresentation){hdrPresentation=createHdrPresentation(gl,{generation:contextGeneration});hdrFailure=null;}
    state.hdrStatus=hdrFailure??hdrPresentation.resize(width,height);
    if(state.hdrStatus.state==='ready'){
      const frameIdentity={generation:contextGeneration,epoch:state.renderUnix,serial:sceneSerial};
      linearFrame=hdrPresentation.beginFrame(frameIdentity);
      if(linearFrame)state.hdrFrame=frameIdentity;
    }
  }
  if(!linearFrame)gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  sceneFramebuffer=linearFrame?hdrPresentation.framebuffer():null;sceneViewport=[0,0,width,height];
  for(const name of ['sphere','physicalSphere','line','ring','pt','glow','atmosphere','solar']){
    if(!P[name]||!P[`${name}U`])continue;
    gl.useProgram(P[name]);gl.uniform1i(P[`${name}U`].u_linearOutput,linearFrame?1:0);
  }
}

// The scattering prepass runs inside the opaque body pass, whose state paint()
// fixes once per frame before the first body: the scene target and its full
// viewport, the default vertex array, blending and depth testing on, depth
// writes on, no culling, scissor, stencil, discard or coverage, and dither at
// its default. Every draw after the prepass sets its program, meshes and
// sampler units itself, so nothing downstream depends on which of those the
// prepass hands back. This writes that boundary state and hands the targets
// the same values as the restore snapshot. The snapshot is therefore what the
// context holds, by construction: no driver query is needed to learn it, and
// no tracked guess stands in for one. Each restored handle is null or the
// scene target the presentation owner names, so the targets' own check that a
// restore never rebinds a scattering-owned handle stays true of the real state.
// Output units 8 and 9 belong to the scattering consumers, unit 7 to the
// admitted column field, and unit 10 to the packed ozone field. All four are
// released here so a restore can never rebind an owner texture that generation
// may replace.
// The queries this replaces were synchronous round trips on the hosted runner:
// the diagnostic checkpoint attributes 4,604.8 ms to 48 getParameter calls.
const SCENE_PASS_ENABLES={blend:'BLEND',depthTest:'DEPTH_TEST',cullFace:'CULL_FACE',scissorTest:'SCISSOR_TEST',
  stencilTest:'STENCIL_TEST',rasterizerDiscard:'RASTERIZER_DISCARD',sampleCoverage:'SAMPLE_COVERAGE',
  sampleAlphaToCoverage:'SAMPLE_ALPHA_TO_COVERAGE',dither:'DITHER'};
const SCENE_PASS_ENABLED=Object.freeze({blend:true,depthTest:true,cullFace:false,scissorTest:false,stencilTest:false,
  rasterizerDiscard:false,sampleCoverage:false,sampleAlphaToCoverage:false,dither:true});
function scatteringCallerState(){
  if(linearFrame&&!sceneFramebuffer)throw new Error('HDR scene target unavailable for scattering restore');
  const framebuffer=linearFrame?sceneFramebuffer:null,viewport=[...sceneViewport],textureUnits=[];
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(...sceneViewport);
  gl.bindVertexArray(null);gl.useProgram(null);
  for(const unit of [6,7,8,9,10]){
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindSampler(unit,null);
    textureUnits.push({unit,texture:null,sampler:null});
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.colorMask(true,true,true,true);gl.depthMask(true);
  for(const [key,constant] of Object.entries(SCENE_PASS_ENABLES))gl[SCENE_PASS_ENABLED[key]?'enable':'disable'](gl[constant]);
  return {drawFramebuffer:framebuffer,readFramebuffer:framebuffer,viewport,program:null,vertexArray:null,
    activeTexture:gl.TEXTURE0,textureUnits,colorMask:[true,true,true,true],depthMask:true,enabled:{...SCENE_PASS_ENABLED}};
}

function generateBodyScattering(body,profile,opticalOptions,physicalRadius,mesh){
  if(!scatteringTargets||!scatteringFrame||state.scatteringStatus[body]?.preparationFailed)return null;
  const reference=mesh.heightTex?terrainReference(body):null;
  if(mesh.heightTex&&(!reference||mesh.sourceId!==reference.id||mesh.sourceSha256!==reference.sha256)){
    state.scatteringStatus[body]={state:'unavailable',reason:'Terrain source does not match the scattering envelope.',submission:null};return null;
  }
  const options={...opticalOptions,referenceRadiusKm:physicalRadius,
    ...(reference?{minRadiusKm:reference.minRadiusKm,maxRadiusKm:reference.maxRadiusKm}:{} )};
  const plan=planAtmosphereScattering(profile,options);
  if(plan.status!=='ready'){
    state.scatteringStatus[body]={state:'unavailable',reason:plan.reason,submission:null};return null;
  }
  const opticalFields=incidentFields?.get(body);
  const columnTexture=opticalFields?.columnTexture;
  const args={frame:scatteringFrame,plan,profile,opticalOptions:options,columnTexture,ozoneTexture:opticalFields?.ozoneTexture||null,columnIdentity:ATMOSPHERE_COLUMN_FIELDS[body].sha256};
  // Cancellation records withdrawn demand, not a failed target. A demand switch
  // cancels every entry but retries only the newly demanded body, so a body that
  // is still drawn with a resident field would otherwise stay cancelled for the
  // life of the context and silently fall back to the illustrative limb.
  if(scatteringTargets.status(body).state==='cancelled')scatteringTargets.retry(body);
  let generated=false;
  try{generated=scatteringTargets.beginFrame(scatteringFrame)&&scatteringTargets.generate(body,args,scatteringCallerState());}
  catch(error){
    scatteringTargets.cancel(body);
    state.scatteringStatus[body]={state:'unavailable',preparationFailed:true,reason:`Scattering preparation failed: ${String(error?.message??error).slice(0,300)}`,submission:null};
    return null;
  }
  state.scatteringStatus[body]=scatteringTargets.status(body);
  return generated?args:null;
}

function bindBodyScattering(body,args,program,locations){
  const bound=scatteringTargets?.bind(body,args,{program,locations,activeTexture:gl.TEXTURE0});
  if(!bound){
    state.scatteringStatus[body]={...scatteringTargets?.status(body),state:'unavailable',reason:'Current scattering field binding rejected.'};
    state.opticsStatus[body]='unavailable';
  }
  return !!bound;
}
function sceneClearColor(r,g,b){
  gl.clearColor(.../** @type {[number,number,number]} */(linearFrame?[r,g,b].map(srgbToLinear):[r,g,b]),1);
}
function finishSceneFrame(){
  if(!linearFrame)return;
  if(!hdrPresentation.present({exposure:1,frameIdentity:state.hdrFrame})){
    // A rejected producer never leaves an offscreen-only frame visible. Release
    // this owner and render the existing SDR route once; no per-paint retry loop.
    // Keep its failure until owner replacement; dispose reports only cleanup.
    const report=hdrPresentation.status();
    hdrFailure={...report,state:'unavailable',reason:report.state==='unavailable'?report.reason:'HDR presentation rejected.',estimatedBytes:0,presented:null};
    state.hdrStatus=hdrFailure;
    hdrPresentation.dispose();linearFrame=false;state.hdrFrame=null;paint();return;
  }
  state.hdrStatus=hdrPresentation.status();
}

// ---------------------------------------------------------------- draw
function paint() { frameScheduler.invalidate(); }

function renderFrame() {
  syncIncidentDemand();
  if (!state.active || !gl || !P.sphereU || gl.isContextLost()) return false;
  const canvas = document.getElementById("orreryCanvas");
  if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) {
    sunLook?.suspend();
    hdrPresentation?.dispose();hdrPresentation=null;state.hdrFrame=null;linearFrame=false;
    scatteringTargets?.dispose();scatteringTargets=null;scatteringFrame=null;state.scatteringFrame=null;state.scatteringStatus={};
    state.hdrStatus={state:'deferred',reason:'No visible frame.'};return false;
  }
  const [w, h] = ensureSized(canvas);
  beginSceneFrame(w,h);
  const dpr = displayDpr();
  // Camera/picking use CSS aspect; backing-pixel rounding must not refit zoom.
  const { eye, vp, skyVp } = cameraMatrices(canvas.clientWidth, canvas.clientHeight);
  referenceVisible = new Map();
  state.terrainRendered={};state.opticsStatus={};
  referenceViewport = {width:canvas.clientWidth,height:canvas.clientHeight};
  if (state.galaxy) { syncReferenceDemand(); paintGalaxy(w, h, dpr, vp, eye); finishSceneFrame();updatePhysicalAppearance();return true; }

  gl.viewport(0, 0, w, h);
  sceneClearColor(0.004, 0.006, 0.016); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ---- sky backdrop (no depth) ----
  if (state.showSky) {
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive
    drawPoints(celBufs.mw, celBufs.mwCount, skyVp, dpr, 1.0);
    drawPoints(celBufs.bg, celBufs.bgCount, skyVp, dpr, 0.7);
    if (state.showConst) {
      gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, matrixUpload(skyVp)); gl.uniform1f(P.lineU.u_alpha, 0.5);
      bindLine(celBufs.constLine); gl.drawArrays(gl.LINES, 0, celBufs.constCount);
    }
    drawPoints(celBufs.bright, celBufs.brightCount, skyVp, dpr, 0.8);
    drawPoints(celBufs.marker, celBufs.markerCount, skyVp, dpr, 0.85);
  }

  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  moonGuideQueue = [];
  transparentPasses=[];

  // ---- small bodies: the asteroid + Kuiper belts and the dwarf/comet/probe markers ----
  if(!state.solarInspection)drawSmallBodies(vp, dpr);

  // ---- bodies (lit spheres) ----
  moonMarkers = []; // rebuilt by drawMoons as each planet is drawn
  state.moonsHiddenReason = state.showMoons ? moonAvailabilityNote() : '';
  state.moonsAliasedCount = 0;
  for (const name of DRAW_LIST) {
    const b = name === "Sun" ? { name: "Sun" } : state.bodies.find((x) => x.name === name);
    if(state.solarInspection&&name!=='Sun')continue;
    if (!b) continue;
    drawBody(b, vp, eye);
  }
  if (!state.moonsHiddenReason && state.moonsAliasedCount) {
    const count = state.moonsAliasedCount;
    state.moonsHiddenReason = `${count} inner moon${count > 1 ? "s" : ""} hidden — the clock is `
      + "advancing faster than they orbit. Slow the speed or untick Animate to see them.";
  }

  // The fallback solar halo/wind participates in the same transparency ordering.
  queueTransparent([0,0,0],eye,()=>drawSun(vp,eye,w,h));
  transparentPasses.sort((a,b)=>b.distance-a.distance);
  for(const pass of transparentPasses)pass.draw();
  transparentPasses=[];

  // ---- scene: orbits + grid ----
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, matrixUpload(vp)); gl.uniform1f(P.lineU.u_alpha, 0.55);
  bindLine(sceneLineBuf);
  for (const r of state.solarInspection?[]:sceneRanges) gl.drawArrays(r.mode === "lines" ? gl.LINES : gl.LINE_STRIP, r.first, r.count);
  bindLine(dropLineBuf);
  for (const r of state.solarInspection?[]:dropRanges) gl.drawArrays(gl.LINES, r.first, r.count);
  drawOrbitLines(vp,w,h);
  gl.depthMask(true);

  for (const pts of moonGuideQueue) {
    if (!moonPathBuf) moonPathBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, moonPathBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
    bindLine(moonPathBuf);
    gl.depthMask(false); gl.drawArrays(gl.LINES, 0, pts.length / 6); gl.depthMask(true);
  }

  updateLabels(canvas, vp, skyVp);
  gl.disable(gl.BLEND);
  finishSceneFrame();
  syncReferenceDemand();
  updatePhysicalAppearance();
  return true;
}

function bindLine(buf) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
}

function drawPoints(buf, count, vp, dpr, soft, shearT = 0) {
  if (!count) return;
  gl.useProgram(P.pt);
  gl.uniformMatrix4fv(P.ptU.u_vp, false, matrixUpload(vp));
  gl.uniform1f(P.ptU.u_dpr, dpr); gl.uniform1f(P.ptU.u_soft, soft);
  // Differential-rotation shear (galaxy disc only; shearT = galactic years). 0 ⇒ no rotation.
  gl.uniform1f(P.ptU.u_shearT, shearT); gl.uniform1f(P.ptU.u_shearK, GAL_SHEAR_K); gl.uniform1f(P.ptU.u_shearRc, GAL_SHEAR_RC);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.drawArrays(gl.POINTS, 0, count);
}

// The SDO disk is the Earth-facing hemisphere near its capture epoch. sun.jpg.json records when
// fetch_textures.py downloaded the frame—the accuracy contract treats that as an upper-bound
// approximation because SDO's "latest" endpoint can lag. Freeze that Sun→Earth
// direction ONCE, expressed in the Sun's rotating body frame, so the shader keeps the image
// glued to the surface: it co-rotates with the real IAU spin, and sunspots stay put as the
// camera orbits (the old camera-locked basis dragged them around, and its
// cross([0,0,1], camera) degenerated to NaN in the top-down view). Without metadata we fall
// back to "now" — right for a freshly fetched frame, the pre-metadata behaviour otherwise.
let sunBasisA = null;
function sunDiskBasis() {
  if (sunBasisA) return sunBasisA;
  const nowUnix = state.sunImageUnix || Date.now() / 1000; // fetch/load epoch, never the scrubbed sim time
  let d = null;
  try {
    const positions = systemPositions(nowUnix);
    const i = SYSTEM_POSITIONS_ORDER.indexOf("Earth");
    if (positions && i >= 0 && positions.length >= (i + 1) * 3) {
      d = norm([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
    }
  } catch (_) { /* engine hiccup — fall back below */ }
  if (!d) {
    const earth = state.bodies.find((x) => x.name === "Earth");
    if (!earth || earth.x_au == null) return [1, 0, 0]; // no positions yet: harmless placeholder
    d = norm([earth.x_au, earth.y_au, earth.z_au]);
  }
  const rot = iauRotation(BODY.Sun, nowUnix);
  // Body-frame components are Rᵀ·d — rot's upper-left 3×3 is orthonormal, column-major.
  sunBasisA = [
    rot[0] * d[0] + rot[1] * d[1] + rot[2] * d[2],
    rot[4] * d[0] + rot[5] * d[1] + rot[6] * d[2],
    rot[8] * d[0] + rot[9] * d[1] + rot[10] * d[2],
  ];
  return sunBasisA;
}

// Radial alpha profile of the ring photometry PNG (the same axis drawRing samples it on:
// x = radial fraction inner→outer), for shadowing the photo ring by its own density.
function ringImageAlphaProfile(img, n = 160) {
  try {
    const cv = document.createElement("canvas");
    cv.width = n; cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, n, 1);
    const px = ctx.getImageData(0, 0, n, 1).data;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = px[i * 4 + 3];
    return out;
  } catch (_) { return null; } // canvas readback blocked — the model profile still applies
}

function makeProfileTex(data) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, data.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Lazily build (and cache) the 1-D ring-opacity texture the ring-shadow lookup samples —
// R8, LINEAR-filtered so the shadow edges come out softly antialiased for free. The source
// mirrors what drawRing actually renders: the photometry PNG's own alpha when the textured
// Saturn ring is showing, the ringColorAt model otherwise — so ring and shadow always agree,
// including when the Photo textures checkbox flips between them.
function ringShadowProfileTex(name, phys) {
  const photo = textureEligible("saturn_ring", "ring-profile") && name === "Saturn" && state.useTextures && ringTex.ready && ringTex.alphaProfile;
  const key = photo ? name + "#photo" : name;
  if (ringShadowTex[key]) return ringShadowTex[key];
  const data = photo ? ringTex.alphaProfile : ringOpacityProfile(phys.rings);
  ringShadowTex[key] = makeProfileTex(data);
  return ringShadowTex[key];
}

// Per-body presentation clocks used only while true spin exceeds one visible turn per five
// real seconds. Orbital positions and the underlying simulation epoch always remain exact.
let rotationDisplayUnix = {};
const rotationLimitedBodies = new Set();

function resetRotationDisplay() {
  rotationDisplayUnix = {};
  rotationLimitedBodies.clear();
  state.spinLimitedCount = 0;
}

function updateRotationDisplay(realStepSeconds) {
  state.earthLookPhase=advanceSolEarthCloudPhase(state.earthLookPhase,realStepSeconds,state.simStepSeconds,
    BODY.Earth.rotationHours,state.animate&&state.earthWeather&&earthLookSelected(state)
      &&!document.hidden&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  rotationLimitedBodies.clear();
  const simulatedSecondsPerRealSecond = state.yearsPerSec * DAYS_PER_YEAR * 86400;
  for (const name of DRAW_LIST) {
    const phys = BODY[name];
    if (!phys) continue;
    const visibleStep = rotationDisplayStepSeconds(
      realStepSeconds, state.simStepSeconds, phys.rotationHours,
    );
    // Decide from the selected simulation rate, not this frame's duration. Browsers may
    // deliver a zero/duplicate rAF timestamp or a long throttled frame; neither may toggle
    // the disclosure and change the navigation panel's height.
    const limited = state.animate
      && rotationDisplayIsLimited(simulatedSecondsPerRealSecond, phys.rotationHours);
    if (limited) {
      const previous = rotationDisplayUnix[name] ?? (state.renderUnix - state.simStepSeconds);
      rotationDisplayUnix[name] = previous + visibleStep;
      rotationLimitedBodies.add(name);
    } else {
      delete rotationDisplayUnix[name];
    }
  }
  state.spinLimitedCount = rotationLimitedBodies.size;
}

/**
 * @typedef {{m:any, off:number[], bodyKm:[number,number,number], sunlit:number}} DrawnMoon
 */

/**
 * The moons of one planet that this frame will actually draw, with their PHYSICAL planetocentric
 * offsets (AU, world frame) solved once.
 *
 * Split out of drawMoons because the transit shadows need the same positions BEFORE the planet's
 * sphere is drawn and the markers need them after; solving Kepler twice for 21 moons every frame
 * to answer the same question twice would be the whole cost of the feature. drawBody calls this
 * and hands the result down.
 *
 * Returning null means "draw no moons and no moon shadows" — the two are gated together on
 * purpose. A shadow whose caster the Nyquist gate has just hidden would be a dark spot crossing
 * Jupiter with nothing casting it, which is a worse picture than no shadow at all; and the LOD
 * and validity gates below are the layer's honesty rails, so the shadow has to sit behind them
 * too. The invariant is simply: a shadow appears only when its moon is on screen.
 *
 * @returns {{moons:DrawnMoon[], scale:number, aliased:number}|null}
 */
function drawnMoonsFor(parentName, parentPos, parentDisplayAU, eye) {
  if (!moonElementsReady || !state.showMoons) return null;
  // Outside the window the committed elements were validated in, we do not know where these
  // moons are — the phase drifts without bound and the date slider reaches ±5000 years. Drawing
  // them anyway would put confident-looking dots at arbitrary points, which is worse than an
  // empty orbit. The reason is surfaced in the accuracy line rather than left as a mystery.
  if (!withinMoonValidity(
    state.renderUnix, moonSet.MOON_VALID_MIN_JD, moonSet.MOON_VALID_MAX_JD,
  )) {
    state.moonsHiddenReason = `Moons hidden — outside their ${moonValidityLabel()} `
      + "validated window. Press Now to bring them back.";
    return null;
  }
  const moons = moonSet.moonsOf(parentName);
  if (!moons.length) return null;
  const phys = BODY[parentName];
  // Rings are drawn out to (outerKm / radiusKm) x the planet's display radius; feed that in so
  // the moons are lifted clear of them rather than into them.
  const ringOuterAU = phys.rings ? (phys.rings.outerKm / phys.radiusKm) * parentDisplayAU : 0;
  const scale = systemScale(moons, parentDisplayAU, sceneDisplayPolicy().physicalGeometry, ringOuterAU, moon => requestedMoonRadius(moon, phys.radiusKm, parentDisplayAU));
  // Beyond this the whole system is a few pixels wide; drawing it just speckles the planet.
  // A focused or selected parent keeps its moons anyway: the camera is there to show them.
  const outermost = (moons[moons.length - 1].a / AU_KM) * scale;
  const dist = Math.hypot(eye[0] - parentPos[0], eye[1] - parentPos[1], eye[2] - parentPos[2]);
  const focused = parentName === state.selected || parentName === state.anchor;
  if (!focused && outermost / Math.max(dist, 1e-9) < 0.012) return null;

  /** @type {DrawnMoon[]} */
  const drawn = [];
  let aliased = 0;
  for (const m of moons) {
    // A frame that samples this moon's orbit below the Nyquist rate (aliasedByClock: fewer
    // than ~3 samples per revolution) cannot draw its motion, only alias it — apparent travel
    // can even reverse. Fast-forwarding therefore thins the inner moons out first and keeps
    // the outer ones, which is exactly which of them the clock is still resolving.
    if (aliasedByClock(m, state.simStepSeconds)) { aliased++; continue; }
    drawn.push({ m, off: moonOffsetAU(m, state.renderUnix), bodyKm: [0, 0, 0], sunlit: 1 });
  }
  return { moons: drawn, scale, aliased };
}

/** The all-clear upload: count 0 and two zeroed arrays, shared because nothing ever writes it. */
const NO_MOON_SHADOWS = packMoonShadows([]);

/**
 * Transit shadows on the planet's disc, and how much sunlight each of its moons is still
 * receiving — both from the PHYSICAL geometry, never from the inflated display positions.
 * See the header of moonshadows.js for the derivation and for why the distinction matters.
 *
 * Everything is handed to moonshadows.js in the planet's BODY frame, in km. Note that `rot` may
 * be the rate-limited DISPLAY rotation at high clock speeds: that is harmless here, because the
 * shader turns the body frame straight back into world space through the same matrix, so the
 * shadow lands at the correct world-frame point on the globe either way. Only which surface
 * feature happens to lie under it inherits the disclosed spin-display cap.
 *
 * Fills `sunlit` on each drawn moon as a side effect, so the body-frame offsets are computed
 * once for both halves of the event.
 *
 * @returns {{count:number, pos:Float32Array, axis:Float32Array}}
 */
function moonShadowUniforms(phys, planetPos, rot, drawn) {
  if (!drawn || !drawn.moons.length) return NO_MOON_SHADOWS;
  // World → body is Rᵀ; rot's upper 3×3 is orthonormal and column-major (same transpose the
  // ring-shadow light direction above uses).
  const toBody = (v) => /** @type {[number,number,number]} */ ([
    rot[0] * v[0] + rot[1] * v[1] + rot[2] * v[2],
    rot[4] * v[0] + rot[5] * v[1] + rot[6] * v[2],
    rot[8] * v[0] + rot[9] * v[1] + rot[10] * v[2],
  ]);
  const sunOffset = toBody([-planetPos[0] * AU_KM, -planetPos[1] * AU_KM, -planetPos[2] * AU_KM]);
  const geom = {
    eqRadius: phys.radiusKm, polarRadius: phys.polarKm, sunRadius: BODY.Sun.radiusKm,
  };
  const casters = [];
  for (const e of drawn.moons) {
    e.bodyKm = toBody([e.off[0] * AU_KM, e.off[1] * AU_KM, e.off[2] * AU_KM]);
    // The other half of the same geometry: a moon that has gone behind its planet loses the Sun.
    e.sunlit = sunlightOnMoon(e.bodyKm, sunOffset, geom);
    casters.push({ name: e.m.n, offset: e.bodyKm, radius: e.m.r });
  }
  return packMoonShadows(moonShadowsOnPlanet(casters, sunOffset, geom, MAX_MOON_SHADOWS));
}

function updateEarthLayerStatus() {
  const dailyOption = document.getElementById('orreryEarthDailyOption');
  const weather = appearanceReference('Earth', 'weather');
  if (dailyOption) dailyOption.textContent = `MODIS ${weather?.observation_label || 'date unavailable'} (swaths with surface)`;
  const node = document.getElementById('orreryEarthLayerStatus');
  if (node) node.textContent = state.useTextures ? earthLayerDescription(state) : 'Reference imagery is switched off.';
  const legend = document.getElementById('orreryIceLegend');
  if (legend) legend.hidden = !state.useTextures || !state.earthIce;
  const caption = document.getElementById('orreryIceLegendCaption'), ice = appearanceReference('Earth', 'sea-ice');
  if (caption) caption.textContent = `${ice?.label || 'Sea ice unavailable'} · ${ice?.observation_label || 'Date unavailable'}. Transparent areas have no displayed data.`;
}

function bindEarthTextures(enabled,locations=P.sphereU) {
  for (const [role, active, flag, sampler, unit] of /** @type {[string,boolean,string,string,number][]} */ ([
    ['night-lights', state.earthNight, 'u_earthNight', 'u_nightTex', 2],
    [earthCloudRole(state), state.earthWeather, 'u_earthWeather', 'u_weatherTex', 3],
    ['sea-ice', state.earthIce, 'u_earthIce', 'u_iceTex', 4],
  ])) {
    const asset = appearanceReference('Earth', role);
    const tex = asset && referenceTextures[asset.id];
    const ready = !!(enabled && active && tex?.ready);
    gl.uniform1i(locations[flag], ready ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, ready ? tex.tex : whiteTex);
    gl.uniform1i(locations[sampler], unit);
  }
  gl.activeTexture(gl.TEXTURE0);
}

function drawEarthLook(pos,rEq,rPol,rot,vp,eye,lightObj,pixels){
  const detail=earthLookDetails?.get('Earth');
  if(!earthLookSelected(state)||!detail||!P.earthLook)return false;
  const uniforms=P.earthLookU,model=mul(translate(pos),mul(rot,scaleM([rEq,rEq,rPol])));
  const camera=physicalCameraPosition(eye,pos,rot,rEq,1);camera[2]/=BODY.Earth.polarKm/BODY.Earth.radiusKm;
  const cloud=referenceTextures[appearanceReference('Earth','cloud-composite').id];
  const night=referenceTextures[appearanceReference('Earth','night-lights').id];
  const draw=pass=>{
    gl.useProgram(P.earthLook);
    gl.uniformMatrix4fv(uniforms.u_mvp,false,new Float32Array(mul(vp,model)));
    gl.uniform3fv(uniforms.u_camObj,new Float32Array(camera));
    gl.uniform3fv(uniforms.u_lightObj,new Float32Array(lightObj));
    gl.uniform1f(uniforms.u_oblate,BODY.Earth.polarKm/BODY.Earth.radiusKm);
    gl.uniform1f(uniforms.uCloudPhase,state.earthLookPhase);
    gl.uniform1f(uniforms.u_pixelDiameter,pixels);
    gl.uniform1f(uniforms.u_earthLookExposure,EARTH_LOOK_EXPOSURE);
    gl.uniform1i(uniforms.u_earthLookPass,pass);gl.uniform1i(uniforms.u_linearOutput,linearFrame?1:0);
    gl.uniform1i(uniforms.u_earthWeather,state.earthWeather&&cloud?.ready?1:0);
    gl.uniform1i(uniforms.u_earthNight,state.earthNight&&night?.ready?1:0);
    gl.uniform1i(uniforms.u_earthAtmosphere,state.opticsEnabled?1:0);
    for(const [unit,sampler,texture] of [[0,'u_tex',detail.tex],[2,'u_nightTex',night?.ready?night.tex:whiteTex],
      [3,'uCloudMap',cloud?.ready?cloud.tex:whiteTex],[11,'u_oceanMask',detail.mask]]){
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniforms[sampler],unit);
    }
    gl.activeTexture(gl.TEXTURE0);bindBodyMesh();gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    gl.drawElements(gl.TRIANGLES,sphere.count,gl.UNSIGNED_SHORT,0);gl.disable(gl.CULL_FACE);
  };
  draw(0);
  queueTransparent(pos,eye,()=>{gl.depthMask(false);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);draw(1);
    gl.depthMask(true);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);});
  return true;
}

function drawBody(b, vp, eye) {
  const phys = BODY[b.name]; if (!phys) return;
  const pos = bodyWorldPos(b);
  const rEq = displayRadiusAU(b.name), rPol = rEq * (phys.polarKm / phys.radiusKm);
  const pixelDiameter=referencePixelDiameter(pos,rEq,vp,referenceViewport);
  referenceVisible.set(b.name,pixelDiameter);
  if(b.name==='Sun'&&drawApprovedSun(vp,eye,pos,rEq,pixelDiameter))return;
  if(b.name==='Sun'&&drawSolarReference(vp,eye,pos,rEq,pixelDiameter,1)){
    queueTransparent(pos,eye,()=>{
      gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);
      drawSolarReference(vp,eye,pos,rEq,pixelDiameter,2);
      gl.depthMask(true);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    });
    return;
  }
  const mesh=detailMesh(b.name,pixelDiameter)||sphere;
  state.terrainRendered[b.name]=!!mesh.heightTex;
  // The display clock advances continuously when true spin would alias. It is updated once
  // per animation tick, outside drawBody, so input-triggered repaints cannot advance it twice.
  const rotUnix = rotationDisplayUnix[b.name] ?? state.renderUnix;
  const rot = iauRotation(phys, rotUnix);
  const model = mul(translate(pos), mul(rot, scaleM([rEq, rEq, rPol])));
  const mvp = new Float32Array(mul(vp, model));
  const inspectionLight=b.name==='Saturn'&&state.saturnLighting==='look-lab'
    &&illustrativeSelected(b.name,state)&&illustrativeDetails?.get(b.name)?saturnLookLight(eye,pos):null;
  const light = inspectionLight || (b.name === "Sun" ? [0, 0, 1] : norm([-b.x_au, -b.y_au, -b.z_au]));
  const lightObj=[dot(rot.slice(0,3),light),dot(rot.slice(4,7),light),dot(rot.slice(8,11),light)];
  if(b.name==='Earth'&&drawEarthLook(pos,rEq,rPol,rot,vp,eye,lightObj,pixelDiameter)){
    drawMoons(b.name,pos,rEq,vp,eye,drawnMoonsFor(b.name,pos,rEq,eye));return;
  }
  const requestedProfile=state.opticsEnabled&&pixelDiameter>=64?getAtmosphereProfile(b.name):null;
  if(requestedProfile&&b.name===incidentDemand)requestPhysicalPrograms(b.name);
  if(requestedProfile&&b.name===incidentDemand)incidentFields?.request(b.name);
  state.opticsStatus[b.name]=requestedProfile?opticalReadiness(b.name):'deferred';
  // Nested quadrature is never a frame-time fallback. Both immutable numerical
  // fields must pass admission before reference optical transfer becomes active.
  const physical=P.physicalSets?.[b.name];
  let profile=requestedProfile&&physicalProgramState(b.name)==='ready'&&physical&&incidentFields?.get(b.name)?.columnTexture?requestedProfile:null;
  const distanceAu=b.name==='Sun'?1:Math.hypot(b.x_au,b.y_au,b.z_au);
  const opticalOptions={cameraBodyKm:physicalCameraPosition(eye,pos,rot,rEq,phys.radiusKm),sunDirectionBody:lightObj,
    polarRatio:phys.polarKm/phys.radiusKm,solarDistanceAu:distanceAu,exposure:linearFrame?1:distanceAu*distanceAu};
  const scattering=profile?generateBodyScattering(b.name,profile,opticalOptions,phys.radiusKm,mesh):null;
  if(profile&&!scattering)profile=null;
  if(profile){
    gl.useProgram(physical.physicalSphere);
    if(!bindBodyScattering(b.name,scattering,physical.physicalSphere,physical.physicalSphereU))profile=null;
  }
  state.opticsStatus[b.name]=requestedProfile?opticalReadiness(b.name):'deferred';
  const atmo = atmoColor(b.name), atmoStr = atmoStrength(b.name);
  // Solve the moon positions ONCE per planet per frame: the transit shadows need them before
  // this sphere is drawn, drawMoons needs them after.
  const drawn = drawnMoonsFor(b.name, pos, rEq, eye);
  const shadows = moonShadowUniforms(phys, pos, rot, drawn);

  const sphereUniforms=profile?physical.physicalSphereU:P.sphereU;
  gl.useProgram(profile?physical.physicalSphere:P.sphere);
  if(profile)gl.uniform1f(sphereUniforms.u_scatteringReferenceHeightKm,phys.radiusKm-profile.radiusKm);
  gl.uniform1i(sphereUniforms.u_linearOutput,linearFrame?1:0);
  setAtmosphereUniforms(gl,sphereUniforms,profile,opticalOptions);
  bindAtmosphereColumns(b.name,sphereUniforms);
  bindIncidentField(b.name,profile,sphereUniforms);
  bindTerrainShadow(mesh,phys.radiusKm,sphereUniforms);
  gl.uniformMatrix4fv(sphereUniforms.u_mvp, false, mvp);
  gl.uniformMatrix4fv(sphereUniforms.u_model, false, new Float32Array(model));
  // Inverse transpose of R * diag(a,a,b), up to an irrelevant common factor.
  // Without this, oblate planets use mesh normals and the terminator is misplaced.
  const normals = normalMat3(rot), axisRatio = phys.polarKm / phys.radiusKm;
  for (let i = 6; i < 9; i++) normals[i] /= axisRatio;
  gl.uniformMatrix3fv(sphereUniforms.u_nmat, false, new Float32Array(normals));
  gl.uniform1i(sphereUniforms.u_style, -1); // unregistered surface detail stays neutral
  gl.uniform1i(sphereUniforms.u_mode, b.name === "Sun" ? 1 : 0);
  // Only the visible Sun as the subject gets the educational photosphere. As context
  // (the overview, or EUV mode before the Sun is selected) it stays the flat disk.
  const showPhotosphere=b.name==='Sun'&&state.solarMode==='visible'&&solarSubject();
  if(sphereUniforms.u_activity)gl.uniform1f(sphereUniforms.u_activity, showPhotosphere?1:0);
  gl.uniform1f(sphereUniforms.u_time, state.renderUnix * 0.0002);
  if(showPhotosphere&&sphereUniforms['u_spot[0]']){
    const seconds=solarActivitySeconds(),packed=[];
    for(const region of solarPhotosphereSpots(seconds)) packed.push(...region.lead,...region.trail);
    gl.uniform4fv(sphereUniforms['u_spot[0]'], new Float32Array(packed));
    gl.uniformMatrix3fv(sphereUniforms.u_activityFrame, false, new Float32Array(bodyToSolarSource(rot)));
    gl.uniform1f(sphereUniforms.u_activityDays, solarActivityDays(seconds));
  }
  // The Sun emits white visible light (NASA SVS 13859). This slightly warm
  // display RGB is illustrative, not calibrated radiance or observed detail.
  // u_style stays -1. Spots and cells appear only through u_activity above, as a
  // disclosed educational display for the visible Sun under inspection.
  gl.uniform3fv(sphereUniforms.u_base, b.name === "Sun" ? [1, 0.98, 0.94] : appearanceFallbackColor(b.name) || missingDetailColor(b.name));
  gl.uniform3fv(sphereUniforms.u_light, new Float32Array(light));
  gl.uniform3fv(sphereUniforms.u_cam, new Float32Array(eye));
  gl.uniform3fv(sphereUniforms.u_atmo, new Float32Array(atmo));
  gl.uniform1f(sphereUniforms.u_atmoStr, atmoStr);
  // Distant views have no numerical transfer, so an admitted profile supplies the
  // illustrative haze columns instead. The physical program never reads them.
  setHazeUniforms(gl, sphereUniforms, getAtmosphereProfile(b.name));
  // Surface-map priority: a real fetched photographic map (fetch_textures.py) beats the map we
  // generate from the committed vectors, which in turn beats the procedural shader. Only the
  // generated maps can ask to MODULATE rather than replace.
  const isSun = b.name === "Sun";
  // A replacing artistic map owns the ground. Venus radar is the other case:
  // Magellan stays on this pass and the artistic atmosphere is a later shell.
  const replaces = illustrativeReplacesSurface(b.name, state);
  const overlay = venusAtmosphereOverlay(b.name, state);
  const illustrativeTex = replaces ? illustrativeDetails?.get(b.name) : null;
  const atmosphereTex = overlay ? illustrativeDetails?.get('Venus') : null;
  const reference = surfaceReferenceShown(b.name, state) ? appearanceReference(b.name) : null;
  const referenceTex = state.useTextures && reference && referenceTextures[reference.id]?.ready ? referenceTextures[reference.id] : null;
  const sunTexd = isSun && textureEligible("Sun", "observed-disk") && state.useTextures && sunTex.ready;
  const photoTexd = !replaces && !overlay && !isSun && textureEligible(b.name) && state.useTextures && textures[b.name] && textures[b.name].ready;
  // NOT gated on state.useTextures. That checkbox is labelled "NASA textures" and its job is the
  // OPTIONAL photographic downloads; the generated maps are committed public-domain geography that
  // ships with the app. Gating them too meant unticking it replaced real coastlines with the
  // procedural noise continents — the exact thing this release exists to remove.
  const gen = !replaces && !overlay && !isSun && textureEligible(b.name, "generated-map") && !photoTexd && genTex[b.name] && genTex[b.name].ready
    ? genTex[b.name] : null;
  const useTex = illustrativeTex || referenceTex || sunTexd || photoTexd || !!gen;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, illustrativeTex ? illustrativeTex.tex : referenceTex ? referenceTex.tex : sunTexd ? sunTex.tex : (photoTexd ? textures[b.name].tex : (gen ? gen.tex : whiteTex)));
  gl.uniform1i(sphereUniforms.u_tex, 0);
  gl.uniform1i(sphereUniforms.u_useTex, useTex ? 1 : 0);
  gl.uniform1i(sphereUniforms.u_texMode, referenceTex ? 3 : gen ? gen.texMode : 0);
  // Illustrative JPEGs stay on texMode 0 so they do not pick up coverage windows
  // or Earth layers. The flag is 1 only for this draw's bound artistic map and is
  // cleared on every other sphere draw, including moons that reuse the program.
  gl.uniform1i(sphereUniforms.u_illustrativeLinear, illustrativeTex ? 1 : 0);
  gl.uniform1i(sphereUniforms.u_saturnLook, illustrativeTex && b.name==='Saturn' ? 1 : 0);
  gl.uniform1i(sphereUniforms.u_textureLinear, referenceTex?.linearFilter ? 1 : 0);
  if (referenceTex) {
    const uniforms = appearanceUniforms(reference);
    gl.uniform4fv(sphereUniforms.u_map, new Float32Array(uniforms.map));
    gl.uniform4fv(sphereUniforms.u_mapLat, new Float32Array(uniforms.lat));
    gl.uniform4fv(sphereUniforms.u_mapWindow, new Float32Array(uniforms.window));
    gl.uniform1i(sphereUniforms.u_mapNoData, uniforms.nodata);
  }
  bindEarthTextures(!!referenceTex && b.name === 'Earth',sphereUniforms);
  gl.uniform3fv(sphereUniforms.u_sunA, new Float32Array(sunTexd ? sunDiskBasis() : [1, 0, 0]));
  // Ring-shadow inputs: the light direction expressed in the BODY frame (Rᵀ·light — rot's
  // upper 3×3 is orthonormal, column-major), the annulus radii in equatorial-radius units, the
  // oblateness ratio, and the radial opacity-profile texture on unit 1. Zeroed for ringless
  // bodies, and re-zeroed by drawMoons (same program, stale state).
  gl.uniform3fv(sphereUniforms.u_lightObj, new Float32Array([
    rot[0] * light[0] + rot[1] * light[1] + rot[2] * light[2],
    rot[4] * light[0] + rot[5] * light[1] + rot[6] * light[2],
    rot[8] * light[0] + rot[9] * light[1] + rot[10] * light[2],
  ]));
  gl.uniform2fv(sphereUniforms.u_ringRad, new Float32Array(
    phys.rings ? [phys.rings.innerKm / phys.radiusKm, phys.rings.outerKm / phys.radiusKm] : [0, 0],
  ));
  gl.uniform1f(sphereUniforms.u_oblate, phys.polarKm / phys.radiusKm);
  // Transit shadows. count is 0 on all but a handful of frames per decade, and the shader skips
  // the whole block then — but the arrays are still uploaded so a stale caster from the previous
  // planet can never be read if the count is ever raised without them.
  // Real-Sun moon transits do not describe a camera-lit inspection material.
  gl.uniform1i(sphereUniforms.u_moonShadowCount, inspectionLight ? 0 : shadows.count);
  gl.uniform4fv(sphereUniforms["u_moonShadowPos[0]"], shadows.pos);
  gl.uniform4fv(sphereUniforms["u_moonShadowAxis[0]"], shadows.axis);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, phys.rings ? ringShadowProfileTex(b.name, phys) : whiteTex);
  gl.uniform1i(sphereUniforms.u_ringTex, 1);
  gl.activeTexture(gl.TEXTURE0);

  const simplify=sphereMeshEligible({name:b.name,selected:state.selected,anchor:state.anchor,
    terrain:mesh!==sphere,physical:!!requestedProfile});
  const drawMesh=simplify?(sphereMeshPool?.select(mvp,sceneViewport[2],sceneViewport[3],true,gl,programContextGeneration)||mesh):mesh;
  bindBodyMesh(drawMesh);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  if(!simplify||!sphereOutsideClip(mvp))gl.drawElements(gl.TRIANGLES,drawMesh.count,drawMesh.indexType||gl.UNSIGNED_SHORT,0);
  gl.disable(gl.CULL_FACE);

  // Artistic Venus atmosphere over the Magellan ground. The JPEG has no alpha,
  // so the shell derives coverage and stays off the physical program (mode 4
  // lives in the span that program deletes). One atmosphere: skip the
  // procedural limb while this shell is actually drawn.
  if (atmosphereTex) {
    const lift = venusAtmosphereShellScale(phys.radiusKm);
    const sModel = mul(translate(pos), mul(rot, scaleM([rEq * lift, rEq * lift, rPol * lift])));
    queueTransparent(pos, eye, () => {
      gl.useProgram(P.sphere);
      setAtmosphereUniforms(gl, P.sphereU, null);
      gl.uniform1f(P.sphereU.u_bodyRadiusKm, phys.radiusKm);
      gl.uniform1i(P.sphereU.u_linearOutput, linearFrame ? 1 : 0);
      gl.uniform1i(P.sphereU.u_illustrativeLinear, 1);
      gl.uniform1i(P.sphereU.u_mode, 4);
      gl.uniform1i(P.sphereU.u_style, -1);
      gl.uniform1i(P.sphereU.u_useTex, 1);
      gl.uniform1i(P.sphereU.u_texMode, 0);
      gl.uniform1i(P.sphereU.u_textureLinear, 0);
      gl.uniform1i(P.sphereU.u_tex, 0);
      gl.uniformMatrix4fv(P.sphereU.u_mvp, false, new Float32Array(mul(vp, sModel)));
      gl.uniformMatrix4fv(P.sphereU.u_model, false, new Float32Array(sModel));
      gl.uniformMatrix3fv(P.sphereU.u_nmat, false, new Float32Array(normals));
      gl.uniform3fv(P.sphereU.u_cam, new Float32Array(eye));
      gl.uniform3fv(P.sphereU.u_light, new Float32Array(light));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atmosphereTex.tex);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      bindBodyMesh();
      gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
    });
  }

  // atmosphere limb halo (additive shell, slightly larger, no depth write)
  if (atmoStr > 0 && b.name !== "Sun" && b.name !== "Earth" && !profile && !atmosphereTex) {
    // A restrained illustrative optical limb, not an atmospheric-height measurement.
    // Earth keeps the admitted haze or the physical transfer; it does not grow a 1.015× shell.
    const sModel = mul(translate(pos), mul(rot, scaleM([rEq * 1.015, rEq * 1.015, rPol * 1.015])));
    queueTransparent(pos,eye,()=>{
      // This closure owns its expanded transform and selected mesh.
      const haloMvp=new Float32Array(mul(vp,sModel));
      const haloMesh=simplify?(sphereMeshPool?.select(haloMvp,sceneViewport[2],sceneViewport[3],true,gl,programContextGeneration)||sphere):sphere;
      // This callback runs after other bodies/moons: bind every uniform used by mode 2.
      gl.useProgram(P.sphere);setAtmosphereUniforms(gl,P.sphereU,null,opticalOptions);
      gl.uniform1i(P.sphereU.u_illustrativeLinear, 0);
      gl.uniform1i(P.sphereU.u_saturnLook, 0);
      gl.uniformMatrix4fv(P.sphereU.u_mvp, false, haloMvp);
      gl.uniformMatrix4fv(P.sphereU.u_model, false, new Float32Array(sModel));
      gl.uniformMatrix3fv(P.sphereU.u_nmat,false,new Float32Array(normals));
      gl.uniform3fv(P.sphereU.u_cam,new Float32Array(eye));
      gl.uniform3fv(P.sphereU.u_light,new Float32Array(light));
      gl.uniform3fv(P.sphereU.u_atmo,new Float32Array(atmo));gl.uniform1f(P.sphereU.u_atmoStr,atmoStr);
      gl.uniform1i(P.sphereU.u_mode, 2);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
      bindBodyMesh(haloMesh);
      if(!simplify||!sphereOutsideClip(haloMvp))gl.drawElements(gl.TRIANGLES, haloMesh.count, haloMesh.indexType||gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    });
  }

  if(profile){
    // The display scale uses the catalogue radius; the optical outer endpoint
    // uses the profile datum. Their small radius difference must not move the ray.
    const extent=(profile.radiusKm+profile.topKm)/phys.radiusKm;
    const shell=mul(translate(pos),mul(rot,scaleM([rEq*extent,rEq*extent,rPol*extent])));
    queueTransparent(pos,eye,()=>{
      gl.useProgram(physical.atmosphere);gl.uniform1i(physical.atmosphereU.u_linearOutput,linearFrame?1:0);setAtmosphereUniforms(gl,physical.atmosphereU,profile,opticalOptions);
      if(!bindBodyScattering(b.name,scattering,physical.atmosphere,physical.atmosphereU))return;
      bindAtmosphereColumns(b.name,physical.atmosphereU);
      gl.uniformMatrix4fv(physical.atmosphereU.u_mvp,false,new Float32Array(mul(vp,shell)));
      bindBodyMesh();gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.depthMask(false);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.drawElements(gl.TRIANGLES,sphere.count,gl.UNSIGNED_SHORT,0);
      gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    });
  }

  // All opaque moons join the depth pass; transparent rings are deferred with the atmosphere.
  drawMoons(b.name, pos, rEq, vp, eye, drawn);
  if (phys.rings) queueTransparent(pos,eye,()=>drawRing(b.name,phys,pos,rEq,rot,vp,light));
}

// A moon's drawn radius. Planets in this view are already enlarged so the small ones stay
// visible; moons need the same treatment or Phobos (11 km beside a 3,396 km Mars) is a
// sub-pixel speck. The ratio to the parent is preserved and then boosted, with a floor so the
// smallest are still findable — the same bargain the planet sizes already make, and the panel
// says so. True-scale mode gets the honest ratio.
function requestedMoonRadius(m, parentRadiusKm, parentDisplayAU) {
  const ratio = m.r / parentRadiusKm;
  if (sceneDisplayPolicy().physicalGeometry) return parentDisplayAU * ratio;
  return Math.min(parentDisplayAU * 0.42, Math.max(parentDisplayAU * 0.055, parentDisplayAU * ratio * 4));
}

// Shared capped radius for the mesh and focus camera; picking uses rendered markers.
let moonRadiusCache = new Map();
function moonDisplayRadius(m, parentRadiusKm, parentDisplayAU) {
  if (sceneDisplayPolicy().physicalGeometry) return m.r / AU_KM;
  const key = `${m.p}:${state.renderUnix}:${parentDisplayAU}`;
  if (!moonRadiusCache.has(key)) {
    if (moonRadiusCache.size >= 5) moonRadiusCache.clear();
    const moons = moonSet.moonsOf(m.p), phys = BODY[m.p];
    const ring = phys.rings ? phys.rings.outerKm / phys.radiusKm * parentDisplayAU : 0;
    const scale = systemScale(moons, parentDisplayAU, false, ring,
      moon => requestedMoonRadius(moon, parentRadiusKm, parentDisplayAU));
    moonRadiusCache.set(key, resolveDisplayRadii(moons.map(moon => ({ name: moon.n,
      pos: moonOffsetAU(moon, state.renderUnix).map(v => v * scale),
      physicalRadius: moon.r / AU_KM,
      requestedRadius: requestedMoonRadius(moon, parentRadiusKm, parentDisplayAU),
    }))));
  }
  return moonRadiusCache.get(key)[m.n];
}

/**
 * The validated interval, read from the generated table rather than written out by hand.
 * Re-running tools/fetch_moons.py moves the window; a literal date in the notice below
 * silently became a lie the moment that happened, so the label is derived from the same
 * constants the guard tests against.
 *
 * Memoised on those constants: outside the window drawMoons() reaches this once per body per
 * frame — about twenty times — and two Intl date formats plus two Date allocations per call is
 * real main-thread time during exactly the accelerated animation that puts you out here.
 */
let moonValidityLabelCache = "";
function moonValidityLabel() {
  if (!moonValidityLabelCache) {
    const month = (jd) => new Date((jd - 2440587.5) * 86400000)
      .toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    moonValidityLabelCache =
      `${month(moonSet.MOON_VALID_MIN_JD)}–${month(moonSet.MOON_VALID_MAX_JD)}`;
  }
  return moonValidityLabelCache;
}

// Draw the moons of one planet from the set drawnMoonsFor() already resolved (see there for
// every reason this can be empty). Returns quietly when there is nothing to draw.
const IDENTITY_ROTATION = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function drawMoons(parentName, parentPos, parentDisplayAU, vp, eye, drawn) {
  if (!drawn) return;
  // Counted even when the clock has aliased away every moon of this planet — that is exactly
  // the case the accuracy line exists to disclose.
  state.moonsAliasedCount += drawn.aliased;
  if (!drawn.moons.length) return;
  const phys = BODY[parentName];
  const scale = drawn.scale;

  // Orbit paths, when the Orbits overlay is on. Same scale factor as the markers, so the moon
  // always sits ON its drawn path. Without these the markers float with none of the context the
  // overlay promises for every other body in the scene.
  if (state.showOrbits && moonGuideVisible(parentName, state.selected, state.anchor, state.moonGuideMode,
    Object.fromEntries(moonSet.MOONS.map(m => [m.n, m.p])))) {
    const pts = [];
    for (const { m } of drawn.moons) {
      const path = moonOrbitPath(m, state.renderUnix, 64);
      for (let i = 0; i + 1 < path.length; i++) {
        for (const q of [path[i], path[i + 1]]) {
          pts.push(parentPos[0] + q[0] * scale, parentPos[1] + q[1] * scale, parentPos[2] + q[2] * scale,
            m.col[0] * 0.55, m.col[1] * 0.55, m.col[2] * 0.55);
        }
      }
    }
    if (pts.length) moonGuideQueue.push(pts);
  }

  for (const { m, off, sunlit } of drawn.moons) {
    const pos = [parentPos[0] + off[0] * scale, parentPos[1] + off[1] * scale, parentPos[2] + off[2] * scale];
    const r = moonDisplayRadius(m, phys.radiusKm, parentDisplayAU);
    referenceVisible.set(m.n, referencePixelDiameter(pos, r, vp, referenceViewport));
    // Tidally locked moons keep their prime meridian toward the planet along the mean orbit,
    // pole on the orbit normal (moonorbits.js). Nereid spins freely and keeps the renderer frame.
    const spin = synchronousMoonRotation(m, state.renderUnix, poleVector(phys, state.renderUnix)) || IDENTITY_ROTATION;
    const model = mul(translate(pos), mul(spin, scaleM([r, r, r])));
    // Draw with the inflated offset, but light from the physical position. Using `pos` here
    // moved an outer moon several rendered AU from its parent and rotated its terminator by
    // tens of degrees even though its real planetocentric offset is tiny on the solar scale.
    const physicalPos = [parentPos[0] + off[0], parentPos[1] + off[1], parentPos[2] + off[2]];
    const light = norm([-physicalPos[0], -physicalPos[1], -physicalPos[2]]);

    gl.useProgram(P.sphere);
    setAtmosphereUniforms(gl,P.sphereU,null);
    bindTerrainShadow(sphere,m.r);
    const moonMvp=new Float32Array(mul(vp,model));
    gl.uniformMatrix4fv(P.sphereU.u_mvp, false, moonMvp);
    gl.uniformMatrix4fv(P.sphereU.u_model, false, new Float32Array(model));
    gl.uniformMatrix3fv(P.sphereU.u_nmat, false, new Float32Array(normalMat3(spin)));
    // Surface qualification controls detail; the existing published albedo scale
    // remains meaningful when no photographic texture is eligible.
    gl.uniform1i(P.sphereU.u_style, -1); // no invented craters, clouds, or ice patterns
    gl.uniform1i(P.sphereU.u_mode, 0);
    gl.uniform1f(P.sphereU.u_time, state.renderUnix * 0.0002);
    // The admitted fallback hue at the moon's PUBLISHED geometric albedo — see moonAppearance.js —
    // dimmed if the moon is inside its planet's shadow cone. `sunlit` is the fraction of the
    // solar disc the moon can still see (sunlightOnMoon in moonshadows.js, computed from the
    // PHYSICAL offset like the transit shadows), so an eclipsed Galilean fades out and comes
    // back as it crosses the penumbra — the event Rømer used to measure the speed of light.
    // The 0.06 floor is the planet's own scattered light, matching the 0.05 ambient the sphere
    // shader gives an unlit surface: a moon in Jupiter's umbra all but disappears, as it does
    // in a telescope, but it is not painted pure black.
    // `sunlit` is a LINEAR fraction of the solar disc, but the value it scales is
    // sRGB-encoded (moonAppearance.js writes albedo through the 1/2.2 transfer), so the
    // ramp must pass through the same transfer or penumbral ingress reads ~2x deeper than
    // the geometry says: linear 0.50 displayed as encoded would show 0.247 of the light.
    const eclipsed = (0.06 + 0.94 * sunlit) ** (1 / 2.2);
    const baseColor = moonBaseColor({ n: m.n, col: missingDetailColor(m.n) });
    gl.uniform3fv(P.sphereU.u_base, new Float32Array(
      [baseColor[0] * eclipsed, baseColor[1] * eclipsed, baseColor[2] * eclipsed],
    ));
    gl.uniform3fv(P.sphereU.u_light, new Float32Array(light));
    gl.uniform3fv(P.sphereU.u_cam, new Float32Array(eye));
    gl.uniform3fv(P.sphereU.u_atmo, new Float32Array(moonAtmosphereColor(m.n)));
    gl.uniform1f(P.sphereU.u_atmoStr, m.n === "Titan" ? 0.5 : 0);
    setHazeUniforms(gl, P.sphereU, null); // no admitted moon profile carries a haze
    // Only reviewed grids may wrap onto a moon. The spin frame above places a locked moon's
    // map longitudes; it is derived from the orbit, not from an independent spin model.
    const reference = appearanceReference(m.n);
    const registered = state.useTextures && reference && referenceTextures[reference.id]?.ready ? referenceTextures[reference.id] : null;
    const legacy = textureEligible(m.n) && state.useTextures && textures[m.n]?.ready ? textures[m.n] : null;
    const moonTex = registered || legacy;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, moonTex ? moonTex.tex : whiteTex);
    gl.uniform1i(P.sphereU.u_tex, 0);
    gl.uniform1i(P.sphereU.u_useTex, moonTex ? 1 : 0);
    gl.uniform1i(P.sphereU.u_textureLinear, 0);
    // Registered modes retain source axes and gaps; mode 5 also retains the
    // admitted mission RGB ratios. Both keep the neutral albedo/eclipse gain.
    gl.uniform1i(P.sphereU.u_texMode, registered ? (reference.moon_color_mode === 'source-rgb' ? 5 : 4) : legacy ? 2 : 0);
    gl.uniform1i(P.sphereU.u_illustrativeLinear, 0);
    gl.uniform1i(P.sphereU.u_saturnLook, 0);
    if (registered) {
      const uniforms = appearanceUniforms(reference);
      gl.uniform4fv(P.sphereU.u_map, new Float32Array(uniforms.map));
      gl.uniform4fv(P.sphereU.u_mapLat, new Float32Array(uniforms.lat));
      gl.uniform4fv(P.sphereU.u_mapWindow, new Float32Array(uniforms.window));
      gl.uniform1i(P.sphereU.u_mapNoData, uniforms.nodata);
    }
    bindEarthTextures(false); // auxiliary layers must never leak from Earth onto moons
    gl.uniform1f(P.sphereU.u_oblate, 1);
    gl.uniform2fv(P.sphereU.u_ringRad, new Float32Array([0, 0])); // no ring shadow on moons — clear the parent's state
    // Nor a moon shadow ON a moon: mutual Galilean events are real but they need each moon's
    // own body frame and an accuracy this element set does not claim (moons.js: "never for an
    // occultation, a mutual event"). Clear the parent's casters so none leaks onto this sphere.
    gl.uniform1i(P.sphereU.u_moonShadowCount, 0);

    const simplify=sphereMeshEligible({name:m.n,selected:state.selected,anchor:state.anchor,moon:true,mappedMoon:!!moonTex});
    const moonMesh=simplify?(sphereMeshPool?.select(moonMvp,sceneViewport[2],sceneViewport[3],true,gl,programContextGeneration)||sphere):sphere;
    bindBodyMesh(moonMesh);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    if(!simplify||!sphereOutsideClip(moonMvp))gl.drawElements(gl.TRIANGLES, moonMesh.count, moonMesh.indexType||gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.CULL_FACE);

    moonMarkers.push({ name: m.n, pos, moon: m });
  }
}

function drawRing(name, phys, pos, rEq, rot, vp, light) {
  if (!ringBufs[name] || ringBufs[name].rEq !== rEq) {
    const data = buildRing(phys.rings, rEq, phys.radiusKm, true);
    const buf = ringBufs[name] ? ringBufs[name].buf : gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    ringBufs[name] = { buf, count: data.length / 8, rEq };
  }
  // Only Saturn has a real ring photometry map; others use the vertex-coloured fallback.
  const useTex = textureEligible("saturn_ring", "ring-profile") && state.useTextures && name === "Saturn" && ringTex.ready;
  const model = mul(translate(pos), rot);
  gl.useProgram(P.ring); gl.uniformMatrix4fv(P.ringU.u_mvp, false, new Float32Array(mul(vp, model)));
  gl.uniformMatrix4fv(P.ringU.u_model, false, new Float32Array(model));
  // Planet-shadow inputs: world centre, unit direction toward the Sun, display radius.
  gl.uniform3fv(P.ringU.u_center, new Float32Array(pos));
  gl.uniform3fv(P.ringU.u_light, new Float32Array(light));
  gl.uniform1f(P.ringU.u_prad, rEq);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, useTex ? ringTex.tex : whiteTex);
  gl.uniform1i(P.ringU.u_tex, 0); gl.uniform1i(P.ringU.u_useTex, useTex ? 1 : 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, ringBufs[name].buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
  gl.disable(gl.CULL_FACE);
  gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, ringBufs[name].count); gl.depthMask(true);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
}

function drawSolarWind(vp) {
  gl.enable(gl.DEPTH_TEST);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
  if(particles)drawPoints(celBufs.wind,particles.N,vp,displayDpr(),.9);
  gl.depthMask(true);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
}

function drawSun(vp, eye, w, h) {
  if(sunLookDrawn){drawSolarWind(vp);return;}
  if(solarEuvActive()&&state.useTextures&&solarDetail?.get('reference'))return;
  const rSun = displayRadiusAU("Sun");
  // corona: a camera-facing additive glow quad
  const fwd = norm(sub([0, 0, 0], eye));
  let right = norm(cross([0, 0, 1], fwd)); if (!isFinite(right[0])) right = [1, 0, 0];
  const up = cross(fwd, right);
  gl.useProgram(P.glow); gl.uniformMatrix4fv(P.glowU.u_vp, false, matrixUpload(vp));
  gl.uniform3fv(P.glowU.u_center, new Float32Array([0, 0, 0]));
  gl.uniform3fv(P.glowU.u_right, new Float32Array(right)); gl.uniform3fv(P.glowU.u_up, new Float32Array(up));
  // Depth TEST stays ON (only writes are off): a planet nearer the camera must silhouette the
  // glow. Disabling the test painted the corona over Mercury and Venus from every angle — the
  // outer quad reached most of the way to Earth's orbit. The sizes are trimmed for the same
  // reason: this is the visual halo, not a physical corona extent.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  gl.uniform3fv(P.glowU.u_color, new Float32Array([1.0, 0.85, 0.5])); gl.uniform1f(P.glowU.u_size, rSun * 2.2); gl.uniform1f(P.glowU.u_pow, 2.8);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.uniform3fv(P.glowU.u_color, new Float32Array([1.0, 0.55, 0.2])); gl.uniform1f(P.glowU.u_size, rSun * 3.4); gl.uniform1f(P.glowU.u_pow, 4.2);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Wind is independent of which renderer owns the disk and corona.
  drawSolarWind(vp);

  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function atmoColor(name) {
  return ({ Venus: [0.95, 0.85, 0.55], Earth: [0.35, 0.6, 1.0], Mars: [0.7, 0.5, 0.4],
    Jupiter: [0.9, 0.8, 0.6], Saturn: [0.9, 0.85, 0.6], Uranus: [0.6, 0.9, 0.95], Neptune: [0.4, 0.6, 1.0] }[name]) || [0, 0, 0];
}
function atmoStrength(name) {
  return ({ Venus: 0.3, Mars: 0.08, Jupiter: 0.18, Saturn: 0.16, Uranus: 0.18, Neptune: 0.18 }[name]) || 0;
}

// ---------------------------------------------------------------- galactic-scale view
function drawGalaxyMarker(vp, eye, center, color, size) {
  const fwd = norm(sub(center, eye));
  let right = norm(cross([0, 0, 1], fwd)); if (!isFinite(right[0])) right = [1, 0, 0];
  const up = cross(fwd, right);
  gl.useProgram(P.glow); gl.uniformMatrix4fv(P.glowU.u_vp, false, matrixUpload(vp));
  gl.uniform3fv(P.glowU.u_center, new Float32Array(center));
  gl.uniform3fv(P.glowU.u_right, new Float32Array(right)); gl.uniform3fv(P.glowU.u_up, new Float32Array(up));
  gl.uniform3fv(P.glowU.u_color, new Float32Array(color)); gl.uniform1f(P.glowU.u_size, size); gl.uniform1f(P.glowU.u_pow, 2.0);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// The arc of the Sun's galactic orbit traversed since "Now" — a gold trail behind the moving Sun
// (capped at one full lap). Built each frame on a dynamic line buffer.
function drawGalaxyTrail(vp) {
  const swept = GAL_OMEGA * state.galYears;
  if (Math.abs(swept) < 1e-4) return;
  const span = Math.min(Math.abs(swept), 2 * Math.PI);
  const sign = swept >= 0 ? 1 : -1;
  const base = GAL_THETA0 - GAL_OMEGA * state.offsetYears; // azimuth at galYears = 0
  const n = Math.max(2, Math.round((span / (2 * Math.PI)) * 160));
  const v = [];
  for (let i = 0; i <= n; i++) {
    const th = base - sign * span * (i / n); // i=0 at the start, i=n at the Sun's current azimuth
    v.push(GAL_SUN_R * Math.cos(th), GAL_SUN_R * Math.sin(th), 0, 0.95, 0.80, 0.35);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, celBufs.galTrail);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
  gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, matrixUpload(vp)); gl.uniform1f(P.lineU.u_alpha, 0.9);
  bindLine(celBufs.galTrail); gl.drawArrays(gl.LINE_STRIP, 0, n + 1);
}

function paintGalaxy(w, h, dpr, vp, eye) {
  if (state.localView) { paintNeighbourhood(w, h, dpr, vp, eye); return; }
  gl.viewport(0, 0, w, h);
  sceneClearColor(0.003, 0.004, 0.011); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
  // galactocentric reference rings (Sun's orbit highlighted)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, matrixUpload(vp)); gl.uniform1f(P.lineU.u_alpha, 0.5);
  bindLine(celBufs.galGuide);
  for (const r of galaxy.ranges) gl.drawArrays(gl.LINE_STRIP, r.first, r.count);
  drawGalaxyTrail(vp); // the arc of orbit the Sun has travelled since "Now"
  // ~8,600 disc/arm/bulge stars, additive — sheared by differential rotation over the galactic clock.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  drawPoints(celBufs.galaxy, celBufs.galaxyCount, vp, dpr, 0.9, state.galYears);
  // The REAL naked-eye catalogue at its true galactic positions: a compact bright halo
  // hugging the Sun's marker, because nearly every star you can see by eye is within
  // ~2,000 ly. It rides the sheared disc like everything else.
  drawPoints(celBufs.catStars, celBufs.catStarsCount || 0, vp, dpr, 0.85, state.galYears);
  // deep-sky landmarks (nebulae, pulsars, black holes, nearby stars…), colour-coded by type
  if (state.galDeepSky) {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawPoints(celBufs.galObj, celBufs.galObjCount || 0, vp, dpr, 0.85, state.galYears); // co-rotate with the disc
  }
  // the galactic centre (gold) and the Sun (cyan-white "you are here")
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  drawGalaxyMarker(vp, eye, [0, 0, 0], [1.0, 0.78, 0.32], 1.2);
  drawGalaxyMarker(vp, eye, galaxy.sunPos, [0.55, 0.95, 1.0], 0.55);
  const canvas = document.getElementById("orreryCanvas");
  updateLabels(canvas, vp, vp);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
}

// The solar neighbourhood: the same real catalogue at light-year scale, Sun at the
// origin. Every star sits at its Hipparcos-parallax 3-D position (heliocentric galactic
// frame, +x toward the galactic centre); size encodes intrinsic luminosity, colour B−V.
// No differential-rotation shear here — at this scale the neighbourhood co-moves.
function paintNeighbourhood(w, h, dpr, vp, eye) {
  gl.viewport(0, 0, w, h);
  sceneClearColor(0.003, 0.004, 0.011); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(P.line); gl.uniformMatrix4fv(P.lineU.u_vp, false, matrixUpload(vp)); gl.uniform1f(P.lineU.u_alpha, 0.45);
  bindLine(celBufs.nbhdGuide);
  for (const r of nbhd.ranges) gl.drawArrays(gl.LINE_STRIP, r.first, r.count);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  drawPoints(celBufs.nbhd, celBufs.nbhdCount || 0, vp, dpr, 0.85);
  drawGalaxyMarker(vp, eye, [0, 0, 0], [0.55, 0.95, 1.0], 0.16);
  const canvas = document.getElementById("orreryCanvas");
  updateLabels(canvas, vp, vp);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
}

// ---------------------------------------------------------------- DOM labels
const labelPresenter=createLabelPresenter({document,onInvalidate:()=>paint()});
function updateLabels(canvas, vp, skyVp) {
  updateOrreryAccuracy();
  const host = document.getElementById("orreryLabels"); if (!host) return;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  const items = [];
  const discs = [];
  if (state.galaxy && state.localView) {
    items.push({ name: "☉ Sun — 0 ly", p: [0, 0, 0], cls: "orrery-label sky-star" });
    for (const r of nbhd.ringLabels) items.push({ name: r.name, p: r.p, cls: "orrery-label sky-galaxy" });
    // Named stars, nearest first; cap by zoom so close-in exploration stays readable.
    const maxLabels = state.radius < 4 ? 40 : state.radius < 12 ? 26 : 16;
    for (const s of nbhd.named.slice(0, maxLabels)) items.push({ name: s.name, p: s.p, cls: "orrery-label sky-star" });
  } else if (state.galaxy) {
    // Disc-feature labels (arms, the bar, the spur) shear with the differentially-rotating
    // points they name — a static label detaches from its arm within a few hundred Myr of
    // animation. The Sun (updated by updateGalaxySun) and the static rings stay unsheared.
    for (const it of galaxy.labels) {
      items.push({
        name: it.name,
        p: it.shear ? galShear(it.p, state.galYears) : it.p,
        cls: it.name.startsWith("☉") ? "orrery-label sky-star" : "orrery-label sky-galaxy",
      });
    }
    // Deep-sky landmark labels appear once you zoom in toward the Sun's region (they cluster near it).
    if (state.galDeepSky && state.radius < 70) {
      for (const o of galObjects) items.push({ name: o.name, p: galShear(o.pos, state.galYears), cls: "orrery-label sky-galaxy" });
    }
  } else {
    for (const name of DRAW_LIST) {
      const b = name === "Sun" ? { name: "Sun" } : state.bodies.find((x) => x.name === name);
      if(state.solarInspection&&name!=='Sun')continue;
      if (!b) continue;
      const p = bodyWorldPos(b), phys = BODY[name];
      // Label occlusion uses the physical photosphere for the Sun. The display
      // disc is ~40× larger and would hide Mercury and Venus whenever the camera
      // looks near the ecliptic.
      const discRadius = name === "Sun"
        ? phys.radiusKm / AU_KM
        : displayRadiusAU(name) * Math.min(1, phys.polarKm / phys.radiusKm);
      const disc = projectOpaqueDisc({id:name,position:p,radius:discRadius}, vp, {width:cw,height:ch});
      if (disc) discs.push(disc);
      items.push({ name, p, cls: "orrery-label" });
    }
    if (state.showSmall&&!state.solarInspection) {
      for (const s of smallBodies) items.push({ name: s.name, p: s.pos, cls: s.kind === "probe" ? "orrery-label sky-pulsar" : "orrery-label sky-galaxy" });
    }
    // Only the moons actually drawn this frame — drawMoons drops whole systems that are too
    // small on screen to be worth it, and a label for an undrawn moon would be a lie.
    for (const mk of moonMarkers) {
      const disc = projectOpaqueDisc({id:mk.name,position:mk.pos,radius:moonDisplayRadius(mk.moon,BODY[mk.moon.p].radiusKm,displayRadiusAU(mk.moon.p))}, vp, {width:cw,height:ch});
      if (disc) discs.push(disc);
      items.push({ name: mk.name, p: mk.pos, cls: "orrery-label sky-star" });
    }
    if (state.showSunEq&&!state.solarInspection) {
      const pole = norm(poleVector(BODY.Sun, state.renderUnix));
      items.push({ name: "Sun's axis · 7.25° tilt", p: [pole[0] * 1.7, pole[1] * 1.7, pole[2] * 1.7], cls: "orrery-label sky-galaxy" });
    }
    if (state.showLabels && state.showSky&&!state.solarInspection) {
      for (const pl of cel.pulsars) items.push({ name: "⊛ " + pl.name, p: pl.pos, cls: "orrery-label sky-pulsar", sky: true });
      for (const g of cel.deepsky) items.push({ name: g.name, p: g.pos, cls: "orrery-label sky-galaxy", sky: true });
      for (const s of cel.brightStars) if (s.m < 0.6) items.push({ name: s.name, p: s.pos, cls: "orrery-label sky-star", sky: true });
    }
  }
  labelPresenter.present({canvas,host,items,discs,vp,skyVp,
    parentOf:name=>name==='Moon'?'Earth':moonSet.MOONS.find(m=>m.n===name)?.p??null,
    selected:state.selected,selectedStar:state.selectedStar?.name,anchor:state.anchor,primaryNames:DRAW_LIST});
}

// ---------------------------------------------------------------- detail panel
// (The facts card itself is built by orreryDetail.js; this wrapper just supplies the
// body's live snapshot row.)
function showDetail(name) {
  syncIncidentDemand();
  updatePhysicalAppearance();
  updateFocusSystemControl();
  const focus=document.getElementById('orreryFocusSelected');
  if(focus)focus.toggleAttribute('disabled',!!state.selectedStar);
  const status=document.getElementById("orrerySelectionStatus");
  const selectedLabel=state.selectedStar?.name||name||"No object";
  updateOrreryAccuracy(); // selection facts must not wait for a canvas frame
  if(status&&status.textContent!==`${selectedLabel} selected`)status.textContent=`${selectedLabel} selected`;
  // A picked star wins the panel until something else is picked; otherwise fall back to
  // the body card (which also renders the "click something" placeholder).
  if (state.selectedStar) { renderStarDetail(state.selectedStar); return; }
  const moon = name ? moonSet.MOONS.find((m) => m.n === name) : null;
  if (moon) { renderMoonDetail(moon, state.renderUnix, state); return; }
  const small = name ? smallBodies.find((s) => s.name === name) : null;
  if (small) { renderSmallDetail(small); return; }
  renderDetail(name, state.bodies.find((b) => b.name === name), state);
}

// Screen-space nearest named star to (px, py). `m` is the matrix the stars were drawn
// with — skyVp on the unit sky sphere, plain vp for the neighbourhood's true 3-D places.
// Only NAMED_STARS are pickable: they are the ~500 with a proper name and the metadata
// the card needs, and it keeps the hit test to one short loop per click.
function pickStar(px, py, w, h, m, project) {
  if (!starCat) return null;
  let best = null;
  for (const s of starCat.NAMED_STARS) {
    const p = project(s);
    if (!p) continue;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const wv = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (wv <= 0) continue;
    const sx = (x / wv * 0.5 + 0.5) * w, sy = (1 - (y / wv * 0.5 + 0.5)) * h;
    const d = Math.hypot(sx - px, sy - py);
    // Brighter stars get a slightly larger hit radius so the recognisable ones win ties.
    const reach = Math.max(12, 26 - 2.2 * s.mag);
    if (d < reach && (!best || d < best.d)) best = { d, star: s };
  }
  return best ? best.star : null;
}

// ---------------------------------------------------------------- animation loop
const frameScheduler=createFrameScheduler({
  schedule:callback=>requestAnimationFrame(callback),cancel:handle=>cancelAnimationFrame(handle),
  // Retained GL is not drawable while asynchronous entry/Retry is still
  // admitting its snapshot. The first-frame owner opens that gate after setup.
  now:()=>performance.now(),enabled:()=>state.active&&(!state.entering||firstFrameOwner!==null)&&!document.hidden&&!!gl&&!!P.sphereU&&document.getElementById("orreryCanvas")?.style.display!=="none",
  continuous:()=>continuousFrames(),render:now=>renderScheduledFrame(now),
  onSample:sample=>{
    if(renderQuality.observe(sample)){syncRenderQuality();paint();}
  },
});
// Entry, Retry and restoration retain ownership of their first deferred draw.
// Validate that scene before resuming its simulation clock; later failures still
// propagate through the ordinary scheduler failure policy.
function ownFirstFrame(canvas,failed){
  const lifecycle=graphicsLifecycle,generation=programContextGeneration,manager=shaderPrograms;
  const owner={
    current:()=>firstFrameOwner===owner&&state.active&&lifecycle===graphicsLifecycle&&generation===programContextGeneration&&shaderPrograms===manager,
    failed:error=>{canvas.style.display='none';failed(error);},
  };
  firstFrameOwner=owner;
}
function renderScheduledFrame(now){
  const owner=firstFrameOwner;
  if(!owner)return tick(now);
  if(!owner.current()){firstFrameOwner=null;return tick(now);}
  try {
    const rendered=renderFrame();
    if(rendered&&firstFrameOwner===owner)firstFrameOwner=null;
    return rendered;
  }catch(error){
    if(!owner.current())throw error;
    firstFrameOwner=null;frameScheduler.cancel();state.lastTick=0;
    owner.failed(error);
    return false;
  }finally{retryTerrainFailures=false;}
}
// Bounded CPU and input latency samples; no synchronous GPU diagnostic queries.
export function orreryFrameTimings(){return frameScheduler.timings();}
function continuousFrames(){
  return state.animate||state.freeFly||(state.solarPlayback.playing&&solarPlaybackAvailable())||solarFlowActive();
}
function tick(now) {
  if (!state.active || document.hidden || !gl) { state.lastTick = 0; return false; }
  const rawDt = state.lastTick ? (now - state.lastTick) / 1000 : 0.016;
  const dt = Math.min(0.05, rawDt);
  state.lastTick = now;
  const spinBefore = state.spinLimitedCount;
  if (state.animate) {
    if (state.galaxy) {
      // The galactic clock only runs while the disc view is showing it. The Solar
      // neighbourhood is static (co-moving, J2000 epoch) and ignores galYears — letting
      // the clock tick invisibly there would jump the Sun/trail/disc by tens of Myr the
      // moment the user returns to the disc.
      if (!state.localView) {
        state.galYears += dt * galYearsPerSec(); // the Sun travels its galactic orbit as time runs
        updateGalaxySun();
      }
    } else {
      // How much simulated time one frame covers — the moon aliasing guard and visible-spin
      // limiter both key off it. At the 1 hour/s default it is ~1 sim-minute per frame; at
      // 5 yr/s it is ~30 days, more than a full orbit for several moons.
      // Advance from the previous simulated epoch. Re-evaluating Date.now() here added one
      // wall-clock second per real second on top of the selected accelerated rate, making
      // every rate fast (and a slow manual rate materially so).
      let nextFrame;
      try {
        const stepSeconds=solarStepSeconds(dt,state.yearsPerSec);
        const {unix}=validateSystemRequest({unix:state.renderUnix+stepSeconds});
        const bodies=projectSystemPositions(state.bodies,systemPositions(unix));
        nextFrame={bodies,renderUnix:unix,simElapsed:state.simElapsed+stepSeconds,simStepSeconds:stepSeconds};
      } catch(error) {
        cancelSystemWork();metadataFailed=true;
        state.animate=false;state.simStepSeconds=0;resetRotationDisplay();
        state.engineError=`System animation stopped: ${error.message}; prior rendered time and coordinates retained. Choose another time or Now, then resume Animate.`;
        const cb=/** @type {HTMLInputElement|null} */(document.getElementById("orreryAnimate"));if(cb)cb.checked=false;
      }
      if(nextFrame) {
        Object.assign(state,nextFrame);
        finishPositionUpdate();
        stepParticles(dt);
        updateRotationDisplay(dt);
      }
    }
  }
  if (state.freeFly) flyStep(dt);
  state.solarPlayback=advanceReferencePlayback(state.solarPlayback,dt,{active:solarPlaybackAvailable(),reducedMotion:prefersReducedMotion()});
  // Wall time, not the 50ms simulation cap. A slow frame should still move the corona.
  if(solarFlowActive())solarFlowSeconds+=Math.min(1,rawDt);
  const moonNoteBefore = state.moonsHiddenReason;
  let rendered=false;
  try{rendered=renderFrame();}finally{retryTerrainFailures=false;}
  if (state.moonsHiddenReason !== moonNoteBefore || state.spinLimitedCount !== spinBefore) updateOrreryAccuracy();
  if(!continuousFrames())state.lastTick=0;
  return rendered;
}
function startLoop() { frameScheduler.invalidate(); }
let solarFlowSeconds=0;
function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
}
// Reduced motion shows the activity clock at zero even if it was running before the
// preference changed, so no front or sheared state stays frozen on screen.
function solarActivitySeconds() {
  return prefersReducedMotion()?0:solarFlowSeconds;
}
function solarFlowActive() {
  if(prefersReducedMotion()||!state.active||state.galaxy||state.selectedStar||!solarSubject()) return false;
  if(state.solarMode==='illustrative')return state.useTextures&&state.sunLookPlaying&&state.sunLookStatus==='ready';
  if(state.solarMode==='visible') return true;
  return solarPlaybackAvailable();
}
function armSolarFlow() { if(solarFlowActive())startLoop(); }

// Integrate free-fly movement from held keys (WASD = move, Q/E or R/F = down/up, Shift = boost).
function flyStep(dt) {
  const K = state.keys;
  const fwd = flyForward();
  const right = norm(cross(fwd, [0, 0, 1]));
  const up = [0, 0, 1];
  let v = [0, 0, 0], moving = false;
  if (K.has("w")) { v = add(v, fwd); moving = true; }
  if (K.has("s")) { v = sub(v, fwd); moving = true; }
  if (K.has("d")) { v = add(v, right); moving = true; }
  if (K.has("a")) { v = sub(v, right); moving = true; }
  if (K.has("e") || K.has("r")) { v = add(v, up); moving = true; }
  if (K.has("q") || K.has("f")) { v = sub(v, up); moving = true; }
  if (moving) {
    const s = state.flySpeed * (K.has("shift") ? 6 : 1) * dt;
    const n = norm(v);
    state.freePos = [state.freePos[0] + n[0] * s, state.freePos[1] + n[1] * s, state.freePos[2] + n[2] * s];
  }
}

// Switch the orbit anchor (focus). Re-frames the camera at a distance suited to that body's
// size, and approaches from the SUNLIT side: the old camera kept its previous azimuth, which as
// often as not framed the night hemisphere — a black disc is a broken-looking first impression.
function planetGlobeExtent(name) {
  const body = BODY[name];
  if (!body) return null;
  return displayRadiusAU(name) * Math.max(name === "Sun" ? 1.35 : 1,
    1 + (getAtmosphereProfile(name)?.topKm || 0) / body.radiusKm,
    (body.rings?.outerKm || body.radiusKm) / body.radiusKm,
    (terrainExtentKm(name)?.maxRadiusKm || body.radiusKm) / body.radiusKm);
}

function planetSystemExtent(name) {
  const globe = planetGlobeExtent(name);
  if (globe == null) return null;
  // Fit the visible envelope without changing the near limit or display radius.
  if(name==='Sun'&&state.solarMode==='illustrative'&&state.useTextures)
    return Math.max(globe,displayRadiusAU(name)*SUN_LOOK_EXTENT);
  // Earth's Moon comes directly from the engine, independently of the moon layer.
  if (name === "Earth") {
    const earth = state.bodies.find(b=>b.name==='Earth');
    const moon = state.bodies.find(b=>b.name==='Moon');
    if (earth && moon) return Math.max(globe,
      Math.hypot(...bodyWorldPos(moon).map((v,i)=>v-bodyWorldPos(earth)[i])) + displayRadiusAU('Moon'));
  }
  if (!moonElementsReady || !state.showMoons) return globe;
  if (!withinMoonValidity(state.renderUnix, moonSet.MOON_VALID_MIN_JD, moonSet.MOON_VALID_MAX_JD)) {
    return globe;
  }
  const moons = moonSet.moonsOf(name);
  if (!moons.length) return globe;
  const body = BODY[name];
  const parentDisplayAU = displayRadiusAU(name);
  const ringOuterAU = body.rings ? (body.rings.outerKm / body.radiusKm) * parentDisplayAU : 0;
  return Math.max(globe, satelliteSystemExtent(
    moons, parentDisplayAU, sceneDisplayPolicy().physicalGeometry, ringOuterAU,
    moon => requestedMoonRadius(moon, body.radiusKm, parentDisplayAU),
  ));
}

function focusedCatalogMoon() {
  const moon = moonSet.MOONS.find(m => m.n === state.anchor);
  return moon && moonWorldPos(moon.n) ? moon : null;
}

function focusedPlanetName() {
  const moon = moonSet.MOONS.find(m => m.n === state.anchor);
  return moon ? moon.p : state.anchor;
}

function anchorDisplayExtent() {
  const moon = focusedCatalogMoon();
  if (moon) return moonDisplayRadius(moon, BODY[moon.p].radiusKm, displayRadiusAU(moon.p));
  // The existing anchor follows the parent when a moon position is unavailable.
  const name = focusedPlanetName();
  return name && BODY[name] ? (name === 'Sun' || state.focusMode === 'inspect-system'
    ? planetSystemExtent(name) : planetGlobeExtent(name)) : null;
}

function anchorNearExtent() {
  const moon = focusedCatalogMoon();
  if (moon) return moonDisplayRadius(moon, BODY[moon.p].radiusKm, displayRadiusAU(moon.p));
  const name = focusedPlanetName();
  return name && BODY[name] ? planetGlobeExtent(name) : null;
}

function setAnchor(name, focusMode = 'inspect-body') {
  state.anchor = name;
  state.focusMode = name === 'Sun' ? 'overview' : focusMode;
  state.solarInspection=false;
  if(name!=='Sun')state.solarPlayback.playing=false;
  orbitFocusFit = null;
  state.selectedStar = null; // an explicit body choice unpins any star card
  if (name === "Sun") {
    // Keep selection and the facts card in sync with every other Focus option. The early
    // return previously reframed the camera but left the placeholder detail card visible.
    state.selected = name;
    showDetail(name);
    state.az = OVERVIEW_AZ;
    state.el = OVERVIEW_EL;
    state.radius = OVERVIEW_RADIUS;
    paint();
    armSolarFlow();
    return;
  }
  const small = smallBodies.find((s) => s.name === name);
  if (small) {
    state.radius = 4; // point markers have no display radius; 4 AU keeps the orbit in context
  } else {
    const extent = anchorDisplayExtent();
    const canvas = document.getElementById("orreryCanvas");
    if (extent) {
      state.radius = fitOrbitDistance(extent,
        Math.max(1, canvas?.clientWidth || 1) / Math.max(1, canvas?.clientHeight || 1),
        FOVY, Math.hypot(...anchorPos()));
      orbitFocusFit = { anchor: name, distance: state.radius };
    }
  }
  state.selected = name;
  showDetail(name);
  const t = anchorPos();
  if (t[0] || t[1]) {
    state.az = Math.atan2(-t[1], -t[0]) + 0.5; // eye toward the Sun, offset for a gibbous phase
    // Moon-bearing planets pull back to a system portrait; a higher elevation
    // keeps the satellites around the disc instead of stacked behind it.
    const systemPortrait = state.focusMode === "inspect-system";
    state.el = systemPortrait ? 0.62 : 0.3;
  }
  paint();
}

function inspectSun() {
  state.anchor='Sun';state.selected='Sun';state.selectedStar=null;state.freeFly=false;state.galaxy=false;
  state.topDown=false;state.preTopRadius=0;
  for(const id of ['orreryTopDown','orreryFreeFly']){
    const input=/** @type {HTMLInputElement|null} */(document.getElementById(id));if(input)input.checked=false;
  }
  state.solarInspection=true;state.focusMode="inspect-body";
  const rot=sourceSolarRotation(),canvas=document.getElementById('orreryCanvas');
  state.az=Math.atan2(rot[9],rot[8]);state.el=Math.asin(rot[10]);
  state.radius=fitOrbitDistance(anchorDisplayExtent(),Math.max(1,canvas?.clientWidth||1)/Math.max(1,canvas?.clientHeight||1),FOVY,0);
  orbitFocusFit={anchor:'Sun',distance:state.radius};
  // A deliberate camera-only zoom retains the margin for the selected Sun envelope.
  // Retain the standard fit above so resize reconciliation preserves this zoom ratio.
  state.radius*=.84;
  const anchor=/** @type {HTMLSelectElement|null} */(document.getElementById('orreryAnchor'));if(anchor)anchor.value='Sun';
  showDetail('Sun');paint();armSolarFlow();
}

function selectedSystemParent() {
  const name = state.selected || state.anchor;
  const parent = name === 'Moon' ? 'Earth' : moonSet.MOONS.find(m=>m.n===name)?.p || name;
  return !state.galaxy && !state.selectedStar && (parent === 'Earth' || moonSet.moonsOf(parent).length) ? parent : null;
}

function updateFocusSystemControl() {
  const button = document.getElementById('orreryFocusSystem');
  if(button)writeBoolean(button,'disabled',!selectedSystemParent());
}

// Fill the Focus dropdown from the data rather than hard-coding it: Sun + planets (+ Earth's
// Moon) first, then each planet's moons as a group, then the dwarf planets, comets and
// spacecraft from the small-body layer. The moon entries come from the static moons.js, so this
// runs once at attach and needs no re-run when the lazily imported element knots arrive.
function populateAnchorSelect() {
  const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById("orreryAnchor"));
  if (!sel) return;
  const cur = state.anchor;
  sel.textContent = "";
  const add = (parentEl, value, label) => {
    const o = document.createElement("option");
    o.value = value; o.textContent = label || value;
    parentEl.appendChild(o);
  };
  add(sel, "Sun");
  for (const p of PLANET_ORDER) {
    add(sel, p);
    if (p === "Earth") add(sel, "Moon", "  · Moon");
  }
  if (moonSet) {
    for (const parent of moonSet.MOON_PARENTS) {
      const og = document.createElement("optgroup");
      og.label = `${parent} — moons`;
      for (const m of moonSet.moonsOf(parent)) add(og, m.n);
      sel.appendChild(og);
    }
  }
  /** @type {[string, Array<{n:string}>][]} */
  const groups = [
    ["Dwarf planets & asteroids", DWARFS],
    ["Comets", COMETS],
    ["Spacecraft", PROBES],
  ];
  for (const [label, list] of groups) {
    const og = document.createElement("optgroup");
    og.label = label;
    for (const b of list) add(og, b.n);
    sel.appendChild(og);
  }
  sel.value = cur;
  if (sel.value !== cur) sel.value = "Sun"; // the previous anchor no longer exists
}

// ---- Time-speed model. One rate, three synchronized controls (log slider, preset buttons,
// manual value+unit entry) — changing any updates the others; none overrides another.
// Push state.yearsPerSec back out to every speed control. `source` names the control the user
// is currently typing/dragging in, which is left alone so we never fight their input.
function updateSpeedUI(source) {
  if (state.galaxy) return; // the slider is lent to the galactic clock in galaxy mode
  const s = /** @type {HTMLInputElement|null} */ (document.getElementById("orrerySpeed"));
  const entry = /** @type {HTMLInputElement|null} */ (document.getElementById("orrerySpeedEntry"));
  const unit = /** @type {HTMLSelectElement|null} */ (document.getElementById("orrerySpeedUnit"));
  const presets = document.getElementById("orrerySpeedPresets");
  const dps = state.yearsPerSec * DAYS_PER_YEAR;
  if (s && source !== "slider") s.value = String(solarSliderFromSpeed(state.yearsPerSec));
  if (entry && unit && source !== "entry") {
    entry.value = String(parseFloat((dps / Number(unit.value)).toPrecision(4)));
  }
  if (presets) {
    for (const b of presets.querySelectorAll("button[data-dps]")) {
      const button = /** @type {HTMLElement} */ (b);
      const on = Math.abs(Number(button.dataset.dps) - dps) / dps < 0.02;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.classList.toggle("active", on);
    }
  }
}

function setSolarSpeed(yps, source) {
  // Manual entry may go beyond the slider's range; keep it physical and finite. If the cap
  // bites, the source control is rewritten too — no control may display a rate the
  // simulation is not actually running.
  const clamped = Math.min(50, Math.max(0.0001 / DAYS_PER_YEAR, yps));
  state.yearsPerSec = clamped;
  updateSpeedUI(clamped === yps ? source : undefined);
}

// The Time-speed slider serves both views at very different scales, so reconfigure it per mode:
// solar-system = log-mapped 1 hour/s … 5 yr/s; galaxy = linear millions of years per second.
function setSpeedSliderMode(galaxy) {
  const s = /** @type {HTMLInputElement|null} */ (document.getElementById("orrerySpeed"));
  const lbl = document.getElementById("orrerySpeedLabel");
  const extras = document.getElementById("orrerySpeedExtras");
  if (!s) return;
  if (galaxy) {
    s.min = "0.1"; s.max = "50"; s.step = "0.1"; s.value = String(state.galSpeed);
    s.setAttribute("aria-label", "galactic time speed (millions of years per second)");
    if (lbl) lbl.textContent = "Galactic time (Myr / sec)";
    if (extras) extras.style.display = "none";
  } else {
    s.min = "0"; s.max = "1"; s.step = "0.001"; s.value = String(solarSliderFromSpeed(state.yearsPerSec));
    s.setAttribute("aria-label", "animation time speed");
    if (lbl) lbl.textContent = "Time speed";
    if (extras) extras.style.display = "";
    updateSpeedUI();
  }
}

// Toggle the free-fly camera, seeding its position/orientation from the current orbit view so the
// transition is seamless, and back again.
function setFreeFly(on) {
  state.freeFly = on;
  const hint = document.getElementById("orreryInsight");
  if (on) {
    const eye = orbitEye(), t = anchorPos();
    state.freePos = eye.slice();
    const dir = norm(sub(t, eye));
    state.yaw = Math.atan2(dir[1], dir[0]);
    state.pitch = Math.max(-1.5, Math.min(1.5, Math.asin(dir[2])));
    const c = document.getElementById("orreryCanvas"); if (c) c.focus();
    startLoop(); // free-fly integrates held keys per frame, so the loop must run even with Animate off
    if (hint) hint.textContent = "Free-fly camera: click the view, then W/A/S/D to move, R/F (or E/Q) for up/down, Shift to boost, drag to look, scroll to thrust forward. Untick Free fly to return to orbit.";
  } else if (hint) {
    hint.textContent = SYSTEM_VIEW_HINT;
  }
  paint();
}

// ---------------------------------------------------------------- lifecycle
export function enterOrrery() {
  // Idempotent against overlapping calls: enter is async (WASM load + GL init), so a
  // double-invocation could race two initGL passes. app.js always leaves before entering,
  // but the boot router and future callers shouldn't have to know that.
  if (enterPromise && state.active) return enterPromise;
  state.entering = true;
  const pending = enterOrreryInner().finally(() => {
    if(enterPromise===pending){state.entering = false;enterPromise = null;}
  });
  enterPromise=pending;return pending;
}

async function enterOrreryInner() {
  firstFrameOwner=null;frameScheduler.cancel();state.lastTick=0;
  state.active = true;
  metadataFailed=false;
  const generation=systemGeneration;
  const canvas = document.getElementById("orreryCanvas"); if (!canvas) return;
  // Clear a possible showFallback() hide — but ONLY clear. Setting an inline
  // display:block here permanently overrode the CSS that hides this canvas on the other
  // surfaces (body[data-surface] rules), so one visit to the 3-D view left a stale WebGL
  // frame corrupting the Sun surface's layout for the rest of the session.
  canvas.style.display = "";
  try {
    // Leaving suspends the scene clock. Reentry/Retry refreshes its metadata, not
    // its accepted time; only first entry and explicit Now/time inputs use wall time.
    const {unix}=validateSystemRequest({unix:state.bodies.length===9 ? state.renderUnix : effectiveBaseUnix() + state.simElapsed});
    const [,snapshot]=await Promise.all([loadSkyEngine(),requestSystemSnapshot(unix)]);
    if(!state.active||generation!==systemGeneration)return;
    state.bodies=snapshot.bodies.map(body=>({...body}));state.renderUnix=unix;state.metadataUnix=unix;state.engineError="";lastFullSnapshot=performance.now();
    if (!gl) {
      const lifecycle=graphicsLifecycle;
      const res = await initGL(canvas);
      // Graphics completion belongs to the graphics lifecycle, not to the scientific-time
      // request. A time slider or Now action advances only the metadata generation, so it
      // must not skip particles, textures, geometry, the first paint and the frame loop.
      // Leaving, hiding or losing the context discards the pending compile and advances
      // graphicsLifecycle; that superseded entry must return before treating its null
      // result as missing WebGL2 and hiding the canvas a renewed entry draws into.
      if(!state.active||lifecycle!==graphicsLifecycle)return;
      if (!res) { showFallback("WebGL2 is unavailable — try a recent Chrome, Edge, Firefox, or Safari."); return; }
      state.backend = "WebGL2/ANGLE" + res.label.replace("WebGL2", "");
      const node = document.getElementById("orreryBackend");
      if (node) node.textContent = "Rendering on " + res.label;
      initParticles();
    }
    if(!incidentFields)initIncidentResources();
    loadTextures();
    setSpeedSliderMode(state.galaxy);
    rebuildPositions();
    buildSceneLines();
    updateOrreryPositions();
    showDetail(state.selected);
    updateOrreryAccuracy();
    ownFirstFrame(canvas,error=>{
      state.engineError=`3-D view failed to initialise: ${error instanceof Error?error.message:String(error)}`;
      updateOrreryAccuracy();
    });
    paint();
    startLoop();
    // Compact identities and the curated sky are already available. Enrichment
    // follows actual scene or catalogue demand, never unconditional view entry.
    syncCatalogueDemand(true);
    buildGeneratedMaps();

  } catch (e) { if(state.active&&generation===systemGeneration&&!document.hidden) {showFallback("3-D view failed to initialise: " + e.message);console.error(e);} }
}
export function leaveOrrery() {
  firstFrameOwner=null;
  state.active = false;resetSunLook();
  cancelCatalogueWork();
  cancelPendingPrograms();
  hdrPresentation?.dispose();hdrPresentation=null;linearFrame=false;state.hdrFrame=null;
  scatteringTargets?.dispose();scatteringTargets=null;scatteringFrame=null;state.scatteringFrame=null;state.scatteringStatus={};
  state.hdrStatus={state:'deferred',reason:'View inactive.'};
  cancelPendingReferenceTextures();
  resetIllustrativeResources();
  incidentFields?.dispose();incidentFields=null;incidentDemand='';
  state.solarPlayback.playing=false;
  terrainDetails?.abortPending();solarDetail?.abortPending();
  physicalPresenter.dispose();
  updatePhysicalAppearance();
  cancelSystemWork();
  frameScheduler.cancel();state.lastTick=0;
}
async function showFallback(msg) {
  frameScheduler.cancel();state.lastTick=0;
  const generation=systemGeneration,unix=state.renderUnix;
  state.engineError=msg;
  updateOrreryAccuracy();
  const node = document.getElementById("orreryInsight"); if (node) node.textContent = msg;
  const canvas = document.getElementById("orreryCanvas"); if (canvas) canvas.style.display = "none";
  // Keep the text alternative alive: the "Positions" list needs only the ephemeris engine,
  // not WebGL — it used to stay empty after a GL failure, leaving a fully dead panel.
  try {
    const snap = await requestSystemSnapshot(unix);
    if(!state.active||generation!==systemGeneration)return;
    state.bodies = snap.bodies.map(body=>({...body}));
    state.metadataUnix=unix;updateOrreryAccuracy();
    updateOrreryPositions();
  } catch (error) {
    if(!state.active||generation!==systemGeneration)return;
    state.engineError=`${msg}; text positions unavailable: ${error.message}. Retry explicitly to recover.`;
    updateOrreryAccuracy();
  }
}

// ---------------------------------------------------------------- interaction
(function attach() {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById("orreryCanvas")); if (!canvas) return;
  canvas.tabIndex = 0;
  syncRenderQuality();
  document.getElementById('orreryCatalogueRetry')?.addEventListener('click',retryCatalogues);
  document.addEventListener('focusin',event=>{
    const button=document.getElementById('orreryCatalogueRetry');
    if(event.target!==button&&event.target!==document.body)catalogueFocusIntent=null;
  });
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,event=>{
    const button=document.getElementById('orreryCatalogueRetry');
    if(!button?.contains(/** @type {Node} */(event.target)))catalogueFocusIntent=null;
  },true);
  document.getElementById("orreryRetry")?.addEventListener("click",()=>{
    // Coalesce repeated clicks before cancellation can invalidate the pending entry.
    if(state.entering)return;
    cancelSystemWork();metadataFailed=false;state.engineError="";lastFullSnapshot=0;
    // A failed re-entry can retain GL and bodies while hiding the canvas before
    // startLoop. Metadata-only recovery cannot restore that rendering lifecycle.
    if(!gl||state.bodies.length!==9||canvas.style.display==="none")void enterOrrery();else void refreshSystemMetadata();
    updateOrreryAccuracy();
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)catalogueFocusIntent=null;
    syncIncidentDemand();
    state.keys.clear(); state.lastTick=0;
    if (document.hidden) { sunLook?.suspend();earthLookWanted=false;earthLookDetails?.abortPending();frameScheduler.cancel();cancelPendingPrograms();cancelSystemWork(); }
    else if (state.active) {
      // requestAnimationFrame never ran while the tab was hidden, so any compile still
      // pending has been charged wall-clock time no poll could observe. Renew its
      // deadline now that polling resumes; otherwise the first visible poll expires
      // every mandatory program and reports WebGL2 as unavailable on a browser that
      // supports it. A tab that loads hidden reaches here before its first frame.
      shaderPrograms?.renewDeadlines();sunLook?.renewDeadlines();
      if(!gl||!state.bodies.length)void enterOrrery();else startLoop();
    }
  });
  document.getElementById("orrerySearch")?.addEventListener("input",event=>{
    state.objectQuery=/** @type {HTMLInputElement} */ (event.target).value; syncCatalogueDemand();updateOrreryPositions();
  });
  document.getElementById("orreryObjectGroup")?.addEventListener("change",event=>{
    state.objectGroup=/** @type {HTMLSelectElement} */ (event.target).value; syncCatalogueDemand();updateOrreryPositions();
  });
  document.getElementById("orreryFocusSelected")?.addEventListener("click",()=>{
    if (state.selected && !state.selectedStar) state.selected==='Sun'?inspectSun():setAnchor(state.selected);
  });
  document.getElementById('orreryFocusSystem')?.addEventListener('click',()=>{
    const parent = selectedSystemParent();
    if (parent) setAnchor(parent, 'inspect-system');
  });
  document.getElementById('orreryInspectSun')?.addEventListener('click',inspectSun);
  // Respect the OS motion preference: the 3-D surface must not auto-animate full-viewport
  // for users who asked for reduced motion. The Animate checkbox re-enables it explicitly.
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    state.animate = false;
    const cb = /** @type {HTMLInputElement|null} */ (document.getElementById("orreryAnimate"));
    if (cb) cb.checked = false;
  }
  const clampR = (r) => {
    const extent = !state.galaxy && state.anchor !== "Sun" ? anchorNearExtent() : null;
    const minimum = extent ? minimumOrbitDistance(extent, Math.hypot(...anchorPos())) : .6;
    return Math.max(minimum, Math.min(160, r));
  };
  const pointers = new Map(); let lx = 0, ly = 0, pinch = 0, downX = 0, downY = 0, moved = false;
  const spread = () => { const p = [...pointers.values()]; return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0; };

  canvas.addEventListener("pointerdown", (e) => {
    frameScheduler.invalidate({input:true});
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); lx = e.clientX; ly = e.clientY;
    // Multiple contacts are a gesture even before either finger moves.
    downX = e.clientX; downY = e.clientY; moved = pointers.size > 1;
    if (pointers.size === 2) pinch = spread();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const drop = (e) => {
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    // Ending a pinch: re-anchor the drag origin to the surviving finger, or its next
    // pointermove computed dx against a pre-pinch position and whipped the camera.
    if (pointers.size === 1) {
      const p = pointers.values().next().value;
      lx = p.x; ly = p.y;
      pinch = 0;
    }
  };
  canvas.addEventListener("pointerup", (e) => {
    frameScheduler.invalidate({input:true}); if (!moved) pick(e); drop(e); });
  canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("pointermove", (e) => {
    // Hovering is not interaction: only a tracked drag or pinch schedules a frame.
    if (!pointers.has(e.pointerId)) return;
    frameScheduler.invalidate({input:true});
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      moved = true; // a pinch is a gesture, not a tap — lifting a finger must not trigger pick()
      const d = spread(); if (pinch > 0 && d > 0) { state.radius = clampR(state.radius * (pinch / d)); pinch = d; if (!state.animate) paint(); }
      return;
    }
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    if (state.freeFly) { // drag = mouse-look
      state.yaw -= dx * 0.005;
      state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch - dy * 0.005));
    } else {
      state.az -= dx * 0.008;
      state.el = Math.max(-1.45, Math.min(1.45, state.el + dy * 0.008));
    }
    lx = e.clientX; ly = e.clientY; if (!state.animate) paint();
  });
  canvas.addEventListener("wheel", (e) => {
    frameScheduler.invalidate({input:true});
    e.preventDefault();
    if (state.freeFly) { const f = flyForward(); const s = Math.sign(e.deltaY) * -0.5 * (e.shiftKey ? 4 : 1); state.freePos = add(state.freePos, [f[0] * s, f[1] * s, f[2] * s]); }
    else state.radius = clampR(state.radius * (1 + Math.sign(e.deltaY) * 0.12));
    if (!state.animate) paint();
  }, { passive: false });
  canvas.addEventListener("keydown", (e) => {
    frameScheduler.invalidate({input:true});
    if (state.freeFly) {
      const k = e.key.toLowerCase();
      if ("wasdqerf".includes(k) || k === "shift") { state.keys.add(k); e.preventDefault(); return; }
      // arrows also steer the look in free-fly
      if (e.key === "ArrowLeft") state.yaw += 0.06; else if (e.key === "ArrowRight") state.yaw -= 0.06;
      else if (e.key === "ArrowUp") state.pitch = Math.min(1.5, state.pitch + 0.06); else if (e.key === "ArrowDown") state.pitch = Math.max(-1.5, state.pitch - 0.06);
      else return;
      e.preventDefault(); return;
    }
    let used = true;
    if (e.key === "ArrowLeft") state.az -= 0.1; else if (e.key === "ArrowRight") state.az += 0.1;
    else if (e.key === "ArrowUp") state.el = Math.min(1.45, state.el + 0.1); else if (e.key === "ArrowDown") state.el = Math.max(-1.45, state.el - 0.1);
    else if (e.key === "+" || e.key === "=" || e.key === "]") state.radius = clampR(state.radius * 0.88);
    else if (e.key === "-" || e.key === "_" || e.key === "[") state.radius = clampR(state.radius * 1.13);
    else used = false;
    if (used) { e.preventDefault(); if (!state.animate) paint(); }
  });
  canvas.addEventListener("keyup", (e) => { state.keys.delete(e.key.toLowerCase()); });
  canvas.addEventListener("blur", () => state.keys.clear());

  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left), py = (e.clientY - rect.top);
    const [w, h] = [canvas.clientWidth, canvas.clientHeight];
    const { vp, skyVp } = cameraMatrices(canvas.clientWidth, canvas.clientHeight);

    // Solar neighbourhood: stars are the only thing to inspect, at true 3-D places.
    if (state.galaxy) {
      if (state.localView) {
        state.selectedStar = pickStar(px, py, w, h, vp,
          (s) => (s.dist == null ? null : neighbourhoodPos(s.ra, s.dec, s.dist)));
        if (state.selectedStar && typeof CustomEvent === "function") window.dispatchEvent?.(new CustomEvent("sol:object-selected", { detail: { surface: "orrery" } }));
        showDetail(state.selected);
        if (!state.animate) paint();
      }
      return; // the galaxy disc has no per-object picking
    }

    // A fingertip covers far more than a cursor: touch keeps a ~44 px target
    // (WCAG 2.5.5) around small or sub-pixel bodies; mouse and pen stay precise.
    const minimumHit = e.pointerType === "touch" ? 22 : 12;
    let best = null;
    for (const name of DRAW_LIST) {
      if(state.solarInspection&&name!=='Sun')continue;
      const b = name === "Sun" ? { name: "Sun" } : state.bodies.find((x) => x.name === name);
      if (!b) continue;
      const p = bodyWorldPos(b);
      const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
      const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
      const wv = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      if (wv <= 0) continue;
      const sx = (x / wv * 0.5 + 0.5) * w, sy = (1 - (y / wv * 0.5 + 0.5)) * h;
      const d = Math.hypot(sx - px, sy - py);
      const phys = BODY[name];
      const disc = projectOpaqueDisc({id:name,position:p,
        radius:displayRadiusAU(name)*Math.min(1,phys.polarKm/phys.radiusKm)},vp,{width:w,height:h});
      const hitRadius = Math.max(minimumHit, disc?.radius || 0);
      if (d < hitRadius && (!best || wv < best.depth)) best = { d, name, depth:wv };
    }
    // Moons compete on the same footing, with a tighter radius so a moon close to its planet
    // does not steal clicks aimed at the planet itself. Small-body markers (dwarf planets,
    // comets, spacecraft) join at the same tight radius — they used to be drawn and labelled
    // but unclickable, which left their facts unreachable.
    const extra = state.showSmall&&!state.solarInspection ? smallBodies : [];
    for (const mk of [...moonMarkers, ...extra]) {
      const p = mk.pos;
      const wv = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      if (wv <= 0) continue;
      const sx = ((vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12]) / wv * 0.5 + 0.5) * w;
      const sy = (1 - ((vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13]) / wv * 0.5 + 0.5)) * h;
      const d = Math.hypot(sx - px, sy - py);
      const disc = mk.moon ? projectOpaqueDisc({id:mk.name,position:p,
        radius:moonDisplayRadius(mk.moon,BODY[mk.moon.p].radiusKm,displayRadiusAU(mk.moon.p))},vp,{width:w,height:h}) : null;
      if (d < Math.max(minimumHit,disc?.radius || 0) && (!best || wv < best.depth)) best = { d, name: mk.name, depth:wv };
    }
    // Solar-system bodies win: they are the subject of this view, and a star behind one
    // must not steal the click. Only an empty patch of sky falls through to the stars,
    // which live on the backdrop sphere and so project with skyVp, not vp.
    state.selected = best ? best.name : null;
    state.selectedStar = best || !state.showSky
      ? null
      : pickStar(px, py, w, h, skyVp, (s) => equToEcl(s.ra, s.dec));
    if ((state.selected || state.selectedStar) && typeof CustomEvent === "function") window.dispatchEvent?.(new CustomEvent("sol:object-selected", { detail: { surface: "orrery" } }));
    showDetail(state.selected);
    if (!state.animate) paint();
    armSolarFlow();
  }

  const bind = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, event=>{
    frameScheduler.invalidate({input:true});fn(event);
  });
  /** @param {Event} e */
  const inputTarget = (e) => /** @type {HTMLInputElement} */ (e.currentTarget);
  bind("orreryTime", "input", (e) => applySystemTime(Number(inputTarget(e).value)));
  bind("orreryNow", "click", () => applySystemTime(0,true));
  // drawRing already detects a radius change and re-uploads into the SAME buffer, so no
  // ringBufs reset here — nuking the map on every slider input orphaned up to three ~1.3 MB
  // GPU buffers per event without gl.deleteBuffer.
  bind('orreryQuality','change',event=>{
    renderQuality.setMode(inputTarget(event).value);syncRenderQuality();paint();
  });
  bind("orrerySize", "input", (e) => { state.exaggeration = Number(inputTarget(e).value); paint(); });
  bind("orreryTrueScale", "change", (e) => { state.trueScale = inputTarget(e).checked; paint(); updateOrreryAccuracy(); });
  bind("orreryAnimate", "change", (e) => {
    state.animate = inputTarget(e).checked;
    if (state.animate) startLoop();
    else {
      state.simStepSeconds = 0;
      resetRotationDisplay();
      paint();
      updateOrreryAccuracy();
    }
  });
  bind("orrerySpeed", "input", (e) => {
    const v = Number(inputTarget(e).value);
    if (state.galaxy) state.galSpeed = v;
    else setSolarSpeed(solarSpeedFromSlider(v), "slider");
  });
  bind("orrerySpeedPresets", "click", (e) => {
    const btn = /** @type {Element} */ (e.target).closest("button[data-dps]");
    if (btn && !state.galaxy) {
      setSolarSpeed(Number(/** @type {HTMLElement} */ (btn).dataset.dps) / DAYS_PER_YEAR);
    }
  });
  const entrySpeed = () => {
    const entry = /** @type {HTMLInputElement} */ (document.getElementById("orrerySpeedEntry"));
    const unit = /** @type {HTMLSelectElement} */ (document.getElementById("orrerySpeedUnit"));
    const v = Number(entry.value);
    if (Number.isFinite(v) && v > 0 && !state.galaxy) setSolarSpeed((v * Number(unit.value)) / DAYS_PER_YEAR, "entry");
  };
  bind("orrerySpeedEntry", "input", entrySpeed);
  // A unit switch re-expresses the current rate, it does not change it.
  bind("orrerySpeedUnit", "change", () => { if (!state.galaxy) updateSpeedUI(); });
  updateSpeedUI();
  bind("orreryShowOrbits", "change", (e) => { state.showOrbits = inputTarget(e).checked; buildSceneLines(); paint(); });
  bind("orreryShowSky", "change", (e) => { state.showSky = inputTarget(e).checked; paint(); });
  bind("orreryShowConst", "change", (e) => { state.showConst = inputTarget(e).checked; paint(); });
  bind("orreryShowLabels", "change", (e) => { state.showLabels = inputTarget(e).checked; paint(); });
  bind("orreryShowSunEq", "change", (e) => { state.showSunEq = inputTarget(e).checked; buildSceneLines(); buildDropLines(); paint(); });
  bind("orreryShowSmall", "change", (e) => { state.showSmall = inputTarget(e).checked; buildSceneLines(); rebuildSmallBodies(); paint(); });
  bind("orreryShowMoons", "change", (e) => { state.showMoons = inputTarget(e).checked; paint(); updateOrreryAccuracy(); });
  bind("orreryDeepSky", "change", (e) => { state.galDeepSky = inputTarget(e).checked; paint(); });
  bind("orreryTextures", "change", (e) => {
    const wasEnabled = state.useTextures;
    state.useTextures = inputTarget(e).checked;resetSunLook();
    if (state.useTextures && !wasEnabled) loadTextures();
    updatePhysicalAppearance();updateEarthLayerStatus(); paint(); updateOrreryAccuracy();
  });
  bind('orreryPlanetLook','change',e=>{
    state.planetLook=inputTarget(e).value==='illustrative'?'illustrative':'source-qualified';
    resetIllustrativeResources();terrainDetails?.abortPending();
    paint();updatePhysicalAppearance();updateEarthLayerStatus();updateOrreryAccuracy();
  });
  bind('orrerySaturnLighting','change',e=>{
    state.saturnLighting=inputTarget(e).value==='look-lab'?'look-lab':'sun-directed';
    paint();updatePhysicalAppearance();updateOrreryAccuracy();
  });
  bind('orreryTerrain','change',e=>{
    retryTerrainFailures=!state.terrainEnabled&&inputTarget(e).checked;
    state.terrainEnabled=inputTarget(e).checked;
    updatePhysicalAppearance();paint();
  });
  bind('orreryOptics','change',e=>{
    state.opticsEnabled=inputTarget(e).checked;incidentFields?.dispose();incidentFields=null;incidentDemand='';
    scatteringTargets?.dispose();scatteringTargets=null;scatteringFrame=null;state.scatteringFrame=null;state.scatteringStatus={};
    if(state.opticsEnabled){for(const body of ['Earth','Mars'])for(const role of PHYSICAL_PROGRAMS)shaderPrograms?.retry(physicalProgramKey(body,role));}
    else cancelPendingPrograms();
    if(state.opticsEnabled&&gl)initIncidentResources();updatePhysicalAppearance();paint();
  });
  // The default overview anchors on the Sun without selecting it. Reference modes
  // still distinguish that context from an explicitly selected solar subject.
  // Choosing a mode is a request to see the Sun that way, so it makes the Sun the
  // subject rather than leaving a control that appears to do nothing. The camera is
  // left alone: this selects the body, it does not reframe the view like Inspect.
  bind('orrerySolarMode','change',e=>{state.solarMode=['illustrative','reconstructed-euv','visible'].includes(inputTarget(e).value)?inputTarget(e).value:'illustrative';state.solarPlayback.playing=false;resetSunLook();
    if(state.anchor==='Sun'&&!solarSubject()&&!state.galaxy&&!state.selectedStar){state.selected='Sun';showDetail('Sun');}
    syncSolarPlaybackControls();paint();armSolarFlow();window.dispatchEvent(new Event('sol:presentation'));});
  bind('orrerySunResolution','change',e=>{state.sunLookResolution=sunLookResolution(inputTarget(e).value);resetSunLook();syncSolarPlaybackControls();paint();armSolarFlow();});
  bind('orrerySunProminences','change',e=>{state.sunLookProminences=inputTarget(e).checked;paint();});
  bind('orrerySunLookPlay','click',()=>{state.sunLookPlaying=!state.sunLookPlaying;syncSolarPlaybackControls();armSolarFlow();});
  bind('orrerySunLookRestart','click',()=>{solarFlowSeconds=0;resetSunLook();paint();armSolarFlow();});
  bind('orrerySolarPlay','click',()=>{
    if(!solarPlaybackAvailable())return;
    if(state.solarPlayback.seconds>=state.solarPlayback.duration)state.solarPlayback.seconds=0;
    state.solarPlayback.playing=!state.solarPlayback.playing;updatePhysicalAppearance();startLoop();
  });
  bind('orrerySolarTime','input',e=>{state.solarPlayback.seconds=Math.max(0,Math.min(20,Number(inputTarget(e).value)));state.solarPlayback.playing=false;syncSolarPlaybackControls();paint();});
  bind('orrerySolarRestart','click',()=>{
    state.solarPlayback.seconds=0;state.solarPlayback.playing=false;
    if(solarDetail?.status('reference')==='unavailable')solarDetail.retry('reference');
    syncSolarPlaybackControls();paint();
  });
  for (const [id, key] of [['orreryEarthNight', 'earthNight'], ['orreryEarthWeather', 'earthWeather'], ['orreryEarthIce', 'earthIce']]) {
    bind(id, 'change', e => { state[key] = inputTarget(e).checked; updateEarthLayerStatus(); paint(); updateOrreryAccuracy(); });
  }
  bind('orreryVenusRadar', 'change', e => { state.venusRadar = inputTarget(e).checked; updatePhysicalAppearance(); paint(); updateOrreryAccuracy(); });
  bind('orreryEarthCloudSource', 'change', e => {
    const input = inputTarget(e);
    state.earthCloudSource = input.value === 'daily' ? 'daily' : 'composite';
    input.value = state.earthCloudSource;
    updateEarthLayerStatus(); paint(); updateOrreryAccuracy();
  });
  bind("orreryTopDown", "change", (e) => {
    state.topDown = inputTarget(e).checked;
    if (state.topDown) { state.preTopRadius = state.radius; state.radius = 78; } // frame the whole system from above
    else if (state.preTopRadius) { state.radius = state.preTopRadius; }
    paint();
  });
  bind("orreryAnchor", "change", (e) => { if (!state.freeFly) setAnchor(inputTarget(e).value); else {state.anchor = inputTarget(e).value;syncSolarPlaybackControls();} });
  populateAnchorSelect(); // replace the static planet list with the full data-driven one
  bind("orreryFreeFly", "change", (e) => setFreeFly(e.target.checked));
  bind("orreryGalaxy", "click", () => {
    state.galaxy = !state.galaxy;
    state.selectedStar = null;
    if(state.selected?.startsWith('star:'))state.selected=null;
    showDetail(state.selected);updateOrreryPositions();
    if (state.localView) { state.localView = false; const lb = document.getElementById("orreryLocal"); if (lb) lb.textContent = "Solar neighbourhood (ly scale)"; }
    if (state.freeFly) { state.freeFly = false; const ff = /** @type {HTMLInputElement|null} */ (document.getElementById("orreryFreeFly")); if (ff) ff.checked = false; }
    const btn = document.getElementById("orreryGalaxy");
    const insight = document.getElementById("orreryInsight");
    setSpeedSliderMode(state.galaxy);
    if (state.galaxy) {
      state.savedRadius = state.radius; state.radius = 118; state.el = 0.95;
      updateGalaxySun();
      if (btn) btn.textContent = "← Back to the Solar System";
      if (insight) insight.textContent = "The Milky Way, face-on. Two dominant stellar arms (Scutum–Centaurus and Perseus) spring from the ends of the central bar, tilted ~28° to our line to the centre, with the fainter Sagittarius–Carina and Norma–Outer arms between them. The Sun (cyan) sits INSIDE the short Orion Spur, ~8.2 kpc (26,700 ly) out — Sagittarius–Carina is the next arm inward, Perseus the next outward. One lap is a ~220-million-year “galactic year.” Press Animate: the disc rotates DIFFERENTIALLY — inner stars lap outer ones, so over a few hundred Myr the arms shear and wind up. That “winding problem” is exactly why real spiral arms must be density waves, not fixed clumps of stars. Drag to rotate, scroll to zoom.";
    } else {
      state.radius = state.savedRadius; state.el = OVERVIEW_EL;
      if (btn) btn.textContent = "Zoom out to the Milky Way";
      if (insight) insight.textContent = SYSTEM_VIEW_HINT;
      rebuildPositions();
    }
    updatePhysicalAppearance();paint();
  });
  bind("orreryLocal", "click", () => {
    state.localView = !state.localView;
    state.selectedStar = null;
    if(state.selected?.startsWith('star:'))state.selected=null;
    showDetail(state.selected);updateOrreryPositions();
    if (state.freeFly) { state.freeFly = false; const ff = /** @type {HTMLInputElement|null} */ (document.getElementById("orreryFreeFly")); if (ff) ff.checked = false; }
    const lb = document.getElementById("orreryLocal");
    const gb = document.getElementById("orreryGalaxy");
    const insight = document.getElementById("orreryInsight");
    if (state.localView) {
      if (!state.galaxy) { state.galaxy = true; state.savedRadius = state.radius; setSpeedSliderMode(true); if (gb) gb.textContent = "← Back to the Solar System"; }
      state.radius = 28; state.el = 0.5;
      if (lb) lb.textContent = "← Back to the Milky Way disc";
      if (insight) insight.textContent = "The solar neighbourhood at light-year scale — every naked-eye star (Hipparcos catalogue) at its REAL 3-D position from its measured parallax distance, Sun at the centre. +x points at the galactic centre; rings mark 10 / 25 / 50 / 100 / 250 light-years; size encodes intrinsic luminosity, colour the measured B−V temperature. Labels read “star · distance.” Positions are the J2000 epoch (proper motion is real but sub-pixel over the scrubber's ±5000 yr). Drag to rotate, scroll to zoom — Alpha Centauri is the label nearest the Sun.";
    } else {
      state.radius = 118; state.el = 0.95; // back out to the galaxy disc
      if (lb) lb.textContent = "Solar neighbourhood (ly scale)";
      updateGalaxySun();
      if (insight) insight.textContent = "The Milky Way, face-on — the Sun's real catalogued neighbours cluster in the bright halo around its marker (nearly everything you can see by eye is within ~2,000 ly). Zoom back into the Solar neighbourhood to resolve them, or press Animate to run galactic time.";
    }
    updatePhysicalAppearance();paint();
  });

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    releaseSphereMeshes(true);
    firstFrameOwner=null;
    frameScheduler.cancel();graphicsLifecycle++;cancelSystemWork();state.keys.clear();state.lastTick=0;
    state.engineError="3-D graphics context lost; the text alternative and prior coordinates remain available.";updateOrreryAccuracy();
    // Everything GPU-side belongs to the dead context. The texture/ring caches MUST be
    // invalidated too: their `ready` flags used to survive the loss, so after a restore
    // drawBody bound dead textures (planets rendered flat, rings vanished) and
    // texturesStarted=true meant loadTextures() never re-fetched for the life of the tab.
    terrainDetails?.dispose();terrainDetails=null;terrainDemand={};state.terrainStatus={};
    incidentFields?.dispose();incidentFields=null;incidentDemand='';state.opticsStatus={};
    resetSunLook(true);solarDetail?.dispose();solarDetail=null;state.solarStatus='unavailable';state.solarPlayback.playing=false;
    shaderPrograms?.dispose();shaderPrograms=null;state.programStatus={base:'deferred',physical:'deferred'};
    scatteringTargets?.dispose();scatteringTargets=null;scatteringFrame=null;state.scatteringFrame=null;state.scatteringStatus={};
    hdrPresentation?.dispose();hdrPresentation=null;linearFrame=false;state.hdrFrame=null;
    state.hdrStatus={state:'deferred',reason:'Graphics context lost.'};
    resetIllustrativeResources();
    gl = null; P = {};
    textures = {}; sunTex = { ready: false, tex: null }; ringTex = { ready: false, tex: null };
    cancelPendingReferenceTextures();
    referenceTextures = {}; referenceDemand = []; textureGeneration++;
    state.appearanceStatus = Object.fromEntries(appearanceReferences().map(a => [a.id, 'unavailable']));
    updateEarthLayerStatus(); updateOrreryAccuracy();
    whiteTex = null; ringBufs = {}; ringShadowTex = {}; texturesStarted = false; particles = null;
    genTex = {}; genStarted = false; // generated surface maps died with the context too
    moonPathBuf = null;
    syncSolarPlaybackControls();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (!state.active) return;
    state.engineError="";metadataFailed=false;
    const c = document.getElementById("orreryCanvas");
    const restoreLifecycle=graphicsLifecycle;
    let programGeneration=programContextGeneration,result;
    const failed=error=>{
      if(!state.active||restoreLifecycle!==graphicsLifecycle||programGeneration!==programContextGeneration)return;
      state.engineError=`3-D graphics restoration failed: ${error instanceof Error?error.message:String(error)}`;
      updateOrreryAccuracy();
    };
    try{result=initGL(c);}
    catch(error){
      // Capture this synchronous attempt even if setup advanced the generation.
      programGeneration=programContextGeneration;failed(error);return;
    }
    const manager=shaderPrograms;programGeneration=programContextGeneration;
    const restored=ready=>{
      // Restoration belongs to the graphics lifecycle: programGeneration and the manager
      // identity reject a replaced context, while a time change during a parallel
      // compile only advances the metadata generation and must not skip setup.
      if(!state.active||restoreLifecycle!==graphicsLifecycle||programGeneration!==programContextGeneration)return;
      if(!ready){
        if(state.programStatus.base==='unavailable'){
          state.engineError='3-D graphics programs unavailable after context restoration. Retry explicitly.';updateOrreryAccuracy();
        }
        return;
      }
      if(shaderPrograms!==manager)return;
      initParticles();
      loadTextures();
      buildGeneratedMaps();
      // A graphics reset does not change the rendered epoch or its valid physical
      // snapshot. Recomputing positions here also launched a fresh metadata worker
      // while synchronous shader/first-frame work could block its reply deadline.
      // Rebuild only the GPU geometry from the retained coordinates and elements.
      buildSceneLines();
      buildDropLines();
      // The marker buffer is recreated empty by finishGL while smallMarkCount still
      // holds its pre-loss value, so the retained count must be re-backed by real
      // storage before the first restored draw. A paused or reduced-motion scene
      // never reaches the tick that would otherwise repair it.
      rebuildSmallBodies();
      ownFirstFrame(c,failed);
      paint();
      startLoop(); // the tick loop may have stopped while gl was null; re-arm it
    };
    if(result instanceof Promise)void result.then(restored).catch(failed);
    else try{restored(result);}catch(error){failed(error);}
  });
  // Repaint on any size change (DPI / window / layout) so ensureSized rebuilds the backing store at
  // full resolution — fires even when rAF is throttled (background tab), unlike the animation loop.
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { labelPresenter.invalidate(); }).observe(canvas);
})();
