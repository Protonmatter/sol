import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

export function collectContextFailures(owners){
  return [...owners].flatMap(owner=>owner.errors.map(error=>({owner:owner.name,error})));
}

// Full admission catches added paths/symlinks as well as changed pinned bytes.
export function readbackProfileArtifact({webRoot,validator,expected,python=process.env.PYTHON||'python'}){
  const validation=spawnSync(python,[validator,path.join(webRoot,'web-release-manifest.json')],{encoding:'utf8'});
  const changed=[];
  for(const [name,digest]of Object.entries(expected)){
    const file=path.join(webRoot,name);
    try{if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==digest)changed.push(name);}catch{changed.push(name);}
  }
  return {unchanged:validation.status===0&&changed.length===0,changed,validationStatus:validation.status,
    log:(validation.stdout||'')+(validation.stderr||'')+(validation.error?String(validation.error):'')};
}
