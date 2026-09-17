import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ATMOSPHERE_PROFILE_ENCODING,getAtmosphereProfile,serializeAtmosphereProfile} from '../../apps/web/js/atmosphereOptics.js';

const hash=value=>createHash('sha256').update(serializeAtmosphereProfile(value)).digest('hex');

test('profile identity admits the observed Node22/Node24 coefficient pair at GPU precision',()=>{
  const earlier=structuredClone(getAtmosphereProfile('Earth')),later=structuredClone(earlier);
  earlier.betaRayleighKm[1]=0.01355776244792022;
  later.betaRayleighKm[1]=0.013557762447920221;
  assert.notEqual(JSON.stringify(earlier),JSON.stringify(later));
  assert.equal(Math.fround(earlier.betaRayleighKm[1]),Math.fround(later.betaRayleighKm[1]));
  assert.equal(hash(earlier),hash(later));
  const word=new DataView(new ArrayBuffer(4));word.setFloat32(0,later.betaRayleighKm[1]);
  word.setUint32(0,word.getUint32(0)+1);later.betaRayleighKm[1]=word.getFloat32(0);
  assert.notEqual(hash(earlier),hash(later),'a changed uploaded binary32 coefficient must invalidate the field');
});

test('profile identity is versioned, typed, ordered, endian-explicit and nonmutating',()=>{
  const profile=getAtmosphereProfile('Earth'),before=JSON.stringify(profile);
  const identity=serializeAtmosphereProfile(profile);
  assert.equal(JSON.parse(identity).encoding,ATMOSPHERE_PROFILE_ENCODING);
  assert.equal(ATMOSPHERE_PROFILE_ENCODING,'atmosphere-profile-binary32-v1');
  assert.equal(identity,serializeAtmosphereProfile(Object.fromEntries(Object.entries(profile).reverse())));
  assert.equal(JSON.stringify(profile),before);
  assert.ok(Object.isFrozen(profile)&&Object.isFrozen(profile.betaRayleighKm));
  assert.equal(serializeAtmosphereProfile(1),'{"encoding":"atmosphere-profile-binary32-v1","profile":["binary32","3f800000"]}');
  assert.notEqual(hash(0),hash(-0));
  assert.notEqual(hash(1),hash('3f800000'));
  assert.notEqual(hash(1),hash({binary32:'3f800000'}));
  assert.notEqual(hash(1),hash(['binary32','3f800000']));
  assert.notEqual(hash(null),hash(false));
  for(const key of ['body','version','classification','limitations'])assert.notEqual(hash(profile),hash({...profile,[key]:'changed'}));
  assert.notEqual(hash(profile),hash({...profile,sourceRefs:['changed']}));
  assert.notEqual(hash(profile),hash(getAtmosphereProfile('Mars')));
});

test('profile identity rejects nonfinite, binary32 overflow and unsupported values without coercion',()=>{
  for(const value of [NaN,Infinity,-Infinity,1e40,-1e40]){
    assert.throws(()=>serializeAtmosphereProfile({nested:[value]}),/finite binary32/);
  }
  for(const value of [undefined,1n,()=>{},Symbol('x'),new Date(0),[,]]){
    assert.throws(()=>serializeAtmosphereProfile({nested:value}),/Unsupported/);
  }
});
