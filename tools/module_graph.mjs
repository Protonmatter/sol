// Parse source without executing it. The locked TypeScript package is validation-only.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const origin='https://sol.invalid/__root__/';
const order=(a,b)=>a<b?-1:a>b?1:0;
export function resolveModule(specifier,parent){
  if(typeof specifier!=='string'||/[\\\u0000-\u0020%]/.test(specifier))throw new Error('Encoded or invalid module URL');
  if(!(specifier.startsWith('./')||specifier.startsWith('../')))throw new Error('Only relative local module imports are supported');
  const url=new URL(specifier,new URL(parent,origin));
  if(url.origin!=='https://sol.invalid'||!url.pathname.startsWith('/__root__/'))throw new Error('Module URL escapes release boundary');
  if(url.hash||(url.search&&!/^\?v=[a-zA-Z0-9._-]+$/.test(url.search)))throw new Error('Unsupported module URL identity');
  if(!url.pathname.endsWith('.js'))throw new Error('Module must be JavaScript');
  return {url:url.pathname.slice('/__root__/'.length)+url.search,path:url.pathname.slice('/__root__/'.length)};
}
function sourceFile(root,name){
  let folder=root;
  for(const segment of name.split('/')){
    if(!fs.readdirSync(folder).includes(segment))throw new Error(`Missing or wrong-case module: ${name}`);
    folder=path.join(folder,segment);
    if(fs.lstatSync(folder).isSymbolicLink())throw new Error(`Symlink module source: ${name}`);
  }
  if(!fs.statSync(folder).isFile())throw new Error(`Missing module file: ${name}`);
  return folder;
}
export function analyzeModules(webRoot,roots,{includeDeferred=false}={}){
  if(!Array.isArray(roots)||!roots.length||new Set(roots).size!==roots.length)throw new Error('Unique module roots required');
  const normalizedRoots=roots.map(name=>resolveModule('./'+name,'index.html').url).sort(order);
  if(normalizedRoots.some((url,index)=>url!==[...roots].sort(order)[index]))throw new Error('Noncanonical module root identity');
  const queue=[...normalizedRoots],records=new Map(),parsed=new Map(),identities=new Map();
  while(queue.length){
    const identity=queue.pop();if(records.has(identity))continue;
    const resolved=resolveModule('./'+identity,'index.html');
    const prior=identities.get(resolved.path);
    if(prior&&prior!==identity)throw new Error(`Multiple module URL identities for ${resolved.path}: ${prior}, ${identity}`);
    identities.set(resolved.path,identity);
    if(!parsed.has(resolved.path)){
      const raw=fs.readFileSync(sourceFile(path.resolve(webRoot),resolved.path));
      const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
      const edges=moduleEdges(text,resolved.path,{allowComputed:!includeDeferred});
      const imports=[...edges.static,...(includeDeferred?[...edges.dynamic,...edges.workers]:[])];
      parsed.set(resolved.path,{sha256:createHash('sha256').update(raw).digest('hex'),imports});
    }
    const record=parsed.get(resolved.path);
    records.set(identity,{url:identity,path:resolved.path,sha256:record.sha256});
    for(const specifier of record.imports)queue.push(resolveModule(specifier,identity).url);
  }
  return {schema_version:'startup-modules.v1',roots:normalizedRoots,modules:[...records.values()].sort((a,b)=>order(a.url,b.url))};
}

// Parse references without evaluating modules. The URL constructor form also
// covers worker URLs stored in broker descriptors before Worker is constructed.
export function moduleEdges(text,name,{allowComputed=false}={}) {
  const source=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(source.parseDiagnostics.length)throw new Error(`JavaScript syntax error: ${name}`);
  const edges={static:[],dynamic:[],workers:[]};
  for(const node of source.statements){
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier){
      if(!ts.isStringLiteral(node.moduleSpecifier))throw new Error(`Nonliteral static module: ${name}`);
      edges.static.push(node.moduleSpecifier.text);
    }
  }
  const visit=node=>{
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){
      if(node.arguments.length!==1||!ts.isStringLiteral(node.arguments[0])){
        if(!allowComputed)throw new Error(`Literal dynamic module import required: ${name}`);
      }else edges.dynamic.push(node.arguments[0].text);
    }
    if(!allowComputed&&ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&['Worker','SharedWorker'].includes(node.expression.text)){
      const url=node.arguments?.[0];
      if(!url||!ts.isNewExpression(url)||!ts.isIdentifier(url.expression)||url.expression.text!=='URL'
        ||url.arguments?.length!==2||!ts.isStringLiteral(url.arguments[0])
        ||url.arguments[1].getText(source)!=='import.meta.url'||!/\.js(?:[?#]|$)/.test(url.arguments[0].text))throw new Error(`Literal worker module URL required: ${name}`);
    }
    if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL'
      &&node.arguments?.length===2&&node.arguments[1].getText(source)==='import.meta.url'
      &&ts.isStringLiteral(node.arguments[0])&&/\.js(?:[?#]|$)/.test(node.arguments[0].text))edges.workers.push(node.arguments[0].text);
    ts.forEachChild(node,visit);
  };
  visit(source);return edges;
}

// Empty original mappings are only legitimate for generated import/export
// linkage. Executable generated statements must never vanish from coverage.
export function moduleLinkageOnly(text,name) {
  const source=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  return !source.parseDiagnostics.length&&source.statements.every(node=>ts.isImportDeclaration(node)||ts.isExportDeclaration(node));
}

// esbuild 0.28.2 emits this intrinsic for namespace exports. It has no original
// application lines. Admit only this reviewed helper and ordinary module links;
// every other executable mapless chunk requires a new explicit compiler review.
const EXPORT_HELPER=`var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

export {
  __export
};`;
export function compilerGeneratedModuleKind(text,name) {
  if(moduleLinkageOnly(text,name))return 'module-linkage';
  return text.trim()===EXPORT_HELPER?'esbuild-namespace-exports':null;
}

// Recovery fetches a requested entry's static closure, never its deferred payloads.
// Generate from parsed imports/reexports for both source and compiled modules.
export function moduleDependencies(root,roots){
  const complete=analyzeModules(root,roots,{includeDeferred:true});
  const modules=Object.fromEntries(complete.modules.map(item=>{
    if(item.url!==item.path)throw new Error('Recovery requires query-free canonical module identities');
    const edges=moduleEdges(fs.readFileSync(sourceFile(root,item.path),'utf8'),item.path);
    return [item.path,[...new Set(edges.static.map(specifier=>resolveModule(specifier,item.path).path))].sort()];
  }));
  return {schema_version:'module-dependencies.v1',modules};
}
