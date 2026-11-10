// Parse source without executing it. The locked TypeScript package is validation-only.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const origin='https://sol.invalid/__root__/';
const order=(a,b)=>a<b?-1:a>b?1:0;
function resolveModule(specifier,parent){
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
export function analyzeModules(webRoot,roots){
  if(!Array.isArray(roots)||!roots.length||new Set(roots).size!==roots.length)throw new Error('Unique module roots required');
  const normalizedRoots=roots.map(name=>resolveModule('./'+name,'index.html').url).sort(order);
  if(normalizedRoots.some((url,index)=>url!==[...roots].sort(order)[index]))throw new Error('Noncanonical module root identity');
  const queue=[...normalizedRoots],records=new Map(),parsed=new Map();
  while(queue.length){
    const identity=queue.pop();if(records.has(identity))continue;
    const resolved=resolveModule('./'+identity,'index.html');
    if(!parsed.has(resolved.path)){
      const raw=fs.readFileSync(sourceFile(path.resolve(webRoot),resolved.path));
      const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
      const source=ts.createSourceFile(resolved.path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
      if(source.parseDiagnostics.length)throw new Error(`JavaScript syntax error: ${resolved.path}`);
      const imports=[];
      for(const node of source.statements){
        if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier){
          if(!ts.isStringLiteral(node.moduleSpecifier))throw new Error(`Nonliteral static module: ${resolved.path}`);
          imports.push(node.moduleSpecifier.text);
        }
      }
      parsed.set(resolved.path,{sha256:createHash('sha256').update(raw).digest('hex'),imports});
    }
    const record=parsed.get(resolved.path);
    records.set(identity,{url:identity,path:resolved.path,sha256:record.sha256});
    for(const specifier of record.imports)queue.push(resolveModule(specifier,identity).url);
  }
  return {schema_version:'startup-modules.v1',roots:normalizedRoots,modules:[...records.values()].sort((a,b)=>order(a.url,b.url))};
}
