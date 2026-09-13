import assert from "node:assert/strict";
import test from "node:test";
import { projectOpaqueDisc, isLabelOccluded } from "../../apps/web/js/labelOcclusion.js";
import { perspective, lookAt, mul } from "../../apps/web/js/orreryMath.js";

const disc = Object.freeze({ id: "Jupiter", x: 100, y: 100, radius: 40, depth: 10 });
const background = { id: "star", x: 100, y: 100, background: true };

test("only a nearer different opaque body occludes a finite world label", () => {
  assert.equal(isLabelOccluded({ id: "Io", x: 100, y: 100, depth: 12 }, [disc]), true);
  assert.equal(isLabelOccluded({ id: "Io", x: 100, y: 100, depth: 8 }, [disc]), false);
  assert.equal(isLabelOccluded({ id: "Io", x: 100, y: 100, depth: 10 }, [disc]), false);
  assert.equal(isLabelOccluded({ id: "Io", x: 100, y: 100, depth: 10 + 1e-8 }, [disc]), false);
  assert.equal(isLabelOccluded({ id: "Jupiter", x: 100, y: 100, depth: 12 }, [disc]), false);
  assert.equal(isLabelOccluded({ id: "Jupiter", x: 100, y: 100, depth: 12 },
    [disc, { ...disc, id: "Moon", depth: 8 }]), true);
});

test("directional sky labels are background regardless of sky-sphere clip-w", () => {
  assert.equal(isLabelOccluded({ ...background, depth: .2 }, [disc]), true);
  assert.equal(isLabelOccluded(background, [disc]), true);
  assert.equal(isLabelOccluded({ ...background, background: false, depth: .2 }, [disc]), false);
  assert.equal(isLabelOccluded({ ...background, background: false, depth: Infinity }, [disc]), false);
});

test("disc tangent stays visible and optional placed bounds detect text intrusion", () => {
  assert.equal(isLabelOccluded({ ...background, x: 140 }, [disc]), false);
  assert.equal(isLabelOccluded({ ...background, x: 139.99 }, [disc]), true);
  assert.equal(isLabelOccluded({ ...background, x: 145 }, [disc]), false);
  assert.equal(isLabelOccluded({ ...background, x: 145,
    bounds: { x: 130, y: 95, width: 50, height: 10 } }, [disc]), true);
  assert.equal(isLabelOccluded({ ...background, x: 145,
    bounds: { x: 140, y: 95, width: 50, height: 10 } }, [disc]), false);
  assert.equal(isLabelOccluded({ ...background, id: "Jupiter",
    bounds: { x: 95, y: 95, width: 50, height: 10 } }, [disc]), false);
});

test("invalid or incomparable data never fabricates occlusion", () => {
  for (const label of [null, {}, { ...background, id: "" }, { ...background, x: NaN },
    { ...background, y: Infinity }, { id: "Io", x: 100, y: 100, depth: -1 },
    { ...background, bounds: { x: 0, y: 0, width: -1, height: 20 } },
    { ...background, bounds: { x: 0, y: 0, width: Infinity, height: 20 } }]) {
    assert.equal(isLabelOccluded(label, [disc]), false);
  }
  for (const bad of [null, {}, { ...disc, depth: NaN }, { ...disc, depth: -10 },
    { ...disc, radius: 0 }, { ...disc, radius: Infinity }]) {
    assert.equal(isLabelOccluded(background, [bad]), false);
    assert.equal(isLabelOccluded(background, [bad, disc]), true);
  }
  assert.equal(isLabelOccluded(background, null), false);
});

test("projected interior uses the current display radius, CSS size and camera depth", () => {
  const matrix = perspective(Math.PI / 2, 2, .1, 100);
  const viewport = { width: 200, height: 100 };
  const body = { id: "planet", position: [0, 0, -10], radius: 1 };
  const before = JSON.stringify({ matrix, viewport, body });
  const projected = projectOpaqueDisc(body, matrix, viewport);
  assert.equal(projected.id, "planet");
  assert.equal(projected.x, 100); assert.equal(projected.y, 50); assert.equal(projected.depth, 10);
  assert.ok(Math.abs(projected.radius - 3.975) < 1e-12); // 50px focal length * 1/10, minus edge guard.
  const enlarged = projectOpaqueDisc({ ...body, radius: 2 }, matrix, viewport);
  assert.ok(Math.abs(enlarged.radius - 8.95) < 1e-12);
  const offset = projectOpaqueDisc({ ...body, position: [2, 1, -10] }, matrix, viewport);
  assert.ok(Math.abs(offset.x - 110) < 1e-12); assert.ok(Math.abs(offset.y - 45) < 1e-12);
  assert.equal(JSON.stringify({ matrix, viewport, body }), before);
});

test("camera rotation and translation preserve a body's projected center and physical inputs", () => {
  const eye = [10, 0, 0], target = [0, 0, 0];
  const matrix = mul(perspective(Math.PI / 2, 2, .1, 100), lookAt(eye, target, [0, 0, 1]));
  const body = Object.freeze({ id: "planet", position: Object.freeze(target), radius: 1 });
  const result = projectOpaqueDisc(body, matrix, { width: 200, height: 100 });
  assert.deepEqual([result.x, result.y, result.depth], [100, 50, 10]);
  assert.ok(result.radius > 0 && result.radius < 5);
  const labels = Object.freeze([Object.freeze({ id: "Io", x: 100, y: 50, depth: 12 })]);
  const discs = Object.freeze([Object.freeze(result)]);
  assert.equal(isLabelOccluded(labels[0], discs), true);
  assert.deepEqual(body.position, [0, 0, 0]);
});

test("behind-camera, clipped, subpixel and unsupported projection cases yield no disc", () => {
  const matrix = perspective(Math.PI / 2, 2, .1, 100), viewport = { width: 200, height: 100 };
  const body = { id: "planet", position: [0, 0, -10], radius: 1 };
  for (const bad of [null, { ...body, radius: 0 }, { ...body, radius: Infinity },
    { ...body, position: [0, 0, 10] }, { ...body, position: [0, 0, -.5] },
    { ...body, position: [0, 0, -.05], radius: .01 },
    { ...body, position: [0, 0, -101] }, { ...body, radius: .001 }]) {
    assert.equal(projectOpaqueDisc(bad, matrix, viewport), null);
  }
  assert.equal(projectOpaqueDisc(body, matrix, { width: NaN, height: 100 }), null);
  assert.equal(projectOpaqueDisc(body, matrix, { width: 0, height: 100 }), null);
  assert.equal(projectOpaqueDisc(body, matrix.slice(0, 15), viewport), null);
  const malformed = [...matrix]; malformed[0] = Infinity;
  assert.equal(projectOpaqueDisc(body, malformed, viewport), null);
  const sheared = [...matrix]; sheared[8] = .2;
  assert.equal(projectOpaqueDisc(body, sheared, viewport), null);
  const ortho = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  assert.equal(projectOpaqueDisc(body, ortho, viewport), null);
});

test("offscreen centers can still occlude visible background text at the canvas edge", () => {
  const matrix = perspective(Math.PI / 2, 2, .1, 100);
  const result = projectOpaqueDisc({ id: "planet", position: [-20.5, 0, -10], radius: 4 }, matrix,
    { width: 200, height: 100 });
  assert.ok(result.x < 0 && result.x + result.radius > 0);
  assert.equal(isLabelOccluded({ id: "star", x: 2, y: 50, background: true }, [result]), true);
});
