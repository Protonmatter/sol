import assert from "node:assert/strict";
import test from "node:test";
import * as presentationState from "../../apps/web/js/presentationState.js";

const { assessFeedFreshness, resolvePresentation } = presentationState;

const HOUR = 3600 * 1000;
const NOW = Date.parse("2026-09-12T18:30:00Z");

test("feed freshness declines to judge omitted, empty, malformed, non-UTC, and impossible clocks", () => {
  assert.equal(typeof assessFeedFreshness, "function", "presentation state must expose the shared freshness assessment");
  const clocks = [
    undefined,
    "",
    "not-a-clock",
    "2026-09-12T18:30:00",
    "2026-09-12T14:30:00-04:00",
    "2026-09-12T18:30:00-00:00",
    "2026-02-29T18:30:00Z",
    "2026-04-31T18:30:00Z",
    "2026-09-12T24:00:00Z",
  ];
  for (const clock of clocks) {
    const feedStatus = clock === undefined ? { status: "ok" } : { status: "ok", next_recommended_run_utc: clock };
    assert.deepEqual(assessFeedFreshness(feedStatus, NOW), { freshness: "unknown", overdueHours: null }, String(clock));
    assert.equal(resolvePresentation({ feedStatus, nowMs: NOW }).freshness, "unknown", String(clock));
  }
  assert.deepEqual(assessFeedFreshness({ status: "ok", next_recommended_run_utc: "2026-09-12T18:30:00Z" }, NaN),
    { freshness: "unknown", overdueHours: null });
});

test("feed freshness accepts real explicit UTC Z and fractional +00:00 clocks at the unchanged six-hour boundary", () => {
  assert.equal(typeof assessFeedFreshness, "function", "presentation state must expose the shared freshness assessment");
  for (const clock of ["2024-02-29T12:00:00Z", "2024-02-29T12:00:00.125+00:00"]) {
    const due = Date.parse(clock);
    const feedStatus = { status: "ok", next_recommended_run_utc: clock };
    assert.deepEqual(assessFeedFreshness(feedStatus, due + 6 * HOUR),
      { freshness: "within_refresh_window", overdueHours: null }, clock);
    assert.deepEqual(assessFeedFreshness(feedStatus, due + 6 * HOUR + 900000),
      { freshness: "stale", overdueHours: 0.25 }, clock);
  }
});
