#!/usr/bin/env python3
"""Pin the physical/rotational constants in apps/web/js/bodyData.js to their sources — offline.

This is the enforcement half of docs/ACCURACY_CONTRACT.md. Every number below was verified
against its named source; the gate fails when the shipped module drifts from the pin, so a PR
can never silently change a pole, spin rate, radius, mass, or ring edge. To change a value
INTENTIONALLY, update the reference here and the module together in one PR and cite the new
source edition (see docs/DATA_UPDATE_PLAYBOOK.md).

Sources of truth:
  * Rotation (pole RA/Dec + rates, W0, Ẇ): IAU WGCCRE 2015 report (Archinal et al. 2018,
    Celest Mech Dyn Astr 130:22, with the 2019 correction) as distributed in NAIF's
    pck00011.tpc. The 2015 report is the LATEST — the working group has published no newer
    report (1997 and 2012 were skipped; nothing after 2015 as of 2026).
  * DOCUMENTED EXCEPTION — Mars uses the IAU 2009 constants: the 2015 Mars model is only
    valid together with its ~10-term trigonometric series, whose J2000 sum moves the pole
    ~1.5°. Taking the 2015 constant terms alone into bodyData's linear poleAt() model would
    be WORSE than 2009. This gate pins Mars to 2009 and requires the in-code warning comment
    to survive, so nobody "upgrades" the constants without implementing the series.
  * Radii / masses / tilts: NASA planetary fact sheets (nssdc.gsfc.nasa.gov).
  * Ring radii: Saturn C-ring inner edge to A-ring outer edge with the Cassini Division
    (NASA/Cassini); Uranus/Neptune main-ring spans.

Also enforced here (regression classes this repo has actually shipped):
  * rotationHours must agree with 360/|Ẇ| (≤ 0.15 h fact-sheet rounding) and carry Ẇ's sign —
    Neptune shipped for weeks with a card period from IAU 2009 while Ẇ said otherwise.
  * GLSL smoothstep() calls with literal edges must have edge0 < edge1 — reversed edges are
    undefined behaviour that ANGLE happened to tolerate, and one such call painted the whole
    procedural Sun brown.

Standard library only; requires `node` on PATH (same as the CI web job) to evaluate the real
module rather than regex-guess at it.

Usage:
    python tools/validate_body_constants.py
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
BODY_DATA = ROOT / "apps" / "web" / "js" / "bodyData.js"
SHADERS = ROOT / "apps" / "web" / "js" / "orreryShaders.js"

# Pinned per-body constants. Fields listed here must match bodyData.js exactly
# (relative tolerance 1e-12 — these are transcriptions, not measurements).
REFERENCE: dict[str, dict] = {
    "Sun": {
        "radiusKm": 695700, "polarKm": 695700, "massKg": 1.9885e30, "tiltDeg": 7.25,
        "gravity": 274, "escapeKms": 617.5, "densityGcm3": 1.408,
        "meanTempK": 5772, "albedo": 0, "magDipoleEarth": 0,
        "rotationHours": 609.12, "poleRaDeg": 286.13, "poleDecDeg": 63.87,
        "poleRaDotDegPerCty": 0, "poleDecDotDegPerCty": 0,
        "w0Deg": 84.176, "wDotDegPerDay": 14.1844, "rings": None,
    },
    "Mercury": {
        "radiusKm": 2439.7, "polarKm": 2439.7, "massKg": 3.3010e23, "tiltDeg": 0.034,
        "gravity": 3.7, "escapeKms": 4.25, "densityGcm3": 5.427,
        "meanTempK": 440, "albedo": 0.142, "magDipoleEarth": 0.0006,
        "rotationHours": 1407.6, "poleRaDeg": 281.0103, "poleDecDeg": 61.4155,
        "poleRaDotDegPerCty": -0.0328, "poleDecDotDegPerCty": -0.0049,
        "w0Deg": 329.5988, "wDotDegPerDay": 6.1385108, "rings": None,
    },
    "Venus": {
        "radiusKm": 6051.8, "polarKm": 6051.8, "massKg": 4.8673e24, "tiltDeg": 177.36,
        "gravity": 8.87, "escapeKms": 10.36, "densityGcm3": 5.243,
        "meanTempK": 737, "albedo": 0.689, "magDipoleEarth": 0,
        "rotationHours": -5832.5, "poleRaDeg": 272.76, "poleDecDeg": 67.16,
        "poleRaDotDegPerCty": 0, "poleDecDotDegPerCty": 0,
        "w0Deg": 160.2, "wDotDegPerDay": -1.4813688, "rings": None,
    },
    # Earth's RENDERED axis comes from the `precession` branch of poleAt() (a great-circle
    # walk about the ecliptic pole), not the four linear pole fields — so that object is
    # pinned too: 50.2879″/yr is the IAU general precession in longitude at J2000.
    "Earth": {
        "radiusKm": 6378.14, "polarKm": 6356.75, "massKg": 5.9722e24, "tiltDeg": 23.44,
        "gravity": 9.8, "escapeKms": 11.19, "densityGcm3": 5.514,
        "meanTempK": 288, "albedo": 0.434, "magDipoleEarth": 1.0,
        "rotationHours": 23.9345, "poleRaDeg": 0, "poleDecDeg": 90,
        "poleRaDotDegPerCty": -0.641, "poleDecDotDegPerCty": -0.557,
        "w0Deg": 190.147, "wDotDegPerDay": 360.9856235, "rings": None,
        "precession": {"obliquityDeg": 23.43928, "rateArcsecPerYear": 50.2879, "lon0Deg": 90},
    },
    # IAU 2009 ON PURPOSE — see the module docstring. Do not update to the 2015 constants
    # without implementing the 2015 trigonometric series in poleAt()/rotationPhase().
    "Mars": {
        "radiusKm": 3396.2, "polarKm": 3376.2, "massKg": 6.4169e23, "tiltDeg": 25.19,
        "gravity": 3.71, "escapeKms": 5.03, "densityGcm3": 3.933,
        "meanTempK": 210, "albedo": 0.17, "magDipoleEarth": 0,
        "rotationHours": 24.6229, "poleRaDeg": 317.681, "poleDecDeg": 52.887,
        "poleRaDotDegPerCty": -0.1061, "poleDecDotDegPerCty": -0.0609,
        "w0Deg": 176.63, "wDotDegPerDay": 350.89198226, "rings": None,
    },
    "Jupiter": {
        "radiusKm": 71492, "polarKm": 66854, "massKg": 1.89813e27, "tiltDeg": 3.13,
        "gravity": 24.79, "escapeKms": 59.5, "densityGcm3": 1.326,
        "meanTempK": 165, "albedo": 0.538, "magDipoleEarth": 20000,
        "rotationHours": 9.9259, "poleRaDeg": 268.056595, "poleDecDeg": 64.495303,
        "poleRaDotDegPerCty": -0.006499, "poleDecDotDegPerCty": 0.002413,
        "w0Deg": 284.95, "wDotDegPerDay": 870.536, "rings": None,
    },
    "Saturn": {
        "radiusKm": 60268, "polarKm": 54364, "massKg": 5.6832e26, "tiltDeg": 26.73,
        "gravity": 10.44, "escapeKms": 35.5, "densityGcm3": 0.687,
        "meanTempK": 134, "albedo": 0.499, "magDipoleEarth": 580,
        "rotationHours": 10.656, "poleRaDeg": 40.589, "poleDecDeg": 83.537,
        "poleRaDotDegPerCty": -0.036, "poleDecDotDegPerCty": -0.004,
        "w0Deg": 38.9, "wDotDegPerDay": 810.7939024,
        "rings": {"innerKm": 74500, "outerKm": 136780, "gaps": [[117580, 122170]]},
    },
    "Uranus": {
        "radiusKm": 25559, "polarKm": 24973, "massKg": 8.6811e25, "tiltDeg": 97.77,
        "gravity": 8.69, "escapeKms": 21.3, "densityGcm3": 1.27,
        "meanTempK": 76, "albedo": 0.488, "magDipoleEarth": 50,
        "rotationHours": -17.24, "poleRaDeg": 257.311, "poleDecDeg": -15.175,
        "poleRaDotDegPerCty": 0, "poleDecDotDegPerCty": 0,
        "w0Deg": 203.81, "wDotDegPerDay": -501.1600928,
        "rings": {"innerKm": 38000, "outerKm": 51150},
    },
    # WGCCRE 2015: W = 249.978 + 541.1397757·d (15.9663 h). The 2009 values
    # (253.18 + 536.3128492·d, 16.11 h — still on NASA's fact sheet) are RETIRED.
    # poleNut is pck00011's single-term periodic correction — Neptune's whole published
    # series, and the renderer applies it (poleAt/rotationPhase), so it is pinned too.
    "Neptune": {
        "radiusKm": 24764, "polarKm": 24341, "massKg": 1.02409e26, "tiltDeg": 28.32,
        "gravity": 11.15, "escapeKms": 23.5, "densityGcm3": 1.638,
        "meanTempK": 72, "albedo": 0.442, "magDipoleEarth": 27,
        "rotationHours": 15.9663, "poleRaDeg": 299.36, "poleDecDeg": 43.46,
        "poleRaDotDegPerCty": 0, "poleDecDotDegPerCty": 0,
        "w0Deg": 249.978, "wDotDegPerDay": 541.1397757,
        "rings": {"innerKm": 41900, "outerKm": 62930},
        "poleNut": {"n0Deg": 357.85, "nDotDegPerCty": 52.316,
                    "raAmpDeg": 0.70, "decAmpDeg": -0.51, "wAmpDeg": -0.48},
    },
    # poleNut is pck00011's E1 term — the first entry of BODY301_NUT_PREC_RA/_DEC/_PM on the
    # first BODY3_NUT_PREC_ANGLES argument (125.045° − 1935.5364525°·T, the 18.6-year nodal
    # regression). It is the dominant term of the lunar libration series and the renderer
    # applies it, so it is pinned. The constant terms alone put the axis 0.02° from the
    # ecliptic pole instead of the real 1.54° Cassini-state tilt.
    "Moon": {
        "radiusKm": 1737.4, "polarKm": 1736, "massKg": 7.346e22, "tiltDeg": 6.68,
        "gravity": 1.62, "escapeKms": 2.38, "densityGcm3": 3.344,
        "meanTempK": 250, "albedo": 0.136, "magDipoleEarth": 0,
        "rotationHours": 655.72, "poleRaDeg": 269.9949, "poleDecDeg": 66.5392,
        "poleRaDotDegPerCty": 0.0031, "poleDecDotDegPerCty": 0.013,
        "w0Deg": 38.3213, "wDotDegPerDay": 13.17635815, "rings": None,
        "poleNut": {"n0Deg": 125.045, "nDotDegPerCty": -1935.5364525,
                    "raAmpDeg": -3.8787, "decAmpDeg": 1.5419, "wAmpDeg": 3.5610},
    },
}

# The in-code Mars trap warning that must survive refactors (see module docstring).
MARS_GUARD_FRAGMENT = "Do not"
MARS_GUARD_CONTEXT = "trigonometric series"

ROTATION_HOURS_TOLERANCE_H = 0.15  # published sidereal periods are fact-sheet-rounded


AU_KM_PINNED = 149597870.7  # IAU 2012 definition; true-scale mode divides real radii by this


def dump_body_module() -> dict:
    node = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
    script = (
        "import(process.argv[1]).then(m => "
        "console.log(JSON.stringify({ BODY: m.BODY, AU_KM: m.AU_KM })))"
        ".catch(e => { console.error(e); process.exit(1); })"
    )
    url = BODY_DATA.resolve().as_uri()
    out = subprocess.run(
        [node, "-e", script, url],
        capture_output=True, text=True, timeout=60, check=False,
        encoding="utf-8", errors="replace",  # node emits UTF-8; Windows consoles default cp1252
    )
    if out.returncode != 0:
        raise SystemExit(f"FAIL: could not evaluate {BODY_DATA}:\n{out.stderr[-2000:]}")
    return json.loads(out.stdout)


def close(a: float, b: float) -> bool:
    if a == b:
        return True
    return math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12)


def check_nested(name: str, field: str, want: dict, have) -> list[str]:
    if not isinstance(have, dict):
        return [f"{name}.{field}: have {have!r}, pinned {want!r}"]
    errs = []
    for k, w in want.items():
        h = have.get(k)
        if h is None or not close(float(h), float(w)):
            errs.append(f"{name}.{field}.{k}: have {h!r}, pinned {w!r}")
    for k in have:
        if k not in want:
            errs.append(f"{name}.{field}.{k}: unexpected unpinned key {have[k]!r}")
    return errs


def check_bodies(dump: dict) -> list[str]:
    errors: list[str] = []
    body = dump["BODY"]
    if not close(float(dump.get("AU_KM") or -1), AU_KM_PINNED):
        errors.append(f"AU_KM: have {dump.get('AU_KM')!r}, pinned {AU_KM_PINNED!r} — true-scale rendering divides by this")
    for name, ref in REFERENCE.items():
        got = body.get(name)
        if got is None:
            errors.append(f"{name}: missing from BODY")
            continue
        for field, want in ref.items():
            if field == "rings":
                continue
            have = got.get(field)
            if isinstance(want, dict):
                errors += check_nested(name, field, want, have)
            elif have is None or not close(float(have), float(want)):
                errors.append(f"{name}.{field}: have {have!r}, pinned {want!r}")
        # A rendered-orientation model added without a pin must fail, not slide by.
        for model_field in ("poleNut", "precession"):
            if got.get(model_field) and model_field not in ref:
                errors.append(f"{name}.{model_field}: present in BODY but not pinned here")
        # Ring geometry, pinned exactly — including the ABSENCE of gaps: an unpinned new
        # division would silently change both the drawn ring and its shadow.
        want_rings, have_rings = ref["rings"], got.get("rings")
        if want_rings is None:
            if have_rings:
                errors.append(f"{name}.rings: unexpected rings {have_rings!r}")
        elif not have_rings:
            errors.append(f"{name}.rings: missing (pinned {want_rings!r})")
        else:
            for k in ("innerKm", "outerKm"):
                if not close(float(have_rings.get(k, -1)), float(want_rings[k])):
                    errors.append(f"{name}.rings.{k}: have {have_rings.get(k)!r}, pinned {want_rings[k]!r}")
            want_gaps = want_rings.get("gaps") or []
            have_gaps = have_rings.get("gaps") or []
            if len(have_gaps) != len(want_gaps):
                errors.append(f"{name}.rings.gaps: have {have_gaps!r}, pinned {want_gaps!r}")
            else:
                for (w0, w1), (h0, h1) in zip(want_gaps, have_gaps):
                    if not (close(h0, w0) and close(h1, w1)):
                        errors.append(f"{name}.rings.gaps: have {have_gaps!r}, pinned {want_gaps!r}")
                    if not (have_rings["innerKm"] < h0 < h1 < have_rings["outerKm"]):
                        errors.append(f"{name}.rings.gaps: gap [{h0}, {h1}] outside ring span")
        # Internal coherence, independent of the pins.
        rot_h, w_dot = got.get("rotationHours"), got.get("wDotDegPerDay")
        if rot_h and w_dot:
            derived = 360.0 / abs(float(w_dot)) * 24.0
            if abs(abs(float(rot_h)) - derived) > ROTATION_HOURS_TOLERANCE_H:
                errors.append(
                    f"{name}: rotationHours {rot_h} disagrees with 360/|Ẇ| = {derived:.4f} h "
                    f"(> {ROTATION_HOURS_TOLERANCE_H} h) — card, spin-freeze threshold and "
                    "rendered spin must describe the same rotation"
                )
            if (float(rot_h) < 0) != (float(w_dot) < 0):
                errors.append(f"{name}: rotationHours sign disagrees with Ẇ (retrograde mismatch)")
        if got.get("polarKm") and got.get("radiusKm") and float(got["polarKm"]) > float(got["radiusKm"]):
            errors.append(f"{name}: polarKm exceeds equatorial radiusKm")
    return errors


def check_mars_guard() -> list[str]:
    src = BODY_DATA.read_text(encoding="utf-8")
    mars = src.split("Mars: {", 1)
    head = mars[0][-1200:] if len(mars) > 1 else ""
    window = head + (mars[1][:1200] if len(mars) > 1 else "")
    if MARS_GUARD_FRAGMENT in window and MARS_GUARD_CONTEXT in window:
        return []
    return [
        "bodyData.js: the Mars 2009-constants warning comment is gone. Mars must keep the "
        "IAU 2009 pole/W unless the 2015 trigonometric series is implemented — restore the "
        "comment (see docs/ACCURACY_CONTRACT.md)."
    ]


GLSL_NUM = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"


def check_shader_smoothstep() -> list[str]:
    # Scan the comment-stripped source AS A WHOLE (calls may wrap across lines), accepting
    # every GLSL literal form (`1.`, `.5`, exponents); comments may legitimately DESCRIBE
    # the bug pattern. Line numbers are recovered from match offsets for diagnostics.
    errors = []
    src = SHADERS.read_text(encoding="utf-8")
    stripped = re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), src)  # keep offsets stable
    for m in re.finditer(
        rf"smoothstep\(\s*({GLSL_NUM})\s*,\s*({GLSL_NUM})\s*,", stripped, flags=re.S,
    ):
        e0, e1 = float(m.group(1)), float(m.group(2))
        if e0 >= e1:
            line_no = src.count("\n", 0, m.start()) + 1
            errors.append(
                f"orreryShaders.js:{line_no}: smoothstep({e0}, {e1}, …) has non-increasing "
                "edges — undefined GLSL (this class of bug once painted the Sun brown). "
                "Use 1.0 - smoothstep(lo, hi, x) instead."
            )
    return errors


def main() -> int:
    errors = []
    errors += check_bodies(dump_body_module())
    errors += check_mars_guard()
    errors += check_shader_smoothstep()
    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        print(f"{len(errors)} violation(s) of docs/ACCURACY_CONTRACT.md")
        return 1
    print("INFO: body constants match their pinned sources (WGCCRE 2015 / pck00011, NASA "
          "fact sheets); rotation coherence and shader smoothstep hygiene hold")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
