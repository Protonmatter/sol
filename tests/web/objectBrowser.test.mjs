import assert from "node:assert/strict";
import test from "node:test";
import { syncObjectRows, matchesObject } from "../../apps/web/js/objectBrowser.js";
import { renderedEpochLabel } from "../../apps/web/js/accuracy.js";

test("geometric grouping ignores a positive refracted-horizon flag", () => {
  assert.equal(matchesObject({ name: "Moon", alt_deg: -0.1, above_horizon: true }, "moon", "above"), false);
  assert.equal(matchesObject({ name: "Moon", alt_deg: 0, above_horizon: true }, "", "below"), true);
  assert.equal(matchesObject({ name: "Moon", alt_deg: 1 }, "moon", "above"), true);
  assert.equal(matchesObject({ name: "Sirius", kind: "star" }, "sir", "star"), true);
});

test("ten live refreshes preserve the actual node and click identity", () => {
  const list = { children: [], ownerDocument: { createElement() { return { dataset: {}, setAttribute(key, value) { this[key] = value; }, remove() { list.children.splice(list.children.indexOf(this), 1); } }; } }, insertBefore(node, next) {
    const old = this.children.indexOf(node); if (old >= 0) this.children.splice(old, 1);
    this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, node);
  } };
  const selected = [];
  syncObjectRows(list, [{ id: "Earth", label: "Earth 1 AU" }], id => selected.push(id));
  const focused = list.children[0];
  for (let i = 0; i < 10; i++) syncObjectRows(list, [{ id: "Earth", label: `Earth ${i}°`, selected: true }], id => selected.push(id));
  assert.equal(list.children[0], focused);
  assert.equal(focused.textContent, "Earth 9°");
  assert.throws(() => syncObjectRows(list, [{ id: "Earth", label: "corrupt" }, { id: "Earth", label: "duplicate" }], () => {}), /Duplicate/);
  assert.equal(focused.textContent, "Earth 9°", "invalid revisions must not partly mutate the list");
  focused.onclick();
  assert.deepEqual(selected, ["Earth"]);
  syncObjectRows(list, [], () => {});
  assert.equal(list.children.length, 0);
});

test("displayed date follows rendered instant across New Year, not a slider offset", () => {
  assert.match(renderedEpochLabel(Date.parse("2026-12-31T23:59:59Z") / 1000), /2026-12-31 23:59:59/);
  assert.match(renderedEpochLabel(Date.parse("2027-01-01T00:00:01Z") / 1000), /2027-01-01 00:00:01/);
  assert.equal(renderedEpochLabel(NaN), "Render time unavailable");
});
