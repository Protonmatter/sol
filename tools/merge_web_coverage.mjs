#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import coverageModule from "istanbul-lib-coverage";
import reportModule from "istanbul-lib-report";
import reportsModule from "istanbul-reports";
import {
  ROOT,
  WEB,
  releaseSourceMap,
  absoluteRuntimeModules,
  addUnexecutedCoverage,
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
if (!Number.isFinite(minimumLines) || minimumLines < 90 || minimumLines > 100) {
  throw new Error("--minimum-lines must be between 90 and 100");
}
const webRoot = path.resolve(argument("web-root", WEB));
if (webRoot !== WEB && !releaseSourceMap(webRoot)) throw new Error("staged coverage requires a release manifest");

const inputs = [
  path.resolve(argument("node-input", path.join(ROOT, "coverage", "node", "coverage-final.json"))),
  path.resolve(argument("browser-input", path.join(ROOT, "coverage", "browser", "coverage-final.json"))),
];
const runtimeFiles = absoluteRuntimeModules();
const expectedFiles = new Set(runtimeFiles);
function assertCoverageEntry(file, entry) {
  if (!expectedFiles.has(file) || entry?.path !== file) {
    throw new Error("coverage file outside canonical hand-written runtime population");
  }
  for (const [map, counts] of [["statementMap", "s"], ["fnMap", "f"], ["branchMap", "b"]]) {
    if (!entry[map] || !entry[counts] || typeof entry[map] !== "object" || typeof entry[counts] !== "object"
      || Array.isArray(entry[map]) || Array.isArray(entry[counts])
      || JSON.stringify(Object.keys(entry[map]).sort()) !== JSON.stringify(Object.keys(entry[counts]).sort())) {
      throw new Error(`invalid coverage count map ${counts}: ${file}`);
    }
    for (const [key, hits] of Object.entries(entry[counts])) {
      if (counts === "b") {
        const locations = entry[map][key]?.locations;
        if (!Array.isArray(hits) || !Array.isArray(locations) || !locations.length || hits.length !== locations.length) {
          throw new Error(`invalid coverage branch arity: ${file}`);
        }
      }
      const values = counts === "b" ? hits : [hits];
      if (values.some(value => !Number.isSafeInteger(value) || value < 0)) {
        throw new Error(`invalid coverage count ${counts}: ${file}`);
      }
    }
  }
}
const combined = createCoverageMap({});
for (const input of inputs) {
  if (!fs.existsSync(input)) throw new Error(`missing coverage input: ${input}`);
  const data = JSON.parse(fs.readFileSync(input, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`invalid coverage map: ${input}`);
  for (const [file, entry] of Object.entries(data)) assertCoverageEntry(file, entry);
  combined.merge(data);
}
// Individually safe hit counts can overflow when Istanbul adds the reports.
for (const file of combined.files()) assertCoverageEntry(file, combined.fileCoverageFor(file).toJSON());

const normalized = new Set(combined.files().map((file) => path.resolve(file)));
const absent = runtimeFiles.filter((file) => !normalized.has(path.resolve(file)));
if (absent.length) {
  throw new Error(
    "hand-written runtime modules are absent from the merged denominator:\n"
    + absent.map((file) => `  - ${path.relative(ROOT, file)}`).join("\n")
  );
}

// Naming a file does not establish its denominator. Derive the executable lines
// from the current source using the same converter as the browser's zero seed.
const expected = createCoverageMap({});
await addUnexecutedCoverage(expected, runtimeFiles);
for (const file of runtimeFiles) {
  const actualLines = Object.keys(combined.fileCoverageFor(file).getLineCoverage()).sort();
  const expectedLines = Object.keys(expected.fileCoverageFor(file).getLineCoverage()).sort();
  if (!expectedLines.length || JSON.stringify(actualLines) !== JSON.stringify(expectedLines)) {
    throw new Error(`coverage line denominator differs from current source: ${path.relative(ROOT, file)}`);
  }
}

const outputDirectory = path.resolve(argument("output-dir", path.join(ROOT, "coverage", "combined")));
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "coverage-final.json"),
  `${JSON.stringify(combined.toJSON())}\n`
);
const context = createContext({ dir: outputDirectory, coverageMap: combined });
for (const reporter of ["text", "json-summary", "lcovonly"]) create(reporter).execute(context);

const summary = combined.getCoverageSummary();
const lines = summary.lines.pct;
const { covered, total } = summary.lines;
if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(covered) || covered < 0 || covered > total) {
  throw new Error("invalid combined line coverage counts");
}
const [whole, fractional = ""] = String(minimumLines).split(".");
const scale = 10n ** BigInt(fractional.length);
const minimum = BigInt(whole + fractional);
const minimumLabel = Number.isInteger(minimumLines) ? minimumLines.toFixed(2) : String(minimumLines);
if (BigInt(covered) * 100n * scale < BigInt(total) * minimum) {
  throw new Error(
    `combined Node + Chromium line coverage ${lines.toFixed(2)}% (${covered}/${total}) is below ${minimumLabel}%`
  );
}
console.log(
  `OK: combined hand-written web runtime line coverage ${lines.toFixed(2)}% `
  + `(minimum ${minimumLabel}%)`
);
