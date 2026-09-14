// Source admission for numeric terrain. Runtime acquisition is same-origin only.
// BEGIN GENERATED TERRAIN REFERENCES
const REFERENCES = [
  {
    "id": "moon-radial-height-v2",
    "body": "Moon",
    "path": "textures/terrain/moon-radial-height-v2.u16.bin",
    "sha256": "231712404e21d22427b2bb5da32f23b7a5db29cf5bb7e5cd49f7fae6753a8126",
    "bytes": 8294400,
    "width": 2880,
    "height": 1440,
    "encoding": "uint16-little-endian",
    "nodata_code": 65535,
    "heightOffsetKm": -32.768,
    "heightScaleKm": 0.001,
    "quantity": "radial-height-from-reference-sphere",
    "referenceRadiusKm": 1737.4,
    "minHeightKm": -8.729,
    "maxHeightKm": 10.552,
    "minRadiusKm": 1728.671,
    "maxRadiusKm": 1747.952,
    "nativeDegreesPerTexel": 0.125,
    "nativeEquatorialKmPerTexel": 3.790418803018685,
    "mapping": {
      "primeMeridianU": 0.5,
      "longitudeDirection": "east",
      "latitudeType": "planetocentric",
      "latitudeBounds": [
        -90,
        90
      ],
      "pixelRegistration": "cell-centered",
      "rowOrder": "north-to-south"
    },
    "coverage": "global source grid, including source-team interpolation",
    "label": "LRO / LOLA measured relief",
    "source_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif",
    "source_sha256": "45a2b32d56e81ed30db07fead8abc842b249b6511219d9ca2c53f81bc2dc5d62",
    "source_bytes": 33201026,
    "source_retrieved_at": "2026-09-14",
    "metadata_urls": [
      "https://svs.gsfc.nasa.gov/4720/"
    ],
    "metadata_sha256": {
      "lola-product.html": "74624aa809c59e5f570955256cb7cf6ce781595fe7d0ebe93ef42b3e2fa0486b"
    },
    "observation_label": "LOLA gridded reference available in spring 2019; not a single observation epoch",
    "credits": "NASA Scientific Visualization Studio / LRO LOLA instrument team",
    "derivation": "prepare_terrain_detail.py v1; exact equally weighted 2x2 source-cell means at 0.125 degree centered footprints from 0.0625 degree numerical source cells, rational arithmetic, half-up rounding to integer metres; maximum added quantization error 0.5m; no upsampling or color inference",
    "limitations": "LOLA source-team global gridded data from spring 2019; interpolation remains source-team processing. No source shot-count mask is present in the TIFF. The 8-sample/degree derivative retains less detail than the 16-sample/degree source. Grid spacing is not observation accuracy; finite 64-step directional shadows can undersample long grazing paths. No tiled terrain or finite-Sun penumbra qualification.",
    "sourceDegreesPerTexel": 0.0625,
    "sourceMinHeightKm": -8.9815,
    "sourceMaxHeightKm": 10.6855,
    "previousProduct": {
      "id": "moon-radial-height-v1",
      "path": "textures/terrain/moon-radial-height.u16.bin",
      "sha256": "f6ade389b0b3e716b95e2db16e72ba780224f6089ed9e04c11616ecb65a2bd13",
      "bytes": 2073600
    }
  },
  {
    "id": "mars-radial-height-v2",
    "body": "Mars",
    "path": "textures/terrain/mars-radial-height-v2.u16.bin",
    "sha256": "eeee507f80b9d093b5b9327571e1256a74e9380f839233e545f54fa6a3e33dba",
    "bytes": 8294400,
    "width": 2880,
    "height": 1440,
    "encoding": "uint16-little-endian",
    "nodata_code": 65535,
    "heightOffsetKm": -32.768,
    "heightScaleKm": 0.001,
    "quantity": "radial-height-from-reference-sphere",
    "referenceRadiusKm": 3396.0,
    "minHeightKm": -23.059,
    "maxHeightKm": 21.272,
    "minRadiusKm": 3372.941,
    "maxRadiusKm": 3417.272,
    "nativeDegreesPerTexel": 0.125,
    "nativeEquatorialKmPerTexel": 7.408922674715929,
    "mapping": {
      "primeMeridianU": 0.0,
      "longitudeDirection": "east",
      "latitudeType": "planetocentric",
      "latitudeBounds": [
        -90,
        90
      ],
      "pixelRegistration": "cell-centered",
      "rowOrder": "north-to-south"
    },
    "coverage": "global source grid, including source-team interpolation",
    "label": "MGS / MOLA measured relief",
    "source_url": "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megr90n000eb.img",
    "source_sha256": "976cb28c7a6561d1c3f7b4281e035e0c1dd02d387375e4a4aba5010b7064a8d0",
    "source_bytes": 33177600,
    "source_retrieved_at": "2026-09-14",
    "metadata_urls": [
      "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html",
      "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megr90n000eb.lbl",
      "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg016/megr90n000eb.xml"
    ],
    "metadata_sha256": {
      "megr90n000eb.lbl": "39caa45880c19cb3df1bd8dce0ff33a64d14eee844b03419f84ce30c24d7849c",
      "megr90n000eb.xml": "eb5df1efd99d8730d78d7aa68900d69b799f7ced8046e4ca55d0793326faa32a",
      "mola-product.html": "d951dcdd8bbdfbf621e84989c0764e32f73a73903ce23e90d4786a5c9fdfdebe"
    },
    "observation_label": "MOLA 1997-2001 source interval; MEGR product 2.0 created 2003-04-03",
    "credits": "NASA Goddard / MGS MOLA Science Team / PDS Geosciences Node",
    "derivation": "prepare_terrain_detail.py v1; exact equally weighted 2x2 source-cell means at 0.125 degree centered footprints from 0.0625 degree numerical source cells, rational arithmetic, half-up rounding to integer metres; maximum added quantization error 0.5m; no upsampling or color inference",
    "limitations": "MOLA mean radius, not areoid topography; source label supplies interpolated bins where shots are absent, about 55 percent of equatorial bins contain a shot. Original PDS3 map resolution is authoritative: PDS4 cartography scale/resolution fields are transposed; array dimensions and physical value_offset agree. The 8-sample/degree derivative retains less detail than the 16-sample/degree source. Grid spacing is not observation accuracy; finite 64-step directional shadows can undersample long grazing paths. No tiled terrain or finite-Sun penumbra qualification.",
    "sourceDegreesPerTexel": 0.0625,
    "sourceMinHeightKm": -23.17,
    "sourceMaxHeightKm": 21.28,
    "previousProduct": {
      "id": "mars-radial-height-v1",
      "path": "textures/terrain/mars-radial-height.u16.bin",
      "sha256": "821cbd539517b18b29da201d15d6ca01491ce1890b505dbf06892df76d8a3717",
      "bytes": 2073600
    }
  }
];
// END GENERATED TERRAIN REFERENCES

