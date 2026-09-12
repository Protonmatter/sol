// Build-stamped immutable releases. No client claiming or partial precache activation.
const RELEASE_ID = "__SOL_RELEASE_ID__";
const NAMESPACE = "__SOL_RELEASE_NAMESPACE__";
const BASE_PATH = "__SOL_BASE_PATH__";
const PREFIX = "sol-release-";
const CACHE = PREFIX + RELEASE_ID;
const base = new URL(BASE_PATH, self.location.origin);
const marker = new URL("__complete_release__", base).href;
const supported = new Set(["solar-state-snapshot.v2", "solar-state-snapshot.v3", "ephemeris-snapshot.v2", "ephemeris-snapshot.v3"]);
const absolute = path => new URL(path, base).href;
const cleanPath = path => typeof path === "string" && /^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(path) && !path.split("/").some(part => part === "." || part === "..");

function validateManifest(manifest, expected = RELEASE_ID) {
  if (manifest?.schema_version !== "web-release-manifest.v1" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(manifest.release_id)
      || manifest.release_id !== expected || manifest.namespace !== `releases/${expected}/` || manifest.base_path !== BASE_PATH) throw Error("Release identity mismatch");
  if (!Array.isArray(manifest.schemas) || manifest.schemas.length !== 2 || new Set(manifest.schemas).size !== 2
      || !manifest.schemas.every(version => supported.has(version)) || !manifest.schemas.some(version=>version.startsWith("solar-state-"))
      || !manifest.schemas.some(version=>version.startsWith("ephemeris-")) || manifest.abi_versions?.solar !== 1 || manifest.abi_versions?.ephemeris !== 1) throw Error("Unsupported schema/ABI");
  if (!Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > 100000) throw Error("Invalid asset inventory");
  const paths = new Set();
  for (const asset of manifest.assets) {
    if (!cleanPath(asset.path) || paths.has(asset.path) || !Number.isSafeInteger(asset.size) || asset.size < 0
        || !/^[a-f0-9]{64}$/.test(asset.sha256) || !["critical", "optional"].includes(asset.role)) throw Error("Invalid or duplicate asset");
    paths.add(asset.path);
    if (asset.role === "critical" && !["index.html", "sw.js"].includes(asset.path) && !asset.path.startsWith(manifest.namespace)) throw Error("Critical asset crosses release boundary");
  }
  for (const path of ["index.html", "sw.js", manifest.namespace + "index.html", manifest.namespace + "app.js",
    manifest.namespace + "pkg/solar_wasm.wasm", manifest.namespace + "pkg/solar_ephemeris.wasm"]) {
    if (!manifest.assets.some(asset=>asset.path===path && asset.role==="critical")) throw Error("Missing critical asset");
  }
  for (const name of ["solar_wasm.wasm", "solar_ephemeris.wasm"]) {
    if (manifest.wasm_sha256?.[name] !== manifest.assets.find(asset=>asset.path===manifest.namespace + "pkg/" + name)?.sha256) throw Error("Engine hash inventory mismatch");
  }
  return manifest;
}

async function verifyResponse(response, asset) {
  if (!response.ok || response.type === "opaque" || response.redirected) throw Error("Critical asset fetch failed");
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== asset.size) throw Error("Critical asset size mismatch");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte=>byte.toString(16).padStart(2,"0")).join("");
  if (digest !== asset.sha256) throw Error("Critical asset hash mismatch");
  return response;
}

async function completed(name) {
  if (!(await caches.keys()).includes(name)) return null;
  const response = await (await caches.open(name)).match(marker);
  if (!response) return null;
  try { return validateManifest(await response.json(), name.slice(PREFIX.length)); } catch (_) { return null; }
}

async function installRelease() {
  const response = await fetch(absolute("web-release-manifest.json"), {cache:"no-store"});
  if (!response.ok || response.redirected) throw Error("Release manifest unavailable");
  const manifest = validateManifest(await response.json());
  const prior = await completed(CACHE);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(manifest)) throw Error("Release ID reused with different bytes");
    return;
  }
  const stageName = `sol-stage-${RELEASE_ID}`;
  await caches.delete(stageName);
  const stage = await caches.open(stageName);
  try {
    // Sequential admission bounds memory and avoids flooding a low-power device.
    for (const asset of manifest.assets.filter(asset=>asset.role === "critical")) {
      const url = absolute(asset.path);
      await stage.put(url, await verifyResponse(await fetch(url, {cache:"no-store",redirect:"error"}), asset));
    }
    const destination = await caches.open(CACHE);
    for (const request of await stage.keys()) await destination.put(request, await stage.match(request));
    // Written last: cache existence alone is never a successful installation.
    await destination.put(marker, new Response(JSON.stringify(manifest), {headers:{"Content-Type":"application/json"}}));
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  } finally { await caches.delete(stageName); }
}
self.addEventListener("install", event=>event.waitUntil(installRelease()));

