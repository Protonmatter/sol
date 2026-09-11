import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fs.realpathSync(fileURLToPath(new URL("../apps/web/", import.meta.url)));

// Diagnostic only: ESM cache-busting URLs identify the identical local source
// bytes. Native Node coverage counts both instances independently; this resolve
// hook makes unit tests and production imports exercise one source instance.
// It never transforms source, changes a path, or excludes an imported module.
export function canonicalCoverageURL(input) {
  let url;
  try { url = new URL(input); } catch { return input; }
  if (url.protocol !== "file:" || url.hash || !/^\?v=[a-zA-Z0-9._-]+$/.test(url.search)) return input;
  const clean = new URL(url); clean.search = "";
  let file;
  try { file = fs.realpathSync(fileURLToPath(clean)); } catch { return input; }
  const relative = path.relative(WEB, file);
  if (relative.startsWith("..") || path.isAbsolute(relative) || path.extname(file) !== ".js") return input;
  return clean.href;
}
