import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sourceElements,TOP08_REFERENCE} from '../../tools/top2013_source_reference.mjs';

const preferred=new URL('../../crates/solar-ephemeris/rebuild/upstream/top2013.js',import.meta.url);
const script=fileURLToPath(new URL('../../tools/top2013_source_reference.mjs',import.meta.url));
test('current source reference returns exactly the pinned eight finite element samples',()=>{
  const result=sourceElements(fs.readFileSync(preferred));
  assert.equal(result.schema_version,'top2013-source-elements.v1');
  assert.deepEqual(result.source,TOP08_REFERENCE);
  assert.deepEqual(result.samples.map(s=>[s.index,s.years]),[0,1,2,3].flatMap(i=>[[i,5000],[i,-5000]]));
  for(const sample of result.samples){assert.equal(sample.elements.length,6);assert(sample.elements.every(Number.isFinite));assert(sample.elements[0]>0);}
});
test('reference evaluation rejects changed source bytes and unsupported inputs before evaluation',()=>{
  const raw=fs.readFileSync(preferred),changed=Buffer.from(raw);changed[0]^=1;
  for(const value of [changed,raw.subarray(1),Buffer.alloc(3*1024*1024+1),raw.toString('utf8'),null])
    assert.throws(()=>sourceElements(value),/exact pinned/);
});
test('the reference CLI emits the same bounded source identity and rejects bad files',()=>{
  const good=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:30000});
  assert.equal(good.status,0,good.stderr);const output=JSON.parse(good.stdout);assert.deepEqual(output.source,TOP08_REFERENCE);assert.equal(output.samples.length,8);
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'sol-top-source-'));
  try{
    const file=path.join(folder,'changed.js');fs.writeFileSync(file,Buffer.alloc(3*1024*1024+1));
    const bad=spawnSync(process.execPath,[script,file],{encoding:'utf8',timeout:30000});
    assert.notEqual(bad.status,0);assert.equal(bad.stdout,'');assert.match(bad.stderr,/Oversized/);
    fs.writeFileSync(file,'not the pinned theory');
    const wrong=spawnSync(process.execPath,[script,file],{encoding:'utf8',timeout:30000});
    assert.notEqual(wrong.status,0);assert.equal(wrong.stdout,'');assert.match(wrong.stderr,/exact pinned/);
  }finally{
    const relative=path.relative(fs.realpathSync(os.tmpdir()),fs.realpathSync(folder));
    assert(relative&&!path.isAbsolute(relative)&&!relative.startsWith('..')&&!relative.includes(path.sep));
    assert(relative.startsWith('sol-top-source-'));
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
