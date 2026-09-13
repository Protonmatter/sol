import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY } from '../../apps/web/js/bodyData.js';
import { buildRing, ringOpacityProfile } from '../../apps/web/js/orreryMath.js';

function profileAt(rings, km, n = 32768) {
  const data = ringOpacityProfile(rings, n);
  return data[Math.min(n - 1, Math.max(0, Math.floor((km - rings.innerKm) / (rings.outerKm - rings.innerKm) * n)))];
}

test('ice-giant radial gaps stay empty instead of filling each catalogue envelope', () => {
  for (const [name, gaps, rings] of [
    ['Uranus', [40000, 43000, 46000, 49000, 50500], [41840, 44720, 45670, 51140]],
    ['Neptune', [45000, 50000, 55000, 60000], [41900, 53200, 62930]],
  ]) {
    for (const km of gaps) assert.equal(profileAt(BODY[name].rings, km), 0, `${name}: no admitted ring at ${km} km`);
    for (const km of rings) assert.ok(profileAt(BODY[name].rings, km) > 0, `${name}: named ring at ${km} km`);
  }
});

test('narrow rings survive footprint sampling without spreading their total opacity', () => {
  const rings = { innerKm: 0, outerKm: 1000, bands: [{ name: 'thin', innerKm: 1, outerKm: 3, opacity: .8 }] };
  // A point sample at 50 km misses the ring; its 100 km footprint contains 2 km.
  assert.deepEqual([...ringOpacityProfile(rings, 10)], [4, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...ringOpacityProfile({ ...rings, bands: [] }, 10)], Array(10).fill(0));
  const exact = ringOpacityProfile(rings, 1000);
  assert.equal(exact[1], 204); assert.equal(exact[2], 204);
  assert.equal(exact.reduce((sum, x) => sum + x, 0), 408);
});

test('named ring mesh boundaries are exact and never paint across unsupported intervals', () => {
  const rings = { innerKm: 10, outerKm: 30, bands: [
    { name: 'one', innerKm: 11, outerKm: 11.1, opacity: .8 },
    { name: 'two', innerKm: 27, outerKm: 29, opacity: .2 },
  ] };
  const mesh = buildRing(rings, 1, 1, true);
  let first = false, second = false;
  for (let i = 0; i < mesh.length; i += 8 * 3) {
    if (mesh[i + 6] === 0) continue;
    const radial = [0, 8, 16].map(k => Math.hypot(mesh[i+k], mesh[i+k+1]));
    const min = Math.min(...radial), max = Math.max(...radial);
    const band = rings.bands.find(b => min >= b.innerKm - 2e-6 && max <= b.outerKm + 2e-6);
    assert.ok(band, `triangle spans a gap: ${min}..${max}`);
    assert.ok(Math.abs(mesh[i + 6] - band.opacity) < 1e-7);
    first ||= band.name === 'one'; second ||= band.name === 'two';
  }
  assert.ok(first && second, 'sub-grid narrow rings must not disappear');
});

test('Saturn retains documented C/B/A structure and principal narrow gaps', () => {
  const rings = BODY.Saturn.rings;
  for (const km of [77800, 87500, 119000, 133570, 136505]) {
    assert.equal(profileAt(rings, km), 0, `documented gap at ${km} km`);
  }
  assert.ok(profileAt(rings, 100000) > profileAt(rings, 130000));
  assert.ok(profileAt(rings, 130000) > profileAt(rings, 80000));
  assert.equal(rings.outerKm, 136780, 'existing Saturn clearance envelope retained');
  assert.equal(BODY.Uranus.rings.outerKm, 51150, 'existing Uranus envelope retained');
  assert.equal(BODY.Neptune.rings.outerKm, 62950, 'Adams centered at 62930 with a representative 40 km width');
});

test('ring preparation rejects invalid, overlapping or out-of-envelope source intervals', () => {
  const ring = { innerKm: 10, outerKm: 30, bands: [{ name: 'a', innerKm: 11, outerKm: 12, opacity: .5 }] };
  for (const bands of [
    [{ ...ring.bands[0], opacity: NaN }], [{ ...ring.bands[0], opacity: 1.1 }],
    [{ ...ring.bands[0], innerKm: 9 }], [{ ...ring.bands[0], outerKm: 31 }],
    [{ ...ring.bands[0], innerKm: 12 }], [ring.bands[0], { ...ring.bands[0], innerKm: 11.5 }],
  ]) {
    assert.throws(() => buildRing({ ...ring, bands }, 1, 1), /ring/i);
    assert.throws(() => ringOpacityProfile({ ...ring, bands }, 16), /ring/i);
  }
  for (const n of [0, -1, 1.5, Infinity]) assert.throws(() => ringOpacityProfile(ring, n), /ring/i);
});
