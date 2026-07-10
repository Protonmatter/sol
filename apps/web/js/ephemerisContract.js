// Runtime guard for the provider-neutral ephemeris-snapshot.v2 contract.
// Keep this dependency-free so the static browser build and Node CI use the same code.

const MAJOR_BODIES = new Set([
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune",
]);

function fail(path, message) {
  throw new TypeError(`Invalid ephemeris-snapshot.v2 at ${path}: ${message}`);
}

function objectAt(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  return value;
}

function finiteAt(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expected finite number");
  return value;
}

function nullableFiniteAt(value, path) {
  if (value !== null) finiteAt(value, path);
  return value;
}

function stringAt(value, path) {
  if (typeof value !== "string" || !value.trim()) fail(path, "expected non-empty string");
  return value;
}

function rangeAt(value, path, min, max, maxExclusive = false) {
  finiteAt(value, path);
  if (value < min || (maxExclusive ? value >= max : value > max)) {
    fail(path, `expected ${min} <= value ${maxExclusive ? "<" : "<="} ${max}`);
  }
  return value;
}

function bodyAt(value, index) {
  const path = `bodies[${index}]`;
  const body = objectAt(value, path);
  stringAt(body.name, `${path}.name`);
  if (!["star", "moon", "planet"].includes(body.kind)) fail(`${path}.kind`, "unsupported kind");
  if (body.coordinate_frame !== "true_equator_and_equinox_of_date") {
    fail(`${path}.coordinate_frame`, "unexpected coordinate frame");
  }
  rangeAt(body.ra_deg, `${path}.ra_deg`, 0, 360, true);
  rangeAt(body.dec_deg, `${path}.dec_deg`, -90, 90);
  rangeAt(body.geocentric_apparent_ra_deg, `${path}.geocentric_apparent_ra_deg`, 0, 360, true);
  rangeAt(body.geocentric_apparent_dec_deg, `${path}.geocentric_apparent_dec_deg`, -90, 90);
  rangeAt(body.topocentric_apparent_ra_deg, `${path}.topocentric_apparent_ra_deg`, 0, 360, true);
  rangeAt(body.topocentric_apparent_dec_deg, `${path}.topocentric_apparent_dec_deg`, -90, 90);
  if (Math.abs(body.ra_deg - body.topocentric_apparent_ra_deg) > 1e-9) {
    fail(`${path}.ra_deg`, "must alias topocentric_apparent_ra_deg");
  }
  if (Math.abs(body.dec_deg - body.topocentric_apparent_dec_deg) > 1e-9) {
    fail(`${path}.dec_deg`, "must alias topocentric_apparent_dec_deg");
  }
  nullableFiniteAt(body.distance_km, `${path}.distance_km`);
  if (body.distance_km === null && body.kind !== "star") {
    fail(`${path}.distance_km`, "may be null only for catalogue stars");
  }
  rangeAt(body.alt_deg, `${path}.alt_deg`, -90, 90);
  rangeAt(body.az_deg, `${path}.az_deg`, 0, 360, true);
  rangeAt(body.alt_refracted_deg, `${path}.alt_refracted_deg`, -90, 91);
  if (typeof body.above_horizon !== "boolean") fail(`${path}.above_horizon`, "expected boolean");
  if (body.above_horizon !== (body.alt_refracted_deg > 0)) {
    fail(`${path}.above_horizon`, "disagrees with alt_refracted_deg");
  }
  stringAt(body.compass, `${path}.compass`);
  finiteAt(body.angular_size_arcsec, `${path}.angular_size_arcsec`);
  finiteAt(body.horizontal_parallax_deg, `${path}.horizontal_parallax_deg`);
  nullableFiniteAt(body.rise_jd, `${path}.rise_jd`);
  nullableFiniteAt(body.transit_jd, `${path}.transit_jd`);
  nullableFiniteAt(body.set_jd, `${path}.set_jd`);
  nullableFiniteAt(body.transit_alt_deg, `${path}.transit_alt_deg`);
  return body;
}

