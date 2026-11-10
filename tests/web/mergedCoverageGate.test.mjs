import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import coverageModule from 'istanbul-lib-coverage';
import {absoluteRuntimeModules, addUnexecutedCoverage, WEB} from '../../tools/js_coverage_scope.mjs';

const tool=fileURLToPath(new URL('../../tools/merge_web_coverage.mjs',import.meta.url));
const files=absoluteRuntimeModules();
const baseline=coverageModule.createCoverageMap({});
await addUnexecutedCoverage(baseline,files);
const zero=JSON.stringify(baseline.toJSON());
const total=baseline.getCoverageSummary().lines.total;

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sol merged coverage # '));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}
function report(){return JSON.parse(zero);}
function cover(data,count=Infinity){
  let covered=0;
  for(const entry of Object.values(data)){
    for(const key of Object.keys(entry.s))entry.s[key]=covered++<count?1:0;
    for(const key of Object.keys(entry.f))entry.f[key]=1;
    for(const key of Object.keys(entry.b))entry.b[key]=entry.b[key].map(()=>1);
  }
  return data;
}
function counter(data,kind){
  const entry=Object.values(data).find(item=>Object.keys(item[kind]).length)||data[files[0]];
  const loc=entry.statementMap[Object.keys(entry.s)[0]];
  if(kind==='f'&&!Object.keys(entry.f).length){
    entry.fnMap[0]={name:'fixture',decl:loc,loc,line:loc.start.line};entry.f[0]=1;
  }
  if(kind==='b'&&!Object.keys(entry.b).length){
    entry.branchMap[0]={type:'if',loc,line:loc.start.line,locations:[loc,loc]};entry.b[0]=[1,1];
  }
  return [entry,Object.keys(entry[kind])[0]];
}
function run(root,node,browser={},options=[]){
  const input=fs.mkdtempSync(path.join(root,'case-'));
  fs.writeFileSync(path.join(input,'node.json'),JSON.stringify(node));
  fs.writeFileSync(path.join(input,'browser.json'),JSON.stringify(browser));
  const env={...process.env};delete env.NODE_TEST_CONTEXT;delete env.NODE_V8_COVERAGE;
  const output=path.join(input,'output');
  const child=spawnSync(process.execPath,[tool,`--node-input=${path.join(input,'node.json')}`,
    `--browser-input=${path.join(input,'browser.json')}`,`--output-dir=${output}`,...options],
    {encoding:'utf8',env,timeout:60000});
  assert.equal(child.error,undefined);
  const summary=path.join(output,'coverage-summary.json');
  return {...child,diagnostic:child.stdout+child.stderr,
    summary:fs.existsSync(summary)?JSON.parse(fs.readFileSync(summary,'utf8')).total:null};
}

test('merged gate rejects named runtime files with no measured line denominator',t=>{
  const empty=Object.fromEntries(files.map(file=>[file,{path:file,statementMap:{},fnMap:{},branchMap:{},s:{},f:{},b:{}}]));
  const result=run(fixture(t),empty);
  assert.notEqual(result.status,0,'file names with zero counters must not report 100% coverage');
  assert.match(result.diagnostic,/line.*denominator|empty.*coverage|coverage.*empty/i);
});

test('merged gate rejects erased executable lines even when every module remains named',t=>{
  const thin=cover(report());
  for(const entry of Object.values(thin)){
    const key=Object.keys(entry.s)[0];
    entry.s={[key]:1};entry.statementMap={[key]:entry.statementMap[key]};
  }
  const result=run(fixture(t),thin);
  assert.notEqual(result.status,0,'one measured line per module cannot replace its full source denominator');
  assert.match(result.diagnostic,/line.*denominator/i);
});

test('merged gate retains its explicit missing-module rejection',t=>{
  const data=cover(report());delete data[files[0]];
  const result=run(fixture(t),data);
  assert.notEqual(result.status,0);assert.match(result.diagnostic,/absent from the merged denominator/);
});

test('generated catalogues and unrelated files cannot enter the runtime percentage',t=>{
  const root=fixture(t);
  for(const file of [path.join(WEB,'js','starcatalog.js'),path.join(root,'unrelated.js')]){
    const data=cover(report());
    data[file]={path:file,statementMap:{0:{start:{line:1,column:0},end:{line:1,column:1}}},
      fnMap:{},branchMap:{},s:{0:1},f:{},b:{}};
    const result=run(root,data);
    assert.notEqual(result.status,0,'an excluded file must not inflate the runtime report');
    assert.match(result.diagnostic,/outside.*runtime|unexpected.*coverage|coverage.*population/i);
    assert.ok(!result.diagnostic.includes(file),'unapproved report keys must not be echoed');
  }
});

