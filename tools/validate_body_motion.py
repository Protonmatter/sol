#!/usr/bin/env python3
"""Pin what every body actually DOES over time — the motion contract — offline.

`validate_body_constants.py` pins the numbers in `bodyData.js`. This gate pins the motion those
numbers produce when the renderer's own functions are run: it advances the simulation clock and
measures. The distinction matters because every value can be a perfect transcription of WGCCRE
2015 while the code that consumes it drops a term, loses a sign, wraps at the wrong modulus, or
reads days where it wanted centuries — and nothing in the constants gate would notice.

What is measured (never re-derived — the shipped functions are called):
  * Sidereal rotation period, from `rotationPhase()`. The prime-meridian angle is accumulated in
    steps small enough that no step can be mistaken for its complement (< 180° for the fastest
    rotator, Jupiter at 870.5°/day), across one FULL period of the body's periodic argument where
    it has one, so that term contributes exactly zero and the mean rate is what remains. The
    measured period must match the `rotationHours` printed on the detail card.
  * Spin direction, from the sign of that measured rate — checked against the IAU sense pinned
    below, not against the field it is supposed to agree with. Venus and Uranus are the two
    retrograde rotators in WGCCRE 2015; a sign lost anywhere makes one of them turn the wrong way
    on screen, which is a claim about the solar system, not a cosmetic defect.
  * Pole hemisphere. The IAU fixes north as the side of the invariable plane, so EVERY body's
    α₀/δ₀ must land in the ecliptic-northern hemisphere. A flipped pole would still render a
    plausible-looking tilted planet.
  * Obliquity, as the angle between the rendered spin axis and the ecliptic pole. This is
    checked against the NASA fact-sheet obliquity-to-ORBIT and the fact-sheet orbital
    inclination, which bound it exactly: for a spin axis at ε from the orbit normal and an orbit
    normal at i from the ecliptic normal, the spherical triangle gives |ε − i| ≤ θ ≤ ε + i. The
    bound needs no ascending-node data and is tight for the Moon, which is in a Cassini state
    (spin axis, ecliptic normal and orbit normal coplanar) and therefore sits exactly at the
    lower edge. That is how the omission of the lunar E1 libration term was caught: it rendered
    the Moon's axis 0.02° from the ecliptic pole instead of 1.54°.
  * Orbital period of each of the 21 catalogued moons, from the mean-longitude knots actually
    shipped in `moons.js`, compared with the published period `P` the detail panel prints.
  * The time model's presentation cap. The preset speed buttons in `index.html` are pinned here,
    and for every preset × body the display limiter must engage exactly when true spin exceeds
    MAX_DISPLAY_ROTATION_TPS, and when engaged must deliver exactly that rate — no faster (it
    would alias) and no slower (the body would look stopped). Same for the moon Nyquist gate.

Sources of truth:
  * Rotation elements and their sense: IAU WGCCRE 2015 (Archinal et al. 2018 + 2019 correction)
    as distributed in NAIF pck00011.tpc.
  * Obliquity to orbit and orbital inclination to the ecliptic: NASA planetary fact sheets
    (nssdc.gsfc.nasa.gov). The Moon's 5.145° is its orbit's inclination to the ECLIPTIC (the
    fact sheet's 5.145°, not the 18.3–28.6° range it takes against Earth's equator).
  * Moon periods: JPL Horizons, via the committed elements (see tools/ephemeris-data/moons/).

Standard library only; requires `node` on PATH (same as the CI web job) so the real ES modules
are executed rather than parsed by regex.

Usage:
    python tools/validate_body_motion.py
"""

from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_JS = ROOT / "apps" / "web" / "js"
INDEX_HTML = ROOT / "apps" / "web" / "index.html"

# --------------------------------------------------------------------------- pinned references

