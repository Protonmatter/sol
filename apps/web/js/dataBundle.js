// Pure resolve-once data reader. No mutable root aliases and no store publication.
import { parseStrictJson, parseSolarSnapshot } from "./solarContract.js?v=dcca6290db";
import { makeSeriesRecords } from "./seriesModel.js?v=dcca6290db";

export const BUNDLE_SCHEMAS = {"research-data-bundle.v1":{"type":"object","additionalProperties":false,"required":["schema_version","bundle_id","source_bundle_id","source_manifest_sha256","generated_at_utc","components"],"properties":{"schema_version":{"const":"research-data-bundle.v1"},"bundle_id":{"type":"string","minLength":1},"source_bundle_id":{"type":"string","minLength":1},"source_manifest_sha256":{"type":"string","minLength":64,"maxLength":64},"generated_at_utc":{"type":"string","minLength":1},"components":{"type":"array","minItems":5,"maxItems":128,"items":{"type":"object","additionalProperties":false,"required":["role","path","schema_version","size_bytes","sha256"],"properties":{"role":{"type":"string","minLength":1},"path":{"type":"string","minLength":1},"schema_version":{"type":"string","minLength":1},"size_bytes":{"type":"integer","minimum":0,"maximum":16777216},"sha256":{"type":"string","minLength":64,"maxLength":64}}}}},"$schema":"https://json-schema.org/draft/2020-12/schema"},"daily-ingest-status.v2":{"type":"object","additionalProperties":false,"required":["schema_version","bundle_id","source_bundle_id","status","generated_at_utc","observation_time_utc","delivery_state","warnings"],"properties":{"schema_version":{"const":"daily-ingest-status.v2"},"bundle_id":{"type":"string","minLength":1},"source_bundle_id":{"type":"string","minLength":1},"status":{"enum":["ok","degraded"]},"generated_at_utc":{"type":"string","minLength":1},"observation_time_utc":{"type":["string","null"]},"delivery_state":{"const":"validated"},"warnings":{"type":"array","items":{"type":"string","minLength":1}},"last_run_utc":{"type":"string","minLength":1},"next_recommended_run_utc":{"type":"string","minLength":1},"sources":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["file","source","ok","origin","observation_time_utc","retrieved_at_utc"],"properties":{"file":{"type":"string","minLength":1},"source":{"type":"string","minLength":1},"ok":{"type":"boolean"},"origin":{"enum":["current-fetch","cached-fallback","fixture"]},"observation_time_utc":{"type":["string","null"]},"retrieved_at_utc":{"type":["string","null"]}}}}},"$schema":"https://json-schema.org/draft/2020-12/schema"},"bundle-pointer.v1":{"type":"object","additionalProperties":false,"required":["schema_version","bundle_id","manifest_path","manifest_sha256"],"properties":{"schema_version":{"const":"bundle-pointer.v1"},"bundle_id":{"type":"string","minLength":1},"manifest_path":{"type":"string","minLength":1},"manifest_sha256":{"type":"string","minLength":64,"maxLength":64}},"$schema":"https://json-schema.org/draft/2020-12/schema"},"public-data-cache-manifest.v2":{"type":"object","additionalProperties":false,"required":["schema_version","bundle_id","acquired_at_utc","products","failures"],"properties":{"schema_version":{"const":"public-data-cache-manifest.v2"},"bundle_id":{"type":"string","minLength":1},"acquired_at_utc":{"type":"string","minLength":1},"products":{"type":"array","minItems":1,"maxItems":64,"items":{"type":"object","additionalProperties":false,"required":["product_id","source","origin","observation_time_utc","retrieved_at_utc","quality","failure","license","critical","path","size_bytes","sha256"],"properties":{"product_id":{"type":"string","minLength":1},"source":{"type":"string","minLength":1},"origin":{"enum":["current-fetch","cached-fallback","fixture"]},"observation_time_utc":{"type":["string","null"]},"retrieved_at_utc":{"type":["string","null"]},"quality":{"type":"array","minItems":1,"items":{"type":"string","minLength":1}},"failure":{"type":["string","null"]},"license":{"type":"string","minLength":1},"critical":{"type":"boolean"},"path":{"type":"string","minLength":1},"size_bytes":{"type":"integer","minimum":1,"maximum":16777216},"sha256":{"type":"string","minLength":64,"maxLength":64}}}},"failures":{"type":"array","maxItems":64,"items":{"type":"object","additionalProperties":false,"required":["product_id","critical","error_type"],"properties":{"product_id":{"type":"string","minLength":1},"critical":{"type":"boolean"},"error_type":{"type":"string","minLength":1}}}}},"$schema":"https://json-schema.org/draft/2020-12/schema"}};
const LIMIT = 16 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const HASH = /^[a-f0-9]{64}$/;
function fail(message) { throw new Error(message); }
function relative(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._/-]+$/.test(value) || value.split("/").some(p=>!p || p === "." || p === "..")) fail("Invalid bundle relative path");
  return value;
}
function validate(value, schema) {
  for(const key of Object.keys(schema))if(!["$schema","type","const","enum","minimum","maximum","minLength","maxLength","minItems","maxItems","items","required","properties","additionalProperties"].includes(key))fail("Unsupported bundle schema keyword "+key);
  const types={object:value!==null&&typeof value==="object"&&!Array.isArray(value),array:Array.isArray(value),string:typeof value==="string",null:value===null,boolean:typeof value==="boolean",number:typeof value==="number"&&Number.isFinite(value),integer:Number.isSafeInteger(value)};
  if(schema.type && !(Array.isArray(schema.type)?schema.type:[schema.type]).some(t=>types[t])) fail("Bundle schema type mismatch");
  if(Object.hasOwn(schema,"const")&&value!==schema.const || schema.enum&&!schema.enum.includes(value)) fail("Bundle schema value mismatch");
  if(typeof value==="number"&&(!Number.isFinite(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity))) fail("Bundle number outside bounds");
  if(typeof value==="string"&&(value.length<(schema.minLength??0)||value.length>(schema.maxLength??Infinity))) fail("Bundle string outside bounds");
  if(Array.isArray(value)) {
    if(value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity)) fail("Bundle array outside bounds");
    for(let i=0;i<value.length;i++){if(!Object.hasOwn(value,i))fail("Sparse bundle array");if(schema.items)validate(value[i],schema.items);}
  }
  if(types.object){for(const key of schema.required||[])if(!Object.hasOwn(value,key))fail("Missing bundle field "+key);
    for(const [key,item]of Object.entries(value)){if(schema.properties?.[key])validate(item,schema.properties[key]);else if(schema.additionalProperties===false)fail("Unexpected bundle field "+key);}}
}
function contract(value, version) { validate(value,BUNDLE_SCHEMAS[version]); }
function utc(value, nullable=false) {
  if(value===null&&nullable)return;
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(value)||!Number.isFinite(Date.parse(value)))fail("Invalid explicit UTC timestamp");
  const [year,month,day,hour,minute,second]=value.slice(0,19).split(/[-T:]/).map(Number);
  const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year===0||month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59)fail("Invalid UTC calendar timestamp");
}
function freeze(value){if(value&&typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function sameJson(left,right){
  // Reject oversized numeric metadata instead of equating distinct rounded counters.
  if(typeof left==="number"&&typeof right==="number")return Math.abs(left)<=Number.MAX_SAFE_INTEGER&&Math.abs(right)<=Number.MAX_SAFE_INTEGER&&left===right;
  if(left===right)return true;
  if(!left||!right||typeof left!=="object"||typeof right!=="object")return false;
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((v,i)=>sameJson(v,right[i]));
  const keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&sameJson(left[key],right[key]));
}
function observationCoherence(snapshot,report){
  // Match daily derivation's attributed evidence projection without changing either input.
  // Explicit cross-runtime whitespace (U+FEFF is deliberately not stripped).
  const whitespace=/^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
  const frames=report.frames.filter(frame=>{const value=frame?.provenance?.source;if(typeof value!=="string")return false;const source=value.replace(whitespace,"");return source!==""&&source.toLowerCase()!=="unknown";});
  if(!sameJson(snapshot.observations,[{...report,frames}]))fail("Snapshot embedded observations disagree with normalized observations");
  if(!Object.hasOwn(snapshot,"observed_context")||!sameJson(snapshot.observed_context,report.observed_context??{}))fail("Snapshot observation context disagrees with normalized observations");
}
async function read(url,fetcher){
  const response=await fetcher(url,{cache:"no-cache"});
  if(!response.ok)fail(`Bundle HTTP ${response.status}`);
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();fail("Bundle exceeds byte limit");}chunks.push(value);}}
  finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}return raw;
}
function parse(raw){return parseStrictJson(new TextDecoder("utf-8",{fatal:true}).decode(raw));}
async function hash(raw,crypto){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",raw))].map(v=>v.toString(16).padStart(2,"0")).join("");}

/** Local preview resolves pointer once. Built clients resolve their immutable
 * release manifest, never the mutable root manifest or fixed data aliases. */
export async function readDataBundle({pointerUrl=null,releaseUrl=null,expectedReleaseId=null,fetcher=fetch,crypto=globalThis.crypto}) {
  let descriptor, manifestUrl, release=null;
  if(releaseUrl){
    release=parse(await read(releaseUrl,fetcher));
    if(release.schema_version!=="web-release-manifest.v1"||release.release_id!==expectedReleaseId||release.namespace!==`releases/${expectedReleaseId}/`)fail("Release identity mismatch");
    descriptor=release.data_bundle;
    if(!descriptor||descriptor.bundle_id!==release.data_bundle_id)fail("Missing release-bound data bundle");
    const path=relative(descriptor.manifest_path);
    if(!path.startsWith(release.namespace+"data/bundles/"))fail("Bundle outside release namespace");
    const siteRoot=new URL("../../",releaseUrl);
    manifestUrl=new URL(path,siteRoot).href;
    const asset=release.assets?.find(a=>a.path===path);
    if(!asset||asset.sha256!==descriptor.manifest_sha256||asset.role!=="critical")fail("Bundle manifest is not release-bound");
  } else {
    if(!pointerUrl)fail("Missing bundle selection");
    descriptor=parse(await read(pointerUrl,fetcher));contract(descriptor,"bundle-pointer.v1");
    manifestUrl=new URL(relative(descriptor.manifest_path),pointerUrl).href;
  }
  if(!ID.test(descriptor.bundle_id)||!HASH.test(descriptor.manifest_sha256))fail("Invalid bundle identity/hash");
  const manifestRaw=await read(manifestUrl,fetcher);
  if(await hash(manifestRaw,crypto)!==descriptor.manifest_sha256)fail("Bundle manifest hash mismatch");
  const manifest=parse(manifestRaw);contract(manifest,"research-data-bundle.v1");
  if(manifest.bundle_id!==descriptor.bundle_id||!ID.test(manifest.source_bundle_id)||!HASH.test(manifest.source_manifest_sha256))fail("Bundle identity mismatch");
  utc(manifest.generated_at_utc);
  const roles=new Set(),paths=new Set(),data=Object.create(null),raws=Object.create(null);
  for(const component of manifest.components){
    const path=relative(component.path),role=component.role;
    if(!["snapshot","observations","feed_status","series_manifest","source_manifest"].includes(role)&&!/^series_frame:\d+$/.test(role))fail("Unknown bundle role");
    if(roles.has(role)||paths.has(path.toLowerCase())||!HASH.test(component.sha256))fail("Duplicate bundle component or invalid hash");
    roles.add(role);paths.add(path.toLowerCase());
    const url=new URL(path,manifestUrl).href;
    if(release){const asset=release.assets.find(a=>a.path===new URL(url).pathname.slice(release.base_path.length));if(!asset||asset.sha256!==component.sha256||asset.size!==component.size_bytes||asset.role!=="critical")fail("Component not bound to release asset");}
    const raw=await read(url,fetcher);
    if(raw.length!==component.size_bytes||await hash(raw,crypto)!==component.sha256)fail("Component hash/size mismatch: "+role);
    raws[role]=raw;data[role]=parse(raw);
    if(data[role]?.schema_version!==component.schema_version)fail("Component schema mismatch");
  }
  for(const role of ["snapshot","observations","feed_status","series_manifest","source_manifest"])if(!roles.has(role))fail("Missing bundle role "+role);
  if([...roles].some(r=>!["snapshot","observations","feed_status","series_manifest","source_manifest"].includes(r)&&!/^series_frame:\d+$/.test(r)))fail("Unknown bundle role");
  const source=data.source_manifest,status=data.feed_status;
  contract(source,"public-data-cache-manifest.v2");contract(status,"daily-ingest-status.v2");
  if(source.bundle_id!==manifest.source_bundle_id||await hash(raws.source_manifest,crypto)!==manifest.source_manifest_sha256||status.bundle_id!==manifest.bundle_id||status.source_bundle_id!==source.bundle_id||status.generated_at_utc!==manifest.generated_at_utc)fail("Source/status bundle identity mismatch");
  utc(source.acquired_at_utc);utc(status.observation_time_utc,true);
  const degraded=source.failures.length>0||source.products.some(p=>p.origin!=="current-fetch"||p.failure!==null);
  if(status.status!==(degraded?"degraded":"ok"))fail("Feed status must preserve source degradation");
  const productIds=new Set(),productPaths=new Set();
  for(const product of source.products){relative(product.path);if(!ID.test(product.product_id)||productIds.has(product.product_id.toLowerCase())||productPaths.has(product.path.toLowerCase())||!product.source.trim()||product.source.trim().toLowerCase()==="unknown"||!HASH.test(product.sha256))fail("Invalid attributable source product");productIds.add(product.product_id.toLowerCase());productPaths.add(product.path.toLowerCase());utc(product.observation_time_utc,true);utc(product.retrieved_at_utc,true);}
  if(data.observations.schema_version!=="observation-frame.v1"||!Array.isArray(data.observations.frames)||!data.observations.source_mode)fail("Invalid normalized observations");
  const snapshot=parseSolarSnapshot(new TextDecoder().decode(raws.snapshot));
  observationCoherence(snapshot,data.observations);
  const series=data.series_manifest;
  if(series.schema_version!=="series-manifest.v1")fail("Invalid series schema");
  makeSeriesRecords(series,[]);
  const selectedRoles=new Set();
  const frames=series.frames.map((entry,index)=>{
    const role=`series_frame:${index}`;
    if(entry.availability==="unavailable"){if(!entry.reason||roles.has(role))fail("Invalid declared gap");return null;}
    const record=manifest.components.find(c=>c.role===role);
    if(!record||record.path!==`series/${entry.file}`)fail("Missing series component");
    selectedRoles.add(role);
    return parseSolarSnapshot(new TextDecoder().decode(raws[role]));
  });
  if([...roles].some(r=>r.startsWith("series_frame:")&&!selectedRoles.has(r)))fail("Orphan series component");
  return freeze({bundleId:manifest.bundle_id,sourceBundleId:manifest.source_bundle_id,
    identity:{bundle_id:manifest.bundle_id,source_bundle_id:manifest.source_bundle_id,manifest_sha256:descriptor.manifest_sha256},
    snapshot,observations:data.observations,feedStatus:status,seriesManifest:series,seriesFrames:frames,seriesRecords:makeSeriesRecords(series,frames)});
}