test('malformed hit counts cannot be hidden by otherwise passing coverage',t=>{
  const root=fixture(t);
  for(const kind of ['s','f','b'])for(const invalid of [-1,.5,'1',null]){
    const data=cover(report());
    const [entry,key]=counter(data,kind);
    if(kind==='b')entry.b[key][0]=invalid;else entry[kind][key]=invalid;
    const result=run(root,data);
    assert.notEqual(result.status,0,`${kind} must reject ${JSON.stringify(invalid)}`);
    assert.match(result.diagnostic,/invalid.*coverage.*count|coverage.*count.*invalid/i);
  }
});

test('branch hit arrays must retain exactly their declared nonempty locations',t=>{
  const root=fixture(t);
  for(const difference of ['empty','short','long']){
    const data=cover(report()),[entry,key]=counter(data,'b');
    const arity=entry.branchMap[key].locations.length;
    entry.b[key]=Array(difference==='empty'?0:difference==='short'?arity-1:arity+1).fill(1);
    const result=run(root,data);
    assert.notEqual(result.status,0,'branch location/count arity must agree');
    assert.match(result.diagnostic,/branch.*arity|branch.*count/i);
  }
  const data=cover(report()),[entry,key]=counter(data,'b');
  entry.branchMap[key].locations=[];entry.b[key]=[];
  const result=run(root,data);
  assert.notEqual(result.status,0);assert.match(result.diagnostic,/branch.*arity|branch.*count/i);
});

test('individually safe counts cannot overflow during merge while the safe boundary passes',t=>{
  const root=fixture(t);
  for(const kind of ['s','f','b']){
    const a=cover(report()),b=report(),[left,key]=counter(a,kind),[right]=counter(b,kind);
    if(kind==='b'){left.b[key][0]=Number.MAX_SAFE_INTEGER;right.b[key][0]=Number.MAX_SAFE_INTEGER;}
    else{left[kind][key]=Number.MAX_SAFE_INTEGER;right[kind][key]=Number.MAX_SAFE_INTEGER;}
    const invalid=run(root,a,b);
    assert.notEqual(invalid.status,0,kind+' merged hits must remain safe integers');
    assert.match(invalid.diagnostic,/invalid.*coverage.*count|overflow/i);
    if(kind==='b'){left.b[key][0]=Number.MAX_SAFE_INTEGER-1;right.b[key][0]=1;}
    else{left[kind][key]=Number.MAX_SAFE_INTEGER-1;right[kind][key]=1;}
    const valid=run(root,a,b);
    assert.equal(valid.status,0,valid.diagnostic);
    assert.equal(valid.summary.lines.total,total);
  }
});

test('complementary valid reports preserve every executable line and merge their hits',t=>{
  const a=report(),b=report();let index=0;
  for(const file of files)for(const key of Object.keys(a[file].s)){
    a[file].s[key]=index%2;b[file].s[key]=1-index%2;index++;
  }
  const result=run(fixture(t),a,b);
  assert.equal(result.status,0,result.diagnostic);
  assert.equal(result.summary.lines.total,total);
  assert.equal(result.summary.lines.covered,total);
});

test('complete uncovered lines remain counted and fail the unchanged 90% floor',t=>{
  const result=run(fixture(t),cover(report(),Math.floor(total*.89)));
  assert.notEqual(result.status,0);assert.match(result.diagnostic,/below 90\.00%/);
  assert.equal(result.summary.lines.total,total);
  assert.ok(result.summary.lines.covered*100<90*total);
});

test('a higher requested floor compares real line counts rather than truncated display percent',t=>{
  const covered=Math.ceil(total*.901),actual=covered*100/total;
  const minimum=(actual+Math.floor(actual*100)/100)/2;
  assert.ok(minimum>Math.floor(actual*100)/100);
  const root=fixture(t),data=cover(report(),covered);
  const passing=run(root,data,{},[`--minimum-lines=${minimum}`]);
  assert.equal(passing.status,0,passing.diagnostic);
  assert.ok(passing.stdout.includes(String(minimum)),'the exact requested floor remains visible');
  const failing=run(root,data,{},[`--minimum-lines=${actual+.001}`]);
  assert.notEqual(failing.status,0);assert.match(failing.diagnostic,/below/);
});

test('the default floor cannot be lowered or replaced with a nonfinite value',t=>{
  const root=fixture(t),data=cover(report());
  for(const minimum of ['0','89.99','NaN','Infinity','100.01']){
    const result=run(root,data,{},[`--minimum-lines=${minimum}`]);
    assert.notEqual(result.status,0);assert.match(result.diagnostic,/between 90 and 100/);
  }
});
