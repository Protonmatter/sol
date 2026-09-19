import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDisplayRadii, moonGuideVisible } from '../../apps/web/js/displayGeometry.js';
import { systemScale, satelliteSystemExtent, moonOffsetAU } from '../../apps/web/js/moonorbits.js';
import { MOONS, MOON_VALID_MIN_JD, MOON_VALID_MAX_JD } from '../../apps/web/js/moons.js';
import { MOON_ELEMENTS } from '../../apps/web/js/moonelements.js';
import { BODY, AU_KM } from '../../apps/web/js/bodyData.js';
import { buildRing } from '../../apps/web/js/orreryMath.js';

test('physical radii ignore enlargement, and capped enlargement never moves physical centers', () => {
  const bodies = [
    { name: 'Sun', pos: [0, 0, 0], physicalRadius: .00465, requestedRadius: 2 },
    { name: 'Mercury', pos: [.307, 0, 0], physicalRadius: .0000163, requestedRadius: .45 },
    { name: 'Venus', pos: [.32, .03, 0], physicalRadius: .0000405, requestedRadius: .75 },
  ];
  const before = JSON.stringify(bodies);
  const physical = resolveDisplayRadii(bodies, true);
  for (const b of bodies) assert.equal(physical[b.name], b.physicalRadius);
  const enlarged = resolveDisplayRadii(bodies, false);
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    assert.ok(enlarged[a.name] + enlarged[b.name] <= .95 * Math.hypot(...a.pos.map((v, k) => v - b.pos[k])) + 1e-14);
    assert.ok(enlarged[a.name] >= a.physicalRadius);
  }
  assert.equal(JSON.stringify(bodies), before);
  assert.deepEqual(resolveDisplayRadii([...bodies].reverse(), false), enlarged);
});

test('physical contact is retained and ring extents constrain enlargement', () => {
  const bodies = [
    { name: 'a', pos: [0, 0, 0], physicalRadius: .01, requestedRadius: 1, extentRatio: 3 },
    { name: 'b', pos: [1, 0, 0], physicalRadius: .01, requestedRadius: 1 },
  ];
  const r = resolveDisplayRadii(bodies, false);
  assert.ok(3 * r.a + r.b <= .95 + 1e-14);
  bodies[1].pos = [.01, 0, 0];
  assert.deepEqual(resolveDisplayRadii(bodies, false), { a: .01, b: .01 });
});

test('invalid display inputs fail before NaN or ambiguous radii can be published', () => {
  const valid = { name: 'a', pos: [0,0,0], physicalRadius: .01, requestedRadius: .1 };
  for (const bad of [{ pos: [NaN,0,0] }, { pos: [0,0] }, { requestedRadius: Infinity }, { physicalRadius: -1 }, { extentRatio: 0 }]) {
    assert.throws(() => resolveDisplayRadii([{ ...valid, ...bad }]), /display geometry/i);
  }
  assert.throws(() => resolveDisplayRadii([valid, valid]), /display geometry/i);
});

test('unqualified ring colors use neutral RGB while retaining the disclosed opacity model', () => {
  const original = buildRing(BODY.Saturn.rings, .1, BODY.Saturn.radiusKm);
  const neutral = buildRing(BODY.Saturn.rings, .1, BODY.Saturn.radiusKm, true);
  assert.equal(original.length, neutral.length);
  for (let i = 0; i < neutral.length; i += 8) {
    assert.equal(neutral[i + 3], neutral[i + 4]);
    assert.equal(neutral[i + 4], neutral[i + 5]);
    for (const k of [0,1,2,6,7]) assert.equal(neutral[i+k], original[i+k]);
  }
});

test('moon clearance includes moon radius, ring extent, and sibling center distance', () => {
  const moons = [{ a: 149597.8707, e: 0, r: 10 }, { a: 149747.4685707, e: 0, r: 10 }];
  const offsets = [[.001, 0, 0], [.001001, 0, 0]];
  const scale = systemScale(moons, .1, false, .3, () => .04, (_, i) => offsets[i]);
  assert.ok(.34 <= .95 * .001 * scale);
  assert.ok(.08 <= .95 * .000001 * scale + 1e-12);
  assert.equal(systemScale(moons, .1, true, .3, () => .04), 1);
  const reach = satelliteSystemExtent(moons, .1, false, .3, () => .04);
  assert.ok(reach >= Math.max(.1, .3));
  assert.ok(reach >= (moons[1].a * (1 + moons[1].e) / 149597870.7) * systemScale(moons, .1, false, .3, () => .04) + .04);
});

test('detailed moon guides follow selected or focused systems with explicit all/off overrides', () => {
  assert.equal(moonGuideVisible('Jupiter', null, 'Sun'), false);
  assert.equal(moonGuideVisible('Jupiter', 'Jupiter', 'Sun'), true);
  assert.equal(moonGuideVisible('Jupiter', 'Io', 'Sun', 'context', { Io: 'Jupiter' }), true);
  assert.equal(moonGuideVisible('Jupiter', null, 'Jupiter'), true);
  assert.equal(moonGuideVisible('Jupiter', null, 'Sun', 'all'), true);
  assert.equal(moonGuideVisible('Jupiter', 'Jupiter', 'Jupiter', 'off'), false);
});

test('all catalogued moon systems clear their parent, rings and sibling spheres at held epochs', () => {
  const moons = MOONS.map(m => ({ ...m, ...MOON_ELEMENTS[m.n] }));
  for (const jd of [MOON_VALID_MIN_JD, (MOON_VALID_MIN_JD + MOON_VALID_MAX_JD) / 2, MOON_VALID_MAX_JD]) {
    const unix = (jd - 2440587.5) * 86400;
    for (const parent of new Set(moons.map(m => m.p))) for (const radius of [.002, .1, .4]) {
      const phys = BODY[parent], system = moons.filter(m => m.p === parent);
      const requested = m => Math.min(radius * .42, Math.max(radius * .055, radius * m.r / phys.radiusKm * 4));
      const ring = phys.rings ? radius * phys.rings.outerKm / phys.radiusKm : 0;
      const scale = systemScale(system, radius, false, ring, requested);
      const records = system.map(m => ({ name: m.n, pos: moonOffsetAU(m, unix).map(v => v * scale), physicalRadius: m.r / AU_KM, requestedRadius: requested(m) }));
      const radii = resolveDisplayRadii(records);
      for (const m of records) {
        assert.ok(Math.max(radius, ring) + radii[m.name] <= .95 * Math.hypot(...m.pos), `${parent}/${m.name} clearance at ${jd}`);
      }
      for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
        const a = records[i], b = records[j];
        assert.ok(radii[a.name] + radii[b.name] <= .95 * Math.hypot(...a.pos.map((v,k) => v-b.pos[k])) + 1e-12);
      }
    }
  }
});
