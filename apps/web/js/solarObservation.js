import { visualAssetManifest } from "./visualAssetManifest.js";

// Build validation binds original NASA bytes, caption and archive identity. This
// separate record never enters surface-texture eligibility or model registration.
const source = visualAssetManifest.observed_images[0];
const observation = Object.freeze({
  id: source.id,
  path: source.path,
  label: source.label,
  sourceUrl: source.source_url,
  credits: source.credits,
  capturedAt: source.captured_at,
  retrievedAt: source.retrieved_at,
  interpretation: source.interpretation,
  status: source.status,
  mission: source.mission,
  instrument: source.instrument,
  wavelengthAngstrom: source.wavelength_angstrom,
  isFalseColor: source.is_false_color,
  sha256: source.sha256,
  bytes: source.bytes,
  allowedUsages: Object.freeze([...source.allowed_usages]),
  registrationVerified: source.registration_verified,
  globalMappingAllowed: source.global_mapping_allowed,
  scientificAnalysisAllowed: source.scientific_analysis_allowed,
  limits: source.limits,
});

/** Return the bundled observation's immutable provenance; performs no I/O. */
export function getSolarObservation() {
  return observation;
}
