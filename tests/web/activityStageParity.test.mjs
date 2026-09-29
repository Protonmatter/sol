import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {stageFromActivity} from '../../apps/web/js/format.js';

const cases=JSON.parse(fs.readFileSync(new URL('../fixtures/activity-stage-cases.json',import.meta.url),'utf8'));
for(const {activity,stage} of cases)test(`browser activity ${activity} agrees with the shared cycle-stage contract`,()=>{
  assert.equal(stageFromActivity(activity),stage);
});
