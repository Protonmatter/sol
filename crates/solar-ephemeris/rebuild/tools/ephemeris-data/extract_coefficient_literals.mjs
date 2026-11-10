// Static reference-data extraction only. No input JavaScript is executed.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const BODIES={vsop2013:['mer','ven','emb','mar','jup','sat','ura','nep','plu'],top2013:['jup','sat','ura','nep','plu']};
const MAX_BYTES=1048576,MAX_NODES=1000000;
const PINNED_VSOP08_BYTES=2672670;
const PINNED_VSOP08_SHA256='a279a77a29bf958cab3a0f6b9804fe472fbd6a6b9841a1b5a52f906c9561649e';
const PINNED_VSOP08_READ_LIMIT=3145728;
const PINNED_TOP08_BYTES=2370905;
const PINNED_TOP08_SHA256='c75e7f713d7e5b1bea1278efeb62b06236098754c6db49717700ae61b6f5ab15';
const PINNED_TOP08_READ_LIMIT=3145728;

export function extractCoefficientLiterals(source,family){
  if(typeof source!=='string'||!['vsop2013','elpmpp02','top2013'].includes(family))throw Error('Unsupported coefficient source');
  const bytes=Buffer.byteLength(source);
  // Preserve the default resource bound. Only this exact hash-admitted larger
  // immutable input is allowed; the one-million-node syntax bound is unchanged.
  const admittedLarge=(family==='vsop2013'&&bytes===PINNED_VSOP08_BYTES
    &&createHash('sha256').update(source,'utf8').digest('hex')===PINNED_VSOP08_SHA256)
    ||(family==='top2013'&&bytes===PINNED_TOP08_BYTES
    &&createHash('sha256').update(source,'utf8').digest('hex')===PINNED_TOP08_SHA256);
  if(bytes>MAX_BYTES&&!admittedLarge)throw Error('Unsupported or oversized coefficient source');
  const tree=ts.createSourceFile(family+'.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(tree.parseDiagnostics.length)throw Error('Coefficient source has syntax errors');
  let visited=0;
  function literal(node,depth=0){
    if(!node||depth>24||++visited>MAX_NODES)throw Error('Coefficient literal budget exceeded');
    if(ts.isNumericLiteral(node)){
      const number=Number(node.text);if(!Number.isFinite(number))throw Error('Nonfinite coefficient');return number;
    }
    if(ts.isPrefixUnaryExpression(node)&&[ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(node.operator)){
      const number=literal(node.operand,depth+1);if(typeof number!=='number')throw Error('Non-numeric unary coefficient');
      return node.operator===ts.SyntaxKind.MinusToken?-number:number;
    }
    if(ts.isArrayLiteralExpression(node))return node.elements.map(value=>literal(value,depth+1));
    if(ts.isObjectLiteralExpression(node)){
      const value=Object.create(null);
      for(const property of node.properties){
        if(!ts.isPropertyAssignment(property)||!ts.isIdentifier(property.name)||Object.hasOwn(value,property.name.text))throw Error('Invalid or duplicate coefficient property');
        value[property.name.text]=literal(property.initializer,depth+1);
      }
      return value;
    }
    throw Error('Coefficient is not a numeric literal: '+ts.SyntaxKind[node.kind]);
  }
  const records=Object.create(null),frequencies=[];let lunarCalls=0;
  function visit(node){
    if(++visited>MAX_NODES)throw Error('Coefficient syntax budget exceeded');
    if(family==='elpmpp02'&&ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='ELPMPP02'){
      if(node.arguments.length!==3||++lunarCalls!==1||node.arguments[0].getText(tree)!=='elpmpp02')throw Error('Invalid lunar coefficient registration');
      records.coeffs=literal(node.arguments[2]);
    }
    if(family==='top2013'&&ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='freq'&&node.initializer&&ts.isArrayLiteralExpression(node.initializer))frequencies.push(literal(node.initializer));
    if(family!=='elpmpp02'&&ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isPropertyAccessExpression(node.left)&&ts.isIdentifier(node.left.expression)&&node.left.expression.text===family){
      const body=node.left.name.text,call=node.right;
      if(!BODIES[family].includes(body)||Object.hasOwn(records,body)||!ts.isCallExpression(call)||!ts.isIdentifier(call.expression)||call.expression.text!==(family==='vsop2013'?'VSOP2K':'TOP2K'))throw Error('Invalid or duplicate planetary coefficient registration');
      if(call.arguments.length!==(family==='vsop2013'?3:5)||!ts.isStringLiteral(call.arguments[0])||call.arguments[0].text!==body)throw Error('Coefficient body identity differs');
      records[body]={GM:literal(call.arguments[1]),coeffs:literal(call.arguments[2])};
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  if(family==='elpmpp02'){
    if(lunarCalls!==1)throw Error('Missing lunar coefficient registration');
  }else if(Object.keys(records).length!==BODIES[family].length)throw Error('Incomplete planetary coefficient matrix');
  if(family==='top2013'){
    if(frequencies.length!==5||frequencies.some(row=>!Array.isArray(row)||row.length!==5||row.some((value,index)=>typeof value!=='number'||!Object.is(value,frequencies[0][index]))))throw Error('Inconsistent mean-motion inputs');
    records.freq=frequencies[0];
  }
  return records;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==4)throw Error('Usage: extract_coefficient_literals.mjs FAMILY INPUT.js');
    const [family,file]=process.argv.slice(2);
    const readLimit=family==='vsop2013'?PINNED_VSOP08_READ_LIMIT:family==='top2013'?PINNED_TOP08_READ_LIMIT:MAX_BYTES;
    if(fs.statSync(file).size>readLimit)throw Error('Oversized coefficient input');
    const raw=fs.readFileSync(file);if(raw.length>readLimit)throw Error('Oversized coefficient input');
    process.stdout.write(JSON.stringify(extractCoefficientLiterals(raw.toString('utf8'),family))+'\n');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
