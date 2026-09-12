import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { canonicalCoverageURL } from "../../tools/node_coverage_identity.mjs";
import { ROOT, WEB } from "../../tools/js_coverage_scope.mjs";

test("diagnostic canonicalization preserves exact production file and changes only the v query", () => {
  const source = pathToFileURL(path.join(WEB, "js", "starphysics.js")).href;
  assert.equal(canonicalCoverageURL(source + "?v=dcca6290db"), source);
  assert.equal(canonicalCoverageURL(source), source);
});

test("diagnostic identity hook refuses unrelated origins, paths, fragments and query meanings", () => {
  const source = pathToFileURL(path.join(WEB, "js", "starphysics.js")).href;
  for (const url of ["https://example.invalid/a.js?v=x", "data:text/javascript,export{}",
    pathToFileURL(path.join(ROOT, "tests", "web", "starphysics.test.mjs")).href + "?v=x",
    new URL("../../package.json?v=x", source).href,
    source + "?mode=test", source + "?v=x&mode=test", source + "?v=x&v=y",
    source + "?v=../outside", source + "?v=x#other", source + "?v=", "not-a-url"]) {
    assert.equal(canonicalCoverageURL(url), url, url);
  }
});
