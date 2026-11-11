import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as accuracy from '../../apps/web/js/accuracy.js';

const registryURL = new URL('../../apps/web/data/independent-vector-evidence.json', import.meta.url);
function rawRegistry() { return new Uint8Array(fs.readFileSync(registryURL)); }
function query(document, row = document.records[0]) {
  return { body: row.body, case: row.case, quantity: document.domain.quantity,
    frame: document.domain.frame, timeScale: document.domain.time_scale,
    observerDomain: document.domain.observer_domain, centerId: row.center_id,
    modelArgumentPolicy: document.domain.model_argument_policy, jd: row.jd_tdb,
    execution: document.execution };
}

test('independent admission is explicit and does not trust caller qualification flags', async () => {
  assert.equal(typeof accuracy.admitIndependentEvidence, 'function');
  assert.equal(typeof accuracy.independentEvidenceSummary, 'function');
  for (const raw of [null, undefined, {}, {validated:true}, [], new Uint8Array([123,125])]) {
    assert.equal(await accuracy.admitIndependentEvidence(raw), null);
  }
  assert.equal(accuracy.accuracyForSelection([{method:'independent_reference',validated:true}], {}).status, 'unvalidated');
  assert.equal(accuracy.independentEvidenceSummary({validated:true}), null);
});

test('bound native sample admission requires every explicit selection dimension', async () => {
  const raw = rawRegistry(), document = JSON.parse(new TextDecoder().decode(raw));
  const admitted = await accuracy.admitIndependentEvidence(raw);
  assert.ok(admitted, 'generated release-bound registry must admit');
  const selected = query(document);
  const result = accuracy.accuracyForSelection(admitted, selected);
  assert.equal(result.status, 'sampled');
  assert.deepEqual(result.recordIds, [document.records[0].id]);
  assert.match(result.text, /native/i);
  assert.match(result.text, /arcsecond-equivalent/);
  assert.match(result.text, /sample only/i);
  for (const [field,value] of Object.entries({...selected, body:'wrong',case:'wrong',quantity:'velocity',
    frame:'ICRF',timeScale:'UTC',observerDomain:'topocentric',centerId:399,
    modelArgumentPolicy:'UTC_conversion',jd:selected.jd+1e-9,execution:'wasm'})) {
    assert.equal(accuracy.accuracyForSelection(admitted,{...selected,[field]:value}).status,'unvalidated',field);
  }
  for (const field of Object.keys(selected)) {
    const incomplete={...selected};delete incomplete[field];
    assert.equal(accuracy.accuracyForSelection(admitted,incomplete).status,'unvalidated',field);
  }
  assert.equal(accuracy.accuracyForSelection(structuredClone(admitted),selected).status,'unvalidated');
  assert.equal(accuracy.accuracyForSelection(document.records,selected).status,'unvalidated');
  assert.equal(accuracy.accuracyForSelection(document,selected).status,'unvalidated');
  assert.ok(Object.isFrozen(admitted));
});

test('altered evidence bytes never inherit a release binding', async () => {
  const raw=rawRegistry(), document=JSON.parse(new TextDecoder().decode(raw));
  for (const mutate of [d=>d.records[0].relative_vector_norm_arcsec=0,
    d=>d.records[0].jd_tdb+=1,d=>d.native_source_digest='0'.repeat(64),
    d=>d.records[0].center_id=399,d=>d.records.pop()]) {
    const forged=structuredClone(document);mutate(forged);
    assert.equal(await accuracy.admitIndependentEvidence(new TextEncoder().encode(JSON.stringify(forged))),null);
  }
  assert.equal(await accuracy.admitIndependentEvidence(new Uint8Array([...raw,32])),null);
});

test('sample summaries preserve origins and never qualify the current UTC selection', async () => {
  const document=JSON.parse(new TextDecoder().decode(rawRegistry()));
  const admitted=await accuracy.admitIndependentEvidence(rawRegistry());
  const summary=accuracy.independentEvidenceSummary(admitted,'geocentric-moon');
  assert.equal(summary.samples,16);assert.equal(summary.centerId,399);
  assert.match(summary.text,/native/i);assert.match(summary.text,/continuous/i);
  assert.equal(accuracy.independentEvidenceSummary(admitted,'unknown'),null);
  const row=document.records.find(r=>r.case==='geocentric-moon');
  const utc={...query(document,row),timeScale:'UTC'};
  assert.equal(accuracy.accuracyForSelection(admitted,utc).status,'unvalidated');
  assert.match(accuracy.epochAccuracyAtUnix(Date.now()/1000,'helio').text,/unvalidated/);
});


test('retained failed native samples cannot qualify selections', async () => {
  const raw=rawRegistry(), document=JSON.parse(new TextDecoder().decode(raw));
  const admitted=await accuracy.admitIndependentEvidence(raw);
  const failed=document.records.filter(row=>!row.passed);
  assert.ok(failed.length>0, 'retained deep-time failures must not disappear');
  for (const row of failed) {
    assert.equal(accuracy.accuracyForSelection(admitted,query(document,row)).status,'unvalidated');
  }
  assert.equal(accuracy.independentEvidenceSummary(admitted,'geocentric-moon').passed,false);
});
