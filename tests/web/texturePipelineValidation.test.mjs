import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';

const moduleUrl = new URL('../../tools/texture_pipeline_validation.mjs', import.meta.url);
async function subject() {
  assert.ok(fs.existsSync(moduleUrl), 'The texture qualification tool must exist');
  return import(moduleUrl);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('payload accounting sums every NPOT mip and never calls it measured memory', async () => {
  const {texturePayloadEstimate} = await subject();
  assert.deepEqual(texturePayloadEstimate(5, 3, true), {
    basis: 'RGBA8 texel payload estimate; not observed VRAM or browser memory',
    width: 5, height: 3, bytes_per_texel: 4, mip_levels: 3,
    base_bytes: 60, mip_bytes: 12, total_bytes: 72,
  });
  assert.equal(texturePayloadEstimate(1, 8, true).total_bytes, 60);
  assert.equal(texturePayloadEstimate(5, 3, false).total_bytes, 60);
  for (const dimensions of [[0, 1], [1.5, 2], [NaN, 2], [Infinity, 2], [-1, 2], [Number.MAX_SAFE_INTEGER, 2]]) {
    assert.throws(() => texturePayloadEstimate(...dimensions, true), /dimension|safe/i);
  }
});

test('device projection preserves photo extent and refuses palette resampling', async () => {
  const {projectUploadDimensions} = await subject();
  assert.deepEqual(projectUploadDimensions([5400, 2700], 4096, false), [4096, 2048]);
  assert.deepEqual(projectUploadDimensions([5400, 2700], 8192, false), [5400, 2700]);
  assert.deepEqual(projectUploadDimensions([3, 9], 4, false), [1, 4]);
  assert.throws(() => projectUploadDimensions([5400, 2700], 4096, true), /palette/i);
  assert.throws(() => projectUploadDimensions([3, 9], 0, false), /limit/i);
});

test('filter fixtures retain exact gray, alpha/no-data, and distinct palette texels', async () => {
  const {createTextureFixtures} = await subject();
  const fixtures = createTextureFixtures();
  const read = id => PNG.sync.read(fixtures.find(f => f.id === id).bytes);
  assert.deepEqual([...read('gray-step').data], [0,0,0,255,255,255,255,255]);
  assert.deepEqual([...read('alpha-edge').data], [64,128,224,255,255,0,255,0]);
  assert.deepEqual([...read('palette').data], [20,100,220,255,240,40,60,255]);
  assert.deepEqual([...read('gray-checker').data], [0,0,0,255,255,255,255,255,255,255,255,255,0,0,0,255]);
  assert.deepEqual(fixtures.map(f => [f.id, hash(f.bytes)]), createTextureFixtures().map(f => [f.id, hash(f.bytes)]));
});

function staged(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sol-texture-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const namespace = 'releases/local-fixture';
  const files = new Map([
    [`${namespace}/app.js`, 'export const fixture = true;\n'],
    [`${namespace}/js/orrery.js`, 'function makeTexture(img, repeatS, nearest = false, premultiplyAlpha = false) {\n  return img;\n}\n'],
    [`${namespace}/js/referenceDemand.js`, 'export const MAX_REFERENCE_TEXTURES = 8;\nexport const MAX_REFERENCE_REQUESTS = 2;\n'],
    [`${namespace}/textures/map.png`, PNG.sync.write(new PNG({width:2,height:1}))],
  ]);
  const image = files.get(`${namespace}/textures/map.png`);
  files.set(`${namespace}/visual-assets.v1.json`, JSON.stringify({schema_version:'visual-assets.v1', mapped_references:[{
    id:'fixture-map',body:'Earth',role:'surface',path:'textures/map.png',sha256:hash(image),bytes:image.length,
    dimensions:[2,1],nodata:'none',color_interpretation:'Synthetic test only',source_sha256:hash(image),
  }]}));
  const assets = [...files].map(([relative, bytes]) => {
    const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, bytes);
    return {path:relative,size:Buffer.byteLength(bytes),sha256:hash(bytes)};
  });
  const manifest = {schema_version:'web-release-manifest.v1',namespace,base_path:'/',source_sha:'a'.repeat(40),assets};
  const writeManifest = () => fs.writeFileSync(path.join(root, 'web-release-manifest.json'), JSON.stringify(manifest));
  writeManifest();
  return {root, manifest, writeManifest};
}

test('staged inventory binds encoded bytes, source dimensions and renderer identity', async t => {
  const {readTextureStage} = await subject();
  const s = staged(t), result = readTextureStage(s.root);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].id, 'fixture-map');
  assert.deepEqual(result.assets[0].dimensions, [2,1]);
  assert.match(result.renderer_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.cache_policy.ready_capacity, 8);
  assert.equal(result.cache_policy.concurrent_requests, 2);
  assert.equal(result.assets[0].size_verified, true);
});

test('release namespace accepts the staging contract trailing slash without changing asset identity', async t => {
  const {readTextureStage}=await subject(),s=staged(t);
  s.manifest.namespace+='/' ;s.writeManifest();
  const result=readTextureStage(s.root);
  assert.equal(result.namespace,'releases/local-fixture');
  assert.equal(result.assets[0].id,'fixture-map');
});

