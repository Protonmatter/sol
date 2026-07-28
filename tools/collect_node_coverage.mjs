#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  ROOT,
  absoluteRuntimeModules,
  repositoryRelative,
} from "./js_coverage_scope.mjs";

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
  "--reports-dir=coverage/node",
  ...absoluteRuntimeModules().map((file) => `--include=${repositoryRelative(file)}`),
  process.execPath,
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

const output = path.join(ROOT, "coverage", "node", "coverage-final.json");
if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
  throw new Error(`c8 did not produce ${output}`);
}
