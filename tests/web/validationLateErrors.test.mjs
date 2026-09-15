import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Execute the callers' actual event listeners and final acceptance blocks. The
// expensive browser work is replaced only after its original receipt is saved;
// this exercises late-event ordering without a GPU or a second test-only gate.
function between(source, start, end, includeEnd = false) {
  assert.equal(source.split(start).length, 2, `Expected one boundary: ${start}`);
  const begin = source.indexOf(start), finish = source.indexOf(end, begin);
  assert.ok(finish > begin, `Missing end boundary: ${end}`);
  return source.slice(begin, finish + (includeEnd ? end.length : 0));
}

function fixture(caller, {memory = true, inject = () => {}} = {}) {
  const browserCaller = caller === 'browser';
  const file = browserCaller ? 'browser_validation.mjs' : 'physical_rendering_validation.mjs';
  const source = fs.readFileSync(new URL(`../../tools/${file}`, import.meta.url), 'utf8');
  const listeners = browserCaller
    ? between(source, 'page.on("pageerror",', '// Page-scoped Fetch interception')
    : between(source, "page.on('pageerror',", "page.on('requestfailed',");
  const acceptance = between(source, 'evidence.original_gates={passed:true',
    browserCaller ? "evidence.status='passed';" : 'evidence.passed=true;', true);
  const evidence = {status: 'running', passed: false, errors: [], console_errors: []};
  const page = new EventEmitter(), failures = [];
  let followups = 0, disposed = 0;
  const context = vm.createContext({assert, page, evidence, failures, memory,
    browser: {}, backend: 'native', console: {log() {}}, phase: '',
    save() {}, saveEvidence() {}, workerCoverage: {async dispose() { disposed++; }},
    async runFullFeatureMemoryCheckpoints({originalReceipt, save}) {
      followups++;
      assert.equal(originalReceipt.passed, true);
      if (!browserCaller) assert.equal(originalReceipt.deadline_ms, 240000);
      await Promise.resolve();
      inject(page);
      save({status: 'passed'});
    },
  });
  // The production arrays and its empty-array assertions share one realm.
  vm.runInContext('evidence.errors=[];evidence.console_errors=[];', context);
  vm.runInContext(listeners, context, {filename: file});
  return {evidence, failures, page, execute: () => vm.runInContext(`(async()=>{${acceptance}})()`, context, {filename: file}),
    accepted: () => browserCaller ? evidence.status === 'passed' : evidence.passed,
    counts: () => ({followups, disposed})};
}

const consoleEvent = (level, text) => ({type: () => level, text: () => text, location: () => ({lineNumber: 1})});

for (const caller of ['browser', 'physical']) {
  for (const event of ['pageerror', 'console']) {
    test(`${caller} rejects a ${event} arriving after original acceptance during successful memory work`, async () => {
      const detail = `late ${event} during context restoration`;
      const f = fixture(caller, {inject: page => page.emit(event,
        event === 'pageerror' ? new Error(detail) : consoleEvent('error', detail))});
      await assert.rejects(f.execute(), new RegExp(detail));
      assert.equal(f.evidence.original_gates.passed, true, 'Original gates must retain their independent result');
      assert.equal(f.evidence.memory.status, 'passed', 'Failure must come from the late runtime event');
      assert.equal(f.accepted(), false);
      assert.equal(f.counts().followups, 1);
    });
  }

  test(`${caller} accepts memory work without new runtime errors`, async () => {
    const f = fixture(caller);
    await f.execute();
    assert.equal(f.accepted(), true);
    assert.equal(f.evidence.original_gates.passed, true);
    assert.deepEqual(f.counts(), {followups: 1, disposed: caller === 'browser' ? 1 : 0});
  });

  test(`${caller} keeps the original no-memory path and console warning filter`, async () => {
    const withoutMemory = fixture(caller, {memory: false});
    await withoutMemory.execute();
    assert.equal(withoutMemory.accepted(), true);
    assert.deepEqual(withoutMemory.counts(), {followups: 0, disposed: 0});
    const warning = fixture(caller, {inject: page => page.emit('console', consoleEvent('warning', 'expected warning'))});
    await warning.execute();
    assert.equal(warning.accepted(), true);
  });
}

test('browser preserves its existing expected resource-error filter during memory work', async () => {
  const f = fixture('browser', {inject: page => page.emit('console', consoleEvent('error', 'Failed to load resource: 404'))});
  await f.execute();
  assert.equal(f.accepted(), true);
  assert.deepEqual(f.failures, []);
});