test('staged inventory rejects tampered renderer or image bytes before any browser launch', async t => {
  const {readTextureStage} = await subject();
  const s = staged(t);
  fs.appendFileSync(path.join(s.root,s.manifest.namespace,'js/orrery.js'), '// unexpected');
  assert.throws(() => readTextureStage(s.root), /size|hash/i);
});

test('staged application observation rejects a changed non-texture application file', async t => {
  const {readTextureStage} = await subject();
  const s=staged(t);
  fs.appendFileSync(path.join(s.root,s.manifest.namespace,'app.js'),'// drift');
  assert.throws(()=>readTextureStage(s.root),/size|hash/i);
});

test('staged inventory rejects traversal, unlisted files and ambiguous namespace', async t => {
  const {readTextureStage} = await subject();
  const s = staged(t);
  s.manifest.assets.push({path:'../outside',size:1,sha256:'a'.repeat(64)});s.writeManifest();
  assert.throws(() => readTextureStage(s.root), /path|escape/i);
  s.manifest.assets.pop();s.manifest.assets=s.manifest.assets.filter(a=>!a.path.endsWith('/js/orrery.js'));s.writeManifest();
  assert.throws(() => readTextureStage(s.root), /absent|listed/i);
  s.manifest.namespace = '../escape';s.writeManifest();
  assert.throws(() => readTextureStage(s.root), /namespace|path|escape/i);
});

test('timing summary preserves cold/warm phase and treats completion failure as unavailable', async () => {
  const {summarizeTextureSamples} = await subject();
  const sample = (phase,value) => ({id:'a',phase,decode_api_ms:value,upload_api_ms:value*2,mipmap_api_ms:0,
    completion:{status:'signaled',wait_wall_ms:value*3},error:null});
  const summary = summarizeTextureSamples([sample('cold-browser-cache',2),sample('warm-browser-cache',1),
    {...sample('cold-browser-cache',3),completion:{status:'timeout',wait_wall_ms:20}}]);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].phase,'cold-browser-cache');
  assert.equal(summary[0].successful_samples,1);
  assert.equal(summary[0].failed_samples,1);
  assert.equal(summary[0].decode_api_ms.median,2);
  assert.equal(summary[1].decode_api_ms.median,1);
  assert.throws(() => summarizeTextureSamples([sample('warm-browser-cache',NaN)]), /finite|timing/i);
  assert.throws(() => summarizeTextureSamples([{...sample('warm-browser-cache',1),completion:{status:'signaled',wait_wall_ms:NaN}}]), /finite|timing/i);
});

test('inventory-only qualification writes bound evidence without loading a browser', async t => {
  const {runTextureQualification} = await subject();
  const s=staged(t),out=path.join(s.root,'output');
  const result=await runTextureQualification({webRoot:s.root,out,inventoryOnly:true,browserPath:'missing-browser-must-not-launch'});
  assert.equal(result.status,'inventory-only');assert.deepEqual(result.samples,[]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'evidence.json'),'utf8')).assets[0].size_verified,true);
});

test('a new qualification attempt refuses to overwrite an earlier evidence receipt', async t => {
  const {runTextureQualification}=await subject(),s=staged(t),out=path.join(s.root,'retained');
  await runTextureQualification({webRoot:s.root,out,inventoryOnly:true});
  const file=path.join(out,'evidence.json'),before=fs.readFileSync(file);
  await assert.rejects(runTextureQualification({webRoot:s.root,out,inventoryOnly:true}),/exist|receipt|output/i);
  assert.deepEqual(fs.readFileSync(file),before);
});

test('diagnostic startup continuation cannot turn a failed original deadline into success', async () => {
  const {observeTextureStartup}=await subject(),calls=[],checkpoints=[];
  const result=await observeTextureStartup(async timeout=>{
    calls.push(timeout);if(calls.length===1)throw Object.assign(new Error('startup timeout'),{name:'TimeoutError'});
  },gate=>checkpoints.push(gate));
  assert.deepEqual(calls,[30000,15000]);assert.equal(result.status,'failed');
  assert.equal(result.timeout_ms,30000);assert.equal(checkpoints[0].status,'failed');
  const success=await observeTextureStartup(async timeout=>assert.equal(timeout,30000));
  assert.equal(success.status,'passed');
  await assert.rejects(observeTextureStartup(async()=>{throw new Error('page detached');}),/detached/);
  await assert.rejects(observeTextureStartup(async()=>{throw Object.assign(new Error('still blocked'),{name:'TimeoutError'});}),/still blocked/);
});

test('application startup requires ready base graphics and cannot pass on ephemeris bodies alone',async()=>{
  const {textureSceneReady}=await subject(),bodies=Array(9).fill({});
  assert.equal(textureSceneReady({bodies,backend:'',engineError:''}),false);
  assert.equal(textureSceneReady({bodies,backend:'WebGL2',programStatus:{base:'loading'}}),false);
  assert.equal(textureSceneReady({bodies,backend:'WebGL2',programStatus:{base:'unavailable'}}),false);
  assert.equal(textureSceneReady({bodies,backend:'WebGL2',programStatus:{base:'ready'}}),true);
  assert.equal(textureSceneReady({bodies,backend:'WebGL2'}),true,'immutable legacy stages use their actual backend admission');
  assert.equal(textureSceneReady({bodies:[],backend:'WebGL2',programStatus:{base:'ready'}}),false);
  assert.equal(textureSceneReady({engineError:'graphics failed'}),true,'failure stops waiting and is rejected by application snapshot validation');
});
