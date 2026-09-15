import { visualAssetManifest } from "./visualAssetManifest.js";

// This lookup permits only explicitly reviewed uses. Raster identity does not
// establish map coverage, calibrated color, observation epoch or orientation.
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
deepFreeze(visualAssetManifest);

export function visualAssetForBody(name) {
  const key = String(name).toLowerCase();
  return visualAssetManifest.assets.find(a => a.body.toLowerCase() === key || a.id === key) || null;
}

export function textureEligible(name, usage = "global-sphere") {
  const a = visualAssetForBody(name);
  if (!a || a.source_identity.status !== "verified" || !a.allowed_usages.includes(usage)) return false;
  if (usage === "browse-preview") return true;
  if (a.mapping_status !== "qualified") return false;
  if (usage === "global-sphere") {
    const c = a.coverage;
    return c.status === "verified" && a.projection === "equirectangular"
      && c.latitude_deg?.[0] === -90 && c.latitude_deg?.[1] === 90
      && c.longitude_deg?.[1] - c.longitude_deg?.[0] === 360;
  }
  return usage === "observed-disk" || usage === "ring-profile";
}

export function missingDetailColor(name) {
  const fallback = visualAssetManifest.fallbacks[name];
  return [...(fallback?.rgb || visualAssetForBody(name)?.fallback.rgb || [0.55, 0.55, 0.55])];
}

export function visualProvenanceText(name) {
  const a = visualAssetForBody(name);
  if (!a) return visualAssetManifest.fallbacks[name]?.label || "Surface detail unavailable; neutral display color is not a measurement.";
  return `${a.label}. ${a.source_identity.status === "verified" ? "Official source bytes verified." : "Source identity unverified."} ${a.qualification_notes}`;
}

export function visualBrowsePreview(name) {
  const a = visualAssetForBody(name);
  return textureEligible(name, "browse-preview") ? { path: a.path, label: a.label, credits: a.credits, sourceUrl: a.source_url } : null;
}

export function dynamicSourceForChannel(channel) {
  return visualAssetManifest.dynamic_sources.find(source => source.channel === channel) || null;
}

export function dynamicSourceEligible(channel, url) {
  const source = dynamicSourceForChannel(channel);
  return !!source && source.source_url === url && source.source_policy === "official-mutable-browse"
    && source.allowed_usages.length === 1 && source.allowed_usages[0] === "observed-disk"
    && source.capture_time === null && source.content_sha256 === null
    && source.registration_verified === false && source.global_mapping_allowed === false;
}
