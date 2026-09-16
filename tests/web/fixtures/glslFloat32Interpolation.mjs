// Scoped execution adapter for the actual scattering interpolation helpers.
// GLSL control flow is retained; arithmetic is lowered to binary32 operations.
// This models separate multiply/add, not backend contraction or transcendental ULPs.
import ts from 'typescript';

const f=Math.fround,copy=x=>Array.isArray(x)?x.map(copy):x;
const zip=(a,b,fn)=>Array.isArray(a)?a.map((v,i)=>zip(v,Array.isArray(b)?b[i]:b,fn))
  :Array.isArray(b)?b.map(v=>zip(a,v,fn)):fn(a,b);
const unary=(a,fn)=>Array.isArray(a)?a.map(v=>unary(v,fn)):fn(a);
const slots={x:0,y:1,z:2,w:3,r:0,g:1,b:2,a:3};
const vector=(n,args,convert=f)=>{
  const values=args.flat();if(values.length===1)return Array(n).fill(convert(values[0]));
  if(values.length!==n)throw new Error(`Invalid vec${n} constructor`);
  return values.map(convert);
};
const helpers={
  __copy:copy,__f:f,__neg:a=>unary(a,v=>f(-v)),
  __add:(a,b)=>zip(a,b,(x,y)=>f(x+y)),__sub:(a,b)=>zip(a,b,(x,y)=>f(x-y)),
  __mul:(a,b)=>zip(a,b,(x,y)=>f(x*y)),__div:(a,b)=>zip(a,b,(x,y)=>f(x/y)),
  __mod:(a,b)=>zip(a,b,(x,y)=>x%y),
  __get:(a,s)=>s.length===1?a[slots[s]]:[...s].map(v=>a[slots[v]]),
  __set:(a,s,v)=>{[...s].forEach((k,i)=>{a[slots[k]]=copy(s.length===1?v:v[i]);});return copy(v);},
  __array:n=>Array(n),
  floor:a=>unary(a,Math.floor),fract:a=>unary(a,v=>f(v-Math.floor(v))),
  log:a=>unary(a,v=>f(Math.log(v))),exp:a=>unary(a,v=>f(Math.exp(v))),
  // Scalar transcendentals the haze closed forms need. Unused by the interpolation
  // helpers, so widening the allowlist cannot change what they translate to.
  acos:a=>unary(a,v=>f(Math.acos(v))),degrees:a=>unary(a,v=>f(v*180/Math.PI)),
  pow:(a,b)=>zip(a,b,(x,y)=>f(Math.pow(x,y))),sqrt:a=>unary(a,v=>f(Math.sqrt(v))),
  min:(a,b)=>zip(a,b,Math.min),
  max:(a,b)=>zip(a,b,Math.max),clamp:(a,b,c)=>zip(zip(a,b,Math.max),c,Math.min),
  any:a=>a.some(Boolean),greaterThan:(a,b)=>zip(a,b,(x,y)=>x>y),lessThanEqual:(a,b)=>zip(a,b,(x,y)=>x<=y),
  ...Object.fromEntries([2,3,4].flatMap(n=>[[`vec${n}`,(...a)=>vector(n,a)],[`ivec${n}`,(...a)=>vector(n,a,Math.trunc)]])),
};

/** Only this bounded helper subset is supported; unknown syntax/calls fail closed. */
export function interpolationProgram(glsl){
  const types='float|int|vec[234]|ivec[234]';
  // The only GLSL arrays in these helpers are fixed, uninitialized vec3 arrays.
  const source=glsl.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'')
    .replace(/\bvec3\s+(rows|values)\[4\]/g,'vec3 $1=__array(4)')
    .replace(/,planes\[4\]/g,',planes=__array(4)')
    .replace(new RegExp(`\\b(?:${types}) (\\w+)\\(`,'g'),'function $1(')
    .replace(new RegExp(`\\b(?:${types}) (\\w+)(?=[,)])`,'g'),'$1')
    .replace(new RegExp(`\\b(?:${types}) (\\w+)`,'g'),'let $1');
  const parsed=ts.createSourceFile('interpolation.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(parsed.parseDiagnostics.length)throw new Error('Interpolation helper translation did not parse');
  const names=new Set(parsed.statements.filter(ts.isFunctionDeclaration).map(n=>n.name.text));
  const allowedCalls=new Set([...Object.keys(helpers),...names,'texelFetch']);
  const operators={'+':'__add','-':'__sub','*':'__mul','/':'__div','%':'__mod'};
  const factory=ts.factory,call=(name,args)=>factory.createCallExpression(factory.createIdentifier(name),undefined,args);
  function transform(context){
    function assign(left,right){
      if(ts.isPropertyAccessExpression(left))return call('__set',[visit(left.expression),factory.createStringLiteral(left.name.text),right]);
      if(!ts.isIdentifier(left)&&!ts.isElementAccessExpression(left))throw new Error('Unsupported interpolation assignment');
      return factory.createBinaryExpression(ts.visitEachChild(left,visit,context),factory.createToken(ts.SyntaxKind.EqualsToken),call('__copy',[right]));
    }
    function visit(node){
      if(ts.isWhileStatement(node)||ts.isDoStatement(node)||ts.isNewExpression(node)||ts.isTryStatement(node))
        throw new Error('Unsupported interpolation control flow');
      if(ts.isCallExpression(node)&&(!ts.isIdentifier(node.expression)||!allowedCalls.has(node.expression.text)))
        throw new Error('Unsupported interpolation call');
      if(ts.isNumericLiteral(node))return call('__f',[node]);
      if(ts.isPropertyAccessExpression(node)){
        if(!/^[xyzwrgbast]{1,4}$/.test(node.name.text)||[...node.name.text].some(s=>slots[s]===undefined))throw new Error('Unsupported interpolation swizzle');
        return call('__get',[visit(node.expression),factory.createStringLiteral(node.name.text)]);
      }
      if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.MinusToken)return call('__neg',[visit(node.operand)]);
      if(ts.isBinaryExpression(node)){
        const op=node.operatorToken.getText(parsed);
        if(op==='=')return assign(node.left,visit(node.right));
        if(op.endsWith('=')&&operators[op.slice(0,-1)])return assign(node.left,call(operators[op.slice(0,-1)],[visit(node.left),visit(node.right)]));
        if(operators[op])return call(operators[op],[visit(node.left),visit(node.right)]);
        if(!['<','>','<=','>=','==','!=','&&','||'].includes(op))throw new Error(`Unsupported interpolation operator ${op}`);
      }
      if(ts.isVariableDeclaration(node)&&node.initializer)
        return factory.updateVariableDeclaration(node,node.name,undefined,undefined,call('__copy',[visit(node.initializer)]));
      if(ts.isFunctionDeclaration(node)){
        const body=ts.visitEachChild(node.body,visit,context);
        const copies=node.parameters.map(p=>factory.createExpressionStatement(assign(p.name,p.name)));
        return factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,undefined,node.parameters,undefined,
          factory.updateBlock(body,[...copies,...body.statements]));
      }
      return ts.visitEachChild(node,visit,context);
    }
    return root=>ts.visitNode(root,visit);
  }
  const result=ts.transform(parsed,[transform]);
  const javascript=ts.createPrinter().printFile(result.transformed[0]);result.dispose();
  const compile=new Function(...Object.keys(helpers),'u_scatteringSurfaceSize','u_scatteringSurface','texelFetch',
    `'use strict';${javascript};return {${[...names].join(',')}};`);
  return (size,texelFetch)=>compile(...Object.values(helpers),copy(size),'surface',texelFetch);
}