# WGCCRE 2015 rotation sense. +1 = prograde (Ẇ > 0), −1 = retrograde. Pinned independently of
# bodyData so that flipping a sign there cannot flip the expectation with it.
SPIN_SENSE = {
    "Sun": +1, "Mercury": +1, "Venus": -1, "Earth": +1, "Mars": +1,
    "Jupiter": +1, "Saturn": +1, "Uranus": -1, "Neptune": +1, "Moon": +1,
}

# NASA planetary fact sheets: obliquity to orbit (deg) and orbital inclination to the ecliptic
# (deg). The Sun and Earth are referred to the ecliptic itself, so their inclination is 0 by
# construction — the Sun's 7.25° IS its equator-to-ecliptic angle.
OBLIQUITY_TO_ORBIT = {
    "Sun": (7.25, 0.0), "Mercury": (0.034, 7.004), "Venus": (177.36, 3.395),
    "Earth": (23.44, 0.0), "Mars": (25.19, 1.848), "Jupiter": (3.13, 1.304),
    "Saturn": (26.73, 2.485), "Uranus": (97.77, 0.770), "Neptune": (28.32, 1.770),
    "Moon": (6.68, 5.145),
}
# Slack on the spherical-triangle bound. The inputs are fact-sheet values rounded to 2–3
# decimals and the pole itself carries truncated periodic terms; 0.15° absorbs both and is far
# below anything a real orientation error would produce (a dropped term costs whole degrees).
OBLIQUITY_SLACK_DEG = 0.15

# Time-speed presets, exactly as index.html ships them (simulated days per real second). Pinned
# so a preset cannot be added or retuned without re-running this audit against it.
SPEED_PRESETS = [
    ("1 h/s", 1 / 24), ("1 d/s", 1.0), ("1 wk/s", 7.0), ("1 mo/s", 30.4369),
    ("1 yr/s", 365.25), ("2 yr/s", 730.5), ("5 yr/s", 1826.25),
]
PRESET_MATCH_REL = 1e-8  # the HTML writes 1/24 as 0.0416666667

MAX_DISPLAY_ROTATION_TPS_PINNED = 0.2  # one visible turn per five real seconds (deliberate)

# Measured rotation period vs the card's rotationHours. The card carries fact-sheet rounding
# (Neptune 15.9663 h against 360/Ẇ = 15.96630 h), so the same 0.15 h the constants gate uses.
ROTATION_HOURS_TOLERANCE_H = 0.15
# Measured rate vs the pinned Ẇ. This is a transcription check on the code path, not a
# measurement, so it is tight; the residual is pure floating-point accumulation (worst observed
# ~1e-11 °/day, on Neptune's 688-year periodic cycle).
RATE_TOLERANCE_DEG_PER_DAY = 1e-6

# Moon orbital period implied by the shipped mean-longitude knots vs the published P. Worst
# observed is 4.4e-7 d (Callisto); P is stored to five decimals, so half a rounding step alone
# is 5e-6 d. 1e-4 d (8.6 s) sits ~20× above the rounding floor and ~200× below anything a
# miscounted revolution could produce.
MOON_PERIOD_TOLERANCE_DAYS = 1e-4
# Per-knot-pair rate. Eccentric moons genuinely wander here: Nereid (e = 0.75) shows 1.5% across
# a single weekly pair while its whole-table rate is exact to 3e-7. The gate is therefore loose
# on a single pair and tight on the table — a corrupted knot still fails, physics does not.
MOON_KNOT_PAIR_TOLERANCE_REL = 0.05

# --------------------------------------------------------------------------- measurement (node)

