import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const toolURL = new URL("../../tools/check_node_coverage.mjs", import.meta.url);
const toolPath = fileURLToPath(toolURL);
const fixturePath = fileURLToPath(new URL("../fixtures/node-coverage", import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sol node coverage # "));
  fs.cpSync(fixturePath, root, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(root, mode = "full", extra = [], useDefaultOutput = false) {
  const output = useDefaultOutput ? path.join(root, "coverage", "node-executed") : path.join(root, "report with spaces");
  const env = { ...process.env, SOL_NODE_COVERAGE_FIXTURE_MODE: mode };
  // This is a new standalone CLI run, not a recursive node:test invocation.
  // Neither the parent's test-runner sentinel nor its coverage destination
  // belongs to the isolated child fixture.
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = spawnSync(process.execPath, [toolPath, ...(useDefaultOutput ? [] : [`--output-dir=${output}`]), ...extra], {
    cwd: root, encoding: "utf8", timeout: 120000,
    env,
  });
  assert.equal(child.error, undefined);
  return { ...child, output, diagnostic: child.stdout + child.stderr };
}

test("c8 Node gate merges real query aliases, preserves VM bytes and keeps the original imported population", t => {
  const root = fixture(t);
  // Ambient c8 configuration must not alter this fixed gate's include or floors.
  fs.writeFileSync(path.join(root, ".c8rc.json"), JSON.stringify({ include: ["outside.js"], exclude: ["**/*"], all: true, lines: 0 }));
  const result = run(root);
  assert.equal(result.status, 0, result.diagnostic);
  const report = JSON.parse(fs.readFileSync(path.join(result.output, "coverage-final.json"), "utf8"));
  assert.deepEqual(Object.keys(report).map(file => path.relative(root, file).split(path.sep).join("/")).sort(), [
    "apps/web/alias.js", "apps/web/starcatalog.js", "apps/web/vm.js",
  ]);
  const alias = report[path.join(root, "apps", "web", "alias.js")];
  assert.equal(alias.path, path.join(root, "apps", "web", "alias.js"));
  assert.ok(Object.values(alias.s).every(count => count > 0), "complementary statements merge by canonical path");
  assert.ok(Object.values(alias.b).flat().every(count => count > 0), "neither query instance overwrites the other branch");
  assert.equal(Object.keys(alias.f).length, 2, "module aliases do not double the function denominator");
  assert.ok(Object.values(alias.f).every(count => count > 0));
  const summary = JSON.parse(fs.readFileSync(path.join(result.output, "coverage-summary.json"), "utf8"));
  for (const key of ["lines", "branches", "functions"]) {
    assert.ok(summary.total[key].total > 0);
    assert.equal(summary.total[key].covered, summary.total[key].total, key);
  }
  assert.match(result.stdout, /Node-only coverage/);
  assert.match(result.stdout, /90/);
});

test("under-covered real Node execution fails and retains JSON and summary evidence", t => {
  const result = run(fixture(t), "partial");
  assert.equal(result.status, 1, result.diagnostic);
  assert.match(result.diagnostic, /below 90%/);
  const summary = JSON.parse(fs.readFileSync(path.join(result.output, "coverage-summary.json"), "utf8"));
  assert.ok(summary.total.functions.covered < summary.total.functions.total);
  assert.ok(fs.statSync(path.join(result.output, "coverage-final.json")).size > 0);
});

test("default report directory matches the workflow artifact upload contract", t => {
  const root = fixture(t);
  const child = run(root, "full", [], true);
  assert.equal(child.status, 0, child.diagnostic);
  const report = path.join(root, "coverage", "node-executed", "coverage-summary.json");
  assert.ok(fs.statSync(report).size > 0);
  const workflow = fs.readFileSync(new URL("../../.github/workflows/coverage.yml", import.meta.url), "utf8");
  assert.match(workflow, /^            coverage\/node-executed\r?$/m);
});

test("no in-scope execution cannot reuse an earlier passing report", t => {
  const root = fixture(t);
  assert.equal(run(root).status, 0);
  const result = run(root, "empty");
  assert.equal(result.status, 1, result.diagnostic);
  assert.match(result.diagnostic, /no in-scope|empty coverage/i);
});

test("failed Node tests stay failed even when all coverage metrics pass", t => {
  const result = run(fixture(t), "failing");
  assert.equal(result.status, 1, result.diagnostic);
  assert.match(result.diagnostic, /Node test process failed/);
  const summary = JSON.parse(fs.readFileSync(path.join(result.output, "coverage-summary.json"), "utf8"));
  assert.equal(summary.total.lines.covered, summary.total.lines.total);
});

test("no test files and unsupported threshold or population overrides fail closed", t => {
  const root = fixture(t);
  for (const option of ["--lines=0", "--branches=0", "--functions=0", "--include=outside.js", "--exclude=apps/web/alias.js", "--all"]) {
    const result = run(root, "full", [option]);
    assert.notEqual(result.status, 0);
    assert.match(result.diagnostic, /unsupported argument/i);
  }
  fs.unlinkSync(path.join(root, "tests", "web", "aliases.test.mjs"));
  const result = run(root);
  assert.equal(result.status, 1, result.diagnostic);
  assert.match(result.diagnostic, /no Node test files/);
});

test("every 90% floor uses integer counts, not rounded or claimed percentages", async () => {
  const gate = await import(toolURL).catch(error => {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return {};
  });
  assert.equal(typeof gate.assertCoverageTotals, "function", "fixed-count gate is available");
  const totals = () => Object.fromEntries(["lines", "branches", "functions"].map(key => [key, { total: 1000, covered: 900, pct: 0 }]));
  assert.doesNotThrow(() => gate.assertCoverageTotals(totals()), "exactly 90% passes despite a false pct field");
  for (const key of ["lines", "branches", "functions"]) {
    const under = totals();
    under[key] = { total: 100000, covered: 89999, pct: 100 };
    assert.throws(() => gate.assertCoverageTotals(under), new RegExp(`${key}.*below 90%`));
    for (const invalid of [undefined, {}, { total: 0, covered: 0 }, { total: 1, covered: 2 },
      { total: 10, covered: -1 }, { total: 10, covered: NaN }, { total: 10, covered: 9.5 },
      { total: "10", covered: 10 }, { total: Number.MAX_SAFE_INTEGER + 1, covered: 10 }]) {
      const input = totals();
      input[key] = invalid;
      assert.throws(() => gate.assertCoverageTotals(input), new RegExp(`invalid.*${key}|${key}.*invalid`));
    }
  }
  for (const invalid of [undefined, null, {}, []]) assert.throws(() => gate.assertCoverageTotals(invalid), /invalid/);
});
