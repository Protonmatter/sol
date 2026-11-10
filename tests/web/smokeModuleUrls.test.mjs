import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {smokeModuleUrls} from '../../tools/smoke_module_urls.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sol-smoke-modules-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'js'));
  fs.writeFileSync(path.join(root,'app.js'),"import './js/store.js?v=core';const load=()=>import('./js/orrery.js?v=view');");
  fs.writeFileSync(path.join(root,'js/orrery.js'),"import './store.js?v=core';import './orreryTime.js?v=clock';import './moons.js?v=catalogue';");
  for(const name of ['store.js','orreryTime.js','moons.js'])fs.writeFileSync(path.join(root,'js',name),'export {};');
  return root;
}
test('smoke identities follow actual owning imports with distinct versions and no preloads',t=>{
  const root=fixture(t);
  assert.deepEqual(smokeModuleUrls(root),['js/store.js?v=core','js/orreryTime.js?v=clock','js/orrery.js?v=view','js/moons.js?v=catalogue']);
});
test('smoke parser ignores comments and string lookalikes',t=>{
  const root=fixture(t);fs.appendFileSync(path.join(root,'app.js'),`\n// import('./js/orrery.js?v=wrong');\nconst text="import('./js/orrery.js?v=also-wrong')";`);
  fs.appendFileSync(path.join(root,'js/orrery.js'),`\n// import './orreryTime.js?v=wrong';`);
  assert.equal(smokeModuleUrls(root)[1],'js/orreryTime.js?v=clock');
});
test('multiple System module identities cannot silently pick an instance',t=>{
  const root=fixture(t);fs.appendFileSync(path.join(root,'app.js'),"import('./js/orrery.js?v=other');");
  assert.throws(()=>smokeModuleUrls(root),/ambiguous/);
});
test('multiple clock module identities in the owner cannot silently pick an instance',t=>{
  const root=fixture(t);fs.appendFileSync(path.join(root,'js/orrery.js'),"import './orreryTime.js';");
  assert.throws(()=>smokeModuleUrls(root),/ambiguous/);
});
test('a missing required catalogue import is rejected',t=>{
  const root=fixture(t);const file=path.join(root,'js/orrery.js');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace("import './moons.js?v=catalogue';",''));
  assert.throws(()=>smokeModuleUrls(root),/Missing/);
});
test('external dynamic imports and malformed source fail admission',t=>{
  const root=fixture(t);const app=path.join(root,'app.js');const original=fs.readFileSync(app,'utf8');
  fs.writeFileSync(app,original+"import('https://example.invalid/orrery.js');");assert.throws(()=>smokeModuleUrls(root),/local relative/);
  fs.writeFileSync(app,'import {');assert.throws(()=>smokeModuleUrls(root),/syntax/);
});
