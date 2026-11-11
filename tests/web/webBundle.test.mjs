import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeModules} from '../../tools/module_graph.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sol-bundle-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'project','apps','web'),stage=path.join(root,'stage');
 const files={
  'app.js':"import {state} from './js/store.js';export const lazy=()=>import('./js/view.js');export {state};",
  'engine.js':"export const wasm=new URL('./pkg/engine.wasm?v=old',import.meta.url).href;",
  'js/store.js':'export const state={count:0};',
  'js/view.js':"import {state} from './store.js';import {next} from './private.js';export function render(){state.count=next(state.count);return state.count;}export const load=()=>import('./moonelements.js');export const worker=()=>new Worker(new URL('./worker.js',import.meta.url),{type:'module'});",
  'js/private.js':'export function next(value){return value+1;}\nexport const asset=new URL("../data/fixture.json",import.meta.url).href;',
  'js/worker.js':"import {next} from './private.js';import {wasm} from '../engine.js';self.onmessage=()=>postMessage([next(2),wasm]);",
  'js/moonelements.js':'export const moons=[1,2,3];',
 };
 for(const [name,value]of Object.entries(files)){const target=path.join(source,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);}
 fs.cpSync(source,stage,{recursive:true});
 return {root,source,stage,files};
}
test('bundler keeps startup, catalogue, workers and assets canonical while combining private modules',async t=>{
 const {bundleWeb}=await import('../../tools/bundle_web.mjs');const f=fixture(t);
 const result=await bundleWeb({sourceRoot:f.source,stageRoot:f.stage,roots:['app.js'],qaEntries:['js/view.js'],releaseId:'fixture'});
 assert.equal(fs.readFileSync(path.join(f.stage,'app.js'),'utf8'),f.files['app.js']);
 assert.deepEqual(analyzeModules(f.stage,['app.js']).modules.map(m=>m.path),['app.js','js/store.js']);
 assert.ok(!fs.existsSync(path.join(f.stage,'js/private.js')),'no second original copy of an inlined module');
 assert.ok(fs.existsSync(path.join(f.stage,'js/worker.js')),'worker retains its stable URL');
 assert.equal(fs.readFileSync(path.join(f.stage,'js/moonelements.js'),'utf8'),f.files['js/moonelements.js']);
 assert.equal(fs.readFileSync(path.join(f.stage,'engine.js'),'utf8'),f.files['engine.js']);
 const complete=analyzeModules(f.stage,['app.js'],{includeDeferred:true});assert.ok(complete.modules.length>2);
 assert.ok(result.outputs.every(item=>item.path.startsWith('js/')));
 assert.ok(!result.outputs.some(item=>item.inputs.includes('apps/web/js/moonelements.js')));
 const privateOutput=result.outputs.find(item=>item.inputs.includes('apps/web/js/private.js'));assert.ok(privateOutput);
 const map=JSON.parse(fs.readFileSync(path.join(f.stage,privateOutput.map),'utf8'));
 const index=map.sources.indexOf('apps/web/js/private.js');assert.ok(index>=0);assert.equal(map.sourcesContent[index],f.files['js/private.js']);
 assert.equal(result.sources['apps/web/js/private.js'],hash(f.files['js/private.js']));
 const stage2=path.join(f.root,'different-stage');fs.cpSync(f.source,stage2,{recursive:true});
 assert.deepEqual(await bundleWeb({sourceRoot:f.source,stageRoot:stage2,roots:['app.js'],qaEntries:['js/view.js'],releaseId:'fixture'}),result);
 for(const file of result.outputs.flatMap(item=>[item.path,item.map]))assert.deepEqual(fs.readFileSync(path.join(f.stage,file)),fs.readFileSync(path.join(stage2,file)));
 fs.writeFileSync(path.join(f.stage,'package.json'),'{"type":"module"}');
 const app=await import(new URL('file://'+path.join(f.stage,'app.js')));const view=await app.lazy();
 assert.equal(view.render(),1);assert.equal(app.state.count,1,'same original store instance across output boundary');
});
test('bundler rejects a statically required optional catalogue',async t=>{
 const {bundleWeb}=await import('../../tools/bundle_web.mjs');const f=fixture(t);
 fs.appendFileSync(path.join(f.source,'js/view.js'),"\nimport './moonelements.js';");
 await assert.rejects(bundleWeb({sourceRoot:f.source,stageRoot:f.stage,roots:['app.js'],qaEntries:[],releaseId:'fixture'}),/optional.*static/i);
});

