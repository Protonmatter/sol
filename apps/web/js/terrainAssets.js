// Source admission for numeric terrain. Runtime acquisition is same-origin only.
// BEGIN GENERATED TERRAIN REFERENCES
const REFERENCES = [
  {
    "id": "moon-radial-height-v1",
    "body": "Moon",
    "path": "textures/terrain/moon-radial-height.u16.bin",
    "sha256": "f6ade389b0b3e716b95e2db16e72ba780224f6089ed9e04c11616ecb65a2bd13",
    "bytes": 2073600,
    "width": 1440,
    "height": 720,
    "encoding": "uint16-little-endian",
    "nodata_code": 65535,
    "heightOffsetKm": -32.768,
    "heightScaleKm": 0.001,
    "quantity": "radial-height-from-reference-sphere",
    "referenceRadiusKm": 1737.4,
    "minHeightKm": -8.878,
    "maxHeightKm": 10.504,
    "minRadiusKm": 1728.5220000000002,
    "maxRadiusKm": 1747.904,
    "nativeDegreesPerTexel": 0.25,
    "nativeEquatorialKmPerTexel": 7.58083760603737,
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
    "source_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif",
    "source_sha256": "330afa2556a86fd05ac6ba2f912f246600fdade35de2a0d90593d50d07b01b65",
    "source_bytes": 4153352,
    "source_retrieved_at": "2026-09-13",
    "metadata_urls": [
      "https://svs.gsfc.nasa.gov/4720/"
    ],
    "metadata_sha256": {},
    "observation_label": "LOLA gridded reference available in spring 2019; not a single observation epoch",
    "credits": "NASA Scientific Visualization Studio / LRO LOLA instrument team",
    "derivation": "prepare_terrain_reference.py v1; native samples retained; float kilometres (Moon) or signed big-endian integer metres (Mars) to little-endian unsigned integer metres with -32768m offset; round-half-up; no resampling; maximum quantization error 0.5m",
    "limitations": "Numerical laser-altimetry grid, not the CGI kit's aesthetic color image. Native 0.25-degree cells; source gridding is retained. No sub-cell geological detail. Lunar reference orientation is not a current-facing feature-location claim."
  },
  {
    "id": "mars-radial-height-v1",
    "body": "Mars",
    "path": "textures/terrain/mars-radial-height.u16.bin",
    "sha256": "821cbd539517b18b29da201d15d6ca01491ce1890b505dbf06892df76d8a3717",
    "bytes": 2073600,
    "width": 1440,
    "height": 720,
    "encoding": "uint16-little-endian",
    "nodata_code": 65535,
    "heightOffsetKm": -32.768,
    "heightScaleKm": 0.001,
    "quantity": "radial-height-from-reference-sphere",
    "referenceRadiusKm": 3396.0,
    "minHeightKm": -22.931,
    "maxHeightKm": 21.241,
    "minRadiusKm": 3373.069,
    "maxRadiusKm": 3417.241,
    "nativeDegreesPerTexel": 0.25,
    "nativeEquatorialKmPerTexel": 14.817845349431858,
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
    "source_url": "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/megr90n000cb.img",
    "source_sha256": "f03189d62bb882f81d4f1dd08537e56d42f3d0371747ce62c9f01db3f552834a",
    "source_bytes": 2073600,
    "source_retrieved_at": "2026-09-13",
    "metadata_urls": [
      "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html",
      "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/megr90n000cb.lbl",
      "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/megr90n000cb.xml"
    ],
    "metadata_sha256": {
      "megr90n000cb.lbl": "5b5887d828354542e92eb404c1b7c25371b2aedeeedf645a18da22efaf06a8a9",
      "megr90n000cb.xml": "18a41c681c7d418eca3be847f8b0b33bbb6f2bfe838b41c96f047c2e4540b332"
    },
    "observation_label": "MOLA 1997-2001 source interval; MEGR product 2.0 created 2003-04-03",
    "credits": "NASA Goddard / MGS MOLA Science Team / PDS Geosciences Node",
    "derivation": "prepare_terrain_reference.py v1; native samples retained; float kilometres (Moon) or signed big-endian integer metres (Mars) to little-endian unsigned integer metres with -32768m offset; round-half-up; no resampling; maximum quantization error 0.5m",
    "limitations": "Mean planetary radius, not height above areoid. IAU2000 planetocentric positive-east coordinates. Source team interpolates bins without measurements; about 55 percent of equatorial bins contain a shot. No local interpolation is claimed as newly observed geology."
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
  if(reference.bytes>4*1024*1024||!/^textures\/terrain\/[a-z0-9.-]+\.bin$/.test(reference.path)) throw new Error('Terrain asset exceeds byte budget or local path contract');
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

export function terrainSummary(body,status='deferred') {
  const reference=terrainReference(body);
  if(!reference)return 'Qualified numerical terrain unavailable for this body.';
  if(status==='unavailable')return `${reference.label} unavailable; smooth reference surface retained.`;
  if(status!=='ready')return `${reference.label}; relief loads when focused at a useful scale.`;
  return `${reference.label} · true-scale relief · 0.25° source cells. Archive topography; source date is separate from model time.`;
}
