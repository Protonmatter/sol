import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertEphemerisSnapshotV3, parseEphemerisSnapshot } from "../../apps/web/js/ephemerisContract.js";
import { fetchServerSky } from "../../apps/web/js/skyEngine.js";
import { SkyConsent } from "../../apps/web/js/skyPrivacy.js";

const snapshot = JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json", import.meta.url), "utf8")).snapshot;
// Hand-checked bearings: north is zero, increasing clockwise through east.
const directions = [
  [0, "N"], [22.5, "NNE"], [45, "NE"], [67.5, "ENE"],
  [90, "E"], [112.5, "ESE"], [135, "SE"], [157.5, "SSE"],
  [180, "S"], [202.5, "SSW"], [225, "SW"], [247.5, "WSW"],
  [270, "W"], [292.5, "WNW"], [315, "NW"], [337.5, "NNW"],
];
// Each exact midpoint belongs to the clockwise sector, including NNW -> N.
// Literal before/at/after values keep expected results independent of production math.
const boundaries = [
  [11.2499999, 11.25, 11.2500001, "N", "NNE"],
  [33.7499999, 33.75, 33.7500001, "NNE", "NE"],
  [56.2499999, 56.25, 56.2500001, "NE", "ENE"],
  [78.7499999, 78.75, 78.7500001, "ENE", "E"],
  [101.2499999, 101.25, 101.2500001, "E", "ESE"],
  [123.7499999, 123.75, 123.7500001, "ESE", "SE"],
  [146.2499999, 146.25, 146.2500001, "SE", "SSE"],
  [168.7499999, 168.75, 168.7500001, "SSE", "S"],
  [191.2499999, 191.25, 191.2500001, "S", "SSW"],
  [213.7499999, 213.75, 213.7500001, "SSW", "SW"],
  [236.2499999, 236.25, 236.2500001, "SW", "WSW"],
  [258.7499999, 258.75, 258.7500001, "WSW", "W"],
  [281.2499999, 281.25, 281.2500001, "W", "WNW"],
  [303.7499999, 303.75, 303.7500001, "WNW", "NW"],
  [326.2499999, 326.25, 326.2500001, "NW", "NNW"],
  [348.7499999, 348.75, 348.7500001, "NNW", "N"],
];

function withBearing(azimuth, compass, bodyName = "Sun") {
  const data = structuredClone(snapshot);
  Object.assign(data.bodies.find(body => body.name === bodyName), { az_deg: azimuth, compass });
  return data;
}

test("v3 intake accepts all sixteen compass directions without changing the snapshot", () => {
  for (const [azimuth, compass] of [...directions, [359.9999999, "N"]]) {
    const data = withBearing(azimuth, compass), before = JSON.stringify(data);
    assert.equal(assertEphemerisSnapshotV3(data), data);
    assert.equal(JSON.stringify(data), before);
    assert.deepEqual(parseEphemerisSnapshot(before), data);
  }
});

test("v3 compass sectors include exact clockwise boundaries and preserve both sides", () => {
  for (const [before, midpoint, after, previous, next] of boundaries) {
    for (const [azimuth, compass] of [[before, previous], [midpoint, next], [after, next]]) {
      assert.doesNotThrow(() => assertEphemerisSnapshotV3(withBearing(azimuth, compass)), `${azimuth}: ${compass}`);
    }
  }
});

test("v3 intake rejects compass labels that disagree with cardinal and intercardinal azimuths", () => {
  for (const [azimuth, compass] of directions) {
    const wrong = compass === "N" ? "S" : "N";
    assert.throws(() => assertEphemerisSnapshotV3(withBearing(azimuth, wrong)), /compass.*az_deg/i, `${azimuth}: ${wrong}`);
  }
  for (const compass of ["north", "n", " N", "N ", "unknown"]) {
    assert.throws(() => parseEphemerisSnapshot(JSON.stringify(withBearing(0, compass))), /compass.*az_deg/i);
  }
  assert.throws(() => assertEphemerisSnapshotV3(withBearing(0, "S", "Sirius")), /compass.*az_deg/i);
});

test("v3 intake rejects the adjacent sector on either side of every midpoint", () => {
  for (const [before, midpoint, after, previous, next] of boundaries) {
    for (const [azimuth, compass] of [[before, next], [midpoint, previous], [after, previous]]) {
      assert.throws(() => assertEphemerisSnapshotV3(withBearing(azimuth, compass)), /compass.*az_deg/i, `${azimuth}: ${compass}`);
    }
  }
});

test("remote provider intake rejects a north position labelled south before publication", async t => {
  const response = withBearing(0, "S"), before = JSON.stringify(response);
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, text: async () => before }));
  const consent = new SkyConsent();
  consent.setRecipient("https://example.invalid");
  consent.grant();
  const unix = (response.time.jd_utc - 2440587.5) * 86400;
  await assert.rejects(fetchServerSky(unix, 0, 0, 0, "https://example.invalid", { consent }), /compass.*az_deg/i);
  assert.equal(JSON.stringify(response), before);
});
