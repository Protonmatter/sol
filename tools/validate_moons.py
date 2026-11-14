#!/usr/bin/env python3
"""Validate the generated multi-epoch moon model against held-out Horizons vectors.

The element knots and validation vectors are temporally interleaved: validation
times sit halfway between knots. This prevents a table lookup from passing and
measures the interpolation plus Kepler propagation the browser actually performs.
"""
from __future__ import annotations

import csv
import argparse
import math
import subprocess
import sys
from pathlib import Path

from moon_model import (
    equinoctial_knots,
    interpolate,
    knot_step_days,
    load_element_groups,
    position,
)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "ephemeris-data" / "moons"

# These are product accuracy budgets, not permissive frame-error detectors.
# The previous one-epoch model allowed 8° / 4% and measured 4.09° / 2.61%.
MAX_ANGLE_DEG = 0.15
MAX_RADIUS_FRAC = 0.0025  # 0.25%
MIN_CHECKS_PER_MOON = 100
VECTOR_COLUMNS = ("Satellite", "Code", "jd_tdb", "x_km", "y_km", "z_km")

EXPECTED_INC = {
    "Mars": (15, 40),
    "Jupiter": (0, 10),
    "Saturn": (15, 40),
    "Uranus": (85, 110),
    "Neptune": (0, 180),
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-canonical", action="store_true", help="require reviewed pinned Linux x86_64 generation evidence")
    args = parser.parse_args(argv)
    errors: list[str] = []

    regeneration = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "generate_moons.py"), "--check", *(["--require-canonical"] if args.require_canonical else [])],
        capture_output=True,
        text=True,
    )
    if regeneration.returncode != 0:
        errors.append(
            "generate_moons.py --check failed:\n"
            + regeneration.stdout
            + regeneration.stderr
        )
    elif regeneration.stdout:
        print(regeneration.stdout.strip())

    groups = load_element_groups(SRC / "horizons_satellite_elements.csv")
    knots = {name: equinoctial_knots(rows) for name, rows in groups.items()}
    with (SRC / "jpl_satellite_physical.csv").open(encoding="utf-8", newline="") as physical_stream:
        physical = {row["Satellite"]: row for row in csv.DictReader(physical_stream)}

    checks_by_moon: dict[str, int] = {}
    dates_by_moon: dict[str, list[float]] = {}
    seen_vectors: set[tuple[str, float]] = set()
    worst_angle = (0.0, "")
    worst_radius = (0.0, "")
    checked = 0
    with (SRC / "horizons_satellite_vectors.csv").open(
        encoding="utf-8", newline=""
    ) as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames != list(VECTOR_COLUMNS):
            errors.append("validation vector columns differ from the declared format")
        for row in reader if reader.fieldnames == list(VECTOR_COLUMNS) else ():
            if set(row) != set(VECTOR_COLUMNS) or any(row[key] is None for key in VECTOR_COLUMNS):
                errors.append("validation vector row has missing or extra fields")
                continue
            name = row["Satellite"]
            moon_knots = knots.get(name)
            if moon_knots is None:
                errors.append(f"{name}: validation vector with no element knots")
                continue
            if row["Code"] != str(groups[name][0]["code"]):
                errors.append(f"{name}: validation vector target code differs from its elements")
                continue
            try:
                jd = float(row["jd_tdb"])
                truth = tuple(float(row[key]) for key in ("x_km", "y_km", "z_km"))
            except (TypeError, ValueError):
                errors.append(f"{name}: validation vector has a malformed epoch or coordinate")
                continue
            if not all(math.isfinite(value) for value in (jd, *truth)):
                errors.append(f"{name}: validation vector has a non-finite epoch or coordinate")
                continue
            if (name, jd) in seen_vectors:
                errors.append(f"{name} @ JD {jd:.6f}: duplicate validation vector")
                continue
            seen_vectors.add((name, jd))

            # A validation record may never coincide with a training knot.
            nearest_days = min(abs(jd - knot["jd"]) for knot in moon_knots)
            if nearest_days < 1e-6:
                errors.append(f"{name} @ JD {jd:.6f}: validation time is an element knot")
                continue
            if not (moon_knots[0]["jd"] < jd < moon_knots[-1]["jd"]):
                errors.append(f"{name} @ JD {jd:.6f}: validation requires extrapolation")
                continue

            got = position(interpolate(moon_knots, jd))
            if len(got) != 3 or not all(math.isfinite(value) for value in got):
                errors.append(f"{name} @ JD {jd:.6f}: model vector is non-finite or malformed")
                continue
            truth_radius = math.dist((0, 0, 0), truth)
            got_radius = math.dist((0, 0, 0), got)
            numerator = sum(a * b for a, b in zip(got, truth))
            denominator = got_radius * truth_radius
            if not all(math.isfinite(value) for value in (truth_radius, got_radius, numerator, denominator)) \
                    or truth_radius <= 0 or got_radius <= 0 or denominator <= 0:
                errors.append(f"{name} @ JD {jd:.6f}: invalid vector norm or comparison range")
                continue
            cosine = numerator / denominator
            angular = math.degrees(
                math.acos(max(-1.0, min(1.0, cosine)))
            )
            radial = abs(got_radius - truth_radius) / truth_radius
            if not all(math.isfinite(value) for value in (cosine, angular, radial)):
                errors.append(f"{name} @ JD {jd:.6f}: non-finite vector comparison")
                continue
            checked += 1
            checks_by_moon[name] = checks_by_moon.get(name, 0) + 1
            dates_by_moon.setdefault(name, []).append(jd)
            if angular > worst_angle[0]:
                worst_angle = (angular, f"{name} @ JD {jd:.1f}")
            if radial > worst_radius[0]:
                worst_radius = (radial, f"{name} @ JD {jd:.1f}")
            if angular > MAX_ANGLE_DEG:
                errors.append(
                    f"{name} @ JD {jd:.1f}: {angular:.4f}° "
                    f"from Horizons (limit {MAX_ANGLE_DEG}°)"
                )
            if radial > MAX_RADIUS_FRAC:
                errors.append(
                    f"{name} @ JD {jd:.1f}: radius off by {radial * 100:.4f}% "
                    f"(limit {MAX_RADIUS_FRAC * 100:.2f}%)"
                )

    if set(checks_by_moon) != set(groups):
        errors.append("element and validation moon sets differ")
    for name in groups:
        count = checks_by_moon.get(name, 0)
        if count < MIN_CHECKS_PER_MOON:
            errors.append(
                f"{name}: only {count} held-out checks; need {MIN_CHECKS_PER_MOON}"
            )

    # Physical and representation sanity.
    for name, rows in groups.items():
        moon_knots = knots[name]
        try:
            step = knot_step_days(moon_knots)
        except ValueError as exc:
            errors.append(f"{name}: {exc}")
            continue
        if step > 7.000001:
            errors.append(f"{name}: element cadence {step:g} d is too sparse")
        representative = interpolate(
            moon_knots, 0.5 * (moon_knots[0]["jd"] + moon_knots[-1]["jd"])
        )
        row = physical.get(name)
        if row is None:
            errors.append(f"{name}: no physical parameters")
            continue
        radius = float(row["mean_radius_km"])
        if not (1 < radius < 3000):
            errors.append(f"{name}: implausible mean radius {radius} km")
        if representative["a"] <= radius:
            errors.append(
                f"{name}: orbit inside its own radius "
                f"({representative['a']} <= {radius} km)"
            )
        if not (0 <= representative["e"] < 1):
            errors.append(
                f"{name}: eccentricity {representative['e']} is not an ellipse"
            )
        planet = str(rows[0]["planet"])
        low, high = EXPECTED_INC.get(planet, (0, 180))
        if not (low <= representative["i"] <= high):
            errors.append(
                f"{name}: inclination {representative['i']}° outside "
                f"{low}–{high}° for a {planet} satellite"
            )

    if errors:
        print("FAIL: moon validation")
        for error in errors:
            print("  -", error)
        return 1

    valid_min = max(min(dates) for dates in dates_by_moon.values())
    valid_max = min(max(dates) for dates in dates_by_moon.values())
    print(
        f"OK: {len(groups)} moons — regen byte-stable; {checked} interleaved "
        f"Horizons checks across JD {valid_min:.1f}–{valid_max:.1f}; "
        f"worst angular {worst_angle[0]:.4f}° [{worst_angle[1]}], "
        f"worst radial {worst_radius[0] * 100:.4f}% [{worst_radius[1]}]"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