// Prevent a consumer from changing the published byte identity or coordinate contract.
function freezeTree(value) {
  if(value&&typeof value==='object') {for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}
  return value;
}
freezeTree(REFERENCES);

export function terrainReferences() {return REFERENCES;}
export function terrainReference(body) {return REFERENCES.find(ref=>ref.body===body)||null;}

/** @param {ArrayBuffer} buffer @param {any} reference */
export function decodeTerrain(buffer,reference) {
  const count=reference.width*reference.height;
  if(!Number.isSafeInteger(count)||count<8||count>4096*2048||buffer.byteLength!==count*2||buffer.byteLength!==reference.bytes) throw new Error('Terrain byte size does not match declared dimensions');
  if(reference.encoding!=='uint16-little-endian'||reference.quantity!=='radial-height-from-reference-sphere'||reference.mapping.latitudeType!=='planetocentric'||reference.mapping.longitudeDirection!=='east') throw new Error('Unsupported terrain encoding or coordinate datum');
  const view=new DataView(buffer),heightsKm=new Float32Array(count);
  for(let i=0;i<count;i++) {
    const code=view.getUint16(i*2,true);
    if(code===reference.nodata_code) throw new Error('Terrain source contains missing coverage');
    const h=code*reference.heightScaleKm+reference.heightOffsetKm;
    if(!Number.isFinite(h)||h<reference.minHeightKm-1e-7||h>reference.maxHeightKm+1e-7) throw new Error('Terrain source height outside qualified range');
    heightsKm[i]=h;
  }
  return {width:reference.width,height:reference.height,heightsKm,referenceRadiusKm:reference.referenceRadiusKm,
    primeMeridianU:reference.mapping.primeMeridianU};
}

