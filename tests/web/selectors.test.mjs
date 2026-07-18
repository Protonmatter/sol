// Tests for store-coupled selectors — specifically the feed-staleness logic that keeps
// a frozen "ok" from rendering as current health. dom.js touches `document` at module
// evaluation, so a minimal shim is installed BEFORE the selectors import; every element
// lookup returning null exercises the same guards the browser relies on.
globalThis.document = { getElementById: () => null };

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Module identity includes the query string: selectors.js imports "./store.js?v=<token>"
// (see build_web.py), so importing store.js WITHOUT the token yields a second, unrelated
// store instance — every mutation below would be invisible to the selectors. Extract the
// live token from selectors.js itself so these tests survive every restamp.
const selectorsUrl = new URL("../../apps/web/js/selectors.js", import.meta.url);
const tokenMatch = readFileSync(selectorsUrl, "utf8").match(/\.\/store\.js\?v=([0-9a-zA-Z]+)/);
const q = tokenMatch ? `?v=${tokenMatch[1]}` : "";
const { store } = await import(`../../apps/web/js/store.js${q}`);
const { feedOverdueHours, feedStateLabel, feedStateClass, dataStateLabel } =
  await import("../../apps/web/js/selectors.js");

const HOUR = 3600 * 1000;
const T0 = Date.parse("2026-07-03T05:40:00Z"); // the feed's next_recommended_run_utc

test("feedOverdueHours: not overdue inside the 6h grace, exact hours past it", () => {
  store.feedStatus = { status: "ok", next_recommended_run_utc: "2026-07-03T05:40:00Z" };
  assert.equal(feedOverdueHours(T0 + 5 * HOUR), null);           // late but within grace
  assert.ok(Math.abs(feedOverdueHours(T0 + 7 * HOUR) - 1) < 1e-9); // 1h past grace
  assert.equal(feedOverdueHours(T0 - HOUR), null);               // not yet due
});

test("feedOverdueHours: missing or malformed inputs never throw, just decline to judge", () => {
  store.feedStatus = null;
  assert.equal(feedOverdueHours(T0), null);
  store.feedStatus = { status: "ok" };
  assert.equal(feedOverdueHours(T0), null);
  store.feedStatus = { status: "ok", next_recommended_run_utc: "not a date" };
  assert.equal(feedOverdueHours(T0), null);
});

test("a multi-day-stale 'ok' feed reads stale and wears the failure tone", () => {
  // A next-run date far in the past is deterministically overdue on any real clock.
  store.feedStatus = { status: "ok", next_recommended_run_utc: "2000-01-01T00:00:00Z" };
  assert.match(feedStateLabel(), /^stale \d+d$/);
  assert.equal(feedStateClass(), "degraded");
});

test("a current 'ok' feed still reads healthy", () => {
  const soon = new Date(Date.now() + 3600 * 1000).toISOString();
  store.feedStatus = { status: "ok", next_recommended_run_utc: soon };
  assert.equal(feedStateLabel(), "daily ok");
  assert.equal(feedStateClass(), "live");
});

test("explicit failure states pass through untouched", () => {
  store.feedStatus = { status: "failed", next_recommended_run_utc: "2000-01-01T00:00:00Z" };
  assert.equal(feedStateLabel(), "failed");
  assert.equal(feedStateClass(), "degraded");
});

test("dataStateLabel precedence: degraded beats live beats cached beats fixture", () => {
  store.state = { source_mode: "live+degraded-cache", operational_readiness: {} };
  assert.equal(dataStateLabel(), "degraded");
  store.state = { source_mode: "synthetic+cached-observed-context", operational_readiness: {} };
  assert.equal(dataStateLabel(), "cached");
  store.state = { source_mode: "synthetic", operational_readiness: {} };
  assert.equal(dataStateLabel(), "synthetic");
});
