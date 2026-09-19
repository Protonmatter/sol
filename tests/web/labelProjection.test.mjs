import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { layoutLabels } from "../../apps/web/js/labelLayout.js";
import { projectOpaqueDisc, isLabelOccluded } from "../../apps/web/js/labelOcclusion.js";
import { BODY } from "../../apps/web/js/bodyData.js";
import { perspective } from "../../apps/web/js/orreryMath.js";

// Execute the production label function, with only its DOM/scene dependencies
// supplied. No projection formula or packing algorithm is copied into the test.
function fixture() {
  const source = fs.readFileSync(new URL("../../apps/web/js/orrery.js", import.meta.url), "utf8");
  const functionSource = source.slice(source.indexOf("function updateLabels("), source.indexOf("// ---------------------------------------------------------------- detail panel"));
  const labels = [];
  const context = vm.createContext({
    labelEls: labels, updateOrreryAccuracy() {}, layoutLabels, projectOpaqueDisc, isLabelOccluded, BODY,
    // The scene boundary supplies a known enlarged display radius. Projection
    // and occlusion still execute their actual production implementations.
    displayRadiusAU: () => 0.3,
    state: { bodies: [{ name: "Jupiter", p: [0, 0, 0] }], anchor: "Jupiter" },
    DRAW_LIST: ["Jupiter"], moonMarkers: [], moonSet: { MOONS: [] },
    moonDisplayRadius: () => 0.02, bodyWorldPos: body => body.p,
    cel: { pulsars: [], deepsky: [], brightStars: [] },
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

test("a background label behind an opaque planet clears its anchor and returns when unobstructed", () => {
  const f = fixture();
  f.matrix.splice(0,16,...perspective(Math.PI / 2,2,.1,100));
  f.context.state.bodies[0].p = [0,0,-2];
  f.context.state.showLabels = true;
  f.context.state.showSky = true;
  const star = { name: "Reference star", m: 0, pos: [0,1,-2] };
  f.context.cel.brightStars.push(star);
  f.render();
  const label = f.labels.find(label => label.textContent === star.name);
  assert.ok(label);
  assert.equal(label.style.display, "block");
  assert.equal(label.dataset.projectionX, "100");
  assert.ok(Math.abs(Number(label.dataset.projectionY) - 25) < 1e-12);
  const bodyPosition = [...f.context.state.bodies[0].p];
  star.pos = [0,0,-2000];
  f.render();
  assert.equal(label.style.display, "none", "directional sky distance must not prevent opaque-disc occlusion");
  assert.equal(label.dataset.projectionX, undefined);
  assert.equal(label.dataset.projectionY, undefined);
  assert.equal(f.labels.find(label => label.textContent === "Jupiter").style.display, "block", "a body's own disc must not hide its label");
  assert.deepEqual(f.context.state.bodies[0].p, bodyPosition, "label suppression cannot move the body");
  star.pos = [0,1,-2];
  f.render();
  assert.equal(label.style.display, "block");
  assert.equal(label.dataset.projectionX, "100");
  assert.ok(Math.abs(Number(label.dataset.projectionY) - 25) < 1e-12);
});

test("a moon keeps its name when it sits on or behind its parent disc", () => {
  const f = fixture();
  f.matrix.splice(0, 16, ...perspective(Math.PI / 2, 2, .1, 100));
  f.context.DRAW_LIST = ["Earth", "Moon"];
  f.context.state.bodies = [
    { name: "Earth", p: [0, 0, -2] },
    { name: "Moon", p: [0.02, 0, -2.4] },
  ];
  f.context.state.anchor = "Earth";
  f.context.state.selected = "Earth";
  f.context.moonSet = { MOONS: [] };
  f.render();
  const moon = f.labels.find(label => label.textContent === "Moon");
  assert.ok(moon, "Earth's Moon remains a label candidate");
  assert.equal(moon.style.display, "block", "Earth's disc must not hide the Moon's name");

  f.context.DRAW_LIST = ["Jupiter"];
  f.context.state.bodies = [{ name: "Jupiter", p: [0, 0, -2] }];
  f.context.state.anchor = "Jupiter";
  f.context.state.selected = "Jupiter";
  f.context.moonSet = { MOONS: [{ n: "Io", p: "Jupiter" }] };
  f.context.moonMarkers = [{ name: "Io", pos: [0.02, 0, -2.4], moon: { n: "Io", p: "Jupiter" } }];
  f.render();
  const io = f.labels.find(label => label.textContent === "Io");
  assert.ok(io, "a catalog moon remains a label candidate");
  assert.equal(io.style.display, "block", "Jupiter's disc must not hide Io's name");
});