# Executed by node so the audited functions are the shipped ones. Everything below is a
# MEASUREMENT; every comparison lives in Python against the pins above.
NODE_SCRIPT = r"""
const [bodyUrl, moonsUrl, orbitsUrl, timeUrl] = process.argv.slice(1);
Promise.all([import(bodyUrl), import(moonsUrl), import(orbitsUrl), import(timeUrl)])
  .then(([B, Mo, Or, T]) => {
    const D2R = Math.PI / 180;
    const J2000_UNIX = 946728000;      // 2000-01-01T12:00:00Z, the epoch of the IAU elements
    const DAY = 86400;
    const wrap = (d) => ((d % 360) + 540) % 360 - 180;

    const bodies = {};
    for (const [name, p] of Object.entries(B.BODY)) {
      // Span one FULL cycle of the periodic argument where there is one, so its contribution to
      // the accumulated angle is exactly zero and what remains is the mean rate. Ten Julian
      // years otherwise — long enough that a per-step rounding error cannot masquerade as a rate.
      const spanDays = p.poleNut
        ? Math.abs(360 / p.poleNut.nDotDegPerCty) * 36525
        : 3652.5;
      // < 180° per step for the fastest rotator (Jupiter, 870.536 deg/day * 0.2 = 174.1).
      const stepDays = 0.2;
      const steps = Math.max(2, Math.round(spanDays / stepDays));
      const h = spanDays / steps;
      let accum = 0;
      let prev = B.rotationPhase(p, J2000_UNIX) / D2R;
      for (let i = 1; i <= steps; i++) {
        const now = B.rotationPhase(p, J2000_UNIX + i * h * DAY) / D2R;
        accum += wrap(now - prev);
        prev = now;
      }
      const rateDegPerDay = accum / spanDays;

      const pole = B.poleVector(p, J2000_UNIX);
      bodies[name] = {
        rateDegPerDay,
        spanDays,
        turns: accum / 360,
        measuredHours: 360 / rateDegPerDay * 24,
        wDotDegPerDay: p.wDotDegPerDay,
        rotationHours: p.rotationHours,
        tiltDeg: p.tiltDeg,
        poleZ: pole[2],
        poleNorm: Math.hypot(pole[0], pole[1], pole[2]),
        obliquityFromEclipticDeg: Math.acos(Math.max(-1, Math.min(1, pole[2]))) / D2R,
      };
    }

    // Catalogued moons: field 5 of each knot is UNWRAPPED mean longitude, so its slope is the
    // mean motion with no revolution counting required.
    const moons = Mo.MOONS.map((m) => {
      const count = m.el.length / 6;
      const L = (i) => m.el[i * 6 + 5];
      const wholeRate = (L(count - 1) - L(0)) / ((count - 1) * m.step);
      let worstPairRel = 0, worstPairIndex = -1;
      for (let i = 0; i + 1 < count; i++) {
        const rel = Math.abs((L(i + 1) - L(i)) / m.step / wholeRate - 1);
        if (rel > worstPairRel) { worstPairRel = rel; worstPairIndex = i; }
      }
      return {
        n: m.n, p: m.p, P: m.P, nd: m.nd, a: m.a, e: m.e, knots: count, step: m.step,
        periodFromKnots: 360 / wholeRate, periodFromNd: 360 / m.nd,
        worstPairRel, worstPairIndex,
      };
    });

    // Time model. Both gates are pure functions of the selected rate, so they can be evaluated
    // per preset without a frame loop; a 60 fps frame is used for the moon Nyquist gate because
    // that gate keys off the per-frame step, as the renderer computes it.
    // Indexed, not keyed by value: JS and Python disagree on how to spell 1.0 as a string.
    const presets = [];
    for (const dps of JSON.parse(process.env.SOL_PRESET_DPS)) {
      const yps = dps / T.DAYS_PER_YEAR;
      const simPerReal = yps * T.DAYS_PER_YEAR * DAY;
      const frame = 1 / 60;
      const rows = {};
      for (const [name, p] of Object.entries(B.BODY)) {
        const step = T.rotationDisplayStepSeconds(frame, T.solarStepSeconds(frame, yps), p.rotationHours);
        rows[name] = {
          limited: T.rotationDisplayIsLimited(simPerReal, p.rotationHours),
          visibleTurnsPerRealSecond: Math.abs(step) / frame / (Math.abs(p.rotationHours) * 3600),
          signPreserved: Math.sign(step) === Math.sign(T.solarStepSeconds(frame, yps)),
          trueTurnsPerRealSecond: simPerReal / (Math.abs(p.rotationHours) * 3600),
        };
      }
      const aliased = {};
      for (const m of Mo.MOONS) {
        aliased[m.n] = Or.aliasedByClock(m, T.solarStepSeconds(frame, yps));
      }
      presets.push({ dps, simPerReal, rows, aliased, frameStepSeconds: T.solarStepSeconds(frame, yps) });
    }

    console.log(JSON.stringify({
      bodies, moons, presets,
      maxDisplayRotationTps: T.MAX_DISPLAY_ROTATION_TPS,
      daysPerYear: T.DAYS_PER_YEAR,
      solarSpeedMinDps: T.SOLAR_SPEED_MIN_DPS,
      solarSpeedMaxDps: T.SOLAR_SPEED_MAX_DPS,
    }));
  })
  .catch((e) => { console.error(e); process.exit(1); });
"""


