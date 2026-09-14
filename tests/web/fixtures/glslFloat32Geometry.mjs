// A deliberately small interpreter for the actual geometry helper source. Every
// arithmetic operation rounds to binary32; no renderer formula is reimplemented.
// This is a non-FMA CPU model, not an assertion about native compiler contraction.
import ts from 'typescript';

const f=Math.fround,view=new DataView(new ArrayBuffer(4));
const vector=(n,args)=>{const values=args.flat();return values.length===1?Array(n).fill(values[0]):values;};
const zip=(a,b,op)=>Array.isArray(a)?a.map((v,i)=>zip(v,Array.isArray(b)?b[i]:b,op))
  :Array.isArray(b)?b.map(v=>zip(a,v,op)):op(a,b);
const dot=(a,b)=>a.reduce((sum,v,i)=>f(sum+f(v*b[i])),0);
const negate=a=>Array.isArray(a)?a.map(negate):f(-a);
const slots={x:0,y:1,z:2,w:3};
const returned=Symbol('returned');

/** Compile only function declarations; unsupported syntax fails the test. */
export function geometryInterpreter(glsl){
  const source=glsl.replace(/\b(?:float|vec2|vec3|void) (\w+)\(/g,'function $1(')
    .replace(/\b(?:out\s+)?(?:float|vec2|vec3) (\w+)(?=[,)])/g,'$1')
    .replace(/\b(?:float|vec2|vec3) (\w+)/g,'let $1').replace(/\b(0x[\da-f]+|\d+)u\b/gi,'$1');
  const parsed=ts.createSourceFile('geometry.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  if(parsed.parseDiagnostics.length)throw new Error('Geometry helper translation did not parse');
  const functions=new Map(parsed.statements.filter(ts.isFunctionDeclaration).map(node=>[node.name.text,node]));
  const builtins={vec2:(...a)=>vector(2,a),vec3:(...a)=>vector(3,a),sqrt:x=>f(Math.sqrt(x)),
    min:(a,b)=>zip(a,b,Math.min),max:(a,b)=>zip(a,b,Math.max),length:a=>f(Math.sqrt(dot(a,a))),
    normalize:a=>{const n=f(Math.sqrt(dot(a,a)));return a.map(v=>f(v/n));},
    floatBitsToUint:x=>{view.setFloat32(0,x,true);return view.getUint32(0,true);},
    uintBitsToFloat:x=>{view.setUint32(0,x>>>0,true);return view.getFloat32(0,true);}};
  function run(name,args,globals={}){
    const fn=functions.get(name);if(!fn)throw new Error(`Missing GLSL helper ${name}`);
    const env={...globals};fn.parameters.forEach((p,i)=>{env[p.name.text]=args[i];});
    function set(node,value){
      if(ts.isIdentifier(node)){env[node.text]=value;return value;}
      if(ts.isPropertyAccessExpression(node)){const target=evaluate(node.expression);target[slots[node.name.text]]=value;return value;}
      throw new Error(`Unsupported GLSL assignment ${node.getText(parsed)}`);
    }
    function evaluate(node){
      if(ts.isNumericLiteral(node))return f(Number(node.text));
      if(ts.isIdentifier(node)){if(!(node.text in env))throw new Error(`Unbound ${node.text}`);return env[node.text];}
      if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
      if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
      if(ts.isParenthesizedExpression(node))return evaluate(node.expression);
      if(ts.isPropertyAccessExpression(node)){const a=evaluate(node.expression),swizzle=node.name.text;return swizzle.length===1?a[slots[swizzle]]:[...swizzle].map(s=>a[slots[s]]);}
      if(ts.isPrefixUnaryExpression(node)){
        const a=evaluate(node.operand);if(node.operator===ts.SyntaxKind.MinusToken)return negate(a);
        if(node.operator===ts.SyntaxKind.ExclamationToken)return !a;
      }
      if(ts.isCallExpression(node)){
        const name=node.expression.getText(parsed),args=node.arguments.map(evaluate);
        return builtins[name]?builtins[name](...args):run(name,args,globals).value;
      }
      if(ts.isConditionalExpression(node))return evaluate(evaluate(node.condition)?node.whenTrue:node.whenFalse);
      if(ts.isBinaryExpression(node)){
        const op=node.operatorToken.getText(parsed);
        if(op==='=')return set(node.left,evaluate(node.right));
        const a=evaluate(node.left);
        if(op==='&&')return a&&evaluate(node.right);if(op==='||')return a||evaluate(node.right);
        const b=evaluate(node.right);
        const math={'+':(a,b)=>f(a+b),'-':(a,b)=>f(a-b),'*':(a,b)=>f(a*b),'/':(a,b)=>f(a/b),
          '&':(a,b)=>(a>>>0)&(b>>>0),'<':(a,b)=>a<b,'>':(a,b)=>a>b,'<=':(a,b)=>a<=b,'>=':(a,b)=>a>=b};
        if(op==='*=')return set(node.left,zip(a,b,math['*']));
        if(math[op])return zip(a,b,math[op]);
      }
      throw new Error(`Unsupported GLSL expression ${node.getText(parsed)}`);
    }
    function execute(node){
      if(ts.isBlock(node)){for(const statement of node.statements)execute(statement);return;}
      if(ts.isVariableStatement(node)){for(const declaration of node.declarationList.declarations)
        env[declaration.name.text]=declaration.initializer?evaluate(declaration.initializer):undefined;return;}
      if(ts.isExpressionStatement(node)){evaluate(node.expression);return;}
      if(ts.isIfStatement(node)){if(evaluate(node.expression))execute(node.thenStatement);else if(node.elseStatement)execute(node.elseStatement);return;}
      if(ts.isReturnStatement(node))throw {[returned]:true,value:node.expression?evaluate(node.expression):undefined};
      throw new Error(`Unsupported GLSL statement ${node.getText(parsed)}`);
    }
    try{execute(fn.body);}catch(result){if(!result?.[returned])throw result;return {value:result.value,locals:env};}
    return {value:undefined,locals:env};
  }
  return {run};
}
