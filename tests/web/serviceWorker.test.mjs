import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKER = path.join(ROOT, "apps", "web", "sw.js");

function response(body, ok = true) {
  return {
    ok,
    clone() { return response(body, ok); },
    async text() { return body; },
  };
}

function harness() {
  const listeners = new Map();
  const added = [];
  const put = [];
  const deleted = [];
  const cache = {
    async add(url) {
      added.push(url);
      if (url.includes("optional")) throw new Error("blocked test asset");
    },
    async put(request, value) { put.push([request, value]); },
  };
  const source = fs.readFileSync(WORKER, "utf8");
  const token = /const TOKEN = "\?v=([0-9a-zA-Z]+)"/.exec(source)?.[1];
  assert.ok(token, "service-worker cache token must be parseable");
  const currentCache = `sol-${token}`;
  let names = ["sol-old", currentCache, "unrelated"];
  let match = async () => null;
  let fetcher = async (request) => response(String(request));
  const context = vm.createContext({
    URL,
    caches: {
      async delete(name) { deleted.push(name); return true; },
      async keys() { return names; },
      async match(request, options) { return match(request, options); },
      async open() { return cache; },
    },
    fetch(request, options) { return fetcher(request, options); },
    self: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      clients: { async claim() {} },
      location: { origin: "https://sol.example" },
      async skipWaiting() {},
    },
  });
  vm.runInContext(source, context, { filename: WORKER });
  return {
    added,
    cache,
    context,
    currentCache,
    deleted,
    listeners,
    put,
    setFetch(next) { fetcher = next; },
    setMatch(next) { match = next; },
    setNames(next) { names = next; },
  };
}

async function dispatchWait(listener, extra = {}) {
  let pending;
  listener({ ...extra, waitUntil(value) { pending = value; } });
  await pending;
}

async function dispatchFetch(listener, request) {
  let responsePromise;
  listener({ request, respondWith(value) { responsePromise = value; } });
  return responsePromise;
}

test("service worker derives precache URLs and retires only stale Sol caches", async () => {
  const h = harness();
  h.setFetch(async () => response(
    '<link href="app.js?v=abc123"><script src="optional.js?v=abc123"></script>'
  ));
  await dispatchWait(h.listeners.get("install"));
  assert.deepEqual(h.added, ["app.js?v=abc123", "optional.js?v=abc123"]);
  assert.equal(h.put[0][0], "./");

  h.setNames(["sol-old", h.currentCache, "unrelated"]);
  await dispatchWait(h.listeners.get("activate"));
  assert.deepEqual(h.deleted, ["sol-old"]);
});

test("service worker routing covers immutable, navigation, data, and fall-through paths", async () => {
  const h = harness();
  const listener = h.listeners.get("fetch");
  const makeRequest = (url, extra = {}) => ({
    method: "GET",
    mode: "cors",
    url,
    ...extra,
  });

  const fetched = await dispatchFetch(listener, makeRequest("https://sol.example/app.js?v=abc"));
  assert.equal(await fetched.text(), "[object Object]");
  assert.equal(h.put.length, 1);
  h.setMatch(async () => response("cached"));
  const cached = await dispatchFetch(listener, makeRequest("https://sol.example/app.js?v=abc"));
  assert.equal(await cached.text(), "cached");

  h.setMatch(async (request) => request === "./" ? response("offline shell") : null);
  h.setFetch(async () => { throw new Error("offline"); });
  const offline = await dispatchFetch(
    listener,
    makeRequest("https://sol.example/route", { mode: "navigate" }),
  );
  assert.equal(await offline.text(), "offline shell");

  h.setMatch(async () => null);
  await assert.rejects(
    dispatchFetch(listener, makeRequest("https://sol.example/data/latest.json")),
    /offline/,
  );

  assert.equal(
    await dispatchFetch(listener, makeRequest("https://other.example/app.js?v=abc")),
    undefined,
  );
  assert.equal(
    await dispatchFetch(listener, { method: "POST", mode: "cors", url: "https://sol.example/api" }),
    undefined,
  );
  assert.equal(
    await dispatchFetch(listener, makeRequest("https://sol.example/styles.css")),
    undefined,
  );
});