self.addEventListener("activate", event=>event.waitUntil((async()=>{
  if (!await completed(CACHE)) throw Error("Cannot activate an incomplete release");
  const clients = await self.clients.matchAll({type:"window",includeUncontrolled:true});
  const inUse = new Set(clients.map(client=>new URL(client.url).pathname).filter(path=>path.startsWith(BASE_PATH + "releases/"))
    .map(path=>PREFIX + path.slice((BASE_PATH + "releases/").length).split("/")[0]));
  const complete = [];
  for (const name of await caches.keys()) if(name.startsWith(PREFIX) && await completed(name)) complete.push(name);
  const previous = complete.filter(name=>name!==CACHE).at(-1);
  for (const name of complete) if(name!==CACHE && name!==previous && !inUse.has(name)) await caches.delete(name);
  // Legacy caches may still serve an old open tab. Retire them only after that tab exits.
  const legacyInUse = clients.some(client=>new URL(client.url).origin===base.origin && new URL(client.url).pathname.startsWith(BASE_PATH)
    && !new URL(client.url).pathname.startsWith(BASE_PATH + "releases/"));
  if (!legacyInUse) for (const name of await caches.keys()) if(/^sol-[A-Za-z0-9]+$/.test(name)) await caches.delete(name);
})()));

self.addEventListener("message", event=>{
  const url = event.source?.url && new URL(event.source.url);
  if(event.data?.type === "GET_RELEASE_ID" && event.ports?.[0] && url?.origin === base.origin && url.pathname.startsWith(BASE_PATH)) {
    event.waitUntil((async()=>{if(await completed(CACHE)) event.ports[0].postMessage({type:"RELEASE_ID",release_id:RELEASE_ID,namespace:NAMESPACE,base_path:BASE_PATH});})());
  }
  if(event.data?.type === "ACTIVATE_RELEASE" && event.data.release_id === RELEASE_ID && url?.origin === base.origin && url.pathname.startsWith(BASE_PATH)) {
    event.waitUntil((async()=>{if(await completed(CACHE)) await self.skipWaiting();})());
  }
});

const reloadRequired = () => new Response("This release is unavailable or incomplete. Reconnect and reload Sol to open a complete compatible release.", {status:409,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}});
async function releaseRequest(url) {
  const relative = url.pathname.slice(BASE_PATH.length);
  const id = relative.split("/")[1];
  const name = PREFIX + id;
  const manifest = await completed(name);
  if (!manifest) return reloadRequired();
  const cache = await caches.open(name);
  const path = relative.endsWith("/") ? relative + "index.html" : relative;
  if (path === manifest.namespace + "web-release-manifest.json") return new Response(JSON.stringify(manifest),{headers:{"Content-Type":"application/json"}});
  const asset = manifest.assets.find(asset=>asset.path===path);
  if (!asset) return reloadRequired();
  const hit = await cache.match(absolute(path));
  if (hit) return hit;
  try {
    const response = await verifyResponse(await fetch(absolute(path),{cache:"no-store",redirect:"error"}),asset);
    await cache.put(absolute(path),response.clone());
    return response;
  } catch (_) { return reloadRequired(); }
}
self.addEventListener("fetch", event=>{
  const request = event.request;
  if(request.method!=="GET") return;
  const url = new URL(request.url);
  if(url.origin!==base.origin || !url.pathname.startsWith(BASE_PATH)) return;
  if(url.pathname.startsWith(BASE_PATH + "releases/")) event.respondWith(releaseRequest(url));
  else if(request.mode==="navigate" && [BASE_PATH,BASE_PATH + "index.html"].includes(url.pathname)) {
    event.respondWith((async()=>await completed(CACHE) ? Response.redirect(absolute(NAMESPACE + "index.html"),302) : reloadRequired())());
  }
  // Mutable legacy paths, cross-origin imagery, and provider traffic are never cached.
});
