import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import "../../outside.js";

test("distinct ESM instances execute complementary paths and exact-byte VM code", async () => {
  const mode = process.env.SOL_NODE_COVERAGE_FIXTURE_MODE;
  if (mode === "empty") return;
  const plain = await import("../../apps/web/alias.js");
  assert.equal(plain.choose(true), "yes");
  if (mode === "partial") return;
  const versioned = await import("../../apps/web/alias.js?v=fixture#identity");
  assert.notEqual(plain.identity, versioned.identity, "coverage must not change ESM identity semantics");
  assert.equal(versioned.choose(false), "no");
  assert.equal(plain.increment(1), 2);
  assert.equal(versioned.increment(2), 3);
  const { catalogue } = await import("../../apps/web/starcatalog.js?v=fixture");
  assert.equal(catalogue[0].name, "Fixture star");
  const url = new URL("../../apps/web/vm.js", import.meta.url);
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(fs.readFileSync(url, "utf8"), { context, identifier: url.href });
  await module.link(() => { throw new Error("fixture has no imports"); });
  await module.evaluate();
  assert.equal(module.namespace.sign(-1), "negative");
  assert.equal(module.namespace.sign(0), "non-negative");
  const boundary = new vm.SyntheticModule(["run"], function () { this.setExport("run", () => "boundary"); }, {
    context, identifier: `test-boundary:${new URL("../../apps/web/unimported.js", import.meta.url).href}`,
  });
  await boundary.link(() => { throw new Error("boundary has no imports"); });
  await boundary.evaluate();
  assert.equal(boundary.namespace.run(), "boundary");
  assert.notEqual(mode, "failing", "deliberate test-process failure must not become a coverage success");
});
