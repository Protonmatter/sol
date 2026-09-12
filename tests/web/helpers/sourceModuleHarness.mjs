import fs from "node:fs";
import vm from "node:vm";

function sourceURL(value) {
  const url = new URL(value);
  if (url.protocol !== "file:") throw new Error("source module harness requires a local file URL");
  if (url.hash || (url.search && !/^\?v=[a-zA-Z0-9._-]+$/.test(url.search))) {
    throw new Error("source module harness only canonicalizes release cache tokens");
  }
  url.search = "";
  url.hash = "";
  return url;
}

// Keep the complete production source and its V8 offsets intact. Browser host
// boundaries may be supplied as namespaces, but their synthetic modules never
// claim execution under a production file's coverage identity.
export async function loadSourceModules(context, urls, {
  resolveImport = () => undefined,
  importModuleDynamically,
  initializeImportMeta = (meta, url) => { meta.url = url.href; },
} = {}) {
  const modules = new Map();
  const boundaries = new Map();
  function moduleFor(value) {
    const url = sourceURL(value);
    if (modules.has(url.href)) return modules.get(url.href);
    modules.set(url.href, new vm.SourceTextModule(fs.readFileSync(url, "utf8"), {
      context,
      identifier: url.href,
      initializeImportMeta: meta => initializeImportMeta(meta, url),
      importModuleDynamically,
    }));
    return modules.get(url.href);
  }
  for (const value of urls) moduleFor(value);
  const link = async (specifier, parent) => {
    const resolved = new URL(specifier, parent.identifier);
    const local = sourceURL(resolved).href;
    if (modules.has(local)) return modules.get(local);
    if (!boundaries.has(resolved.href)) {
      boundaries.set(resolved.href, Promise.resolve(resolveImport(specifier, resolved)).then(namespace =>
        namespace === undefined ? moduleFor(resolved) : new vm.SyntheticModule(Object.keys(namespace), function () {
          for (const [name, value] of Object.entries(namespace)) this.setExport(name, value);
        }, { context, identifier: `test-boundary:${resolved.href}` })));
    }
    return boundaries.get(resolved.href);
  };
  for (const module of modules.values()) {
    if (module.status === "unlinked") await module.link(link);
    if (module.status === "linked") await module.evaluate();
  }
  return urls.map(url => modules.get(sourceURL(url).href).namespace);
}
