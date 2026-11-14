// Offline source-parity reference, not independent astronomical accuracy.
// Only a whole-source/hash-bound, reviewed pure numeric function is evaluated.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript';
import {extractCoefficientLiterals} from './ephemeris-data/extract_coefficient_literals.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const TOP08_REFERENCE=Object.freeze({
  git_revision:'2f679a1f698b4f20f9579d94da24af51559458ed',
  path:'src/top2013/dist/08-big/src/top2013.js',
  sha256_lf:'c75e7f713d7e5b1bea1278efeb62b06236098754c6db49717700ae61b6f5ab15',
  git_blob:'e44c705f4f569db31211c6fead7bf3a56c050c6c',symbol:'top2k_theory',
});
const CORE_SHA='731736d7716ecbebb582514772d1590a2f90db1aa0db9bc11234701dbf71d427';
const SOURCE_BYTES=2370905,READ_LIMIT=3*1024*1024;
const hash=(bytes,algorithm='sha256')=>createHash(algorithm).update(bytes).digest('hex');

export function sourceElements(raw){
  if(!Buffer.isBuffer(raw)||raw.length!==SOURCE_BYTES||hash(raw)!==TOP08_REFERENCE.sha256_lf
      ||hash(Buffer.concat([Buffer.from(`blob ${raw.length}\0`),raw]),'sha1')!==TOP08_REFERENCE.git_blob)
    throw Error('Expected exact pinned TOP2013 08-big source');
  const source=new TextDecoder('utf-8',{fatal:true}).decode(raw);
  const data=extractCoefficientLiterals(source,'top2013');
  const tree=ts.createSourceFile('top2013.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  let core=null;
  function find(node){
    if(ts.isFunctionDeclaration(node)&&node.name?.text===TOP08_REFERENCE.symbol){
      if(core)throw Error('Duplicate source element function');core=node;
    }
    ts.forEachChild(node,find);
  }
  find(tree);
  if(!core||hash(core.getText(tree))!==CORE_SHA)throw Error('Source element function identity differs');
  function allowed(node){
    if([ts.SyntaxKind.NewExpression,ts.SyntaxKind.ThisKeyword,ts.SyntaxKind.ImportKeyword].includes(node.kind))
      throw Error('Unsupported source element operation');
    if(ts.isCallExpression(node)&&!(ts.isPropertyAccessExpression(node.expression)
        &&node.expression.expression.getText(tree)==='Math'&&['sin','cos'].includes(node.expression.name.text)))
      throw Error('Unsupported source element call');
    if(ts.isIdentifier(node)&&['constructor','process','require','eval','globalThis','Function'].includes(node.text))
      throw Error('Unsupported source element identifier');
    ts.forEachChild(node,allowed);
  }
  allowed(core);
  // The immutable source and core pins are the authority. This context/AST check
  // is deliberately not a facility for running arbitrary JavaScript safely.
  const context=vm.createContext({data,result:null},{codeGeneration:{strings:false,wasm:false}});
  new vm.Script(`var time=[]; const solver=${core.getText(tree)};`).runInContext(context,{timeout:1000});
  const samples=[];
  for(const [index,body]of ['jup','sat','ura','nep'].entries())for(const years of [5000,-5000]){
    context.index=index;context.body=body;context.years=years;
    new vm.Script('result=solver({coeffs:data[body].coeffs,dmu:(data.freq[0]-data.freq[1])/880,freq:data.freq,ipla:index+4,GM:data[body].GM},years,[],false,false,0);')
      .runInContext(context,{timeout:1000});
    const elements=Array.from(context.result);
    if(elements.length!==6||!elements.every(Number.isFinite))throw Error('Invalid source elements');
    samples.push({index,years,elements});
  }
  return {schema_version:'top2013-source-elements.v1',source:{...TOP08_REFERENCE},samples};
}

function readSource(file){
  if(fs.lstatSync(file).isSymbolicLink())throw Error('Source symlink is not permitted');
  const fd=fs.openSync(file,'r');
  try{
    const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>READ_LIMIT)throw Error('Oversized source input');
    const buffer=Buffer.alloc(READ_LIMIT+1);let size=0;
    while(size<buffer.length){const n=fs.readSync(fd,buffer,size,buffer.length-size,null);if(!n)break;size+=n;}
    if(size>READ_LIMIT)throw Error('Oversized source input');
    return buffer.subarray(0,size);
  }finally{fs.closeSync(fd);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    if(process.argv.length>3)throw Error('Usage: top2013_source_reference.mjs [preferred-source.js]');
    const file=process.argv[2]||path.join(ROOT,'crates/solar-ephemeris/rebuild/upstream/top2013.js');
    process.stdout.write(JSON.stringify(sourceElements(readSource(file)))+'\n');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
