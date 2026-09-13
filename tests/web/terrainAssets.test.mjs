import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {terrainReference,terrainReferences,loadTerrainReference,decodeTerrain,terrainSummary} from '../../apps/web/js/terrainAssets.js';
import {sampleTerrainHeight} from '../../apps/web/js/terrainGeometry.js';
const root = new URL('../../apps/web/',import.meta.url);

test('runtime references exactly match the source-qualified terrain manifest',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('terrain-assets.v1.json',root),'utf8'));
  assert.equal(manifest.schema_version,'terrain-assets.v1');
  assert.deepEqual(terrainReferences(),manifest.references);
  assert.equal(terrainReference('Venus'),null);
  assert.equal(terrainReference('Jupiter'),null);
  assert.throws(()=>{terrainReference('Moon').sha256='0'.repeat(64);},TypeError);
  for(const ref of terrainReferences()) {
    assert.equal(ref.quantity,'radial-height-from-reference-sphere');
    assert.match(ref.source_sha256,/^[0-9a-f]{64}$/);
    assert.match(ref.observation_label,/199|200|201/);
    assert.equal(ref.mapping.latitudeType,'planetocentric');
    assert.equal(ref.mapping.longitudeDirection,'east');
  }
});
test('decoded-byte cap cancels oversized streams even with no content length',async()=>{
  let cancelled=false;
  const ref=terrainReference('Moon');
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(ref.bytes+1));},cancel(){cancelled=true;}});
  await assert.rejects(loadTerrainReference('Moon',{fetcher:async()=>new Response(stream)}),/size|budget/i);
  assert.equal(cancelled,true);
});
test('compressed transfer length does not replace decoded asset size or byte hash',async()=>{
  const ref=terrainReference('Moon'),raw=await fs.readFile(new URL(ref.path,root));
  const loaded=await loadTerrainReference('Moon',{fetcher:async()=>new Response(raw,{headers:{'content-encoding':'gzip','content-length':'40000'}})});
  assert.equal(loaded.reference.id,ref.id);
});
test('committed numeric terrain assets match hashes, byte dimensions, and radius range',async()=>{
  for(const ref of terrainReferences()) {
    const raw=await fs.readFile(new URL(ref.path,root));
    assert.equal(createHash('sha256').update(raw).digest('hex'),ref.sha256);
    assert.equal(raw.byteLength,ref.width*ref.height*2);
    const decoded=decodeTerrain(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),ref);
    assert.equal(decoded.heightsKm.length,ref.width*ref.height);
    assert.ok(decoded.heightsKm.every(x=>Number.isFinite(x)&&Math.abs(x)<33));
    assert.ok(decoded.heightsKm.some(x=>x<0));
    assert.ok(decoded.heightsKm.some(x=>x>0));
  }
});
test('loader rejects corrupted bytes and truncated assets before publishing geometry',async()=>{
  const ref=terrainReference('Moon');
  const raw=await fs.readFile(new URL(ref.path,root));
  const corrupt=Uint8Array.from(raw);corrupt[0]^=1;
  await assert.rejects(loadTerrainReference('Moon',{fetcher:async()=>new Response(corrupt)}),/SHA-256|hash/i);
  await assert.rejects(loadTerrainReference('Moon',{fetcher:async()=>new Response(raw.subarray(1))}),/size|byte/i);
  assert.throws(()=>decodeTerrain(new ArrayBuffer(2),ref),/size|byte/i);
});
test('loader only requests the selected body and preserves status/source limits',async()=>{
  const calls=[];
  const loaded=await loadTerrainReference('Mars',{fetcher:async(url)=>{
    calls.push(String(url));
    return new Response(await fs.readFile(url));
  }});
  assert.equal(loaded.reference.body,'Mars');
  assert.equal(calls.length,1);
  assert.equal(await loadTerrainReference('Jupiter',{fetcher:()=>{throw new Error('must not fetch');}}),null);
  assert.match(terrainSummary('Moon','ready'),/LOLA|LRO/);
  assert.match(terrainSummary('Mars','unavailable'),/unavailable/i);
  assert.match(terrainSummary('Jupiter','ready'),/unavailable|qualified/i);
});
test('MOLA landmarks retain their hemisphere and planetary-radius datum',async()=>{
  const ref=terrainReference('Mars'),raw=await fs.readFile(new URL(ref.path,root));
  const g=decodeTerrain(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),ref);
  // Broad morphology assertions catch a 180-degree roll, north/south flip, or areoid-height import.
  assert.ok(sampleTerrainHeight(g,226.2,18.65)>15,'Olympus Mons is elevated in the northwest');
  assert.ok(sampleTerrainHeight(g,70,-42)<-10,'Hellas is below the 3396km reference sphere');
  assert.ok(sampleTerrainHeight(g,0,89.8)<-15,'MOLA radius retains polar flattening');
});
