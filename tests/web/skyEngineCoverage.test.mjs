import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { loadSourceModules } from "./helpers/sourceModuleHarness.mjs";

const moduleURL = new URL("../../apps/web/js/skyEngine.js", import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(new URL("../fixtures/ephemeris-v3-corpus.json", import.meta.url))).snapshot;
async function engine(extra = {}) {
  const context = vm.createContext({ URL, TextDecoder, Uint8Array, Float64Array,
    AbortController, setTimeout, clearTimeout, ...extra });
  const [api] = await loadSourceModules(context, [moduleURL]);
  return api;
}

test("engine load shares one in-flight request, resets failure, and decodes validated memory", async () => {
  let attempts = 0, rejectFirst;
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const system = { schema_version: "system-snapshot.v1", bodies: [{ name: "Earth", x_au: 1, y_au: 2, z_au: 3 }] };
  const track = { samples: [{ unix_seconds: 0, alt_deg: 20, az_deg: 30 }, { unix_seconds: 60, alt_deg: 21, az_deg: 31 }] };
  const buffer = new ArrayBuffer(bytes.length + 4096);
  let length = 0;
  const calls = [];
  const output = (name, value, args) => {
    calls.push([name, ...args]); const encoded = new TextEncoder().encode(JSON.stringify(value));
    new Uint8Array(buffer, 64).set(encoded); length = encoded.length; return 64;
  };
  let positionResult = [1, 2, 3];
  const exports = { memory: { buffer }, sky_snapshot: (...args) => output("sky", snapshot, args), result_len: () => length,
    system_snapshot: (...args) => output("system", system, args), body_track: (...args) => output("track", track, args),
    system_positions: () => { new Float64Array(buffer, 0, 3).set(positionResult); return 0; },
    system_positions_len: () => 3 };
  const api = await engine({
    fetch: (_url, options) => {
      assert.equal(options.cache, "no-cache"); attempts++;
      return attempts === 1 ? new Promise((_, reject) => { rejectFirst = reject; })
        : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    },
    WebAssembly: { instantiate: async () => ({ instance: { exports } }) },
  });
  assert.equal(api.systemPositions(0), null);
  assert.throws(() => api.skySnapshot(0, 0, 0, 0), /not loaded/);
  assert.throws(() => api.systemSnapshot(0), /not loaded/);
  assert.throws(() => api.bodyTrack(0, 0, 0, 0, 0, 60, 2), /not loaded/);
  const first = api.loadSkyEngine();
  assert.equal(api.loadSkyEngine(), first);
  rejectFirst(Error("offline")); await assert.rejects(first, /offline/);
  assert.equal(await api.loadSkyEngine(), exports); assert.equal(attempts, 2);
  assert.equal(api.skySnapshot(0, 0, 0, 0).schema_version, "ephemeris-snapshot.v3");
  assert.equal(JSON.stringify(api.systemSnapshot(123)), JSON.stringify(system));
  assert.equal(JSON.stringify(api.bodyTrack(2, 10, -20, 30, 0, 60, 2)), JSON.stringify(track));
  assert.deepEqual(calls, [["sky", 0, 0, 0, 0], ["system", 123], ["track", 2, 10, -20, 30, 0, 60, 2]]);
  const positions = api.systemPositions(0);
  assert.deepEqual(Array.from(positions), [1, 2, 3]);
  positionResult = [4, 5, 6]; api.systemPositions(1);
  assert.deepEqual(Array.from(positions), [1, 2, 3], "positions are copied away from mutable WASM memory");
  delete exports.system_positions;
  assert.equal(api.systemPositions(0), null, "older engine keeps explicit JSON fallback");
});

test("engine HTTP and typed track failures remain actionable", async () => {
  const http = await engine({ fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(http.loadSkyEngine(), /ephemeris wasm HTTP 503/);
  for (const payload of [{ error: "track rejected", code: "work_limit" }, { error: "track rejected" }]) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const api = await engine({ fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }),
      WebAssembly: { instantiate: async () => ({ instance: { exports: {
        memory: { buffer: bytes.buffer }, body_track: () => 0, result_len: () => bytes.length,
      } } }) } });
    await api.loadSkyEngine();
    assert.throws(() => api.bodyTrack(0, 0, 0, 0, 0, 60, 2), error =>
      error.message === "track rejected" && error.code === (payload.code || "engine_failed"));
  }
});

test("server control communicates configured, unavailable, and missing DOM states", async () => {
  for (const configured of [undefined, " https://fixture.invalid/ "]) {
    const button = { setAttribute(name, value) { this[name] = value; } };
    const api = await engine({ window: { SOL_EPHEMERIS_SERVER: configured }, document: { getElementById: () => button } });
    assert.equal(api.SERVER_CONFIGURED, configured !== undefined);
    if (configured === undefined) {
      assert.equal(button.disabled, true); assert.equal(button["aria-disabled"], "true");
      assert.match(button.textContent, /not configured/);
    } else {
      assert.equal(api.SERVER_BASE, "https://fixture.invalid");
      assert.match(button.textContent, /sends location/); assert.match(button.title, /coordinates/);
    }
  }
  await engine({ document: { getElementById: () => null } });
});

test("health validation admits only matching healthy provider and cleans up timeout", async () => {
  for (const result of [null, { ok: false }, { ok: true, status: "broken", schema_version: "ephemeris-snapshot.v3" },
    { ok: true, status: "ok", schema_version: "ephemeris-snapshot.v2" },
    { ok: true, status: "ok", schema_version: "ephemeris-snapshot.v3" }]) {
    let calls = 0, cleared = 0, timeout, signal;
    const api = await engine({
      setTimeout: callback => { timeout = callback; return 7; },
      clearTimeout: handle => { assert.equal(handle, 7); cleared++; },
      fetch: async (url, options) => {
        calls++; assert.equal(url, "https://fixture.invalid/health");
        assert.equal(options.redirect, "error"); signal = options.signal;
        if (result === null) throw Error("offline");
        return { ok: result.ok, json: async () => result };
      },
    });
    assert.equal(await api.checkServerHealth("", null), false);
    assert.equal(await api.checkServerHealth("https://fixture.invalid", null), false);
    assert.equal(calls, 0);
    const valid = await api.checkServerHealth("https://fixture.invalid", { allows: () => true });
    assert.equal(valid, result?.status === "ok" && result?.schema_version === "ephemeris-snapshot.v3");
    assert.equal(calls, 1); assert.equal(cleared, 1);
    timeout(); assert.equal(signal.aborted, true);
  }
});

test("health deadline aborts a pending request and clears its timer after rejection", async () => {
  let timeout, signal, cleared = false;
  const api = await engine({ setTimeout: callback => { timeout = callback; return 9; },
    clearTimeout: handle => { assert.equal(handle, 9); cleared = true; },
    fetch: (_url, options) => new Promise((_, reject) => {
      signal = options.signal; signal.addEventListener("abort", () => reject(Error("aborted")), { once: true });
    }),
  });
  const pending = api.checkServerHealth("https://fixture.invalid", { allows: () => true });
  assert.equal(signal.aborted, false); assert.equal(cleared, false);
  timeout();
  assert.equal(await pending, false); assert.equal(signal.aborted, true); assert.equal(cleared, true);
});
