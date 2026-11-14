import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('diagnostic imports use the current canonical release identity and retain historical tokens',async()=>{
 const file=new URL('../../tools/release_module_urls.mjs',import.meta.url);
 assert.ok(fs.existsSync(file),'shared release identity helper must exist');
 const {releaseModulePath}=await import(file);
 const manifest={namespace:'releases/test/',release_id:'test',assets:[{path:'releases/test/js/store.js'}]};
 assert.equal(releaseModulePath(manifest,'js/store.js'),'js/store.js?v=test');
 manifest.assets.push({path:'releases/test/web-build.v1.json'});
 assert.equal(releaseModulePath(manifest,'js/store.js'),'js/store.js');
 assert.throws(()=>releaseModulePath(manifest,'js/missing.js'),/missing/);
 assert.throws(()=>releaseModulePath(manifest,'../store.js'),/invalid/);
});
test('source provenance includes inlined originals and rejects conflicting copy ownership',async()=>{
 const {releaseSourceIdentities}=await import('../../tools/release_module_urls.mjs');
 assert.equal(typeof releaseSourceIdentities,'function');
 const manifest={namespace:'releases/new/',assets:[{path:'releases/new/app.js',source_path:'apps/web/app.js',source_sha256:'a'},{path:'releases/old/old.js',source_path:'apps/web/old.js',source_sha256:'b'}]};
 const build={schema_version:'web-build.v1',sources:{'apps/web/js/private.js':'c','apps/web/app.js':'a'}};
 assert.deepEqual(releaseSourceIdentities(manifest,build),{'apps/web/app.js':'a','apps/web/js/private.js':'c'});
 assert.throws(()=>releaseSourceIdentities(manifest,{...build,sources:{'apps/web/app.js':'wrong'}}),/conflict/);
});
