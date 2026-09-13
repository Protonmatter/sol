// Registered mission reference imagery. These epochs never follow the model clock.
import { visualAssetManifest } from './visualAssetManifest.js';

// Per-channel median of fully covered pixels in the admitted OPAL display maps.
// A flat display color reduces the gray discontinuity at missing map coverage.
// It is not a reconstruction of clouds or a measurement of natural color.
// Reproducible derivation and input hashes: system-polish/RENDERING_CONTRACT.md.
const PARTIAL_MAP_DISPLAY_COLORS = {
  Saturn: {rgb: [180, 186, 168], sha256: 'c88eb864e3c6a2c4a23f7b8cfa32a510e4dc46431da8b0697b7121f45e307fee'},
  Uranus: {rgb: [198, 232, 203], sha256: 'd59ba81033bba3faf30950c2d8893319a8f3e94f968a648c03b16b5d0fd8c8a5'},
  Neptune: {rgb: [109, 203, 161], sha256: 'c9dee0f329268f801ae5e4c736da72c329539f862a651f536e0c3d4846682adf'},
};
export function appearanceFallbackColor(body) {
  const color = Object.hasOwn(PARTIAL_MAP_DISPLAY_COLORS, body) ? PARTIAL_MAP_DISPLAY_COLORS[body] : null;
  return color && appearanceReference(body)?.sha256 === color.sha256 ? color.rgb.map(channel => channel / 255) : null;
}

export function appearanceReference(body, role = 'surface') {
  return (visualAssetManifest.mapped_references || []).find(a => a.body === body && a.role === role) || null;
}

export function appearanceReferences() {
  return visualAssetManifest.mapped_references || [];
}

export function earthCloudRole(state = {}) {
  return state.earthCloudSource === 'daily' ? 'weather' : 'cloud-composite';
}

export function appearanceUniforms(asset) {
  const m = asset.mapping;
  return {
    map: [m.primeMeridianU, m.longitudeDirection === 'east' ? 1 : -1,
      {parametric: 0, planetocentric: 1, planetographic: 2}[m.latitudeType], 0],
    lat: [...m.latitudeBounds, ...asset.validLatitudeBounds].map(x => x * Math.PI / 180),
    window: [...(m.uvScale || [1, 1]), ...(m.uvOffset || [0, 0])],
    nodata: {none: 0, black: 1, alpha: 2}[asset.nodata],
  };
}

export function appearanceDescription(body, state = {}, details = false) {
  const asset = appearanceReference(body);
  if (!asset) return visualAssetManifest.fallbacks?.[body]?.label || 'Surface detail unavailable in this view; the 3-D appearance is simplified.';
  if (state.useTextures === false) return 'Reference imagery is switched off.';
  const status = state.appearanceStatus?.[asset.id];
  const readiness = status === 'ready' ? '' : status === 'unavailable' ? 'Image unavailable; showing a simplified surface. Reopen this view to retry. '
    : 'Loading reference imagery. ';
  const coverage = asset.nodata !== 'none' || asset.validLatitudeBounds[0] > -90 || asset.validLatitudeBounds[1] < 90
    ? ` Unmapped areas are simplified${appearanceFallbackColor(body) ? ' with a flat color derived from the reference image' : ''}.` : '';
  return `${readiness}${asset.label} · ${asset.observation_label}. ${details ? asset.color_interpretation + ' ' + asset.limitations : 'Reference imagery; its date is separate from model time.' + coverage}`;
}

// Keep the primary object card concise; the adjacent source disclosure carries
// complete capture epochs, processing, coverage and interpretation limits.
export function appearanceSummary(body, state = {}) {
  const asset = appearanceReference(body);
  if (!asset || state.useTextures === false) return appearanceDescription(body, state);
  const status = state.appearanceStatus?.[asset.id];
  const readiness = status === 'ready' ? '' : status === 'unavailable' ? 'Image unavailable; showing a simplified surface. ' : 'Loading reference imagery. ';
  return `${readiness}${asset.label}. Archive imagery; open sources for dates and coverage.`;
}

export function earthLayerDescription(state = {}, compact = false) {
  const roles = /** @type {[string, boolean][]} */ ([['night-lights', state.earthNight !== false], [earthCloudRole(state), state.earthWeather !== false], ['sea-ice', state.earthIce === true]]);
  return roles.filter(([, enabled]) => enabled).map(([role]) => {
    const asset = appearanceReference('Earth', role);
    if (!asset) return `${role}: unavailable`;
    const status = state.appearanceStatus?.[asset.id];
    const label = compact ? {'night-lights':'Night lights',weather:'Dated satellite swaths','cloud-composite':'Clouds and surface','sea-ice':'Sea ice'}[role] : asset.label;
    const limits = role === 'weather' ? ' · swath seams and gaps retained' : role === 'cloud-composite' ? ' · historical composite' : '';
    return `${label} · ${asset.observation_label}${status === 'ready' ? '' : status === 'unavailable' ? ' · unavailable' : ' · loading'}${limits}`;
  }).join(' · ');
}
