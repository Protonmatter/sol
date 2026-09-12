import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { readDataBundle } from "../../apps/web/js/dataBundle.js";

const domNodes = new Map([
  ["layerConfidence", { checked: false }],
  ["layerRegions", { checked: false }],
]);
globalThis.document = { getElementById: id => domNodes.get(id) || null };

const selectorsUrl = new URL("../../apps/web/js/selectors.js", import.meta.url);
const tokenMatch = fs.readFileSync(selectorsUrl, "utf8").match(/\.\/store\.js\?v=([0-9a-zA-Z]+)/);
const q = tokenMatch ? `?v=${tokenMatch[1]}` : "";
const { store } = await import(`../../apps/web/js/store.js${q}`);
const { feedStateLabel, feedStateClass } = await import("../../apps/web/js/selectors.js");

const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const hash = raw => createHash("sha256").update(raw).digest("hex");
const snapshot = JSON.parse(fs.readFileSync(new URL("../../apps/web/data/latest-state.json", import.meta.url), "utf8"));

function bundleWithClock(nextClock) {
  const id = "freshness-test";
  const productRaw = bytes({ fixture: true });
  const source = {
    schema_version: "public-data-cache-manifest.v2", bundle_id: "freshness-source",
    acquired_at_utc: "2026-09-12T18:00:00Z", failures: [],
    products: [{ product_id: "fixture.json", source: "fixture source", origin: "current-fetch",
      observation_time_utc: null, retrieved_at_utc: "2026-09-12T18:00:00Z", quality: ["test fixture"],
      failure: null, license: "test fixture", critical: true, path: "payloads/fixture.json",
      size_bytes: productRaw.length, sha256: hash(productRaw) }],
  };
  const status = {
    schema_version: "daily-ingest-status.v2", bundle_id: id, source_bundle_id: source.bundle_id,
    status: "ok", generated_at_utc: "2026-09-12T18:00:00Z", observation_time_utc: null,
    delivery_state: "validated", warnings: [],
    sources: source.products.map(product => ({ file: product.product_id, source: product.source, ok: true,
      origin: product.origin, observation_time_utc: product.observation_time_utc, retrieved_at_utc: product.retrieved_at_utc })),
    ...(nextClock === undefined ? {} : { next_recommended_run_utc: nextClock }),
  };
  const values = {
    snapshot: structuredClone(snapshot), observations: structuredClone(snapshot.observations[0]),
    feed_status: status, series_manifest: { schema_version: "series-manifest.v1", frames: [] },
    source_manifest: source,
  };
  const root = `https://example.invalid/data/bundles/${id}/`;
  const files = new Map(), components = [];
  for (const [role, value] of Object.entries(values)) {
    const raw = bytes(value), path = `${role}.json`;
    files.set(root + path, raw);
    components.push({ role, path, schema_version: value.schema_version, size_bytes: raw.length, sha256: hash(raw) });
  }
  const manifest = bytes({ schema_version: "research-data-bundle.v1", bundle_id: id,
    source_bundle_id: source.bundle_id, source_manifest_sha256: hash(bytes(source)),
    generated_at_utc: status.generated_at_utc, components });
  files.set(root + "manifest.json", manifest);
  const pointer = bytes({ schema_version: "bundle-pointer.v1", bundle_id: id,
    manifest_path: `bundles/${id}/manifest.json`, manifest_sha256: hash(manifest) });
  return readDataBundle({ pointerUrl: "https://example.invalid/data/current.json", crypto: webcrypto,
    fetcher: async url => new Response(url.endsWith("current.json") ? pointer : files.get(url)) });
}

test("hash-consistent admitted bundles with unknown refresh clocks never present healthy feed state", async () => {
  for (const clock of [undefined, "2026-02-30T00:00:00Z", "2026-09-12T00:00:00-04:00"]) {
    const selected = await bundleWithClock(clock);
    store.feedStatus = selected.feedStatus;
    assert.equal(feedStateLabel(), "unknown", String(clock));
    assert.notEqual(feedStateClass(), "live", String(clock));
  }
});
