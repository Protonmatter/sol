// Pure number/string/array helpers. No imports, no DOM.

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function hash01(value) {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

export function number(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

export function numberOrNa(value, digits) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "n/a";
}

export function compactNumberOrNa(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  if (parsed !== 0 && Math.abs(parsed) < 0.01) return parsed.toExponential(2);
  return parsed.toFixed(2);
}

export function plural(count, singular) {
  return count === 1 ? singular : `${singular}s`;
}

export function countBy(values) {
  return values.reduce((counts, value) => {
    const key = value || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function formatCounts(counts) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${value} ${key}`)
    .join(", ");
}

export function readableMode(value) {
  const textValue = String(value || "unknown").toLowerCase();
  if (textValue.includes("cached")) return "cached";
  if (textValue.includes("fixture")) return "fixture";
  if (textValue.includes("live")) return "live";
  if (textValue.includes("synthetic")) return "synthetic";
  if (textValue.includes("observed")) return "observed";
  if (textValue.includes("inferred")) return "inferred";
  if (textValue.includes("degraded") || textValue.includes("missing") || textValue.includes("failed")) return "degraded";
  return textValue.replace(/[_-]+/g, " ");
}

export function humanizeId(value) {
  return String(value || "unknown").replace(/[_-]+/g, " ");
}

export function formatUtc(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace(".000Z", "Z");
}

export function stageFromActivity(activity) {
  if (activity >= 0.75) return "solar maximum";
  if (activity >= 0.45) return "rising or declining phase";
  return "solar minimum";
}

export function complexityLabel(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= 0.8) return `high (${value.toFixed(2)})`;
  if (value >= 0.55) return `moderate (${value.toFixed(2)})`;
  return `low (${value.toFixed(2)})`;
}
