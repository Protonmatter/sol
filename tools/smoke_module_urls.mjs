// Read module identities without executing application code or loading optional knots.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {analyzeModules} from './module_graph.mjs';

const base='https://sol.invalid/__root__/';
export function smokeModuleUrls(webRoot){
  const root=path.resolve(webRoot);
  const buildFile=path.join(root,'web-build.v1.json');
  if(fs.existsSync(buildFile)){
    const build=JSON.parse(fs.readFileSync(buildFile,'utf8'));
    const modules=['js/store.js','js/orreryTime.js','js/orrery.js','js/moons.js'];
    if(build.schema_version!=='web-build.v1'||modules.some(name=>!build.retained?.includes(name)&&build.entries?.[name]!==name))throw new Error('Missing compiled smoke module entry');
    analyzeModules(root,['app.js',...modules],{includeDeferred:true});
    return modules;
  }
  const parse=name=>{
    const source=ts.createSourceFile(name,fs.readFileSync(path.join(root,name),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    if(source.parseDiagnostics.length)throw new Error('Smoke module JavaScript syntax error: '+name);
    return source;
  };
  const resolve=(literal,parent)=>{
    if(typeof literal!=='string'||!literal.startsWith('.')||/[\\\s%]/.test(literal))throw new Error('Smoke module must be a local relative URL');
    const url=new URL(literal,new URL(parent,base));
    if(!url.href.startsWith(base)||url.hash||(url.search&&!/^\?v=[a-zA-Z0-9._-]+$/.test(url.search)))throw new Error('Smoke module escapes release boundary');
    return url.pathname.slice('/__root__/'.length)+url.search;
  };
  const unique=(urls,name)=>{
    const matches=[...new Set(urls.filter(url=>url.split('?')[0]===name))];
    if(matches.length!==1)throw new Error('Missing or ambiguous smoke module: '+name);
    return matches[0];
  };
  const app=parse('app.js'),dynamic=[];
  const visit=node=>{
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword
        &&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))dynamic.push(resolve(node.arguments[0].text,'app.js'));
    ts.forEachChild(node,visit);
  };
  visit(app);
  const owner=unique(dynamic,'js/orrery.js');
  // Reuse the existing case/symlink/import-boundary and dependency-closure admission.
  analyzeModules(root,['app.js',owner]);
  const imports=parse(owner.split('?')[0]).statements.filter(node=>ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier))
    .map(node=>resolve(node.moduleSpecifier.text,owner));
  return [unique(imports,'js/store.js'),unique(imports,'js/orreryTime.js'),owner,unique(imports,'js/moons.js')];
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3)throw new Error('Usage: node tools/smoke_module_urls.mjs WEB_ROOT');
  console.log(JSON.stringify(smokeModuleUrls(process.argv[2])));
}
