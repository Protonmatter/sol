// Unit tests for the pure formatting helpers (no DOM, no imports).
// Run: node --test tests/web/
import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp, hash01, number, numberOrNa, compactNumberOrNa, plural, countBy,
  formatCounts, readableMode, humanizeId, formatUtc, stageFromActivity, complexityLabel,
} from "../../apps/web/js/format.js";

test("clamp bounds both sides", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test("hash01 is deterministic and in [0, 1)", () => {
  for (const v of [0, 1, 42, 1e6, -3.7]) {
    const h = hash01(v);
    assert.equal(h, hash01(v));
    assert.ok(h >= 0 && h < 1, `hash01(${v}) = ${h}`);
  }
});

test("number / numberOrNa render finite values and refuse the rest", () => {
  assert.equal(number(1.234, 2), "1.23");
  assert.equal(number(NaN, 2), "n/a");
  assert.equal(number(Infinity, 2), "n/a");
  assert.equal(numberOrNa("2.5", 1), "2.5"); // string coercion is the point of the OrNa variant
  assert.equal(numberOrNa("junk", 1), "n/a");
  assert.equal(numberOrNa(null, 1), "0.0"); // Number(null) coerces to 0 — documented quirk, callers null-check first
});

test("compactNumberOrNa switches to exponential below 0.01", () => {
  assert.equal(compactNumberOrNa(0.005), "5.00e-3");
  assert.equal(compactNumberOrNa(0), "0.00");
  assert.equal(compactNumberOrNa(3.14159), "3.14");
  assert.equal(compactNumberOrNa("nope"), "n/a");
});

test("plural / countBy / formatCounts", () => {
  assert.equal(plural(1, "region"), "region");
  assert.equal(plural(2, "region"), "regions");
  assert.deepEqual(countBy(["a", "b", "a", ""]), { a: 2, b: 1, unknown: 1 });
  assert.equal(formatCounts({ beta: 2, alpha: 1 }), "1 alpha, 2 beta"); // sorted by key
});

test("readableMode maps provenance keywords with cached taking precedence", () => {
  assert.equal(readableMode("synthetic+cached-observed-context"), "cached");
  assert.equal(readableMode("live"), "live");
  assert.equal(readableMode("MISSING"), "degraded");
  assert.equal(readableMode("some_other-mode"), "some other mode");
});

test("humanizeId and formatUtc", () => {
  assert.equal(humanizeId("swpc-rtsw-mag-1m"), "swpc rtsw mag 1m");
  assert.equal(humanizeId(null), "unknown");
  assert.equal(formatUtc("2026-07-02T05:40:00Z"), "2026-07-02T05:40:00Z");
  assert.equal(formatUtc(""), "unknown");
  assert.equal(formatUtc("not a date"), "not a date");
});

test("stageFromActivity boundaries match the documented thresholds", () => {
  assert.equal(stageFromActivity(0.75), "solar maximum");
  assert.equal(stageFromActivity(0.7499), "rising or declining phase");
  assert.equal(stageFromActivity(0.45), "rising or declining phase");
  assert.equal(stageFromActivity(0.4499), "solar minimum");
});

test("complexityLabel tiers", () => {
  assert.equal(complexityLabel(0.9), "high (0.90)");
  assert.equal(complexityLabel(0.6), "moderate (0.60)");
  assert.equal(complexityLabel(0.1), "low (0.10)");
  assert.equal(complexityLabel(NaN), "unknown");
});
