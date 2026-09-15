import test from "node:test";
import assert from "node:assert/strict";
import { MOONS, MOON_VALID_MIN_JD, MOON_VALID_MAX_JD } from "../../apps/web/js/moons.js";
import { MOON_ELEMENTS } from "../../apps/web/js/moonelements.js";
import { moonElementsAt, moonOffsetAU, isRetrograde, synchronousMoonRotation, SYNCHRONOUS_MOONS, ASYNCHRONOUS_MOONS }
  from "../../apps/web/js/moonorbits.js";
import { BODY, poleVector } from "../../apps/web/js/bodyData.js";

for (const m of MOONS) Object.assign(m, MOON_ELEMENTS[m.n]);

const D2R = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const column = (rot, c) => [rot[c * 4], rot[c * 4 + 1], rot[c * 4 + 2]];
const unixFromJd = jd => (jd - 2440587.5) * 86400;
// Nine instants spread across the validated element window.
const times = Array.from({ length: 9 }, (_, i) =>
  unixFromJd(MOON_VALID_MIN_JD + (MOON_VALID_MAX_JD - MOON_VALID_MIN_JD) * (i + 0.5) / 9));
const locked = MOONS.filter(m => SYNCHRONOUS_MOONS.has(m.n));
const frame = (m, unix) => synchronousMoonRotation(m, unix, poleVector(BODY[m.p], unix));
// East-positive longitude and latitude of a world direction in a moon's body frame, in degrees.
function bodyAngles(rot, v) {
  const n = Math.hypot(...v);
  const x = dot(column(rot, 0), v) / n, y = dot(column(rot, 1), v) / n, z = dot(column(rot, 2), v) / n;
  return { lon: Math.atan2(y, x) / D2R, lat: Math.asin(Math.max(-1, Math.min(1, z))) / D2R };
}

test("every catalogue moon is classified once as tidally locked or freely spinning", () => {
  for (const m of MOONS) assert.notEqual(SYNCHRONOUS_MOONS.has(m.n), ASYNCHRONOUS_MOONS.has(m.n), m.n);
  assert.equal(SYNCHRONOUS_MOONS.size + ASYNCHRONOUS_MOONS.size, MOONS.length);
  assert.equal(frame(MOONS.find(m => m.n === "Nereid"), times[0]), null, "a freely spinning moon gets no invented lock");
});

test("each locked moon's body frame is a right-handed rotation", () => {
  for (const m of locked) for (const t of times) {
    const rot = frame(m, t), [x, y, z] = [0, 1, 2].map(c => column(rot, c));
    for (const [a, b, want] of [[x, x, 1], [y, y, 1], [z, z, 1], [x, y, 0], [y, z, 0], [z, x, 0]]) {
      assert.ok(Math.abs(dot(a, b) - want) < 1e-12, `${m.n}: axes are not orthonormal`);
    }
    const xy = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    assert.ok(dot(xy, z) > 1 - 1e-12, `${m.n}: x cross y must be the pole`);
    assert.deepEqual(rot.slice(12), [0, 0, 0, 1]);
  }
});

test("the planet stays over the prime meridian, wandering only by optical libration", () => {
  for (const m of locked) for (const t of times) {
    const { lon, lat } = bodyAngles(frame(m, t), moonOffsetAU(m, t).map(v => -v));
    const { e } = moonElementsAt(m, t);
    // True minus mean anomaly is 2e sin M + 1.25e^2 sin 2M + ..., so the sub-planet point
    // cannot leave the prime meridian by more than about 2e radians.
    const libration = (2 * e + 3 * e * e) / D2R;
    assert.ok(Math.abs(lon) <= libration + 1e-9,
      `${m.n}: sub-planet longitude ${lon.toFixed(3)} deg exceeds the libration bound ${libration.toFixed(3)} for e=${e.toFixed(4)}`);
    assert.ok(Math.abs(lat) < 1e-9, `${m.n}: the planet lies in the orbit plane, on the moon's equator`);
  }
});

test("poles sit on the planet's IAU north side, beside it for regular moons and against the orbit for Triton", () => {
  for (const m of locked) for (const t of times) {
    assert.ok(dot(column(frame(m, t), 2), poleVector(BODY[m.p], t)) > 0, `${m.n}: pole is on the planet's south side`);
  }
  // Io, Europa and Ganymede orbit within half a degree of Jupiter's equator, and Titan within
  // a degree of Saturn's, so their spin poles must lie next to the planet's.
  for (const [name, limit] of [["Io", 1], ["Europa", 1], ["Ganymede", 1], ["Titan", 1.5]]) {
    const m = MOONS.find(moon => moon.n === name);
    for (const t of times) {
      const separation = Math.acos(Math.min(1, dot(column(frame(m, t), 2), poleVector(BODY[m.p], t)))) / D2R;
      assert.ok(separation < limit, `${name}: pole ${separation.toFixed(2)} deg from ${m.p}'s`);
    }
  }
  const triton = MOONS.find(m => m.n === "Triton");
  for (const t of times) {
    const el = moonElementsAt(triton, t), inc = el.i * D2R, node = el.node * D2R;
    const momentum = [Math.sin(inc) * Math.sin(node), -Math.sin(inc) * Math.cos(node), Math.cos(inc)];
    assert.equal(isRetrograde(triton, BODY.Neptune, poleVector, t), true);
    assert.ok(dot(column(frame(triton, t), 2), momentum) < 0, "Triton's north pole opposes its retrograde orbital motion");
  }
});

test("a locked moon moves toward 90 degrees from its prime meridian, west or east by its spin about IAU north", () => {
  const retrograde = new Set();
  for (const m of locked) for (const t of times) {
    const el = moonElementsAt(m, t), inc = el.i * D2R, node = el.node * D2R;
    const momentum = [Math.sin(inc) * Math.sin(node), -Math.sin(inc) * Math.cos(node), Math.cos(inc)];
    // Spinning with the orbit about the IAU north pole puts the apex of motion at 90 deg west;
    // spinning against it puts the apex at 90 deg east of the prime meridian.
    const against = dot(momentum, column(frame(m, t), 2)) < 0;
    if (against) retrograde.add(m.n);
    const dt = Math.min(60, m.P * 86400 / 1000);
    const ahead = moonOffsetAU(m, t + dt), behind = moonOffsetAU(m, t - dt);
    const { lon } = bodyAngles(frame(m, t), ahead.map((v, i) => v - behind[i]));
    // Optical libration (2e) plus the flight-path angle (e) bound the offset of the apex.
    const limit = (3 * el.e + 3 * el.e * el.e) / D2R + 0.5;
    const apex = against ? 90 : -90;
    assert.ok(Math.abs(lon - apex) < limit, `${m.n}: direction of motion at ${lon.toFixed(2)} deg, expected ${apex}`);
  }
  // Uranus turns backwards about its IAU north pole and its regular moons follow it; Triton
  // orbits Neptune backwards. Every other locked moon spins forwards about IAU north.
  assert.ok(BODY.Uranus.wDotDegPerDay < 0);
  assert.deepEqual([...retrograde].sort(), ["Ariel", "Miranda", "Oberon", "Titania", "Triton", "Umbriel"]);
});
