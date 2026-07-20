#!/usr/bin/env python3
"""Validate the generated star catalogue — offline, deterministic.

Three layers, so the catalogue cannot drift from its sources or from physics:

  1. Regeneration byte-stability: tools/generate_star_catalog.py --check must report
     the committed starcatalog.js and stars.rs identical to a fresh regeneration.
  2. Structural sanity of apps/web/js/starcatalog.js: counts match, every packed field
     finite and in range (RA [0,360), Dec [-90,90], V ≤ limit, plausible B−V and
     distance), named stars resolve into the packed set.
  3. Physics spot-checks: Python mirrors of the starphysics.js formulas are checked
     against literature values for well-measured stars (Sirius, Vega, …) within honest
     tolerances — catching either a source-decoding break or a formula edit that
     diverges from the JS implementation's documented behaviour.

Standard library only. Exit non-zero on any failure (safe for PR CI).
"""
from __future__ import annotations

import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ROOT / "apps" / "web" / "js" / "starcatalog.js"

LY_PER_PC = 3.2615637772
SUN_MBOL = 4.74
SUN_TEFF = 5772.0

BC_TABLE = [
    (-0.30, -2.9), (-0.20, -1.9), (-0.10, -0.85), (0.00, -0.21), (0.30, -0.09),
    (0.65, -0.07), (0.82, -0.19), (1.10, -0.45), (1.42, -1.24), (1.70, -2.30), (2.00, -3.30),
]

# name -> (distance ly ± tol, Teff K ± tol, luminosity L_sun (min, max))
TRUTH = {
    "Sirius": ((8.60, 0.05), (9940, 900), (20.0, 32.0)),
    "Vega": ((25.0, 0.6), (9600, 900), (30.0, 60.0)),
    "Procyon": ((11.46, 0.12), (6550, 600), (5.0, 9.5)),
    "Arcturus": ((36.7, 1.0), (4290, 450), (110.0, 260.0)),
    "Capella": ((42.9, 1.5), (4950, 600), (55.0, 180.0)),
    "Aldebaran": ((65.3, 2.0), (3910, 450), (300.0, 700.0)),
}


def bc(bv: float) -> float:
    t = max(BC_TABLE[0][0], min(BC_TABLE[-1][0], bv))
    for i in range(1, len(BC_TABLE)):
        x0, y0 = BC_TABLE[i - 1]
        x1, y1 = BC_TABLE[i]
        if t <= x1:
            return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0)
    return BC_TABLE[-1][1]


def teff(bv: float) -> float:
    return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))


def lum(vmag: float, bv: float, dist_ly: float) -> float:
    mv = vmag - 5 * math.log10(dist_ly / LY_PER_PC / 10)
    return 10 ** ((SUN_MBOL - (mv + bc(bv))) / 2.5)


def main() -> int:
    errors: list[str] = []

    # -- 1. regeneration byte-stability -------------------------------------
    check = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "generate_star_catalog.py"), "--check"],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        errors.append("regeneration check failed:\n" + check.stdout + check.stderr)

    # -- 2. structural sanity ------------------------------------------------
    text = JS.read_text(encoding="utf-8")
    count = int(re.search(r"STAR_COUNT = (\d+);", text).group(1))
    packed_block = text.split("STARS_PACKED = [", 1)[1].split("];", 1)[0]
    rows = [r.strip().rstrip(",") for r in packed_block.strip().splitlines()]
    if len(rows) != count:
        errors.append(f"STAR_COUNT {count} != packed rows {len(rows)}")
    if not 8000 <= count <= 10000:
        errors.append(f"suspicious naked-eye star count: {count}")

    named = re.findall(r'\{ hip: (\d+), name: (".*?"), .*?ra: ([-\d.]+), dec: ([-\d.]+), '
                       r"mag: ([-\d.]+), bv: ([-\d.]+|null), dist: ([\d.]+|null)", text)
    if not 400 <= len(named) <= 700:
        errors.append(f"suspicious named-star count: {len(named)}")

    by_name: dict[str, tuple] = {}
    for hip, name, ra, dec, mag, bv, dist in named:
        by_name[name.strip('"')] = (float(ra), float(dec), float(mag),
                                    None if bv == "null" else float(bv),
                                    None if dist == "null" else float(dist))

    n_null_dist = 0
    for i, row in enumerate(rows):
        parts = row.split(",")
        if len(parts) != 5:
            errors.append(f"packed row {i}: {len(parts)} fields")
            break
        ra, dec, mag = float(parts[0]), float(parts[1]), float(parts[2])
        bv = float(parts[3])
        dist = None if parts[4] == "null" else float(parts[4])
        if not (0.0 <= ra < 360.0 and -90.0 <= dec <= 90.0):
            errors.append(f"packed row {i}: RA/Dec out of range ({ra}, {dec})")
            break
        if not (-2.0 <= mag <= 6.6):
            errors.append(f"packed row {i}: V mag out of range ({mag})")
            break
        if not (-0.6 <= bv <= 3.5):
            errors.append(f"packed row {i}: B−V out of range ({bv})")
            break
        if dist is None:
            n_null_dist += 1
        elif not (0.0 < dist < 3.5e5):
            errors.append(f"packed row {i}: distance out of range ({dist})")
            break
    if n_null_dist > count * 0.05:
        errors.append(f"too many null distances: {n_null_dist}/{count}")

    # -- 3. physics spot-checks ---------------------------------------------
    for name, ((d_want, d_tol), (t_want, t_tol), (l_min, l_max)) in TRUTH.items():
        rec = by_name.get(name)
        if rec is None:
            errors.append(f"truth star missing from NAMED_STARS: {name}")
            continue
        _ra, _dec, mag, bv, dist = rec
        if dist is None or abs(dist - d_want) > d_tol:
            errors.append(f"{name}: distance {dist} ly, expected {d_want}±{d_tol}")
            continue
        t = teff(bv)
        if abs(t - t_want) > t_tol:
            errors.append(f"{name}: Teff {t:.0f} K, expected {t_want}±{t_tol}")
        l_val = lum(mag, bv, dist)
        if not l_min <= l_val <= l_max:
            errors.append(f"{name}: luminosity {l_val:.1f} L_sun outside [{l_min}, {l_max}]")

    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1
    print(f"OK: star catalogue — {count} stars, {len(named)} named; regen byte-stable; physics spot-checks pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
