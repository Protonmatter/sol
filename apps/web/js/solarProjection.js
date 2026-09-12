// Presentation geometry only. Physical evolution stays in the snapshot producer.
const RAD = Math.PI / 180;

export function projectSolarPoint(latitude, longitude, coordinates) {
  const meridian = coordinates?.central_meridian_longitude_deg;
  if (![latitude, longitude, meridian].every(Number.isFinite) || Math.abs(latitude) > 90) return null;
  if (coordinates?.longitude_positive !== "west") return null;
  const lat = latitude * RAD, delta = (longitude - meridian) * RAD;
  const z = Math.cos(lat) * Math.cos(delta);
  return { x: Math.cos(lat) * Math.sin(delta), y: -Math.sin(lat), z, visible: z > 1e-12 };
}

export function confidenceEncoding(score) {
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) return null;
  return { opacity: score * 0.65, label: `${score.toFixed(2)} / 1 — heuristic model score, not probability` };
}

export function regionAnchor(region) {
  return region.model_position || { lat_deg: region.lat_deg, lon_deg: region.lon_deg };
}