def measure() -> dict:
    node = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
    urls = [
        (WEB_JS / "bodyData.js").resolve().as_uri(),
        (WEB_JS / "moons.js").resolve().as_uri(),
        (WEB_JS / "moonorbits.js").resolve().as_uri(),
        (WEB_JS / "orreryTime.js").resolve().as_uri(),
    ]
    out = subprocess.run(
        [node, "-e", NODE_SCRIPT, *urls],
        capture_output=True, text=True, timeout=300, check=False,
        encoding="utf-8", errors="replace",  # node emits UTF-8; Windows consoles default cp1252
        env={**__import__("os").environ,
             "SOL_PRESET_DPS": json.dumps([dps for _, dps in SPEED_PRESETS])},
    )
    if out.returncode != 0:
        raise SystemExit(f"FAIL: could not run the motion measurement:\n{out.stderr[-2000:]}")
    return json.loads(out.stdout)


# --------------------------------------------------------------------------------- assertions


def check_rotation(m: dict) -> list[str]:
    errors: list[str] = []
    for name, sense in SPIN_SENSE.items():
        b = m["bodies"].get(name)
        if b is None:
            errors.append(f"{name}: missing from BODY — the motion contract covers every drawn body")
            continue
        rate = b["rateDegPerDay"]
        # The measured mean rate must BE the pinned Ẇ. Anything else means rotationPhase is not
        # applying the elements it was given.
        if abs(rate - b["wDotDegPerDay"]) > RATE_TOLERANCE_DEG_PER_DAY:
            errors.append(
                f"{name}: rotationPhase() advances {rate:.9f} °/day over {b['spanDays']:.1f} d, "
                f"but Ẇ is {b['wDotDegPerDay']} °/day — the rendered spin is not the pinned one"
            )
        if (rate < 0) != (sense < 0):
            errors.append(
                f"{name}: measured spin is {'retrograde' if rate < 0 else 'prograde'}, "
                f"WGCCRE 2015 says {'retrograde' if sense < 0 else 'prograde'}"
            )
        if (float(b["rotationHours"]) < 0) != (sense < 0):
            errors.append(
                f"{name}: rotationHours {b['rotationHours']} h has the wrong sign for a "
                f"{'retrograde' if sense < 0 else 'prograde'} rotator"
            )
        derived = abs(b["measuredHours"])
        if abs(derived - abs(float(b["rotationHours"]))) > ROTATION_HOURS_TOLERANCE_H:
            errors.append(
                f"{name}: one measured rotation takes {derived:.4f} h, the card says "
                f"{abs(float(b['rotationHours'])):.4f} h (> {ROTATION_HOURS_TOLERANCE_H} h apart)"
            )
        # A whole cycle of the periodic argument must contain a whole lot of turns; if the
        # accumulator had lost a revolution the count would not be a smooth function of the span.
        if not math.isfinite(b["turns"]) or abs(b["turns"]) < 1:
            errors.append(f"{name}: measured only {b['turns']:.3f} turns — the phase accumulator is broken")
    return errors


