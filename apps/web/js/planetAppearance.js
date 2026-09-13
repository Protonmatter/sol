// Registered mission reference imagery. These epochs never follow the model clock.
import { visualAssetManifest } from './visualAssetManifest.js';

export function appearanceReference(body, role = 'surface') {
  return (visualAssetManifest.mapped_references || []).find(a => a.body === body && a.role === role) || null;
}

export function appearanceReferences() {
  return visualAssetManifest.mapped_references || [];
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
  if (!asset) return 'Surface detail unavailable in this view; the 3-D appearance is simplified.';
  if (state.useTextures === false) return 'Reference imagery is switched off.';
  const status = state.appearanceStatus?.[asset.id];
  const readiness = status === 'ready' ? '' : status === 'unavailable' ? 'Image unavailable; showing a simplified surface. '
    : 'Loading reference imagery. ';
  const coverage = asset.nodata !== 'none' || asset.validLatitudeBounds[0] > -90 || asset.validLatitudeBounds[1] < 90
    ? ' Unmapped areas are simplified.' : '';
  return `${readiness}${asset.label} · ${asset.observation_label}. ${details ? asset.color_interpretation + ' ' + asset.limitations : 'Reference imagery; its date is separate from model time.' + coverage}`;
}

export function earthLayerDescription(state = {}, compact = false) {
  const roles = /** @type {[string, boolean][]} */ ([['night-lights', state.earthNight !== false], ['weather', state.earthWeather !== false], ['sea-ice', state.earthIce === true]]);
  return roles.filter(([, enabled]) => enabled).map(([role]) => {
    const asset = appearanceReference('Earth', role);
    if (!asset) return `${role}: unavailable`;
    const status = state.appearanceStatus?.[asset.id];
    const label = compact ? {'night-lights':'Night lights',weather:'Clouds and surface','sea-ice':'Sea ice'}[role] : asset.label;
    return `${label} · ${asset.observation_label}${status === 'ready' ? '' : status === 'unavailable' ? ' · unavailable' : ' · loading'}`;
  }).join(' · ');
}
