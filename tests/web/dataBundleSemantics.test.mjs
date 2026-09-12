import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createHash, webcrypto } from "node:crypto";
import { readDataBundle } from "../../apps/web/js/dataBundle.js";

const root = new URL("../../apps/web/data/", import.meta.url);
const pointer = JSON.parse(fs.readFileSync(new URL("current.json", root), "utf8"));
const manifestUrl = new URL(pointer.manifest_path, root);
const manifest = JSON.parse(fs.readFileSync(manifestUrl, "utf8"));
const original = Object.fromEntries(manifest.components.map(c => [c.role, JSON.parse(fs.readFileSync(new URL(c.path, manifestUrl), "utf8"))]));
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const hash = raw => createHash("sha256").update(raw).digest("hex");
const pointerUrl = "https://example.invalid/data/current.json";

function fixture(mutate = () => {}) {
  const values = structuredClone(original), candidate = structuredClone(manifest), files = new Map();
  mutate(values);
  candidate.components = candidate.components.filter(c => Object.hasOwn(values, c.role));
  for (const component of candidate.components) {
    const raw = bytes(values[component.role]);
    component.size_bytes = raw.length; component.sha256 = hash(raw);
    files.set(new URL(component.path, new URL(pointer.manifest_path, pointerUrl)).href, raw);
    if (component.role === "source_manifest") candidate.source_manifest_sha256 = component.sha256;
  }
  const raw = bytes(candidate);
  files.set(new URL(pointer.manifest_path, pointerUrl).href, raw);
  files.set(pointerUrl, bytes({ ...pointer, manifest_sha256: hash(raw) }));
  return { files, read: () => readDataBundle({ pointerUrl, crypto: webcrypto, fetcher: async url => new Response(files.get(url)) }) };
}

const seriesMutations = {
  "valid payload swap": v => { v["series_frame:0"] = structuredClone(v["series_frame:5"]); },
  stage: v => { v.series_manifest.frames[0].stage = "solar maximum"; },
  activity: v => { v.series_manifest.frames[0].activity_index = 0.95; },
  count: v => { v.series_manifest.frames[0].region_count = 34; },
  index: v => { v.series_manifest.frames[0].index = 5; },
  "boolean index": v => { v.series_manifest.frames[0].index = false; },
  "missing index": v => { delete v.series_manifest.frames[0].index; },
  "missing stage": v => { delete v.series_manifest.frames[0].stage; },
};
for (const [name, mutate] of Object.entries(seriesMutations)) {
  test(`rehashed series ${name} cannot publish conflicting cycle metadata`, async () => {
    await assert.rejects(fixture(mutate).read(), /series.*(metadata|index)/i);
  });
}

const feedMutations = {
  absent: v => { delete v.feed_status.sources; },
  missing: v => { v.feed_status.sources.pop(); },
  empty: v => { v.feed_status.sources = []; },
  duplicate: v => { v.feed_status.sources.push(structuredClone(v.feed_status.sources[0])); },
  order: v => { v.feed_status.sources.reverse(); },
  file: v => { v.feed_status.sources[0].file = "fabricated.json"; },
  source: v => { v.feed_status.sources[0].source = "fabricated instrument"; },
  health: v => { v.feed_status.sources[0].ok = false; },
  origin: v => { v.feed_status.sources[0].origin = "current-fetch"; },
  "observation time": v => { v.feed_status.sources[0].observation_time_utc = "2026-09-11T01:00:00Z"; },
  "retrieval time": v => { v.feed_status.sources[0].retrieved_at_utc = "2026-09-11T01:00:00Z"; },
};
for (const [name, mutate] of Object.entries(feedMutations)) {
  test(`rehashed feed ${name} cannot misrepresent source products`, async () => {
    await assert.rejects(fixture(mutate).read(), /feed.*sources/i);
  });
}

test("committed illustrative series retains zero model time and declared gaps without relabeling", async () => {
  const good = await fixture().read();
  assert.equal(good.seriesFrames[10].run.time_seconds, 0);
  assert.equal(good.seriesRecords[10].months, 132);
  const selected = await fixture(v => {
    v.series_manifest.frames[1] = { file: "frame-01.json", months: 13.2, availability: "unavailable", reason: "declared gap" };
    delete v["series_frame:1"];
  }).read();
  assert.equal(selected.seriesFrames[1], null);
  assert.equal(selected.seriesRecords[10].index, 10);
  assert.equal(selected.seriesRecords[10].months, 132);
});

test("feed projection retains product IDs, product order, failures and unknown times without rewriting", async () => {
  const candidate = fixture(v => {
    Object.assign(v.source_manifest.products[0], { product_id: "logical-product", path: "payloads/physical-file.json", failure: "offline fallback" });
    Object.assign(v.feed_status.sources[0], { file: "logical-product", ok: false });
    v.source_manifest.products.reverse(); v.feed_status.sources.reverse();
    v.source_manifest.failures.push({ product_id: "unavailable.json", critical: false, error_type: "OfflineFailure" });
  });
  const before = [...candidate.files].map(([url, raw]) => [url, hash(raw)]);
  const selected = await candidate.read();
  assert.equal(selected.feedStatus.sources.at(-1).file, "logical-product");
  assert.equal(selected.feedStatus.sources.at(-1).ok, false);
  assert.equal(selected.feedStatus.sources.at(-1).observation_time_utc, null);
  assert.deepEqual([...candidate.files].map(([url, raw]) => [url, hash(raw)]), before);
});

test("loader preserves the entire last publication after rehashed series or feed mismatch", async () => {
  let selected = fixture();
  const store = { state: null, timelineIndex: -1, selectedRegionId: null };
  const source = fs.readFileSync(new URL("../../apps/web/js/data.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "").replaceAll("import.meta.url", '"https://example.invalid/js/data.js"');
  const context = vm.createContext({ store, URL, Image: class {}, FALLBACK_STATE: {}, BASE_IMAGES: {},
    document: { getElementById: () => null }, window: {}, renderAll: () => {}, maybeAutoStartTour: () => {}, prepareBundlePublication: () => {},
    readDataBundle: () => selected.read() });
  vm.runInContext(source, context);
  await context.loadState();
  const before = { snapshot: store.state, live: store.liveState, identity: store.dataBundleIdentity, status: store.feedStatus, series: store.seriesRecords };
  for (const mutate of [seriesMutations["valid payload swap"], feedMutations.missing]) {
    selected = fixture(mutate); await context.loadState();
    assert.equal(store.state, before.snapshot); assert.equal(store.liveState, before.live);
    assert.equal(store.dataBundleIdentity, before.identity); assert.equal(store.feedStatus, before.status); assert.equal(store.seriesRecords, before.series);
    assert.match(store.dataError, /series.*metadata|feed.*sources/i);
  }
});
