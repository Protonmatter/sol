// The motion contract: what every body DOES as the clock runs, as opposed to what bodyData.js
// SAYS. tools/validate_body_constants.py pins the constants and tools/validate_body_motion.py
// runs the same measurements from the CI gate; these are the fast JS-side versions, so a broken
// rotation helper fails in `node --test` seconds after the edit rather than in a Python job.
//
// Nothing here re-derives physics. Every number comes out of the functions the renderer calls —
// rotationPhase(), poleVector(), the orreryTime limiter, moonorbits' alias gate — and is
// compared against a source-pinned expectation.
import test from "node:test";
import assert from "node:assert/strict";
import { BODY, poleVector, rotationPhase } from "../../apps/web/js/bodyData.js";
import { MOONS } from "../../apps/web/js/moons.js";
import { MOON_ELEMENTS } from "../../apps/web/js/moonelements.js";

// The knots arrive lazily in the app; merge them here the way loadMoonCatalogue() does so
// these assertions exercise the objects the renderer actually computes from.
for (const m of MOONS) Object.assign(m, MOON_ELEMENTS[m.n]);
import { aliasedByClock } from "../../apps/web/js/moonorbits.js";
import {
  DAYS_PER_YEAR, MAX_DISPLAY_ROTATION_TPS,
  rotationDisplayIsLimited, rotationDisplayStepSeconds, solarStepSeconds,
} from "../../apps/web/js/orreryTime.js";

const D2R = Math.PI / 180;
const J2000_UNIX = 946728000;
const DAY = 86400;
const wrap = (d) => ((d % 360) + 540) % 360 - 180;

// The seven buttons in index.html, in simulated days per real second.
const PRESETS = [
  ["1 h/s", 1 / 24], ["1 d/s", 1], ["1 wk/s", 7], ["1 mo/s", 30.4369],
  ["1 yr/s", 365.25], ["2 yr/s", 730.5], ["5 yr/s", 1826.25],
];

// WGCCRE 2015 rotation sense, pinned here rather than read from the sign of Ẇ — the point is to
// catch a flipped Ẇ, and a check that reads its expectation from the value under test cannot.
const RETROGRADE = new Set(["Venus", "Uranus"]);

// NASA fact sheets: [obliquity to the body's own orbit, orbital inclination to the ecliptic].
// The Sun and Earth are referred to the ecliptic itself, so their inclination is zero.
const FACT_SHEET_TILT = {
  Sun: [7.25, 0], Mercury: [0.034, 7.004], Venus: [177.36, 3.395], Earth: [23.44, 0],
  Mars: [25.19, 1.848], Jupiter: [3.13, 1.304], Saturn: [26.73, 2.485],
  Uranus: [97.77, 0.770], Neptune: [28.32, 1.770], Moon: [6.68, 5.145],
};

/**
 * Mean rotation rate (deg/day) as the renderer produces it: accumulate the prime-meridian angle
 * in steps too small to be confused with their complement (Jupiter, the fastest, covers 174° in
 * 0.2 d) so no revolution can be silently lost.
 */
function measuredRateDegPerDay(phys, spanDays = 365.25, stepDays = 0.2) {
  const steps = Math.round(spanDays / stepDays);
  let accum = 0;
  let prev = rotationPhase(phys, J2000_UNIX) / D2R;
  for (let i = 1; i <= steps; i++) {
    const now = rotationPhase(phys, J2000_UNIX + i * stepDays * DAY) / D2R;
    accum += wrap(now - prev);
    prev = now;
  }
  return accum / (steps * stepDays);
}

/** Angle (deg) between a body's rendered spin axis and the ecliptic pole. */
function axisFromEclipticPole(phys, unix = J2000_UNIX) {
  const p = poleVector(phys, unix);
  return Math.acos(Math.max(-1, Math.min(1, p[2]))) / D2R;
}

test("one rendered rotation takes the period the detail card prints", () => {
  // The card, the spin-freeze threshold and the rendered spin are three consumers of one fact.
  // Neptune once shipped with the card quoting IAU 2009 while Ẇ said 2015; this is the dynamic
  // form of the check that caught it — it measures the angle, it does not re-read the field.
  for (const [name, phys] of Object.entries(BODY)) {
    const rate = measuredRateDegPerDay(phys);
    const hours = Math.abs(360 / rate * 24);
    assert.ok(
      Math.abs(hours - Math.abs(phys.rotationHours)) < 0.15,
      `${name}: measured ${hours.toFixed(4)} h per turn, card says ${Math.abs(phys.rotationHours)} h`,
    );
  }
});

