import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps", "web");

// Generated catalogues are executable ES modules and must load in Chromium, but their
// thousands of declarative rows are not hand-written logic. Counting them would let a large
// data refresh hide an application-logic coverage regression.
export const GENERATED_MODULES = new Set([
  "js/constellations.js",
  "js/galacticobjects.js",
  "js/geography.js",
  "js/moonelements.js",
  "js/moons.js",
  "js/starcatalog.js",
]);

export function relativePageModules({ includeGenerated = false } = {}) {
  const files = ["app.js", "engine.js"];
  for (const entry of fs.readdirSync(path.join(WEB, "js"), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(`js/${entry.name}`);
  }
  files.sort();
  return includeGenerated ? files : files.filter((file) => !GENERATED_MODULES.has(file));
}

export function relativeRuntimeModules(options) {
  return [...relativePageModules(options), "sw.js"].sort();
}

export function absolutePageModules(options) {
  return relativePageModules(options).map((file) => path.join(WEB, file));
}

export function absoluteRuntimeModules(options) {
  return relativeRuntimeModules(options).map((file) => path.join(WEB, file));
}

export function repositoryRelative(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

export { ROOT, WEB };
