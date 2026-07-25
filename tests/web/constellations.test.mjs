// Structural tests for the generated constellation figures.
//
// The generator has its own regen/sanity gate (tools/validate_star_catalog.py), but these
// assert the shape the RENDERERS rely on — flat alternating RA/Dec, RA already normalised
// to [0,360), at least two points per polyline — plus a few positions checked against
// where these constellations actually are in the sky.
import test from "node:test";
import assert from "node:assert/strict";
import { CONSTELLATIONS, CONSTELLATION_COUNT } from "../../apps/web/js/constellations.js";

const by = Object.fromEntries(CONSTELLATIONS.map((c) => [c.abbr, c]));

test("all 88 IAU constellations are present, once each", () => {
  assert.equal(CONSTELLATION_COUNT, 88);
  assert.equal(CONSTELLATIONS.length, 88);
  assert.equal(new Set(CONSTELLATIONS.map((c) => c.abbr)).size, 88, "abbreviations are unique");
  // Serpens is drawn in two disjoint halves but is ONE constellation; the generator merges
  // them, so a regression that let a dict overwrite drop a half would show up here.
  assert.ok(by.Ser, "Serpens present");
  assert.ok(by.Ser.lines.length >= 2, "Serpens keeps both of its disjoint figure groups");
});

test("every figure is renderable: flat RA/Dec pairs, >= 2 points", () => {
  for (const c of CONSTELLATIONS) {
    assert.ok(c.lines.length > 0, `${c.abbr} has no polylines`);
    for (const poly of c.lines) {
      assert.equal(poly.length % 2, 0, `${c.abbr}: odd coordinate count`);
      assert.ok(poly.length >= 4, `${c.abbr}: a polyline needs at least two points`);
      for (let i = 0; i < poly.length; i += 2) {
        const ra = poly[i], dec = poly[i + 1];
        assert.ok(Number.isFinite(ra) && ra >= 0 && ra < 360, `${c.abbr}: RA ${ra} out of [0,360)`);
        assert.ok(Number.isFinite(dec) && dec >= -90 && dec <= 90, `${c.abbr}: Dec ${dec} out of range`);
      }
    }
  }
});

test("figures sit where those constellations actually are", () => {
  // Centre positions cross-checked against published constellation centres.
  const expect = {
    Ori: [83, 5, 15],     // Orion, on the celestial equator
    Cru: [187, -60, 10],  // Crux, deep southern
    UMa: [165, 55, 20],   // Ursa Major, far northern
    Cas: [15, 60, 15],    // Cassiopeia, northern
    Sco: [255, -30, 20],  // Scorpius, southern zodiac
  };
  for (const [abbr, [ra, dec, tol]] of Object.entries(expect)) {
    const c = by[abbr];
    assert.ok(c, `${abbr} missing`);
    const dRa = Math.min(Math.abs(c.center[0] - ra), 360 - Math.abs(c.center[0] - ra));
    assert.ok(dRa <= tol, `${abbr} centre RA ${c.center[0]} far from ${ra}`);
    assert.ok(Math.abs(c.center[1] - dec) <= tol, `${abbr} centre Dec ${c.center[1]} far from ${dec}`);
  }
});

test("centres are real directions, and metadata is populated", () => {
  for (const c of CONSTELLATIONS) {
    assert.ok(c.center[0] >= 0 && c.center[0] < 360, `${c.abbr}: centre RA out of range`);
    assert.ok(c.center[1] >= -90 && c.center[1] <= 90, `${c.abbr}: centre Dec out of range`);
    assert.ok(typeof c.name === "string" && c.name.length > 0, `${c.abbr}: missing name`);
    assert.ok(/^[A-Z][A-Za-z]{2}$/.test(c.abbr), `${c.abbr}: not a 3-letter IAU abbreviation`);
  }
});

test("the figure set is materially larger than the hand-written list it replaced", () => {
  // The old curated array drew 7 constellations / 33 segments. Guard the regression.
  const segments = CONSTELLATIONS.reduce(
    (s, c) => s + c.lines.reduce((t, l) => t + (l.length / 2 - 1), 0), 0);
  assert.ok(segments > 500, `only ${segments} segments — the full IAU set should be far more`);
});
