import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {collectContextFailures,readbackProfileArtifact} from '../../tools/profile_completion.mjs';
test('calibration and pair callbacks delivered after an earlier copy remain failures at finalization',async()=>{
  const owners=[{name:'calibration',errors:[]},{name:'pair-1',errors:[]}],earlier=owners.flatMap(owner=>[...owner.errors]);
  await Promise.resolve();owners[0].errors.push('late calibration worker');owners[1].errors.push('late pair worker');
  assert.deepEqual(earlier,[]);assert.deepEqual(collectContextFailures(owners),[{owner:'calibration',error:'late calibration worker'},{owner:'pair-1',error:'late pair worker'}]);
});
test('actual artifact readback rejects an added unrequested file although every original byte is unchanged',t=>{
  const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'sol-profile-admission-'));
  t.after(()=>{
    const absolute=path.resolve(temp),parent=path.resolve(os.tmpdir())+path.sep;
    assert.ok(absolute.startsWith(parent)&&path.basename(absolute).startsWith('sol-profile-admission-'));
    fs.rmSync(absolute,{recursive:true,force:true});
  });
  const webRoot=path.join(temp,'artifact');
  const script=`import sys,shutil\nfrom pathlib import Path\nsys.path.insert(0,str(Path.cwd()/'tests/python'))\nfrom test_release_artifact import ReleaseArtifactTests\nf=ReleaseArtifactTests();f.setUp()\ntry: shutil.copytree(f.build('profile-unit'),sys.argv[1])\nfinally: f.doCleanups()\n`;
  const setup=spawnSync(process.env.PYTHON||'python',['-c',script,webRoot],{cwd:repo,encoding:'utf8'});assert.equal(setup.status,0,setup.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(webRoot,'web-release-manifest.json'),'utf8'));
  const expected=Object.fromEntries([...manifest.assets.map(item=>item.path),'web-release-manifest.json',manifest.namespace+'web-release-manifest.json']
    .map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(webRoot,name))).digest('hex')]));
  const options={webRoot,validator:path.join(repo,'tools/validate_release_manifest.py'),expected};
  assert.equal(readbackProfileArtifact(options).unchanged,true);
  fs.writeFileSync(path.join(webRoot,manifest.namespace,'unexpected.txt'),'deliberate extra path');
  const after=readbackProfileArtifact(options);assert.equal(after.unchanged,false);assert.deepEqual(after.changed,[],'all originally pinned bytes still match');assert.notEqual(after.validationStatus,0);
});
