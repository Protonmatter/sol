import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../apps/web/js/orreryDetail.js", import.meta.url),
  "utf8",
);

test("live Sun detail retains physical constants and labels the image epoch honestly", () => {
  const liveEnd = source.indexOf('if (name === "Sun")');
  const luminosity = source.indexOf('add("Luminosity"', liveEnd);
  const imagery = source.indexOf('add("Surface imagery"', luminosity);

  assert.ok(liveEnd > source.indexOf("if (live)"), "Sun facts must follow the live-data block");
  assert.ok(luminosity > liveEnd, "Sun luminosity must not be hidden in the no-live branch");
  assert.ok(imagery > luminosity, "surface provenance remains on the Sun card");
  assert.match(source.slice(liveEnd, imagery + 500), /NASA SDO\/HMI continuum, fetched/);
  assert.doesNotMatch(source.slice(liveEnd, imagery + 500), /continuum, captured/);
});
