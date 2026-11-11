// Diagnostics import the same module identity as the selected release. A modern
// immutable namespace needs no query; historical releases keep their old token.
export function releaseModulePath(manifest, name) {
  if (!/^(?:js\/)?[A-Za-z0-9_.-]+\.js$/.test(name)) throw new Error('invalid diagnostic module path');
  if (!manifest.assets.some(asset => asset.path === manifest.namespace + name)) throw new Error('missing diagnostic release module: ' + name);
  return name + (manifest.assets.some(asset => asset.path === manifest.namespace + 'web-build.v1.json') ? '' : '?v=' + manifest.release_id);
}

// Component/probe receipts must still compare originals removed by inlining.
// Callers validate the manifest and build-descriptor asset bytes before use.
export function releaseSourceIdentities(manifest, build = null) {
  const sources = {};
  const add = (name, digest) => {
    if (Object.hasOwn(sources, name) && sources[name] !== digest) throw new Error('conflicting release source ownership: ' + name);
    sources[name] = digest;
  };
  for (const asset of manifest.assets) if (asset.source_path && (asset.path === 'sw.js' || asset.path.startsWith(manifest.namespace))) add(asset.source_path, asset.source_sha256);
  if (build) {
    if (build.schema_version !== 'web-build.v1' || !build.sources) throw new Error('invalid release compiler source inventory');
    for (const [name, digest] of Object.entries(build.sources)) add(name, digest);
  }
  return sources;
}
