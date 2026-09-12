// A raw-text boundary: platform JSON parsing alone cannot detect duplicate keys.
import { solarSchema, solarImageRegistrationSchema } from "./solarSchema.js?v=dcca6290db";
import { attributableSource } from "./sourceAttribution.js";
export { SOLAR_STATE_SNAPSHOT_SCHEMA } from "./solarSchema.js?v=dcca6290db";

export function parseStrictJson(text) {
  if (typeof text !== "string" || text.length > 16 * 1024 * 1024) throw new Error("JSON input exceeds the 16 MiB text limit");
  const result = JSON.parse(text);
  const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/g) || [];
  let cursor = 0;
  function scan(depth) {
    if (depth > 128) throw new Error("JSON nesting exceeds 128 levels");
    const token = tokens[cursor++];
    if (token === "{") {
      const keys = new Set();
      while (tokens[cursor] !== "}") {
        const key = JSON.parse(tokens[cursor++]);
        if (keys.has(key)) throw new Error(`Duplicate JSON key: ${key}`);
        keys.add(key);
        cursor++; // colon; syntax was already checked by JSON.parse
        scan(depth + 1);
        if (tokens[cursor] !== ",") break;
        cursor++;
      }
      cursor++;
    } else if (token === "[") {
      while (tokens[cursor] !== "]") {
        scan(depth + 1);
        if (tokens[cursor] !== ",") break;
        cursor++;
      }
      cursor++;
    } else if (/^-?\d/.test(token) && !Number.isFinite(Number(token))) throw new Error("JSON numbers must be finite");
  }
  scan(0);
  return result;
}

function fail(path, message) { throw new Error(`${path}: ${message}`); }