test("Venus and Uranus turn backwards; nothing else does", () => {
  // A lost sign is invisible in a still frame and wrong in every animated one.
  for (const [name, phys] of Object.entries(BODY)) {
    const rate = measuredRateDegPerDay(phys);
    const retro = rate < 0;
    assert.equal(retro, RETROGRADE.has(name),
      `${name} rotates ${retro ? "retrograde" : "prograde"} at ${rate.toFixed(6)} °/day`);
    assert.equal(phys.rotationHours < 0, RETROGRADE.has(name),
      `${name}: rotationHours sign disagrees with the IAU sense`);
  }
});

test("every IAU pole is a northern unit vector", () => {
  // The IAU fixes north as the side of the invariable plane, so this holds even for the
  // retrograde rotators — their backwards spin lives in Ẇ's sign, never in a flipped axis.
  for (const [name, phys] of Object.entries(BODY)) {
    for (const years of [-500, 0, 500]) {
      const p = poleVector(phys, J2000_UNIX + years * 31557600);
      assert.ok(Math.abs(Math.hypot(p[0], p[1], p[2]) - 1) < 1e-12, `${name}: pole is not a unit vector`);
      assert.ok(p[2] > 0, `${name} at ${years} yr: north pole points south (z = ${p[2].toFixed(6)})`);
    }
  }
});

test("each axis leans by what the fact sheets allow", () => {
  // A spin axis ε from its orbit normal, with that normal i from the ecliptic normal, must sit
  // between |ε − i| and ε + i of the ecliptic pole — exact spherical geometry, no ascending
  // node required. For the retrograde pair the IAU north pole is the other end of the axis, so
  // the fact sheet's obliquity-to-orbit describes the supplement.
  for (const [name, [obliquity, inclination]] of Object.entries(FACT_SHEET_TILT)) {
    const eps = RETROGRADE.has(name) ? 180 - obliquity : obliquity;
    const theta = axisFromEclipticPole(BODY[name]);
    assert.ok(
      theta >= Math.abs(eps - inclination) - 0.15 && theta <= eps + inclination + 0.15,
      `${name}: axis ${theta.toFixed(3)}° from the ecliptic pole, fact sheet allows `
      + `${Math.abs(eps - inclination).toFixed(3)}–${(eps + inclination).toFixed(3)}°`,
    );
  }
});

test("the Moon's axis holds its Cassini state, not the ecliptic pole", () => {
  // The regression this exists for: with only the constant α₀/δ₀ terms the rendered lunar axis
  // sat 0.02° from the ecliptic pole. The Moon is in a Cassini state — spin axis, ecliptic
  // normal and orbit normal stay coplanar with the spin axis 6.68° − 5.14° = 1.54° from the
  // ecliptic pole, on the far side from the orbit normal. That 1.5° lives entirely in the E1
  // libration term (pck00011 BODY301_NUT_PREC_*[0]), so dropping it flattens the axis.
  for (let years = 0; years <= 20; years += 2) {
    const theta = axisFromEclipticPole(BODY.Moon, J2000_UNIX + years * 31557600);
    assert.ok(theta > 1.4 && theta < 1.7,
      `+${years} yr: lunar axis ${theta.toFixed(3)}° from the ecliptic pole, expected ~1.54°`);
  }
});

test("the periodic W correction is applied, not merely stored", () => {
  // poleNut carries a prime-meridian amplitude as well as pole amplitudes. A model that read
  // only the pole halves would still tilt the body correctly and still rotate it wrongly.
  for (const name of ["Neptune", "Moon"]) {
    const phys = BODY[name];
    assert.ok(phys.poleNut && phys.poleNut.wAmpDeg, `${name} should carry a W amplitude`);
    // Sweep one whole period of the argument, so the sinusoid is guaranteed to reach its peak:
    // the Moon's E1 turns over in 18.6 years, Neptune's N in 688.
    const periodYears = (360 / Math.abs(phys.poleNut.nDotDegPerCty)) * 100;
    let maxDelta = 0;
    for (let step = 0; step <= 200; step++) {
      const years = (step / 200) * periodYears;
      const unix = J2000_UNIX + years * 31557600;
      const d = (unix / DAY + 2440587.5) + 69.2 / DAY - 2451545.0;
      const linear = wrap(phys.w0Deg + phys.wDotDegPerDay * d);
      maxDelta = Math.max(maxDelta, Math.abs(wrap(rotationPhase(phys, unix) / D2R - linear)));
    }
    assert.ok(maxDelta > Math.abs(phys.poleNut.wAmpDeg) * 0.5,
      `${name}: rotationPhase never departs from the linear W by more than ${maxDelta.toFixed(4)}°`);
    assert.ok(maxDelta < Math.abs(phys.poleNut.wAmpDeg) * 1.05,
      `${name}: W correction reaches ${maxDelta.toFixed(4)}°, larger than its ${phys.poleNut.wAmpDeg}° amplitude`);
  }
});

