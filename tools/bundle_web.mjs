// Immutable release compiler. Startup modules and stamp-bearing modules keep
// their original directory; deferred view implementations share ESM chunks.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as esbuild from 'esbuild';
import ts from 'typescript';
import {analyzeModules,moduleEdges,resolveModule,compilerGeneratedModuleKind,moduleDependencies} from './module_graph.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const BUILD_DESCRIPTOR='web-build.v1.json';
export const ESBUILD_VERSION='0.28.2';
export const OPTIONAL_MODULES=new Set(['js/moonelements.js','js/starcatalog.js']);
// Public diagnostic entry points are real compiled exports. Their implementation
// is shared with view code, so importing one cannot create a second state owner.
export const QA_ENTRIES=[
 'atmosphereColumnField','atmosphereColumnManifest','atmosphereIncident','atmosphereIncidentManifest',
 'atmosphereOptics','atmosphereScattering','atmosphereShaders','bodyData','constellations','data',
 'destinationOverview','earthLookShaders','ephemerisContract','ephemerisSchema','explorer','galacticobjects','geography',
 'hdrPresentation','moonelements','moonorbits','moons','moonshadows','orbitCamera','orrery','orreryMath',
 'orreryShaders','orreryTime','physicalProgramSources','planetAppearance','planetPhenomena','planetPhenomenaManifest',
 'referenceDemand','releaseClient','ringTransportShaders','shaderPrograms','sky','skyEngine','skyPrivacy',
 'skyWorker','solarAppearance','solarAppearanceManifest','solarSchema','solarVolumeShaders','solarWorker',
 'starDetail','starcatalog','store','sunLook','sunLookRenderer','surfaceMapping','surfaceReflectionShaders',
 'systemWorker','terrain.worker','terrainAssets','terrainGeometry','terrainShadowShaders','view','visualAssetManifest','wavelength',
].map(name=>'js/'+name+'.js');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Resolve each public diagnostic alias to the chunk that owns its binding, so a
// facade loads only its own implementation closure rather than the aggregate's.
// Aliases defined in the aggregate itself keep importing the aggregate.
function diagnosticAliasOwners(text){
 const source=ts.createSourceFile('_diagnostics.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 if(source.parseDiagnostics.length)throw new Error('Unparseable compiler diagnostic aggregate');
 const imported=new Map(),owners=new Map();
 for(const node of source.statements){
  if(ts.isImportDeclaration(node)&&node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)&&!node.importClause.name){
   const from=node.moduleSpecifier.text;
   for(const item of node.importClause.namedBindings.elements)imported.set(item.name.text,{from,name:(item.propertyName||item.name).text});
  }
 }
 for(const node of source.statements){
  if(!ts.isExportDeclaration(node)||!node.exportClause||!ts.isNamedExports(node.exportClause))continue;
  for(const item of node.exportClause.elements){
   const local=(item.propertyName||item.name).text,alias=item.name.text;
   if(node.moduleSpecifier)owners.set(alias,{from:node.moduleSpecifier.text,name:local});
   else if(imported.has(local))owners.set(alias,imported.get(local));
  }
 }
 return owners;
}
const sorted=values=>[...values].sort();
function javascriptFiles(root){
 const result=[];
 function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw new Error('Symlink build input');
  const file=path.join(folder,entry.name);
  if(entry.isDirectory())walk(file);else if(entry.isFile()&&entry.name.endsWith('.js'))result.push(path.relative(root,file).split(path.sep).join('/'));
 }}
 for(const name of ['app.js','engine.js'])if(fs.existsSync(path.join(root,name)))result.push(name);
 if(fs.existsSync(path.join(root,'js')))walk(path.join(root,'js'));
 return result.sort();
}
export async function bundleWeb({sourceRoot,stageRoot,roots,qaEntries=QA_ENTRIES}){
 if(esbuild.version!==ESBUILD_VERSION)throw new Error('Pinned esbuild version required');
 sourceRoot=path.resolve(sourceRoot);stageRoot=path.resolve(stageRoot);
 if(sourceRoot===stageRoot||stageRoot.startsWith(sourceRoot+path.sep))throw new Error('Build output must be disjoint from source');
 const names=javascriptFiles(sourceRoot),raw=new Map(names.map(name=>[name,fs.readFileSync(path.join(sourceRoot,name),'utf8')]));
 const graph=analyzeModules(sourceRoot,sorted(new Set([...roots,...names])),{includeDeferred:true});
 if(graph.modules.some(item=>item.url!==item.path))throw new Error('Current release module imports must use query-free canonical identities');
 const startup=analyzeModules(sourceRoot,roots);
 const retained=new Set(startup.modules.map(item=>item.path));
 for(const name of names){
  if(!name.startsWith('js/')||OPTIONAL_MODULES.has(name)||/__SOL_(?:RELEASE_ID|RELEASE_NAMESPACE|BASE_PATH)__|\?v=[0-9a-zA-Z._-]+/.test(raw.get(name)))retained.add(name);
 }
 for(const name of ['js/research.js','js/sky.js','js/orrery.js'])if(retained.has(name))throw new Error('View entry must remain bundleable; move release stamps to a small boundary module: '+name);
 const entries=new Set(qaEntries.filter(name=>raw.has(name))),required=new Set();
 for(const name of names){
  const edges=moduleEdges(raw.get(name),name);
  for(const specifier of edges.static){
   const target=resolveModule(specifier,name).path;
   if(OPTIONAL_MODULES.has(target))throw new Error('Optional catalogue cannot be a static dependency: '+target);
   if(retained.has(name))required.add(target);
  }
  for(const specifier of [...edges.dynamic,...edges.workers])required.add(resolveModule(specifier,name).path);
 }
 for(const name of required)entries.add(name);
 for(const name of retained){entries.delete(name);required.delete(name);}
 const entryPoints=Object.fromEntries(sorted(entries).map(name=>[name.slice(3,-3),path.join(sourceRoot,name)]));
 let diagnosticSource=null;
 const compile=entryPoints=>esbuild.build({
  absWorkingDir:sourceRoot,entryPoints,bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',
  outdir:path.join(stageRoot,'js'),entryNames:'[dir]/[name]',chunkNames:'shared-[hash]',sourcemap:'external',sourcesContent:true,
  // Preserve executable original lines for the source-based coverage denominator.
  // Dead-code elimination otherwise leaves unmapped originals with converter defaults.
  treeShaking:false,minify:false,charset:'utf8',legalComments:'inline',metafile:true,write:false,logLevel:'silent',
  plugins:[{name:'canonical-retained-modules',setup(build){
   build.onResolve({filter:/^sol-diagnostic:/},()=>({path:'exports',namespace:'sol-diagnostic'}));
   build.onLoad({filter:/.*/,namespace:'sol-diagnostic'},()=>({contents:diagnosticSource,loader:'js',resolveDir:sourceRoot}));
   build.onResolve({filter:/^\.{1,2}\//},args=>{
    const absolute=path.resolve(args.resolveDir,args.path);
    const name=path.relative(sourceRoot,absolute).split(path.sep).join('/');
    if(retained.has(name))return {path:name.startsWith('js/')?'./'+name.slice(3):'../'+name,external:true};
   });
   build.onLoad({filter:/\.js$/},args=>{
    const name=path.relative(sourceRoot,args.path).split(path.sep).join('/');
    if(!raw.has(name))throw new Error('Undeclared compiler source: '+name);
    return {contents:raw.get(name),loader:'js',resolveDir:path.dirname(args.path)};
   });
  }}],
 });
 let result=entries.size?await compile(entryPoints):{outputFiles:[],metafile:{inputs:{},outputs:{}}};
 const diagnosticEntries=sorted(entries).filter(name=>!required.has(name));
 const facades=new Map();
 if(diagnosticEntries.length){
  if(raw.has('js/_diagnostics.js'))throw new Error('Reserved compiler diagnostic entry collision');
  const publicExports=new Map(Object.values(result.metafile.outputs).filter(output=>output.entryPoint).map(output=>[output.entryPoint,output.exports]));
  const statements=[];
  for(const [index,name]of diagnosticEntries.entries()){
   const exports=publicExports.get(name);
   if(!exports)throw new Error('Missing diagnostic module export inventory: '+name);
   const aliases=exports.map((exported,number)=>({exported,alias:`q${index}_${number}`}));
   statements.push(aliases.length?`export {${aliases.map(item=>`${item.exported} as ${item.alias}`).join(',')}} from './${name}';`:`import './${name}';`);
   facades.set(name,aliases);
  }
  diagnosticSource=statements.join('\n');
  const grouped=Object.fromEntries(sorted(required).map(name=>[name.slice(3,-3),path.join(sourceRoot,name)]));
  grouped._diagnostics='sol-diagnostic:exports';
  result=await compile(grouped);
 }

 const outputs=[],outputBytes=new Map();
 for(const file of result.outputFiles){
  const name=path.relative(stageRoot,file.path).split(path.sep).join('/');
  if(!name.startsWith('js/')||name.includes('/../'))throw new Error('Compiler output escaped js directory');
  if(name.endsWith('.map')){
   const map=JSON.parse(file.text);
   map.sources=map.sources.map((source,index)=>{
    const original=path.relative(sourceRoot,path.resolve(path.dirname(file.path),source)).split(path.sep).join('/');
    if(!raw.has(original)||map.sourcesContent[index]!==raw.get(original))throw new Error('Compiler sourcemap source differs from captured input');
    return 'apps/web/'+original;
   });
   outputBytes.set(name,Buffer.from(JSON.stringify(map)+'\n'));
  }else outputBytes.set(name,file.contents);
 }
 for(const [name,record]of Object.entries(result.metafile.outputs)){
  if(!name.endsWith('.js'))continue;
  const output=path.relative(stageRoot,path.resolve(sourceRoot,name)).split(path.sep).join('/');
  const inputs=sorted(Object.keys(record.inputs).filter(name=>name!=='sol-diagnostic:exports').map(name=>'apps/web/'+name));
  const mapping=JSON.parse(Buffer.from(outputBytes.get(output+'.map')).toString('utf8'));
  if(!mapping.sources.length&&!compilerGeneratedModuleKind(Buffer.from(outputBytes.get(output)).toString('utf8'),output))throw new Error('Unmapped executable compiler output requires explicit review: '+output);
  if(inputs.some(name=>OPTIONAL_MODULES.has(name.slice('apps/web/'.length))))throw new Error('Optional catalogue leaked into compiled output');
  outputs.push({path:output,map:output+'.map',sha256:hash(outputBytes.get(output)),map_sha256:hash(outputBytes.get(output+'.map')),inputs});
 }
 const aggregate=outputBytes.get('js/_diagnostics.js');
 const owners=aggregate?diagnosticAliasOwners(Buffer.from(aggregate).toString('utf8')):new Map();
 for(const [name,aliases]of facades){
  let code="import './_diagnostics.js';\n";
  if(aliases.length){
   const groups=new Map();
   for(const {alias,exported}of aliases){
    const owner=owners.get(alias)||{from:'./_diagnostics.js',name:alias};
    if(!/^\.\/(?:shared-[A-Z0-9]+|_diagnostics)\.js$/.test(owner.from))throw new Error('Unexpected diagnostic owner module: '+owner.from);
    if(!groups.has(owner.from))groups.set(owner.from,[]);
    groups.get(owner.from).push(owner.name===exported?exported:`${owner.name} as ${exported}`);
   }
   code=[...groups].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([from,items])=>`export {${items.join(',')}} from '${from}';`).join('\n')+'\n';
  }
  const map=JSON.stringify({version:3,sources:[],sourcesContent:[],names:[],mappings:''})+'\n';
  outputBytes.set(name,Buffer.from(code));outputBytes.set(name+'.map',Buffer.from(map));
  outputs.push({path:name,map:name+'.map',sha256:hash(code),map_sha256:hash(map),inputs:[]});
 }
 // Remove every inlined original before publishing output, including private
 // files. Stable entry URLs are replaced with their actual compiled exports.
 for(const name of Object.keys(result.metafile.inputs).filter(name=>name!=='sol-diagnostic:exports'))fs.rmSync(path.join(stageRoot,name),{force:true});
 for(const [name,bytes]of outputBytes){const file=path.join(stageRoot,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 for(const [name,text]of raw)if(fs.readFileSync(path.join(sourceRoot,name),'utf8')!==text)throw new Error('Compiler source changed during build');
 const recovery=moduleDependencies(stageRoot,sorted(new Set([...roots,...entries,...retained])));
 fs.writeFileSync(path.join(stageRoot,'module-dependencies.v1.json'),JSON.stringify(recovery,null,2)+'\n');
 const stagedStartup=analyzeModules(stageRoot,roots);
 if(JSON.stringify(stagedStartup.modules.map(m=>m.path))!==JSON.stringify(startup.modules.map(m=>m.path)))throw new Error('Bundling changed initial static closure');
 const descriptor={schema_version:'web-build.v1',compiler:{name:'esbuild',version:ESBUILD_VERSION,
  compiler_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),module_graph_sha256:hash(fs.readFileSync(path.join(ROOT,'tools/module_graph.mjs'))),lock_sha256:hash(fs.readFileSync(path.join(ROOT,'package-lock.json')))},
  sources:Object.fromEntries(names.map(name=>['apps/web/'+name,hash(raw.get(name))])),
  retained:sorted(retained),entries:Object.fromEntries(sorted(entries).map(name=>[name,name])),
  outputs:outputs.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
 fs.writeFileSync(path.join(stageRoot,BUILD_DESCRIPTOR),JSON.stringify(descriptor,null,2)+'\n');
 return descriptor;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [sourceRoot,stageRoot]=process.argv.slice(2);
 if(!sourceRoot||!stageRoot)throw new Error('Usage: node tools/bundle_web.mjs SOURCE_ROOT STAGED_NAMESPACE');
 const roots=JSON.parse(fs.readFileSync(path.join(sourceRoot,'startup-modules.v1.json'),'utf8')).roots;
 const descriptor=await bundleWeb({sourceRoot,stageRoot,roots});
 console.log(`Compiled ${descriptor.outputs.length} ESM entries/chunks; retained ${descriptor.retained.length} canonical modules`);
}
