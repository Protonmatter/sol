import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import v8ToIstanbul from "v8-to-istanbul";
import { compilerGeneratedModuleKind } from "./module_graph.mjs";

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
  // Immutable numeric-field inventory: exact regeneration and asset admission
  // are tested; atmosphereColumnField.js remains in the executable denominator.
  "js/atmosphereColumnManifest.js",
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
  const compiled = readBundleCoverage(webRoot, manifest);
  const javascript = new Set(manifest.assets.filter(asset => asset.path.startsWith(manifest.namespace) && asset.path.endsWith(".js")).map(asset => path.resolve(webRoot, asset.path)));
  for (const file of javascript) if (!assets.has(file) && !compiled.has(file)) throw new Error("release JavaScript has no coverage source mapping: " + file);
  return { manifest, assets, compiled, javascript };
}

// Validate both sides of every compiler mapping before converting any coverage.
// Maps carry exact original source text; no generated asset claims one-source
// ownership, and an unknown release chunk cannot disappear from the report.
export function readBundleCoverage(webRoot, manifest, { repositoryRoot = ROOT } = {}) {
  const compiled = new Map();
  const assets = new Map(manifest.assets.map(asset => [asset.path, asset]));
  const descriptorName = manifest.namespace + 'web-build.v1.json';
  const descriptorAsset = assets.get(descriptorName);
  if (!descriptorAsset) return compiled;
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const readAsset = (name, expected) => {
    if (!name.startsWith(manifest.namespace) || !/^[A-Za-z0-9_./-]+$/.test(name)
      || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('unsafe compiled coverage path');
    const asset = assets.get(name), file = path.resolve(webRoot, name);
    const bytes = fs.readFileSync(file);
    if (!asset || digest(bytes) !== asset.sha256 || (expected && expected !== asset.sha256)) throw new Error('compiled coverage asset hash mismatch: ' + name);
    return { file, bytes };
  };
  const descriptor = JSON.parse(readAsset(descriptorName).bytes);
  if (descriptor.schema_version !== 'web-build.v1' || !descriptor.sources || !Array.isArray(descriptor.outputs)) throw new Error('invalid compiled coverage descriptor');
  const originals = new Map();
  for (const [name, expected] of Object.entries(descriptor.sources)) {
    if (!/^apps\/web\/(?:js\/)?[A-Za-z0-9_.-]+\.js$/.test(name)) throw new Error('unsafe compiled coverage source');
    const source = path.resolve(repositoryRoot, name), bytes = fs.readFileSync(source);
    if (digest(bytes) !== expected) throw new Error('compiled coverage source hash mismatch: ' + name);
    originals.set(name, { source, text: bytes.toString('utf8') });
  }
  for (const output of descriptor.outputs) {
    if (!/^js\/[A-Za-z0-9_.-]+\.js$/.test(output.path) || output.map !== output.path + '.map'
      || !Array.isArray(output.inputs) || output.inputs.some(name => !originals.has(name))) throw new Error('invalid compiled coverage output');
    const generated = readAsset(manifest.namespace + output.path, output.sha256);
    if (compiled.has(generated.file)) throw new Error('duplicate compiled coverage output');
    const map = JSON.parse(readAsset(manifest.namespace + output.map, output.map_sha256).bytes);
    if (map.version !== 3 || typeof map.mappings !== 'string' || map.sourceRoot
      || !Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)
      || map.sources.length !== map.sourcesContent.length || new Set(map.sources).size !== map.sources.length) throw new Error('invalid compiled coverage source map');
    const sources = map.sources.map((name, index) => {
      const original = originals.get(name);
      if (!original || !output.inputs.includes(name) || original.text !== map.sourcesContent[index]) throw new Error('compiled coverage map source identity mismatch');
      return original.source;
    });
    const generatedKind = sources.length ? null : compilerGeneratedModuleKind(generated.bytes.toString("utf8"), generated.file);
    if (!sources.length && !generatedKind) throw new Error("unmapped executable code in compiled coverage output");
    compiled.set(generated.file, { file: generated.file, text: generated.bytes.toString('utf8'),
      map: { ...map, sources }, sources, generatedKind });
  }
  return compiled;
}

export async function bundleCoverageEntry(entry, declared) {
  if (entry.text !== declared.text) throw new Error('compiled coverage execution source identity differs from artifact');
  // A facade containing only compiler-generated import/export links has no
  // original executable lines. Its shared implementation is mapped separately.
  if (!declared.sources.length) {
    if (!compilerGeneratedModuleKind(entry.text, declared.file)) throw new Error("unmapped executable code in compiled coverage output");
    return {};
  }
  const converter = v8ToIstanbul(declared.file, 0, { source: entry.text, sourceMap: { sourcemap: declared.map } });
  await converter.load();
  const functions = entry.rawScriptCoverage?.functions || [{ functionName: '(root)', isBlockCoverage: true,
    ranges: entry.ranges.map(range => ({ startOffset: range.start, endOffset: range.end, count: 1 })) }];
  converter.applyCoverage(functions);
  return converter.toIstanbul();
}
