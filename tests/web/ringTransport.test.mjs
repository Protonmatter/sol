import test from 'node:test';
import assert from 'node:assert/strict';
import {ringTransmission} from '../../apps/web/js/ringTransport.js';

test('fixed half-opaque half-empty footprint is not a homogeneous optical-depth slab',()=>{
  const material={kind:'resolved-mixture',regions:[{kind:'opaque',weight:.5},{kind:'empty',weight:.5}]};
  for(const cosine of [1,.5,-.5,.02])assert.equal(ringTransmission(material,cosine),.5);
  assert.notEqual(ringTransmission(material,.5),Math.exp(Math.log(.5)/.5),'averaged-opacity slab negative control');
  assert.equal(ringTransmission(material,.5,.5),.75);
});

test('homogeneous transport happens before footprint averaging and geometric coverage',()=>{
  const slab={kind:'resolved-mixture',regions:[{kind:'depth',weight:1,tau:Math.log(2)}]};
  assert.equal(ringTransmission(slab,1),.5);
  assert.equal(ringTransmission(slab,.5),.25);
  const mixture={kind:'resolved-mixture',regions:[{kind:'depth',weight:.5,tau:Math.log(2)},{kind:'empty',weight:.5}]};
  assert.equal(ringTransmission(mixture,.5),.625);
  assert.equal(ringTransmission(mixture,.5,.5),.8125);
});

test('display opacities stay display opacities and unsupported source claims fail closed',()=>{
  const display={kind:'display-opacity',opacity:.8};
  assert.equal(ringTransmission(display,1,.5),.6);
  assert.equal(ringTransmission(display,.1,.5),.6);
  for(const material of [
    {kind:'resolved-mixture',regions:[{kind:'opaque',weight:.4}]},
    {kind:'resolved-mixture',regions:[{kind:'depth',weight:1,tau:-1}]},
    {kind:'resolved-mixture',regions:[{kind:'opaque',weight:NaN}]},
    {kind:'angular-transmission'},
  ])assert.throws(()=>ringTransmission(material,.5));
  assert.throws(()=>ringTransmission({kind:'resolved-mixture',regions:[{kind:'empty',weight:1}]},.001),/domain/);
});
