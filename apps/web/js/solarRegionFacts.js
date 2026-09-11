// Display-only facts from a validated v3 snapshot; no physical evolution here.
export function solarRegionFacts(region, modelSeconds) {
  const n=(value,digits)=>Number.isFinite(value) ? value.toFixed(digits) : "unavailable";
  const current=region.model_position, birth=region.birth;
  const age=Number.isFinite(modelSeconds) && Number.isFinite(birth?.time_seconds) ? (modelSeconds-birth.time_seconds)/3600 : NaN;
  return `AR ${region.id} · current modeled anchor: ${n(current?.lat_deg,1)}° latitude, ${n(current?.lon_deg,1)}° W Carrington longitude (not an observed centroid). `
    + `Immutable birth: ${n(birth?.lat_deg,1)}° latitude, ${n(birth?.lon_deg,1)}° W at ${n(birth?.time_seconds,0)} model seconds; age ${n(age,2)} model hours. `
    + `Normalized flux ${n(region.flux_norm,2)} (not calibrated gauss); area ${n(region.area_msh,0)} millionths of the solar hemisphere; tilt ${n(region.tilt_deg,1)}°. `
    + `Heuristic model score ${n(region.confidence,2)} — not probability or magnetic-field uncertainty.`;
}
