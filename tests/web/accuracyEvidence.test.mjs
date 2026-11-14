import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { accuracyForSelection, epochAccuracy, epochAccuracyAtUnix, renderedEpochLabel } from "../../apps/web/js/accuracy.js";
const catalog=JSON.parse(fs.readFileSync(new URL("../../apps/web/data/accuracy-evidence.json",import.meta.url),"utf8"));
test("source parity does not claim independent accuracy even at the recorded epoch",()=>{
  const r=catalog.records[0], selection={body:r.body,quantity:r.quantity,jd:r.tested_epochs_jd[0],observerDomain:r.observer_domain};
  const result=accuracyForSelection(catalog.records,selection);
  assert.equal(result.status,"unvalidated"); assert.match(result.text,/source-theory parity/);
  assert.deepEqual(result.recordIds,[r.id]);
  assert.deepEqual(accuracyForSelection(catalog.records,{...selection,jd:selection.jd+1}).recordIds,[]);
  assert.deepEqual(accuracyForSelection(catalog.records,{...selection,quantity:"observer_range_km"}).recordIds,[]);
  assert.deepEqual(accuracyForSelection(catalog.records,{...selection,observerDomain:"terrestrial"}).recordIds,[]);
});
test("UI epoch labels do not promote an untested span",()=>{
  for(const kind of ["helio","sky"]) for(const years of [0,100,5000,6000]) assert.match(epochAccuracy(years,kind).text,/unvalidated/i);
  assert.match(renderedEpochLabel(0),/1970-01-01.*proleptic Gregorian/);
});

test("approved precision target includes every UTC instant of years 1900 through 2200",()=>{
  for(const kind of ["helio","sky"]) {
    for(const iso of ["1900-01-01T00:00:00.000Z","2000-02-29T12:00:00.000Z","2200-12-31T23:59:59.999Z"]) {
      const result=epochAccuracyAtUnix(Date.parse(iso)/1000,kind);
      assert.equal(result.level,"ok");
      assert.match(result.text,/1900–2200/);
      assert.match(result.text,/pending/i);
      assert.match(result.text,/unvalidated/i);
      assert.doesNotMatch(result.text,/approximate exploration/i);
    }
    for(const iso of ["0001-01-01T00:00:00.000Z","1899-12-31T23:59:59.999Z","2201-01-01T00:00:00.000Z","9999-12-31T23:59:59.000Z"]) {
      const result=epochAccuracyAtUnix(Date.parse(iso)/1000,kind);
      assert.equal(result.level,"rough");
      assert.match(result.text,/approximate exploration/i);
      assert.match(result.text,/1900–2200/);
      assert.match(result.text,/unvalidated/i);
    }
  }
});

test("absolute precision classification is independent of wall-clock time and rejects invalid instants",()=>{
  const original=Date.now;
  const unix=Date.parse("1900-01-01T00:00:00Z")/1000;
  const expected=epochAccuracyAtUnix(unix,"helio");
  try {
    for(const now of [Date.parse("2026-11-04T00:00:00Z"),Date.parse("2300-06-01T00:00:00Z")]) {
      Date.now=()=>now;
      assert.deepEqual(epochAccuracyAtUnix(unix,"helio"),expected);
      assert.deepEqual(epochAccuracy((unix-now/1000)/(365.25*86400),"helio"),expected);
    }
  } finally {Date.now=original;}
  for(const value of [NaN,Infinity,-Infinity,null,"1900",undefined]) {
    const result=epochAccuracyAtUnix(value,"sky");
    assert.equal(result.level,"rough");
    assert.match(result.text,/unavailable/i);
    assert.match(result.text,/unvalidated/i);
  }
});

const evidenceSelection={body:catalog.records[0].body,quantity:catalog.records[0].quantity,jd:catalog.records[0].tested_epochs_jd[0],observerDomain:catalog.records[0].observer_domain};
for(const [name,mutate] of [
  ["passing independent record is not yet an accepted qualification",r=>{r.method="independent_reference";r.measured_error.value=0.0001;}],
  ["failed independent threshold",r=>{r.method="independent_reference";r.measured_error.value=500;}],
  ["independent method without reference",r=>{r.method="independent_reference";delete r.reference;}],
  ["unregistered independent ID",r=>{r.method="independent_reference";r.id="not-in-the-accepted-registry";}],
  ["source parity at failing threshold",r=>{r.measured_error.value=r.measured_error.acceptance_threshold;}],
  ["source parity above threshold",r=>{r.measured_error.value=500;}],
  ["missing reference",r=>{delete r.reference;}],
  ["missing reference hash",r=>{delete r.reference.sha256_lf;}],
  ["non-string reference hash",r=>{r.reference.sha256_lf=[r.reference.sha256_lf];}],
  ["non-string reference revision",r=>{r.reference.git_revision=[r.reference.git_revision];}],
  ["malformed immutable identity",r=>{r.reference.git_revision="not-a-revision";}],
  ["missing measurement",r=>{delete r.measured_error;}],
  ["absent error value",r=>{delete r.measured_error.value;}],
  ["nonfinite error value",r=>{r.measured_error.value=NaN;}],
  ["infinite error value",r=>{r.measured_error.value=Infinity;}],
  ["nonfinite acceptance threshold",r=>{r.measured_error.acceptance_threshold=Infinity;}],
  ["nonpositive acceptance threshold",r=>{r.measured_error.acceptance_threshold=0;}],
  ["missing epoch set",r=>{delete r.tested_epochs_jd;}],
  ["malformed epoch set",r=>{r.tested_epochs_jd="not an epoch array";}],
]) test(`accuracy selection fails closed: ${name}`,()=>{
  const record=structuredClone(catalog.records[0]);mutate(record);
  const result=accuracyForSelection([record],evidenceSelection);
  assert.equal(result.status,"unvalidated");
  assert.deepEqual(result.recordIds,[]);
  assert.doesNotMatch(result.text,/source-theory parity is recorded/);
});
test("malformed evidence containers cannot qualify or crash the UI",()=>{
  for(const records of [null,undefined,{},[null],[false],[{}]]) {
    const result=accuracyForSelection(records,evidenceSelection);
    assert.equal(result.status,"unvalidated");assert.deepEqual(result.recordIds,[]);
  }
});
