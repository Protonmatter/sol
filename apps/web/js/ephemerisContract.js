// Live provider boundary. Historical v2 is isolated in ephemerisContractV2.js.
import { ephemerisSchema } from "./ephemerisSchema.js?v=dcca6290db";
import { parseStrictJson } from "./solarContract.js?v=dcca6290db";
const MAJOR = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]);
const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const fail = (path, message) => { throw new TypeError(`Invalid ephemeris-snapshot.v3 at ${path}: ${message}`); };
// Inclusive serialization/float allowance: 2^-29 day (~0.161ms), four binary64
// ulps at modern JD or two at the upper supported epoch. Never a day/window allowance.
const EPOCH_TOLERANCE_DAYS = 2 ** -29;
function assertSameEpoch(actual, expected, context) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual-expected)>EPOCH_TOLERANCE_DAYS) fail("time.jd_utc", `${context} epoch mismatch`);
}
const keywords = new Set(["$schema","$id","$defs","$ref","title","description","type","const","enum","required","properties","additionalProperties","items","minItems","minLength","minimum","maximum","exclusiveMinimum","exclusiveMaximum"]);
function checkSchema(schema) {
  for (const key of Object.keys(schema)) if (!keywords.has(key)) fail("schema", `unsupported keyword ${key}`);
  for (const node of Object.values(schema.properties || {})) checkSchema(node);
  for (const node of Object.values(schema.$defs || {})) checkSchema(node);
  if (schema.items) checkSchema(schema.items);
}
checkSchema(ephemerisSchema);
function validateSchema(value, schema, path="$") {
  if (schema.$ref) return validateSchema(value, ephemerisSchema.$defs[schema.$ref.split("/").at(-1)], path);
  if (Object.hasOwn(schema,"const") && value !== schema.const) fail(path,"constant mismatch");
  if (schema.enum && !schema.enum.includes(value)) fail(path,"unsupported value");
  const object = value !== null && typeof value === "object" && !Array.isArray(value);
  const types = {null:value === null, object, array:Array.isArray(value), string:typeof value === "string", boolean:typeof value === "boolean", number:typeof value === "number" && Number.isFinite(value)};
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(type=>types[type])) fail(path,"incorrect type");
  if (typeof value === "number") {
    if (!Number.isFinite(value) || schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum || schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum || schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail(path,"outside numeric bounds");
  }
  if (typeof value === "string" && [...value].length < (schema.minLength || 0)) fail(path,"empty string");
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems || 0)) fail(path,"too few entries");
    for (let index=0;index<value.length;index++) {
      if (!Object.hasOwn(value,index)) fail(path,"sparse arrays are not JSON values");
      if(schema.items)validateSchema(value[index],schema.items,`${path}[${index}]`);
    }
  }
  if (object) {
    for (const key of schema.required || []) if (!Object.hasOwn(value,key)) fail(path,`missing ${key}`);
    for (const [key,item] of Object.entries(value)) {
      if (Object.hasOwn(schema.properties || {},key)) validateSchema(item,schema.properties[key],`${path}.${key}`);
      else if (schema.additionalProperties === false) fail(path,`unexpected ${key}`);
    }
  }
}
export function assertEphemerisSnapshotV3(snapshot) {
  if (!snapshot || snapshot.schema_version !== "ephemeris-snapshot.v3") fail("schema_version","upgrade required: live provider must emit ephemeris-snapshot.v3");
  validateSchema(snapshot,ephemerisSchema);
  const {time,observer,events_window:window,accuracy}=snapshot;
  if (time.jd_utc < 1721425.5 || time.jd_utc >= 5373484.5) fail("time.jd_utc","unsupported proleptic Gregorian epoch");
  if (["rapid","predicted"].includes(time.earth_orientation.quality) && !time.earth_orientation.source.startsWith("IERS Bulletin A")) fail("time.earth_orientation","precision EOP requires IERS Bulletin A source");
  const offset=observer.terrestrial_lon_deg_east/360;
  const start=Math.floor(time.jd_utc-0.5+offset)+0.5-offset;
  if (window.start_jd!==start || window.end_jd!==start+1) fail("events_window","does not match observer local mean-solar day");
  if ((time.input_time_semantics==="historical_ut1_proxy")!==(time.jd_tai===null)) fail("time","historical approximation mismatch");
  if ((time.jd_tai===null)!==(time.tai_minus_utc_seconds===null)) fail("time","TAI values must both be null or numeric");
  if (time.input_time_semantics==="historical_ut1_proxy" && time.earth_orientation.quality!=="pre_utc_ut1_proxy") fail("time","historical approximation requires degraded UT1-proxy quality");
  if (Math.abs(time.jd_ut1-time.jd_utc-time.dut1_seconds/86400)>2e-9 || Math.abs(time.delta_t_seconds-(time.jd_tt-time.jd_ut1)*86400)>5e-5) fail("time","inconsistent time scales");
  if (time.jd_tai!==null && (Math.abs(time.jd_tai-time.jd_utc-time.tai_minus_utc_seconds/86400)>2e-9 || Math.abs(time.jd_tt-time.jd_tai-32.184/86400)>2e-9)) fail("time","inconsistent TAI/TT");
  if (accuracy.eop_status!==time.earth_orientation.quality) fail("accuracy","EOP status mismatch");
  if ((accuracy.evidence_status==="unvalidated")!==(accuracy.evidence_record_ids.length===0)) fail("accuracy","evidence status mismatch");
  // The current immutable registry has source-theory heliocentric parity only,
  // no independently qualified apparent-place/range/event records for this feed.
  if (accuracy.evidence_status!=="unvalidated") fail("accuracy","no registered independent evidence qualifies this snapshot; provider self-certification is not accepted");
  const names=new Set();
  for (const body of snapshot.bodies) {
    const path=`bodies[${body.name}]`;
    if (names.has(body.name)) fail(path,"duplicate identity"); names.add(body.name);
    // Same sixteen clockwise sectors as both producers; exact midpoints select clockwise.
    if (body.compass!==COMPASS_POINTS[Math.floor(((body.az_deg+11.25)%360)/22.5)]) fail(path+".compass","must agree with az_deg");
    if (Math.abs(body.ra_deg-body.topocentric_apparent_ra_deg)>1e-9 || Math.abs(body.dec_deg-body.topocentric_apparent_dec_deg)>1e-9) fail(path,"topocentric aliases disagree");
    const infinite=body.range_approximation==="infinite_catalogue_star";
    if (infinite) {
      if (MAJOR.has(body.name) || body.kind!=="star" || body.geocentric_range_km!==null || body.observer_range_km!==null) fail(path,"invalid infinite catalogue-star range");
      if (body.ra_deg!==body.geocentric_apparent_ra_deg || body.dec_deg!==body.geocentric_apparent_dec_deg) fail(path,"infinite star has parallax");
    } else if (body.geocentric_range_km===null || body.observer_range_km===null) fail(path,"finite ranges cannot be null");
    if (body.above_horizon!==(body.alt_refracted_deg>0)) fail(path,"above_horizon must use refracted altitude");
    for (const [name,event] of Object.entries(body.events)) {
      if (event.jd!==null) {
        if (event.calculation_status!=="calculated" || event.occurrence_status!=="occurs" || !(event.jd>=start && event.jd<start+1)) fail(`${path}.${name}`,"invalid calculated event or window");
      } else if (event.calculation_status==="calculated" ? event.occurrence_status!=="none_in_window" : event.occurrence_status!=="unknown") fail(`${path}.${name}`,"inconsistent null event status");
    }
    if ((body.events.transit.jd===null)!==(body.events.transit.altitude_deg===null)) fail(path+".transit","time and altitude null pairing");
    if (body.name==="Moon" && Math.abs(body.ra_deg-body.geocentric_apparent_ra_deg)+Math.abs(body.dec_deg-body.geocentric_apparent_dec_deg)<=1e-6) fail(path,"geocentric alias");
  }
  for (const name of MAJOR) if (!names.has(name)) fail("bodies",`missing ${name}`);
  return snapshot;
}
export function parseEphemerisSnapshot(text) {
  const snapshot=parseStrictJson(text);
  if (snapshot && typeof snapshot.error === "string") throw new Error(snapshot.error);
  return assertEphemerisSnapshotV3(snapshot);
}
// Apply only after strict snapshot intake; bind the validated value to this request.
export function assertEphemerisRequestBinding(snapshot, unixSeconds, lat, lonEast, elev) {
  for (const [key,expected] of [["terrestrial_lat_deg",lat],["terrestrial_lon_deg_east",lonEast],["elev_m",elev]]) if (snapshot.observer[key]!==expected) fail("observer", "response does not match requested observer");
  assertSameEpoch(snapshot.time.jd_utc,unixSeconds/86400+2440587.5,"response/request");
  return snapshot;
}
export function mergeLocalEvents(remote,local) {
  assertEphemerisSnapshotV3(remote); assertEphemerisSnapshotV3(local);
  for (const key of ["terrestrial_lat_deg","terrestrial_lon_deg_east","elev_m"]) if (remote.observer[key]!==local.observer[key]) fail("observer","local backfill observer mismatch");
  for (const key of Object.keys(remote.events_window)) if (remote.events_window[key]!==local.events_window[key]) fail("events_window","local backfill window mismatch");
  // This merger also appends instantaneous star geometry, not just daily events.
  assertSameEpoch(local.time.jd_utc,remote.time.jd_utc,"local backfill instantaneous");
  const result=structuredClone(remote), byName=new Map(local.bodies.map(body=>[body.name,body]));
  for (const body of result.bodies) {
    const source=byName.get(body.name);
    if (source) body.events=structuredClone(source.events);
  }
  const present=new Set(result.bodies.map(body=>body.name));
  for (const body of local.bodies) if (!present.has(body.name)) result.bodies.push(structuredClone(body));
  result.warnings.push("Event and catalogue-star provenance is retained per event; local events are not Horizons calculations.");
  return assertEphemerisSnapshotV3(result);
}