// This supports the keyword subset in the embedded canonical schema. Unknown
// assertions fail at schema-load, never silently weaken intake.
const keywords = new Set(["$schema", "$id", "$defs", "$ref", "title", "description", "type", "const", "enum", "required", "properties", "additionalProperties", "items", "minItems", "minLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]);
function checkSchema(schema) {
  for (const key of Object.keys(schema)) if (!keywords.has(key)) throw new Error(`Unsupported schema keyword ${key}`);
  for (const node of Object.values(schema.properties || {})) checkSchema(node);
  for (const node of Object.values(schema.$defs || {})) checkSchema(node);
  if (schema.items) checkSchema(schema.items);
}
checkSchema(solarSchema);
checkSchema(solarImageRegistrationSchema);

function validateSchema(value, schema, path = "snapshot") {
  if (schema.$ref) return validateSchema(value, solarSchema.$defs[schema.$ref.split("/").at(-1)], path);
  if (Object.hasOwn(schema, "const") && value !== schema.const) fail(path, `must equal ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) fail(path, "unsupported value");
  const object = value !== null && typeof value === "object" && !Array.isArray(value);
  const types = { object, array: Array.isArray(value), null: value === null, string: typeof value === "string", boolean: typeof value === "boolean", number: typeof value === "number" && Number.isFinite(value), integer: Number.isInteger(value) };
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(kind => types[kind])) fail(path, `must be ${schema.type}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum || schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum || schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail(path, "number outside allowed bounds");
  }
  if (typeof value === "string" && [...value].length < (schema.minLength || 0)) fail(path, "string too short");
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems || 0)) fail(path, "array too short");
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) fail(`${path}[${index}]`, "missing array item");
      if (schema.items) validateSchema(value[index], schema.items, `${path}[${index}]`);
    }
  }
  if (object) {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(path, `missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties || {}, key)) validateSchema(item, schema.properties[key], `${path}.${key}`);
      else if (schema.additionalProperties === false) fail(path, `unexpected ${key}`);
    }
  }
}

const GATES = ["snapshot_contract", "coordinate_frame_explicit", "deterministic_replay", "public_data_provenance", "normalized_units_disclosed", "calibrated_physical_units", "historical_validation", "swpc_product_comparison", "operational_monitoring"];
const KINDS = ["synthetic", "observed", "blended", "inferred", "degraded"];
// Rust stores births as f32 and serializes them to six decimals. Over its
// 14-day region lifetime, rounding changes the derived longitude by <1.3e-6
// degrees. Keep this allowance fixed so a large age cannot hide a bad anchor.
const LONGITUDE_TOLERANCE_DEG = 1e-5;
const ACTIVE_REGION_LIFETIME_SECONDS = 14 * 86400;
function unique(items, path) { if (new Set(items).size !== items.length) fail(path, "duplicate identities"); }
function freezeTree(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freezeTree); Object.freeze(value); }
  return value;
}

export function parseSolarSnapshot(text) {
  return assertSolarSnapshot(parseStrictJson(text));
}

// Structured-clone/WASM boundaries share live schema, semantics, and freeze.
// This cannot establish duplicate-free original text; raw callers use parse above.
export function assertSolarSnapshot(data) {
  function finiteTree(value, depth = 0) {
    if (depth > 128) fail("snapshot", "nesting exceeds 128 levels");
    if (typeof value === "number" && !Number.isFinite(value)) fail("snapshot", "all numbers must be finite");
    if (value && typeof value === "object") Object.values(value).forEach(item => finiteTree(item, depth + 1));
  }
  finiteTree(data);
  validateSchema(data, solarSchema);
  const { run, grid, fields, coordinates, operational_readiness: readiness } = data;
  if (!data.calibration_state.toLowerCase().includes("normalized")) fail("calibration_state", "must disclose normalized units");
  const expectedTime = run.steps * run.dt_hours * 3600;
  if (!Number.isFinite(expectedTime)) fail("run.time_seconds", "derived duration is not finite");
  if (Math.abs(run.time_seconds - expectedTime) > Math.max(1e-6, Math.abs(expectedTime) * 1e-12)) fail("run.time_seconds", "inconsistent step duration");
  if (Math.abs(coordinates.rotation_reference_deg_per_day - 14.1844) > 1e-9) fail("coordinates", "unsupported rotation reference");
  if (Math.abs(grid.dlon_deg - 360 / grid.lon_count) > 1e-5 || Math.abs(grid.dlat_deg - 180 / grid.lat_count) > 1e-5) fail("grid", "inconsistent spacing");
  for (const [key, field] of Object.entries(fields)) {
    if (field.values.length !== grid.lon_count * grid.lat_count) fail(`fields.${key}`, "length does not match grid");
    if (key === "confidence" && field.values.some(v => v < 0 || v > 1)) fail("confidence", "score must be in [0,1]");
  }
  unique(data.layers.map(layer => layer.id), "layers");
  for (const key of ["br_normalized", "continuum_proxy", "confidence"]) if (!data.layers.some(layer => layer.id === key)) fail("layers", `missing ${key}`);
  unique(data.active_regions.map(region => region.id), "active_regions");
  const activity = data.uncertainty.activity;
  if (activity.at_time_seconds !== run.time_seconds || activity.last_analysis_time_seconds !== null && activity.last_analysis_time_seconds > run.time_seconds) fail("uncertainty.activity", "invalid model/analysis time");
  if ((activity.process_noise_per_day === 0) !== (activity.process_noise_status === "disabled")) fail("uncertainty.activity", "noise status disagrees with rate");
  for (const region of data.active_regions) {
    if (region.birth.time_seconds > run.time_seconds) fail("active_regions", "birth in future");
    if (region.model_position.at_time_seconds !== run.time_seconds || region.model_position.lat_deg !== region.birth.lat_deg) fail("active_regions.model_position", "invalid current anchor time/latitude");
    // Verify the existing solar-core law; this boundary never evolves a model.
    const sine = Math.sin(region.birth.lat_deg * (Math.PI / 180));
    const rate = 14.713 - 2.396 * sine * sine - 1.787 * sine ** 4 - 14.1844;
    const longitude = region.birth.lon_deg + rate * (run.time_seconds - region.birth.time_seconds) / 86400;
    if (!Number.isFinite(longitude) || Number.EPSILON * Math.max(1, Math.abs(longitude)) > LONGITUDE_TOLERANCE_DEG) fail("active_regions.model_position.lon_deg", "derived longitude exceeds numeric precision");
    let expectedLongitude = longitude % 360;
    if (expectedLongitude < 0) expectedLongitude += 360;
    const difference = Math.abs(region.model_position.lon_deg - expectedLongitude);
    if (Math.min(difference, 360 - difference) > LONGITUDE_TOLERANCE_DEG) fail("active_regions.model_position.lon_deg", "longitude inconsistent with birth and model age");
    if (run.time_seconds - region.birth.time_seconds > ACTIVE_REGION_LIFETIME_SECONDS) fail("active_regions", "age exceeds active-region lifetime");
  }
  let attachedObservationFrames = 0;
  for (const report of data.observations) {
    if (report.schema_version !== "observation-frame.v1" || !report.source_mode || !Array.isArray(report.frames)) fail("observations", "invalid report");
    for (const frame of report.frames) {
      if (!frame || !KINDS.includes(frame.layer_kind) || !frame.source_mode || !attributableSource(frame.provenance?.source) || !Object.hasOwn(frame.provenance, "active") || !frame.provenance.raw_source_metadata || typeof frame.provenance.raw_source_metadata !== "object" || Array.isArray(frame.provenance.raw_source_metadata) || !Array.isArray(frame.quality_flags) || !frame.quality_flags.length) fail("observations", "missing attributable provenance or quality flags");
      attachedObservationFrames++;
    }
  }
  if (run.mode === "Assimilation" && attachedObservationFrames === 0) fail("run.mode", "Assimilation requires an attributable attached observation frame");
  if (readiness.data_state.source_mode !== data.source_mode) fail("data_state", "source mode mismatch");
  if ((data.observations.length === 0) !== (readiness.data_state.observation_mode === "none")) fail("data_state", "observation mode mismatch");
  if (readiness.data_state.live_data_present && !data.observations.length) fail("data_state", "live data without observations");
  unique(readiness.gates.map(gate => gate.id), "gates");
  for (const id of GATES) if (!readiness.gates.some(gate => gate.id === id)) fail("gates", `missing ${id}`);
  if (!readiness.gates.find(gate => gate.id === "public_data_provenance").passed) fail("gates", "provenance validity mismatch");
  return freezeTree(data);
}

/** Structure/epoch compatibility is NOT measured geometry calibration. No
 * successful result permits compositing until that separate evidence is wired. */
export function assessSolarImageRegistration(registration, snapshot, asset) {
  try {
    validateSchema(registration, solarImageRegistrationSchema, "registration");
    assertSolarSnapshot(snapshot);
    const r = registration;
    if (!attributableSource(r.source) || !/^[a-f0-9]{64}$/.test(r.image_sha256)) fail("registration", "unattributable source or invalid SHA-256");
    if (!asset || asset.image_id !== r.image_id || asset.sha256 !== r.image_sha256 || asset.capture_timestamp !== r.capture_timestamp) fail("registration", "selected image identity/capture mismatch");
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(r.capture_timestamp);
    const unixMs = Date.parse(r.capture_timestamp);
    if (!match || !Number.isFinite(unixMs) || new Date(unixMs).toISOString() !== `${match[1]}.${(match[2] || "").padEnd(3, "0")}Z`) fail("registration", "capture timestamp must be a real UTC instant with millisecond-or-coarser precision");
    if (unixMs < Date.UTC(2017, 0, 1) || unixMs >= Date.UTC(2027, 0, 1)) fail("registration", "capture outside verified fixed-offset domain [2017,2027)");
    const captureJd = 2440587.5 + (unixMs / 1000 + r.tt_minus_utc_seconds) / 86400;
    const modelJd = snapshot.coordinates.reference_epoch_jd_tt + snapshot.run.time_seconds / 86400;
    const tolerance = r.timestamp_precision_seconds / 86400;
    if (!Number.isFinite(modelJd) || Math.abs(captureJd - r.capture_jd_tt) > tolerance || Math.abs(modelJd - r.capture_jd_tt) > tolerance) fail("registration", "capture UTC/TT or model epoch mismatch");
    const clearance = Math.min(r.disk_center_x_px, r.width_px - r.disk_center_x_px, r.disk_center_y_px, r.height_px - r.disk_center_y_px);
    if (r.disk_radius_px > clearance) fail("registration", "disk geometry lies outside image dimensions");
    return freezeTree({ status: "structure_epoch_compatible", compositing_permitted: false,
      reason: "Identity, structure and epoch are compatible; actual image geometry calibration remains unverified.", evidence: r });
  } catch (error) {
    return Object.freeze({ status: "unavailable", compositing_permitted: false, reason: error.message });
  }
}
