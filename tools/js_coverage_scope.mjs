import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import v8ToIstanbul from "v8-to-istanbul";

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
  // Generated verbatim from the canonical JSON schema; solarContract.test.mjs
  // requires canonical equality. The hand-written guard remains counted.
  "js/solarSchema.js",
  // ephemerisV3.test.mjs compares this generated object to the canonical schema.
  "js/ephemerisSchema.js",
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

export function sourceCoverage(entry, original, manifest) {
  const replacements = {
    __SOL_RELEASE_ID__: manifest.release_id,
    __SOL_RELEASE_NAMESPACE__: manifest.namespace,
    __SOL_BASE_PATH__: manifest.base_path,
  };
  const edits = [];
  let delta = 0;
  const stamped = original.replace(/\?v=[0-9a-zA-Z._-]+|__SOL_RELEASE_ID__|__SOL_RELEASE_NAMESPACE__|__SOL_BASE_PATH__/g,
    (match, offset) => {
      const replacement = match.startsWith("?v=") ? `?v=${manifest.release_id}` : replacements[match];
      edits.push({ originalStart: offset, originalEnd: offset + match.length,
        stagedStart: offset + delta, stagedEnd: offset + delta + replacement.length });
      delta += replacement.length - match.length;
      return replacement;
    });
  if (stamped !== entry.text) throw new Error("staged coverage source identity differs from declared source");
  function offset(value) {
    let shift = 0;
    for (const edit of edits) {
      if (value < edit.stagedStart) break;
      if (value <= edit.stagedEnd) return edit.originalStart + Math.min(value - edit.stagedStart, edit.originalEnd - edit.originalStart);
      shift = edit.stagedEnd - edit.originalEnd;
    }
    return value - shift;
  }
  const result = { ...entry, text: original };
  if (entry.rawScriptCoverage) result.rawScriptCoverage = { ...entry.rawScriptCoverage,
    functions: entry.rawScriptCoverage.functions.map((fn) => ({ ...fn, ranges: fn.ranges.map((range) => ({
      ...range, startOffset: offset(range.startOffset), endOffset: offset(range.endOffset),
    })) })),
  };
  if (entry.ranges) result.ranges = entry.ranges.map((range) => ({ ...range, start: offset(range.start), end: offset(range.end) }));
  return result;
}

// Browser scenarios need not execute historical adapters or cancellation-only
// paths. Preserve their entire denominator at zero; never invent an import hit.
export async function addUnexecutedCoverage(coverage, files) {
  const present = new Set(coverage.files().map(file => path.resolve(file)));
  for (const file of files) {
    if (present.has(path.resolve(file))) continue;
    const source = fs.readFileSync(file, "utf8");
    const converter = v8ToIstanbul(file, 0, { source });
    await converter.load();
    converter.applyCoverage([{ functionName: "", isBlockCoverage: true,
      ranges: [{ startOffset: 0, endOffset: source.length, count: 0 }] }]);
    coverage.merge(converter.toIstanbul());
  }
}

export function releaseSourceMap(webRoot) {
  const file = path.join(webRoot, "web-release-manifest.json");
  if (!fs.existsSync(file)) return null;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.schema_version !== "web-release-manifest.v1") throw new Error("unsupported release source map");
  const assets = new Map();
  for (const asset of manifest.assets) {
    if (!asset.source_path || (!asset.path.startsWith(manifest.namespace) && asset.path !== "sw.js")) continue;
    const source = path.resolve(ROOT, asset.source_path);
    if (!source.startsWith(WEB + path.sep) || path.isAbsolute(asset.source_path)) throw new Error("unsafe coverage source path");
    const bytes = fs.readFileSync(source);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.source_sha256) throw new Error(`coverage source hash mismatch: ${asset.source_path}`);
    assets.set(path.resolve(webRoot, asset.path), { source, original: bytes.toString("utf8") });
  }
  return { manifest, assets };
}