export function assertEphemerisSnapshotV2(value) {
  const snapshot = objectAt(value, "$");
  if (snapshot.schema_version !== "ephemeris-snapshot.v2") {
    fail("$.schema_version", `expected ephemeris-snapshot.v2, got ${String(snapshot.schema_version)}`);
  }
  stringAt(snapshot.engine_version, "$.engine_version");

  if (snapshot.provider != null) {
    const provider = objectAt(snapshot.provider, "$.provider");
    if (!["client", "server"].includes(provider.tier)) fail("$.provider.tier", "unsupported tier");
    stringAt(provider.source, "$.provider.source");
    stringAt(provider.ephemeris, "$.provider.ephemeris");
    if (provider.endpoint_contract !== "ephemeris-snapshot.v2") {
      fail("$.provider.endpoint_contract", "must be ephemeris-snapshot.v2");
    }
  }

  const time = objectAt(snapshot.time, "$.time");
  for (const key of ["jd_utc", "jd_tt", "jd_ut1", "dut1_seconds", "delta_t_seconds", "lst_deg", "obliquity_deg"]) {
    finiteAt(time[key], `$.time.${key}`);
  }
  nullableFiniteAt(time.jd_tai, "$.time.jd_tai");
  nullableFiniteAt(time.tai_minus_utc_seconds, "$.time.tai_minus_utc_seconds");
  if ((time.jd_tai === null) !== (time.tai_minus_utc_seconds === null)) {
    fail("$.time", "jd_tai and tai_minus_utc_seconds must both be null or both numeric");
  }
  rangeAt(time.lst_deg, "$.time.lst_deg", 0, 360, true);
  const eop = objectAt(time.earth_orientation, "$.time.earth_orientation");
  stringAt(eop.source, "$.time.earth_orientation.source");
  if (!["rapid", "predicted", "degraded", "pre_utc_ut1_proxy"].includes(eop.quality)) {
    fail("$.time.earth_orientation.quality", "unsupported quality");
  }
  finiteAt(eop.xp_arcsec, "$.time.earth_orientation.xp_arcsec");
  finiteAt(eop.yp_arcsec, "$.time.earth_orientation.yp_arcsec");
  finiteAt(eop.dut1_uncertainty_seconds, "$.time.earth_orientation.dut1_uncertainty_seconds");

  const observer = objectAt(snapshot.observer, "$.observer");
  rangeAt(observer.terrestrial_lat_deg, "$.observer.terrestrial_lat_deg", -90, 90);
  finiteAt(observer.terrestrial_lon_deg_east, "$.observer.terrestrial_lon_deg_east");
  rangeAt(observer.polar_motion_corrected_lat_deg, "$.observer.polar_motion_corrected_lat_deg", -90, 90);
  rangeAt(observer.polar_motion_corrected_lon_deg_east, "$.observer.polar_motion_corrected_lon_deg_east", 0, 360, true);
  finiteAt(observer.elev_m, "$.observer.elev_m");

  const accuracy = objectAt(snapshot.accuracy, "$.accuracy");
  for (const key of ["class", "coordinate_semantics", "time_scales", "validation_scope", "valid_epoch", "non_goal"]) {
    stringAt(accuracy[key], `$.accuracy.${key}`);
  }
  if (accuracy.eop_status !== eop.quality) fail("$.accuracy.eop_status", "must match EOP quality");

  if (!Array.isArray(snapshot.bodies)) fail("$.bodies", "expected array");
  const names = new Set();
  snapshot.bodies.forEach((entry, index) => {
    const body = bodyAt(entry, index);
    if (names.has(body.name)) fail(`$.bodies[${index}].name`, "duplicate body name");
    names.add(body.name);
  });
  for (const name of MAJOR_BODIES) {
    if (!names.has(name)) fail("$.bodies", `missing major body ${name}`);
  }
  const moon = snapshot.bodies.find((body) => body.name === "Moon");
  const lunarParallax =
    Math.abs(moon.topocentric_apparent_ra_deg - moon.geocentric_apparent_ra_deg)
    + Math.abs(moon.topocentric_apparent_dec_deg - moon.geocentric_apparent_dec_deg);
  if (lunarParallax <= 1e-6) fail("$.bodies[Moon]", "topocentric coordinates alias geocentric coordinates");

  if (!Array.isArray(snapshot.warnings) || snapshot.warnings.length === 0) {
    fail("$.warnings", "expected at least one warning");
  }
  snapshot.warnings.forEach((warning, index) => stringAt(warning, `$.warnings[${index}]`));
  return snapshot;
}
