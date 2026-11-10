import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeModules} from '../../tools/module_graph.mjs';
function fixture(t,files){const root=fs.mkdtempSync(path.join(os.tmpdir(),'sol-module-graph-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const [name,text]of Object.entries(files)){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}return root;}
test('static closure includes cycles and reexports, preserves URL identity and excludes dynamic imports',t=>{
  const root=fixture(t,{'app.js':`import './js/a.js?v=pinned'; import('./js/later.js'); // import './fake.js'
export * from './js/a.js?v=pinned'; const lookalike="import './absent.js'";`,
    'js/a.js':`export {x} from '../shared.js';`,'shared.js':`import './js/a.js?v=pinned';export const x=1;`,'js/later.js':'export default 1;'});
  const value=analyzeModules(root,['app.js?v=pinned']);
  assert.deepEqual(value.modules.map(item=>item.url),['app.js?v=pinned','js/a.js?v=pinned','shared.js']);
  assert.deepEqual(value.roots,['app.js?v=pinned']);
  const before=value.modules.find(item=>item.path==='shared.js').sha256;fs.appendFileSync(path.join(root,'shared.js'),'\n// change');
  assert.notEqual(analyzeModules(root,['app.js?v=pinned']).modules.find(item=>item.path==='shared.js').sha256,before);
});
for(const [label,statement,files,pattern]of [
  ['missing',"import './missing.js';",{},/missing/i],
  ['wrong case',"import './Shared.js';",{'shared.js':'export {};'},/case|missing/i],
  ['malformed',"import {",{},/syntax/i],
  ['escaped boundary',"import '../outside.js';",{},/boundary/i],
  ['encoded escape',"import './%2e%2e/outside.js';",{},/boundary|encoded/i],
  ['encoded separator',"import './js%2fshared.js';",{},/encoded/i],
  ['external',"import 'https://example.test/code.js';",{},/local|external/i],
  ['bare',"import 'package';",{},/local|bare/i],
  ['fragment',"import './shared.js#other';",{'shared.js':'export {};'},/identity/i],
  ['unsupported query',"import './shared.js?cache=1';",{'shared.js':'export {};'},/identity/i],
])test(`graph rejects ${label}`,t=>{const root=fixture(t,{'app.js':statement,...files});assert.throws(()=>analyzeModules(root,['app.js']),pattern);});
test('graph rejects symlinked source even when the target is local',t=>{
  const root=fixture(t,{'app.js':"import './linked.js';",'real.js':'export {};'});
  try{fs.symlinkSync(path.join(root,'real.js'),path.join(root,'linked.js'));}catch(error){if(error.code==='EPERM'){t.skip('Windows symlink privilege unavailable');return;}throw error;}
  assert.throws(()=>analyzeModules(root,['app.js']),/symlink/i);
});
