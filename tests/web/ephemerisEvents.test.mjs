import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { assertEphemerisSnapshotV2 } from "../../apps/web/js/ephemerisContractV2.js";

const cases = JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-event-cases.json", import.meta.url))).cases;
function snapshot(transit, altitude) {
  return {
    schema_version: "ephemeris-snapshot.v2", engine_version: "synthetic-test",
    time: { jd_utc:2460000.75, jd_tt:2460000.75, jd_ut1:2460000.75,
      dut1_seconds:0, delta_t_seconds:0, lst_deg:0, obliquity_deg:23,
      jd_tai:null, tai_minus_utc_seconds:null,
      earth_orientation:{source:"synthetic test", quality:"degraded", xp_arcsec:0, yp_arcsec:0, dut1_uncertainty_seconds:0.9} },
    observer:{terrestrial_lat_deg:0, terrestrial_lon_deg_east:90,
      polar_motion_corrected_lat_deg:0, polar_motion_corrected_lon_deg_east:90, elev_m:0},
    accuracy:{class:"degraded", coordinate_semantics:"synthetic", time_scales:"synthetic",
      validation_scope:"synthetic", valid_epoch:"synthetic", non_goal:"accuracy", eop_status:"degraded"},
    bodies:["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"].map(name => ({
      name, kind:name === "Moon" ? "moon" : name === "Sun" ? "star" : "planet",
      coordinate_frame:"true_equator_and_equinox_of_date", ra_deg:1, dec_deg:2,
      geocentric_apparent_ra_deg:0, geocentric_apparent_dec_deg:2,
      topocentric_apparent_ra_deg:1, topocentric_apparent_dec_deg:2,
      distance_km:100000, alt_deg:20, az_deg:90, alt_refracted_deg:21,
      above_horizon:true, compass:"E", angular_size_arcsec:10, horizontal_parallax_deg:1,
      rise_jd:null, set_jd:null, transit_jd:transit, transit_alt_deg:altitude,
    })), warnings:["Synthetic degraded test"],
  };
}
for (const entry of cases) {
  test(`v2 event guard: ${entry.name}`, () => {
    const value = snapshot(entry.transit, entry.altitude);
    if (entry.valid) assert.equal(assertEphemerisSnapshotV2(value), value);
    else assert.throws(() => assertEphemerisSnapshotV2(value), /transit/);
  });
}
for (const field of ["rise_jd", "set_jd"]) {
  test(`v2 ${field} excludes day end`, () => {
    const value = snapshot(null, null);
    value.bodies[0][field] = 2460001.25;
    assert.throws(() => assertEphemerisSnapshotV2(value), new RegExp(field));
  });
}
