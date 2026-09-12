#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  ROOT,
  WEB,
  releaseSourceMap,
  absoluteRuntimeModules,
  repositoryRelative,
} from "./js_coverage_scope.mjs";

function argument(name, fallback) {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
}
const webRoot = path.resolve(argument("web-root", WEB));
// Unit tests execute original sources; this validates their exact association
// with the staged candidate whose Chromium coverage is merged later.
if (webRoot !== WEB && !releaseSourceMap(webRoot)) throw new Error("staged coverage requires a release manifest");
const outputDirectory = path.resolve(argument("output-dir", path.join(ROOT, "coverage", "node")));

const c8 = path.join(ROOT, "node_modules", "c8", "bin", "c8.js");
if (!fs.existsSync(c8)) {
  throw new Error("missing locked dev dependencies; run npm ci");
}

const tests = fs.readdirSync(path.join(ROOT, "tests", "web"))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => path.join("tests", "web", name));

const args = [
  c8,
  "--all",
  "--clean",
  "--reporter=json",
  `--reports-dir=${outputDirectory}`,
  ...absoluteRuntimeModules().map((file) => `--include=${repositoryRelative(file)}`),
  process.execPath,
  "--experimental-vm-modules",
  "--test",
  ...tests,
];

const result = spawnSync(process.execPath, args, {
  cwd: ROOT,
  encoding: "utf8",
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const output = path.join(outputDirectory, "coverage-final.json");
if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
  throw new Error(`c8 did not produce ${output}`);
}
