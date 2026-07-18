// Unit tests for the small-body Kepler solver — the code path whose failure mode
// (divergence at cometary eccentricity) is documented in the module header.
import test from "node:test";
import assert from "node:assert/strict";
import {
  eccentricAnomaly, keplerXYZ, meanAnomaly, bodyXYZ, asOrbit, DWARFS, COMETS,
} from "../../apps/web/js/smallbodies.js";

test("eccentricAnomaly satisfies Kepler's equation across the (M, e) plane", () => {
  // Includes the high-eccentricity regime the Danby guess exists for (Halley 0.967).
  for (const e of [0, 0.1, 0.5, 0.85, 0.967, 0.995]) {
    for (let m = -3.0; m <= 3.0; m += 0.37) {
      const E = eccentricAnomaly(m, e);
      // Wrap the residual the same way the solver wraps M into [-π, π].
      let M = m % (2 * Math.PI);
      if (M > Math.PI) M -= 2 * Math.PI; else if (M < -Math.PI) M += 2 * Math.PI;
      assert.ok(Math.abs(E - e * Math.sin(E) - M) < 1e-10, `e=${e} M=${m}`);
    }
  }
});

test("keplerXYZ: a circular orbit stays at radius a, in-plane for zero inclination", () => {
  for (let M = 0; M < 6.28; M += 0.7) {
    const [x, y, z] = keplerXYZ(2.5, 0, 0, 0, 0, M);
    assert.ok(Math.abs(Math.hypot(x, y) - 2.5) < 1e-9);
    // z === 0, not assert.equal: sin(0)·negative gives -0, and node:assert compares
    // with Object.is, which distinguishes -0 from 0 (=== does not — the physics is fine).
    assert.ok(z === 0, `z=${z}`);
  }
});

test("keplerXYZ: perihelion and aphelion distances are a(1∓e)", () => {
  const a = 17.9, e = 0.967; // Halley-class
  const [xp, yp, zp] = keplerXYZ(a, e, 0.1, 0.2, 0.3, 0);        // M=0 → perihelion
  const [xa, ya, za] = keplerXYZ(a, e, 0.1, 0.2, 0.3, Math.PI);  // M=π → aphelion
  assert.ok(Math.abs(Math.hypot(xp, yp, zp) - a * (1 - e)) < 1e-6);
  assert.ok(Math.abs(Math.hypot(xa, ya, za) - a * (1 + e)) < 1e-6);
});

test("every shipped dwarf and comet propagates to a finite, plausible position", () => {
  for (const b of [...DWARFS, ...COMETS]) {
    for (const jy2k of [-50, 0, 26.5, 100]) {
      const p = bodyXYZ(b, jy2k);
      assert.ok(p.every(Number.isFinite), `${b.n} at jy2k=${jy2k}`);
      const r = Math.hypot(...p);
      // Bound by the orbit's own geometry, with slack for the solver's tolerance.
      assert.ok(r > b.a * (1 - b.e) * 0.99 && r < b.a * (1 + b.e) * 1.01, `${b.n}: r=${r}`);
    }
  }
});

test("comets carry Tp (perihelion epoch) and meanAnomaly honors it", () => {
  for (const c of COMETS) {
    assert.ok(c.Tp != null, `${c.n} should carry Tp`);
    // At jy2k of its own perihelion, M ≈ 0 (mod 2π)
    const jy2kPeri = (c.Tp - 2451545.0) / 365.25;
    const M = meanAnomaly(c, jy2kPeri) % (2 * Math.PI);
    assert.ok(Math.abs(M) < 1e-9, `${c.n}: M(Tp)=${M}`);
  }
});

test("asOrbit adapts stored elements to the ellipse3d contract", () => {
  const o = asOrbit(DWARFS[0]);
  assert.deepEqual(Object.keys(o).sort(), ["a_au", "argp_deg", "ecc", "inc_deg", "node_deg"]);
  assert.equal(o.a_au, DWARFS[0].a);
});
