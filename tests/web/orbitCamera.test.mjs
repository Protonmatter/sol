import test from 'node:test';
import assert from 'node:assert/strict';
import { fitOrbitDistance, minimumOrbitDistance, orbitNearPlane } from '../../apps/web/js/orbitCamera.js';

const fovY = 42 * Math.PI / 180;
test('focus frames actual display extent at 76% of the limiting viewport dimension', () => {
  for (const extent of [.00001, .002, .08, .32]) for (const aspect of [.4, 1, 2]) {
    const distance = fitOrbitDistance(extent, aspect, fovY, 0);
    const tangent = Math.tan(fovY / 2) * Math.min(1, aspect);
    const occupied = extent / Math.sqrt(distance * distance - extent * extent) / tangent;
    assert.ok(Math.abs(occupied - .76) < 1e-12, `${extent}/${aspect} fit`);
    assert.ok(distance > extent);
  }
  assert.ok(fitOrbitDistance(.02, .4, fovY, 0) > fitOrbitDistance(.02, 2, fovY, 0));
});

test('rings frame their full outer extent and focus scales without enlarging the body', () => {
  const plain = fitOrbitDistance(.14, 1.5, fovY, 0);
  const ringed = fitOrbitDistance(.14 * 2.3, 1.5, fovY, 0);
  assert.ok(Math.abs(ringed / plain - 2.3) < 1e-12);
  assert.ok(minimumOrbitDistance(.002, 0) < .003, 'small moons can zoom inside the old 0.6 AU clamp');
  assert.ok(minimumOrbitDistance(.2, 0) > .2, 'eye stays outside enclosing geometry');
});

test('near plane remains before the focused surface and retains the overview default', () => {
  for (const extent of [1e-7, .002, .08, .4]) {
    const distance = minimumOrbitDistance(extent, 30);
    const near = orbitNearPlane(distance, extent);
    assert.ok(near > 0 && near < distance - extent);
    assert.ok(near <= .008);
  }
  assert.equal(orbitNearPlane(26, .2), .008);
});

test('physical-scale tiny bodies respect a conservative Float32 camera separation floor', () => {
  const radius = 1e-8;
  const origin = fitOrbitDistance(radius, 1, fovY, 0);
  const distant = fitOrbitDistance(radius, 1, fovY, 30);
  assert.ok(distant > 30 * 2 ** -23 * 16);
  assert.ok(distant > origin * 100, 'cannot promise the same close-up at a distant Float32 origin');
  assert.ok(orbitNearPlane(distant, radius) < distant - radius);
});

test('camera helpers reject unavailable or invalid geometry instead of manufacturing a fit', () => {
  for (const radius of [0, -1, NaN, Infinity]) {
    assert.throws(() => fitOrbitDistance(radius, 1, fovY, 0), /camera/i);
    assert.throws(() => minimumOrbitDistance(radius, 0), /camera/i);
  }
  for (const aspect of [0, -1, NaN, Infinity]) assert.throws(() => fitOrbitDistance(1, aspect, fovY, 0), /camera/i);
  for (const fov of [0, Math.PI, NaN]) assert.throws(() => fitOrbitDistance(1, 1, fov, 0), /camera/i);
  for (const coordinate of [-1, NaN, Infinity]) assert.throws(() => minimumOrbitDistance(1, coordinate), /camera/i);
  assert.throws(() => orbitNearPlane(0, 1), /camera/i);
  assert.throws(() => orbitNearPlane(1, -1), /camera/i);
  assert.throws(() => orbitNearPlane(NaN, 0), /camera/i);
  assert.equal(orbitNearPlane(.00001, 1), 1e-9, 'unexpected interior free-fly gets a bounded positive near plane');
});
