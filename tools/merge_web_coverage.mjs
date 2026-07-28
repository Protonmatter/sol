#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import coverageModule from "istanbul-lib-coverage";
import reportModule from "istanbul-lib-report";
import reportsModule from "istanbul-reports";
import {
  ROOT,
  absoluteRuntimeModules,
} from "./js_coverage_scope.mjs";

const { createCoverageMap } = coverageModule;
const { createContext } = reportModule;
const { create } = reportsModule;

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const minimumLines = Number(argument("minimum-lines", "90"));
if (!Number.isFinite(minimumLines) || minimumLines < 0 || minimumLines > 100) {
  throw new Error("--minimum-lines must be between 0 and 100");
}

const inputs = [
  path.join(ROOT, "coverage", "node", "coverage-final.json"),
  path.join(ROOT, "coverage", "browser", "coverage-final.json"),
];
const combined = createCoverageMap({});
for (const input of inputs) {
  if (!fs.existsSync(input)) throw new Error(`missing coverage input: ${input}`);
  combined.merge(JSON.parse(fs.readFileSync(input, "utf8")));
}

const normalized = new Set(combined.files().map((file) => path.resolve(file)));
const absent = absoluteRuntimeModules().filter((file) => !normalized.has(path.resolve(file)));
if (absent.length) {
  throw new Error(
    "hand-written runtime modules are absent from the merged denominator:\n"
    + absent.map((file) => `  - ${path.relative(ROOT, file)}`).join("\n")
  );
}

const outputDirectory = path.join(ROOT, "coverage", "combined");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "coverage-final.json"),
  `${JSON.stringify(combined.toJSON())}\n`
);
const context = createContext({ dir: outputDirectory, coverageMap: combined });
for (const reporter of ["text", "json-summary", "lcovonly"]) create(reporter).execute(context);

const summary = combined.getCoverageSummary();
const lines = summary.lines.pct;
if (lines < minimumLines) {
  throw new Error(
    `combined Node + Chromium line coverage ${lines.toFixed(2)}% is below ${minimumLines.toFixed(2)}%`
  );
}
console.log(
  `OK: combined hand-written web runtime line coverage ${lines.toFixed(2)}% `
  + `(minimum ${minimumLines.toFixed(2)}%)`
);
