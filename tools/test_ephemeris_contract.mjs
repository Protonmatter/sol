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

console.log(`OK: ${process.argv[2]} satisfies the browser ephemeris-snapshot.v2 guard`);