/** @param {string} body @param {{fetcher?:typeof fetch,signal?:AbortSignal}} [options] */
export async function loadTerrainReference(body,{fetcher=globalThis.fetch,signal}={}) {
  const reference=terrainReference(body);
  if(!reference) return null;
  if(reference.bytes>8*1024*1024||!/^textures\/terrain\/[a-z0-9.-]+\.bin$/.test(reference.path)) throw new Error('Terrain asset exceeds byte budget or local path contract');
  const response=await fetcher(new URL('../'+reference.path,import.meta.url),{signal});
  if(!response.ok) throw new Error(`Terrain asset unavailable (HTTP ${response.status})`);
  const declared=response.headers.get('content-length');
  if(declared!==null&&!response.headers.get('content-encoding')&&Number(declared)!==reference.bytes) throw new Error('Terrain declared byte size mismatch');
  // Read the bounded stream rather than allocating an unbounded response.arrayBuffer().
  const output=new Uint8Array(reference.bytes);let length=0;
  const reader=response.body?.getReader();
  if(!reader) throw new Error('Terrain response has no byte stream');
  try {
    for(;;) {
      const {done,value}=await reader.read();if(done)break;
      if(length+value.byteLength>output.byteLength) throw new Error('Terrain byte size exceeds budget');
      output.set(value,length);length+=value.byteLength;
    }
  } catch(error) {await reader.cancel().catch(()=>{});throw error;} finally {reader.releaseLock();}
  if(length!==output.byteLength) throw new Error('Terrain byte size is truncated');
  if(signal?.aborted) throw new DOMException('Terrain request aborted','AbortError');
  if(!globalThis.crypto?.subtle) throw new Error('Terrain SHA-256 verification is unavailable');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',output);
  if(signal?.aborted) throw new DOMException('Terrain request aborted','AbortError');
  const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==reference.sha256) throw new Error('Terrain SHA-256 mismatch; smooth fallback retained');
  return {reference,grid:decodeTerrain(output.buffer,reference)};
}

/** Conservative extent before loading; metadata is part of the immutable app module. */
export function terrainExtentKm(body) {
  const reference=terrainReference(body);
  return reference?{minRadiusKm:reference.minRadiusKm,maxRadiusKm:reference.maxRadiusKm}:null;
}

export function terrainSummary(body,status='deferred',fallbackVisible=false) {
  const reference=terrainReference(body);
  if(!reference)return 'Qualified numerical terrain unavailable for this body.';
  const fallback=fallbackVisible?'lower detail remains visible':'smooth reference surface retained';
  if(status==='unavailable')return `${reference.label} requested detail unavailable; ${fallback}. Toggle terrain relief off and on to retry.`;
  if(status==='loading')return `${reference.label} requested detail loading; ${fallback}.`;
  if(status!=='ready')return `${reference.label}; relief loads when focused at a useful scale.`;
  return `${reference.label} · true-scale relief · ${reference.nativeDegreesPerTexel}° numerical cells from ${reference.sourceDegreesPerTexel??reference.nativeDegreesPerTexel}° source. Archive topography; source date is separate from model time.`;
}
