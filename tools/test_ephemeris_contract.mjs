#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const contractUrl = pathToFileURL(
  new URL("../apps/web/js/ephemerisContract.js", import.meta.url).pathname
);
const { assertEphemerisSnapshotV2 } = await import(contractUrl.href);

if (process.argv.length !== 3) {
  console.error("usage: node tools/test_ephemeris_contract.mjs <snapshot.json>");
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
assertEphemerisSnapshotV2(snapshot);

const sun = snapshot.bodies.find((body) => body.name === "Sun");
if (!sun || sun.distance_km === null) throw new Error("Sun must have finite distance");
const solarParallax =
  Math.abs(sun.topocentric_apparent_ra_deg - sun.geocentric_apparent_ra_deg)
  + Math.abs(sun.topocentric_apparent_dec_deg - sun.geocentric_apparent_dec_deg);
if (solarParallax <= 1e-9) throw new Error("finite-distance Sun unexpectedly aliases geocentric coordinates");

const legacy = structuredClone(snapshot);
legacy.schema_version = "ephemeris-snapshot.v1";
let rejected = false;
try {
  assertEphemerisSnapshotV2(legacy);
} catch (_) {
  rejected = true;
}
if (!rejected) throw new Error("legacy ephemeris-snapshot.v1 was not rejected");

const aliasedMoon = structuredClone(snapshot);
const moon = aliasedMoon.bodies.find((body) => body.name === "Moon");
moon.geocentric_apparent_ra_deg = moon.topocentric_apparent_ra_deg;
moon.geocentric_apparent_dec_deg = moon.topocentric_apparent_dec_deg;
rejected = false;
try {
  assertEphemerisSnapshotV2(aliasedMoon);
} catch (_) {
  rejected = true;
}
if (!rejected) throw new Error("geocentric/topocentric lunar alias was not rejected");

const finiteCatalogueStar = structuredClone(snapshot);
const catalogueStar = finiteCatalogueStar.bodies.find(
  (body) => body.kind === "star" && body.distance_km === null
);
if (!catalogueStar) throw new Error("fixture has no catalogue star for infinity regression");
catalogueStar.topocentric_apparent_ra_deg =
  (catalogueStar.topocentric_apparent_ra_deg + 0.001) % 360;
catalogueStar.ra_deg = catalogueStar.topocentric_apparent_ra_deg;
rejected = false;
try {
  assertEphemerisSnapshotV2(finiteCatalogueStar);
} catch (_) {
  rejected = true;
}
if (!rejected) throw new Error("finite-parallax catalogue star was not rejected");

console.log(`OK: ${process.argv[2]} satisfies the browser ephemeris-snapshot.v2 guard`);
