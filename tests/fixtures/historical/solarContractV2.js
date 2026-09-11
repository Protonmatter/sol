// A raw-text boundary: platform JSON parsing alone cannot detect duplicate keys.
import { solarSchema } from "./solarSchemaV2.js?v=dcca6290db";

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

function validateSchema(value, schema, path = "snapshot") {
  if (schema.$ref) return validateSchema(value, solarSchema.$defs[schema.$ref.split("/").at(-1)], path);
  if (Object.hasOwn(schema, "const") && value !== schema.const) fail(path, `must equal ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) fail(path, "unsupported value");
  const object = value !== null && typeof value === "object" && !Array.isArray(value);
  const types = { object, array: Array.isArray(value), string: typeof value === "string", boolean: typeof value === "boolean", number: typeof value === "number" && Number.isFinite(value), integer: Number.isInteger(value) };
  if (schema.type && !types[schema.type]) fail(path, `must be ${schema.type}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum || schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum || schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail(path, "number outside allowed bounds");
  }
  if (typeof value === "string" && [...value].length < (schema.minLength || 0)) fail(path, "string too short");
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems || 0)) fail(path, "array too short");
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`));
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
function unique(items, path) { if (new Set(items).size !== items.length) fail(path, "duplicate identities"); }
function freezeTree(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freezeTree); Object.freeze(value); }
  return value;
}

export function parseSolarSnapshot(text) {
  const data = parseStrictJson(text);
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
    if (key === "br_variance_normalized" && field.values.some(v => v < 0)) fail(key, "negative variance");
  }
  unique(data.layers.map(layer => layer.id), "layers");
  for (const key of ["br_normalized", "continuum_proxy", "confidence"]) if (!data.layers.some(layer => layer.id === key)) fail("layers", `missing ${key}`);
  unique(data.active_regions.map(region => region.id), "active_regions");
  for (const region of data.active_regions) if (region.birth_seconds > run.time_seconds + 1e-6) fail("active_regions", "birth in future");
  for (const report of data.observations) {
    if (report.schema_version !== "observation-frame.v1" || !report.source_mode || !Array.isArray(report.frames)) fail("observations", "invalid report");
    for (const frame of report.frames) {
      if (!frame || !KINDS.includes(frame.layer_kind) || !frame.source_mode || !frame.provenance?.source || !Object.hasOwn(frame.provenance, "active") || !frame.provenance.raw_source_metadata || typeof frame.provenance.raw_source_metadata !== "object" || Array.isArray(frame.provenance.raw_source_metadata) || !Array.isArray(frame.quality_flags) || !frame.quality_flags.length) fail("observations", "missing attributable provenance or quality flags");
    }
  }
  if (readiness.data_state.source_mode !== data.source_mode) fail("data_state", "source mode mismatch");
  if ((data.observations.length === 0) !== (readiness.data_state.observation_mode === "none")) fail("data_state", "observation mode mismatch");
  if (readiness.data_state.live_data_present && !data.observations.length) fail("data_state", "live data without observations");
  unique(readiness.gates.map(gate => gate.id), "gates");
  for (const id of GATES) if (!readiness.gates.some(gate => gate.id === id)) fail("gates", `missing ${id}`);
  if (!readiness.gates.find(gate => gate.id === "public_data_provenance").passed) fail("gates", "provenance validity mismatch");
  return freezeTree(data);
}