test("no shipped preset stops or reverses a body's spin", () => {
  // The visible-rate cap is a presentation choice, disclosed in the accuracy line. It is allowed
  // to slow a spin to exactly one turn per five real seconds. It is not allowed to freeze one
  // (which would read as a broken renderer) or to run it backwards (which would be a lie).
  const frame = 1 / 60;
  for (const [label, dps] of PRESETS) {
    const yps = dps / DAYS_PER_YEAR;
    const simStep = solarStepSeconds(frame, yps);
    for (const [name, phys] of Object.entries(BODY)) {
      const step = rotationDisplayStepSeconds(frame, simStep, phys.rotationHours);
      assert.ok(step > 0, `${label}/${name}: visible step ${step} s does not advance the clock`);
      const visibleTurns = step / frame / (Math.abs(phys.rotationHours) * 3600);
      const trueTurns = simStep / frame / (Math.abs(phys.rotationHours) * 3600);
      assert.ok(Math.abs(visibleTurns - Math.min(trueTurns, MAX_DISPLAY_ROTATION_TPS)) < 1e-12,
        `${label}/${name}: ${visibleTurns.toFixed(6)} visible turns/s`);
      assert.equal(rotationDisplayIsLimited(yps * DAYS_PER_YEAR * DAY, phys.rotationHours),
        trueTurns > MAX_DISPLAY_ROTATION_TPS,
        `${label}/${name}: limiter disagrees with its own threshold`);
    }
  }
});

test("the cap first bites for Earth between the 1 h/s and 1 d/s presets", () => {
  // Pinning the perception: the reason Earth "stops spinning faster" when the clock speeds up.
  // At the 1 h/s default Earth turns once per 23.9 real seconds, honestly. From 1 d/s upward
  // every preset shows the same five-second turn, and the accuracy line says so.
  const secondsPerVisibleTurn = (dps) => {
    const yps = dps / DAYS_PER_YEAR, frame = 1 / 60;
    const step = rotationDisplayStepSeconds(frame, solarStepSeconds(frame, yps), BODY.Earth.rotationHours);
    return Math.abs(BODY.Earth.rotationHours) * 3600 / (step / frame);
  };
  assert.ok(Math.abs(secondsPerVisibleTurn(1 / 24) - 23.9345) < 0.01);
  for (const [, dps] of PRESETS.slice(1)) {
    assert.ok(Math.abs(secondsPerVisibleTurn(dps) - 5) < 1e-9,
      `${dps} d/s should show a five-second Earth turn, got ${secondsPerVisibleTurn(dps).toFixed(4)} s`);
  }
});

test("every moon's shipped knots imply the orbital period its card prints", () => {
  // Field 5 of each knot is UNWRAPPED mean longitude, so its slope across the whole table is the
  // mean motion with no revolution counting. If the generator had unwrapped one moon onto the
  // wrong branch, the card would print one orbit while the renderer flew another.
  for (const m of MOONS) {
    const count = m.el.length / 6;
    const rate = (m.el[(count - 1) * 6 + 5] - m.el[5]) / ((count - 1) * m.step);
    const implied = 360 / rate;
    assert.ok(Math.abs(implied - m.P) < 1e-4,
      `${m.n}: knots imply ${implied.toFixed(6)} d, card prints ${m.P} d`);
    assert.ok(Math.abs(360 / m.nd - m.P) < 1e-4,
      `${m.n}: mean motion ${m.nd} °/day implies ${(360 / m.nd).toFixed(6)} d, card prints ${m.P} d`);
    assert.ok(rate > 0, `${m.n}: mean longitude runs backwards in the shipped table`);
  }
});

test("the moon Nyquist gate matches the preset that outruns each orbit", () => {
  // The gate's own rule is three samples per revolution. These are the presets at which each
  // sampled moon crosses it at 60 fps — the numbers quoted in the motion audit.
  const frame = 1 / 60;
  const firstHidden = (name) => {
    const m = MOONS.find((x) => x.n === name);
    for (const [label, dps] of PRESETS) {
      if (aliasedByClock(m, solarStepSeconds(frame, dps / DAYS_PER_YEAR))) return label;
    }
    return null;
  };
  assert.equal(firstHidden("Phobos"), "1 wk/s");
  assert.equal(firstHidden("Mimas"), "1 mo/s");
  assert.equal(firstHidden("Io"), "1 yr/s");
  assert.equal(firstHidden("Titan"), "1 yr/s");
  assert.equal(firstHidden("Triton"), "1 yr/s");
  // Nereid's year-long orbit is never outrun, even at the top of the slider.
  assert.equal(firstHidden("Nereid"), null);
});
