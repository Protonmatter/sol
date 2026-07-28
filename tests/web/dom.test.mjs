import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const nodes = new Map([
  ["layerConfidence", { checked: false }],
  ["layerRegions", { checked: false }],
  ["target", { textContent: "", title: "", className: "" }],
]);
globalThis.document = { getElementById: (id) => nodes.get(id) || null };

const selectorsUrl = new URL("../../apps/web/js/selectors.js", import.meta.url);
const tokenMatch = readFileSync(selectorsUrl, "utf8").match(/\.\/dom\.js\?v=([0-9a-zA-Z]+)/);
const q = tokenMatch ? `?v=${tokenMatch[1]}` : "";
const { controls, text, textWithTitle, setPill } =
  await import(`../../apps/web/js/dom.js${q}`);

test("control references and guarded DOM writes stay precise", () => {
  assert.equal(controls.confidence, nodes.get("layerConfidence"));
  assert.equal(controls.regions, nodes.get("layerRegions"));
  text("target", "alpha");
  assert.equal(nodes.get("target").textContent, "alpha");
  text("missing", "ignored");
  textWithTitle("target", "beta", "details");
  assert.equal(nodes.get("target").textContent, "beta");
  assert.equal(nodes.get("target").title, "details");
  textWithTitle("missing", "ignored", "ignored");
  setPill("target", "live", "research-ready");
  assert.equal(nodes.get("target").textContent, "live");
  assert.equal(nodes.get("target").className, "state-pill research-ready");
  setPill("missing", "ignored", "ignored");
});
