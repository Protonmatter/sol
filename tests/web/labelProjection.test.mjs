import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { layoutLabels } from "../../apps/web/js/labelLayout.js";

// Execute the production label function, with only its DOM/scene dependencies
// supplied. No projection formula or packing algorithm is copied into the test.
function fixture() {
  const source = fs.readFileSync(new URL("../../apps/web/js/orrery.js", import.meta.url), "utf8");
  const functionSource = source.slice(source.indexOf("function updateLabels("), source.indexOf("// ---------------------------------------------------------------- detail panel"));
  const labels = [];
  const context = vm.createContext({
    labelEls: labels, updateOrreryAccuracy() {}, layoutLabels,
    state: { bodies: [{ name: "Jupiter", p: [0, 0, 0] }], anchor: "Jupiter" },
    DRAW_LIST: ["Jupiter"], moonMarkers: [], bodyWorldPos: body => body.p,
    document: { getElementById: () => ({ style: {}, appendChild() {} }),
      createElement: () => ({ style: {}, dataset: {}, offsetWidth: 40, offsetHeight: 16, classList: { toggle() {} } }) },
  });
  vm.runInContext(functionSource, context);
  const matrix = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const render = () => context.updateLabels({ clientWidth: 200, clientHeight: 100, offsetLeft: 0, offsetTop: 0 }, matrix, matrix);
  return { labels, context, matrix, render };
}

test("packed label exposes the actual pre-layout projection without moving its box", () => {
  const f = fixture(); f.render();
  assert.equal(f.labels[0].dataset.projectionX, "100");
  assert.equal(f.labels[0].dataset.projectionY, "50");
  assert.equal(f.labels[0].style.left, "108px");
  assert.equal(f.labels[0].style.top, "42px");
});

test("hidden, invalid and removed labels clear stale projection anchors", () => {
  for (const mode of ["behind", "outside", "invalid", "removed"]) {
    const f = fixture(); f.render();
    if (mode === "behind") f.matrix[15] = -1;
    if (mode === "outside") f.context.state.bodies[0].p = [100, 0, 0];
    if (mode === "invalid") f.context.state.bodies[0].p = [NaN, 0, 0];
    if (mode === "removed") f.context.state.bodies = [];
    f.render();
    assert.equal(f.labels[0].style.display, "none", mode);
    assert.equal(f.labels[0].dataset.projectionX, undefined, mode);
    assert.equal(f.labels[0].dataset.projectionY, undefined, mode);
  }
});
