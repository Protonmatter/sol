import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = fs.readFileSync(new URL("../../../apps/web/sw.js", import.meta.url), "utf8");
export const origin = "https://sol.example";
const sha = async value => Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("hex");
export async function release(id, base = "/sol/") {
  const files = {"index.html": "bootstrap " + id, "sw.js":"worker " + id,
    [`releases/${id}/index.html`]: "shell " + id, [`releases/${id}/app.js`]: "app " + id,
    [`releases/${id}/pkg/solar_wasm.wasm`]: "solar " + id, [`releases/${id}/pkg/solar_ephemeris.wasm`]: "ephemeris " + id,
    [`releases/${id}/data/latest-state.json`]: '{"release":"' + id + '"}', [`releases/${id}/texture.jpg`]: "optional"};
  const assets = await Promise.all(Object.entries(files).map(async ([path, bytes]) => ({path,size:new TextEncoder().encode(bytes).length,sha256:await sha(bytes),role:path.endsWith(".jpg")?"optional":"critical"})));
  return {files, manifest:{schema_version:"web-release-manifest.v1",release_id:id,namespace:`releases/${id}/`,base_path:base,
    source_sha:"a".repeat(40),schemas:["solar-state-snapshot.v3","ephemeris-snapshot.v3"],abi_versions:{solar:1,ephemeris:1},
    wasm_sha256:Object.fromEntries(assets.filter(a=>a.path.endsWith(".wasm")).map(a=>[a.path.split("/").at(-1),a.sha256])),assets}};
}
export function harness(id, data, shared = new Map(), base = "/sol/") {
  const listeners = new Map(), calls = [], actions = [];
  let offline = false, corrupt = null, clients = [];
  const key = value => new URL(typeof value === "string" ? value : value.url, origin + base).href;
  const caches = { async keys(){return [...shared.keys()];},async delete(name){return shared.delete(name);}, async open(name){
    if(!shared.has(name)) shared.set(name,new Map()); const rows=shared.get(name);
    return {async match(request){return rows.get(key(request))?.clone();},async put(request,response){rows.set(key(request),response.clone());},async keys(){return [...rows.keys()].map(url=>new Request(url));},async delete(request){return rows.delete(key(request));}};
  }};
  const context = vm.createContext({URL,Request,Response,TextEncoder,crypto:webcrypto,caches,console,
    fetch:async request=>{const url=key(request);calls.push(url);if(offline)throw Error("offline"); const pathname=new URL(url).pathname.slice(base.length);
      if(pathname==="web-release-manifest.json")return new Response(JSON.stringify(data.manifest));
      if(!(pathname in data.files))return new Response("missing",{status:404});
      return new Response(corrupt===pathname?"corrupt":data.files[pathname]);},
    self:{location:{origin,href:origin+base+"sw.js"},registration:{scope:origin+base},addEventListener:(type,fn)=>listeners.set(type,fn),
      clients:{matchAll:async()=>clients,claim:async()=>actions.push("claim")},skipWaiting:async()=>actions.push("skipWaiting")}});
  vm.runInContext(source.replaceAll("__SOL_RELEASE_ID__",id).replaceAll("__SOL_RELEASE_NAMESPACE__",`releases/${id}/`).replaceAll("__SOL_BASE_PATH__",base),context);
  return {shared,calls,actions,setOffline:()=>offline=true,setCorrupt:p=>corrupt=p,setClients:v=>clients=v,
    async event(type,extra={}){let work;listeners.get(type)?.({...extra,waitUntil:p=>work=p});await work;},
    async request(path,mode="cors",method="GET"){let work;listeners.get("fetch")?.({request:{method,mode,url:path.startsWith("https:")?path:origin+base+path},respondWith:p=>work=p});return work;}};
}
