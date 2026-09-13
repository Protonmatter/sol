import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";
import { BASE_IMAGES } from "../../apps/web/js/config.js";

async function harness(url) {
  const images = [];
  const store = { timelineIndex: -1, liveEngineRun: false, wavelength: "continuum" };
  const context = vm.createContext({ Image: class { constructor() { images.push(this); this.complete = true; this.naturalWidth = 1024; } }, window: {}, Event: class {} });
  const [data] = await loadSourceModules(context, [new URL("../../apps/web/js/data.js", import.meta.url)], {
    resolveImport: (_specifier, resolved) => {
      if (resolved.pathname.endsWith("/store.js")) return { store };
      if (resolved.pathname.endsWith("/config.js")) return { FALLBACK_STATE: {}, BASE_IMAGES: { continuum: { ...BASE_IMAGES.continuum, url } } };
      if (resolved.pathname.endsWith("/view.js")) return { renderAll() {} };
      if (resolved.pathname.endsWith("/tour.js")) return { maybeAutoStartTour() {} };
      if (resolved.pathname.endsWith("/dataBundle.js")) return { readDataBundle() {} };
      if (resolved.pathname.endsWith("/timeline.js")) return { prepareBundlePublication() {} };
    },
  });
  return { data, images };
}

test("dynamic image loader rejects a URL absent from the channel policy before constructing Image", async () => {
  const h = await harness("https://example.com/unapproved.jpg");
  assert.equal(h.data.currentBaseImage(), null);
  assert.equal(h.images.length, 0);
  assert.equal(h.data.baseImageState("continuum"), "failed");
});

test("dynamic image loader admits exact approved NASA URL without claiming a pinned frame", async () => {
  const h = await harness(BASE_IMAGES.continuum.url);
  assert.ok(h.data.currentBaseImage());
  assert.equal(h.images.length, 1);
  assert.equal(h.images[0].src, BASE_IMAGES.continuum.url);
});