def check_pole(m: dict) -> list[str]:
    errors: list[str] = []
    for name, (obliquity_to_orbit, orbit_inclination) in OBLIQUITY_TO_ORBIT.items():
        b = m["bodies"].get(name)
        if b is None:
            continue
        if abs(b["poleNorm"] - 1.0) > 1e-9:
            errors.append(f"{name}: poleVector is not a unit vector (|p| = {b['poleNorm']:.12f})")
        # IAU convention: north is the side of the invariable plane, so every α₀/δ₀ points into
        # the ecliptic-northern hemisphere — including the retrograde rotators, whose NEGATIVE Ẇ
        # is what encodes the backwards spin.
        if b["poleZ"] <= 0:
            errors.append(
                f"{name}: the rendered north pole points into the ecliptic-southern hemisphere "
                f"(z = {b['poleZ']:.6f}) — the IAU pole is north by definition"
            )
        # The IAU north pole is the right-hand spin pole only for prograde rotators; for Venus
        # and Uranus it is the opposite end, so the fact sheet's obliquity-to-orbit measures the
        # supplement of the angle we can see here.
        eps = obliquity_to_orbit if SPIN_SENSE.get(name, 1) > 0 else 180.0 - obliquity_to_orbit
        lo = max(0.0, abs(eps - orbit_inclination) - OBLIQUITY_SLACK_DEG)
        hi = min(180.0, eps + orbit_inclination + OBLIQUITY_SLACK_DEG)
        theta = b["obliquityFromEclipticDeg"]
        if not (lo <= theta <= hi):
            errors.append(
                f"{name}: rendered axis is {theta:.3f}° from the ecliptic pole, outside the "
                f"[{lo:.3f}°, {hi:.3f}°] the fact sheet's {obliquity_to_orbit}° obliquity-to-orbit "
                f"and {orbit_inclination}° orbital inclination allow"
            )
    return errors


def check_moons(m: dict) -> list[str]:
    errors: list[str] = []
    moons = m["moons"]
    if len(moons) != 21:
        errors.append(f"expected the 21 curated moons, measured {len(moons)}")
    for mo in moons:
        implied, published = mo["periodFromKnots"], mo["P"]
        if not math.isfinite(implied) or implied <= 0:
            errors.append(f"{mo['n']}: mean longitude does not advance — implied period {implied}")
            continue
        if abs(implied - published) > MOON_PERIOD_TOLERANCE_DAYS:
            errors.append(
                f"{mo['n']} ({mo['p']}): the shipped element knots imply a {implied:.6f} d orbit "
                f"but the card prints {published} d (Δ {abs(implied - published):.2e} d > "
                f"{MOON_PERIOD_TOLERANCE_DAYS} d)"
            )
        if abs(mo["periodFromNd"] - published) > MOON_PERIOD_TOLERANCE_DAYS:
            errors.append(
                f"{mo['n']}: mean motion {mo['nd']} °/day implies {mo['periodFromNd']:.6f} d, "
                f"card prints {published} d"
            )
        if mo["worstPairRel"] > MOON_KNOT_PAIR_TOLERANCE_REL:
            errors.append(
                f"{mo['n']}: knot pair #{mo['worstPairIndex']} implies a mean motion "
                f"{mo['worstPairRel'] * 100:.2f}% away from the table's — a corrupted knot would "
                f"teleport the moon mid-orbit"
            )
        if mo["knots"] < 3:
            errors.append(f"{mo['n']}: only {mo['knots']} element knots — nothing to interpolate")
    return errors