test('actual bundled V8 execution maps to captured original lines and rejects corrupted evidence',async t=>{
 const scope=await import('../../tools/js_coverage_scope.mjs');
 assert.equal(typeof scope.bundleCoverageEntry,'function','coverage must consume compiled outputs');
 const {bundleWeb}=await import('../../tools/bundle_web.mjs');const f=fixture(t);
 fs.appendFileSync(path.join(f.source,'js/private.js'),'\nexport function uncalled(){\n  return 93817;\n}\n');
 const descriptor=await bundleWeb({sourceRoot:f.source,stageRoot:f.stage,roots:['app.js'],qaEntries:['js/view.js']});
 const manifest={namespace:'',assets:[...descriptor.outputs.flatMap(output=>[output.path,output.map]),'web-build.v1.json'].map(name=>({path:name,sha256:hash(fs.readFileSync(path.join(f.stage,name)))}))};
 const declared=scope.readBundleCoverage(f.stage,manifest,{repositoryRoot:path.join(f.root,'project')});
 fs.writeFileSync(path.join(f.stage,'package.json'),'{"type":"module"}');
 const {Session}=await import('node:inspector/promises');const session=new Session();session.connect();
 let scripts;
 try{
  await session.post('Profiler.enable');await session.post('Profiler.startPreciseCoverage',{callCount:true,detailed:true});
  const view=await import(new URL('file://'+path.join(f.stage,'js/view.js')));assert.equal(view.render(),1);
  scripts=(await session.post('Profiler.takePreciseCoverage')).result;
 }finally{session.disconnect();}
 const collected={};
 for(const script of scripts){
  if(!script.url.startsWith('file://'))continue;
  const local=new URL(script.url).pathname,record=declared.get(local);if(!record)continue;
  Object.assign(collected,await scope.bundleCoverageEntry({text:fs.readFileSync(local,'utf8'),rawScriptCoverage:script},record));
 }
 const privateSource=path.join(f.source,'js/private.js');assert.ok(collected[privateSource]);
 assert.ok(Object.values(collected[privateSource].s).some(count=>count>0),'executed original private function receives a real hit');
 const absentLine=fs.readFileSync(privateSource,'utf8').split('\n').findIndex(line=>line.includes('93817'))+1;
 const absent=Object.entries(collected[privateSource].statementMap).filter(([,location])=>location.start.line===absentLine);
 assert.ok(absent.length);assert.ok(absent.every(([id])=>collected[privateSource].s[id]===0),'unexecuted original code remains zero after mapping');
 const output=descriptor.outputs.find(item=>item.inputs.includes('apps/web/js/private.js'));
 const local=path.join(f.stage,output.path),record=declared.get(local),text=fs.readFileSync(local,'utf8');
 await assert.rejects(scope.bundleCoverageEntry({text:text+'foreign();',rawScriptCoverage:{functions:[]}},record),/identity/);
 fs.appendFileSync(path.join(f.stage,output.map),' ');
 assert.throws(()=>scope.readBundleCoverage(f.stage,manifest,{repositoryRoot:path.join(f.root,'project')}),/hash/);
});
test('QA facade aggregation reduces view requests and preserves live exported bindings',async t=>{
 const {bundleWeb}=await import('../../tools/bundle_web.mjs');const f=fixture(t);
 for(const name of ['qaA','qaB','qaC'])fs.writeFileSync(path.join(f.source,'js',name+'.js'),'export let value=1;export function update(next){value=next;}');
 fs.appendFileSync(path.join(f.source,'js/view.js'),"\nimport {value as a} from './qaA.js';import {value as b} from './qaB.js';import {value as c} from './qaC.js';export const total=()=>a+b+c;");
 fs.cpSync(f.source,f.stage,{recursive:true});
 const descriptor=await bundleWeb({sourceRoot:f.source,stageRoot:f.stage,roots:['app.js'],qaEntries:['js/view.js','js/qaA.js','js/qaB.js','js/qaC.js']});
 const graph=analyzeModules(f.stage,['js/view.js']);
 assert.ok(graph.modules.length<=4,'shared diagnostic exports must not fragment one chunk per public module');
 assert.ok(!graph.modules.some(module=>module.path==='js/_diagnostics.js'),'application never loads the diagnostic aggregate');
 fs.writeFileSync(path.join(f.stage,'package.json'),'{"type":"module"}');
 const view=await import(new URL('file://'+path.join(f.stage,'js/view.js'))),qa=await import(new URL('file://'+path.join(f.stage,'js/qaA.js')));
 assert.equal(view.total(),3);qa.update(5);assert.equal(qa.value,5);assert.equal(view.total(),7,'facade retains live bindings to the same compiled owner');
 const facade=descriptor.outputs.find(item=>item.path==='js/qaA.js');assert.deepEqual(facade.inputs,[]);
});
test('view owners cannot silently opt out of release bundling',async t=>{
 const {bundleWeb}=await import('../../tools/bundle_web.mjs');const f=fixture(t);
 fs.writeFileSync(path.join(f.source,'js/orrery.js'),'export const texture="./surface.jpg?v=old";');
 fs.appendFileSync(path.join(f.source,'app.js'),"\nexport const system=()=>import('./js/orrery.js');");
 fs.cpSync(f.source,f.stage,{recursive:true});
 await assert.rejects(bundleWeb({sourceRoot:f.source,stageRoot:f.stage,roots:['app.js'],qaEntries:[]}),/view.*bundle/i);
});
