// The committed geography is the first real surface data the app has ever shipped — before it,
// apps/web/textures/ was .gitignore'd and every deployment drew Earth's "continents" as value
// noise. These tests hold that data to the standard the rest of the repo uses: check it against
// facts that exist outside the repository.
import test from "node:test";
import assert from "node:assert/strict";
import { EARTH, FEATURES, QUANT, decodeRing } from "../../apps/web/js/geography.js";
import { lonToX, latToY, unwrapColumns } from "../../apps/web/js/surfacemap.js";

const wrap = (d) => ((d % 360) + 540) % 360 - 180;

/** Even-odd point-in-polygon over the decoded rings. */
function inAnyRing(rings, lon, lat) {
  for (const r of rings) {
    const p = decodeRing(r);
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

test("the coastlines put land where land is", () => {
  // Coordinates any atlas agrees on. If the vectors were misprojected, mis-signed, or offset,
  // at least one of these flips — a whole-map shift cannot satisfy both the land and sea cases.
  const probes = [
    ["Paris", 2.35, 48.86, true], ["Cairo", 31.24, 30.04, true],
    ["Amazon basin", -60, -5, true], ["central Sahara", 10, 25, true],
    ["Ulaanbaatar", 106.9, 47.9, true], ["Perth", 115.9, -31.95, true],
    ["mid-Atlantic", -40, 0, false], ["mid-Pacific", -140, 0, false],
    ["Bay of Bengal", 88, 15, false], ["Southern Ocean", 0, -55, false],
  ];
  for (const [name, lon, lat, wantLand] of probes) {
    assert.equal(inAnyRing(EARTH.land, lon, lat), wantLand,
      `${name} (${lon}, ${lat}) should be ${wantLand ? "land" : "sea"}`);
  }
});

test("permanent ice covers Antarctica and Greenland, and nothing tropical", () => {
  assert.ok(inAnyRing(EARTH.ice, 0, -85), "Antarctic interior should be ice");
  assert.ok(inAnyRing(EARTH.ice, -42, 72), "the Greenland ice sheet should be ice");
  assert.ok(!inAnyRing(EARTH.ice, 15, 0), "equatorial Africa must not be ice");
});

test("ring decoding round-trips within the quantisation step", () => {
  // Delta-encoded integers are the compact wire format; a sign or accumulation slip here would
  // scramble coastlines subtly enough to look like a rendering bug.
  for (const r of [EARTH.land[0], EARTH.lakes[0], EARTH.ice[0]]) {
    const p = decodeRing(r);
    assert.ok(p.length >= 4);
    for (const [lon, lat] of p) {
      assert.ok(lon >= -180 - 1 / QUANT && lon <= 180 + 1 / QUANT, `longitude ${lon} out of range`);
      assert.ok(lat >= -90 - 1 / QUANT && lat <= 90 + 1 / QUANT, `latitude ${lat} out of range`);
      assert.equal(Math.round(lon * QUANT) / QUANT, lon, "longitude is not on the quantisation grid");
    }
  }
});

test("the projection matches the shader's sampling contract", () => {
  // SPHERE_FS samples uu = 0.5 + atan2(y,x)/2π and vv = acos(z)/π with UNPACK_FLIP_Y false, so
  // the prime meridian must be the CENTRE column and the north pole the TOP row. Get either
  // backwards and the whole map is mirrored or upside down while still looking like a planet.
  const w = 1000, h = 500;
  assert.equal(lonToX(0, w), w / 2, "prime meridian must be the centre column");
  assert.equal(lonToX(-180, w), 0, "180°W must be the left edge");
  assert.ok(Math.abs(lonToX(179.999, w) - w) < 0.1, "just west of 180°E must be the right edge");
  assert.equal(lonToX(90, w), w * 0.75, "90°E must be three-quarters across");
  assert.equal(lonToX(370, w), lonToX(10, w), "longitude must wrap");
  assert.equal(latToY(90, h), 0, "north pole must be the top row");
  assert.equal(latToY(-90, h), h, "south pole must be the bottom row");
  assert.equal(latToY(0, h), h / 2, "the equator must be the middle row");
});

test("a ring crossing the dateline does not smear across the map", () => {
  // The bug this pins: wrapping each vertex independently sends −180 and +180 to the same
  // column, so a ring that merely touches the dateline gets one edge dragged the full width of
  // the map — which rendered as a band of land lying across the ocean.
  const w = 1000;
  const crossing = [[179, 10], [-179, 10], [-179, 0], [179, 0], [179, 10]];
  const xs = unwrapColumns(crossing, w);
  const span = Math.max(...xs) - Math.min(...xs);
  assert.ok(span < w * 0.1, `a 2°-wide ring spans ${span.toFixed(0)} px of ${w}`);
});

test("a pole-encircling ring is recognised as going all the way round", () => {
  // Antarctica returns to its starting longitude one full turn later. The renderer keys its
  // through-the-pole closure off exactly this signature; if unwrapping collapsed it, the cap
  // would be closed by a chord straight across the map and filled on the wrong side.
  const w = 1000;
  const anta = decodeRing(EARTH.land.find((r) => {
    const p = decodeRing(r);
    return p.some(([, lat]) => lat <= -89.9);
  }));
  const xs = unwrapColumns(anta, w);
  assert.ok(Math.abs(xs[xs.length - 1] - xs[0]) > w * 0.99,
    "Antarctica should unwrap to a full turn");
});

test("lunar maria sit at their published selenographic coordinates", () => {
  // Spot values from the IAU/USGS gazetteer. These also prove the east-positive normalisation:
  // Imbrium is published at 14.91°W, and must come out as 345.09°E, not −14.91 and not 14.91.
  const expect = {
    "Mare Imbrium": [34.72, 345.09],
    "Mare Tranquillitatis": [8.35, 30.83],
    "Mare Crisium": [16.18, 59.10],
    "Mare Serenitatis": [27.29, 18.36],
    "Oceanus Procellarum": [20.67, 303.32],
  };
  for (const [name, [lat, lon]] of Object.entries(expect)) {
    const f = FEATURES.Moon.find((x) => x.n === name);
    assert.ok(f, `${name} missing from the catalogue`);
    assert.ok(Math.abs(f.lat - lat) < 0.02, `${name} latitude ${f.lat} vs ${lat}`);
    assert.ok(Math.abs(f.lon - lon) < 0.02, `${name} longitude ${f.lon} vs ${lon}`);
  }
});

test("every lunar feature is east-positive and physically sized", () => {
  assert.ok(FEATURES.Moon.length > 40, "the maria catalogue looks truncated");
  for (const f of FEATURES.Moon) {
    assert.ok(f.lon >= 0 && f.lon < 360, `${f.n}: longitude ${f.lon} is not east-positive [0,360)`);
    assert.ok(f.lat >= -90 && f.lat <= 90, `${f.n}: latitude ${f.lat}`);
    assert.ok(f.d > 0 && f.d < 2 * Math.PI * 1737.4, `${f.n}: diameter ${f.d} km is not physical`);
    assert.ok(f.c < 0, `${f.n}: basaltic units must be darker than the highlands, got ${f.c}`);
  }
});

test("the maria are on the near side — the face tidal locking keeps toward Earth", () => {
  // Real, and a genuine check on the data rather than the code: the near side is ~31% mare, the
  // far side barely 2%. If the longitude convention were mirrored, this ratio would invert.
  let nearArea = 0, farArea = 0;
  for (const f of FEATURES.Moon) {
    const a = f.d * f.d; // ∝ area; only the ratio matters
    if (Math.abs(wrap(f.lon)) < 90) nearArea += a; else farArea += a;
  }
  assert.ok(nearArea > farArea * 10,
    `maria should be overwhelmingly near-side, got near ${nearArea.toFixed(0)} vs far ${farArea.toFixed(0)}`);
});