def check_time_model(m: dict) -> list[str]:
    errors: list[str] = []
    if abs(m["maxDisplayRotationTps"] - MAX_DISPLAY_ROTATION_TPS_PINNED) > 1e-12:
        errors.append(
            f"MAX_DISPLAY_ROTATION_TPS is {m['maxDisplayRotationTps']}, pinned "
            f"{MAX_DISPLAY_ROTATION_TPS_PINNED} — the disclosure in the accuracy line names "
            "one visible turn per five real seconds"
        )
    cap = m["maxDisplayRotationTps"]
    if len(m["presets"]) != len(SPEED_PRESETS):
        return errors + [f"measured {len(m['presets'])} presets, pinned {len(SPEED_PRESETS)}"]
    for (label, dps), preset in zip(SPEED_PRESETS, m["presets"]):
        if abs(preset["dps"] - dps) > abs(dps) * 1e-12:
            errors.append(f"{label}: measured preset {preset['dps']} d/s, pinned {dps}")
        for name, row in preset["rows"].items():
            expect_limited = row["trueTurnsPerRealSecond"] > cap
            if row["limited"] != expect_limited:
                errors.append(
                    f"{label}/{name}: display limiter says {row['limited']} but true spin is "
                    f"{row['trueTurnsPerRealSecond']:.4f} turns/s against a {cap} turns/s cap"
                )
            visible = row["visibleTurnsPerRealSecond"]
            want = min(row["trueTurnsPerRealSecond"], cap)
            if abs(visible - want) > 1e-9:
                errors.append(
                    f"{label}/{name}: visible spin is {visible:.6f} turns/s, expected "
                    f"{want:.6f} — the cap must slow the presentation to exactly the limit, "
                    "never stop it and never overshoot"
                )
            if not row["signPreserved"]:
                errors.append(
                    f"{label}/{name}: the capped step reverses the direction of rotation — "
                    "a slowed spin is a simplification, a reversed one is a falsehood"
                )
        # The moon Nyquist gate must agree with its own stated rule: hide below three samples
        # per revolution, never above.
        for mo in m["moons"]:
            want_hidden = preset["frameStepSeconds"] > (mo["P"] * 86400) / 3
            if preset["aliased"][mo["n"]] != want_hidden:
                errors.append(
                    f"{label}/{mo['n']}: alias gate says {preset['aliased'][mo['n']]} for a "
                    f"{preset['frameStepSeconds']:.1f} s frame step against a {mo['P']} d orbit"
                )
    return errors


def check_presets_match_html() -> list[str]:
    """The pinned preset table above must be the buttons the user can actually press."""
    html = INDEX_HTML.read_text(encoding="utf-8")
    found = [float(v) for v in re.findall(r'class="time-btn"\s+data-dps="([-0-9.eE+]+)"', html)]
    if len(found) != len(SPEED_PRESETS):
        return [
            f"index.html ships {len(found)} time-speed presets, this audit pins "
            f"{len(SPEED_PRESETS)}: {found} vs {[d for _, d in SPEED_PRESETS]}. Add the new "
            "preset here and re-read the measured table before shipping it."
        ]
    errors = []
    for (label, pinned), have in zip(SPEED_PRESETS, found):
        if abs(have - pinned) > abs(pinned) * PRESET_MATCH_REL:
            errors.append(f"index.html preset {label}: data-dps={have}, pinned {pinned}")
    return errors


def summarise(m: dict) -> None:
    worst_rot = max(
        (abs(abs(b["measuredHours"]) - abs(float(b["rotationHours"]))), n)
        for n, b in m["bodies"].items()
    )
    worst_moon = max((abs(mo["periodFromKnots"] - mo["P"]), mo["n"]) for mo in m["moons"])
    print(
        "INFO: motion contract holds — 10 bodies measured through rotationPhase()/poleVector() "
        f"(worst card-vs-measured period {worst_rot[0]:.4f} h on {worst_rot[1]}), "
        f"{len(m['moons'])} moon periods from their shipped knots (worst "
        f"{worst_moon[0]:.2e} d on {worst_moon[1]}), and the display cap engages exactly at "
        f"{m['maxDisplayRotationTps']} turn/s across all {len(SPEED_PRESETS)} shipped presets"
    )


def main() -> int:
    errors = check_presets_match_html()
    measured = measure()
    errors += check_rotation(measured)
    errors += check_pole(measured)
    errors += check_moons(measured)
    errors += check_time_model(measured)
    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        print(f"{len(errors)} violation(s) of the motion contract (docs/ACCURACY_CONTRACT.md)")
        return 1
    summarise(measured)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
