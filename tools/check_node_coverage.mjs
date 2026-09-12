#!/usr/bin/env node

// Fixed Node-only gate: the same imported apps/web/**/*.js population as the
// native reporter, including generated modules. This is NOT the separate --all
// Node + Chromium runtime gate. Run from the repository root; the only CLI
// option is --output-dir=PATH. Raw V8 data, JSON and summary evidence are kept.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Report } from "c8";

const METRICS = ["lines", "branches", "functions"];

export function assertCoverageTotals(totals) {
  const failures = [];
  for (const metric of METRICS) {
    const counts = totals?.[metric];
    if (!counts || !Number.isSafeInteger(counts.total) || counts.total <= 0
      || !Number.isSafeInteger(counts.covered) || counts.covered < 0 || counts.covered > counts.total) {
      failures.push(`invalid ${metric} coverage counts`);
    } else if (BigInt(counts.covered) * 10n < BigInt(counts.total) * 9n) {
      failures.push(`${metric} coverage ${counts.covered}/${counts.total} is below 90%`);
    }
  }
  if (failures.length) throw new Error(failures.join("; "));
}

function collectedFiles(directory, report) {
  const files = new Set();
  const rawFiles = fs.readdirSync(directory).filter(name => name.endsWith(".json"));
  if (!rawFiles.length) throw new Error("missing raw Node coverage report");
  for (const name of rawFiles) {
    const raw = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    if (!Array.isArray(raw.result)) throw new Error(`invalid raw Node coverage report: ${name}`);
    for (const entry of raw.result) {
      const file = entry.url.startsWith("file:") ? fileURLToPath(entry.url) : entry.url;
      if (!path.isAbsolute(file) || !report.exclude.shouldInstrument(file)) continue;
      // c8 logs conversion errors only in debug mode. Require every in-scope
      // collected source to survive conversion instead of silently dropping it.
      const source = fs.readFileSync(file, "utf8");
      if (!Array.isArray(entry.functions) || entry.functions.length === 0) throw new Error(`missing coverage ranges: ${file}`);
      for (const fn of entry.functions) {
        if (!Array.isArray(fn.ranges) || fn.ranges.length === 0) throw new Error(`missing coverage ranges: ${file}`);
        for (const range of fn.ranges) {
          if (!Number.isSafeInteger(range.startOffset) || !Number.isSafeInteger(range.endOffset)
            || range.startOffset < 0 || range.endOffset < range.startOffset || range.endOffset > source.length
            || !Number.isSafeInteger(range.count) || range.count < 0) {
            throw new Error(`invalid coverage range: ${file}`);
          }
        }
      }
      files.add(path.resolve(file));
    }
  }
  return files;
}

export async function checkNodeCoverage(outputDirectory = path.resolve("coverage", "node-executed")) {
  const root = process.cwd();
  const tests = fs.readdirSync(path.join(root, "tests", "web"))
    .filter(name => name.endsWith(".test.mjs")).sort()
    .map(name => path.join(root, "tests", "web", name));
  if (!tests.length) throw new Error("no Node test files found in tests/web");
  const output = path.resolve(outputDirectory);
  fs.mkdirSync(output, { recursive: true });
  // A unique raw directory prevents stale or concurrent runs from contributing
  // hits. Nothing is deleted; a failed test run retains its own evidence too.
  const rawDirectory = fs.mkdtempSync(path.join(output, "raw-"));
  const child = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", ...tests], {
    cwd: root, stdio: "inherit", timeout: 600000,
    env: { ...process.env, NODE_V8_COVERAGE: rawDirectory },
  });
  if (child.error) throw child.error;

  // Programmatic c8 reporting does not read ambient .c8rc/package configuration.
  // ESM loading is untouched: c8 canonicalizes file URLs only while merging
  // the actual V8 execution counts, before converting unchanged source offsets.
  const report = Report({
    include: ["apps/web/**/*.js"], exclude: [], extension: [".js"],
    all: false, omitRelative: true, allowExternal: false, excludeNodeModules: false,
    reporter: ["json", "json-summary", "text-summary"],
    reportsDirectory: output, tempDirectory: rawDirectory, resolve: root,
  });
  const expected = collectedFiles(rawDirectory, report);
  await report.run();
  const coveragePath = path.join(output, "coverage-final.json");
  const summaryPath = path.join(output, "coverage-summary.json");
  const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  if (!expected.size || !Object.keys(coverage).length) throw new Error("empty coverage: no in-scope Node execution");
  const actual = new Set(Object.keys(coverage).map(file => path.resolve(file)));
  if (actual.size !== expected.size || [...expected].some(file => !actual.has(file))) {
    throw new Error("c8 report population differs from collected Node sources");
  }
  for (const metric of METRICS) {
    const counts = summary.total?.[metric];
    console.log(`Node-only coverage ${metric}: ${counts?.covered}/${counts?.total}; required 90%`);
  }
  if (child.status !== 0) throw new Error(`Node test process failed (${child.signal ?? child.status ?? "unknown status"}); coverage reports retained in ${output}`);
  assertCoverageTotals(summary.total);
  return summary;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(arg => !arg.startsWith("--output-dir=") || !arg.slice(13))) {
      throw new Error("unsupported argument; usage: node tools/check_node_coverage.mjs [--output-dir=PATH]");
    }
    await checkNodeCoverage(args[0]?.slice(13));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
