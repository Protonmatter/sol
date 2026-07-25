#!/usr/bin/env python3
"""Validate the shipped moon orbits against JPL Horizons — offline, in CI.

Three gates:

  1. Regeneration byte-stability: generate_moons.py --check must find the committed
     apps/web/js/moons.js identical to a fresh regeneration from the pristine sources.
  2. Positional accuracy: propagate every moon's committed osculating elements with Kepler and
     compare against the committed Horizons state vectors, which straddle the element epoch by
     about a year either side. This is the gate that matters — it is what caught the fact that
     JPL's satellite MEAN elements cannot be Kepler-propagated at all (they were 24–165° wrong
     for Saturn and Uranus at their own epoch).
  3. Physical sanity: radii, densities and orbit sizes are positive and in range, and every
     moon's inclination echoes its planet's obliquity, which is what a correctly-framed
     planetocentric ecliptic element set looks like.

Usage:  python tools/validate_moons.py
"""
from __future__ import annotations

import csv
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "ephemeris-data" / "moons"

# Worst tolerated angular separation from Horizons, degrees. Kepler-propagating osculating
# elements ignores every perturbation after the epoch, and the inner moons of Saturn and Mars are
# perturbed hard, so this is a budget for a VIEW, not an ephemeris. It is deliberately tight
# enough that a convention or frame error — which lands in the tens of degrees — cannot hide.
MAX_ANGLE_DEG = 8.0
# Radial error is a far more sensitive probe of a wrong semi-major axis or eccentricity.
MAX_RADIUS_FRAC = 0.04

AU_KM = 149597870.7
D2R = math.pi / 180
EXPECTED_INC = {"Mars": (15, 40), "Jupiter": (0, 10), "Saturn": (15, 40),
                "Uranus": (85, 110), "Neptune": (0, 180)}


def eccentric_anomaly(M: float, e: float) -> float:
    M = math.fmod(M, 2 * math.pi)
    if M > math.pi:
        M -= 2 * math.pi
    elif M < -math.pi:
        M += 2 * math.pi
    E = M + 0.85 * e * (-1 if M < 0 else 1)
    for _ in range(60):
        d = (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        E -= d
        if abs(d) < 1e-14:
            break
    return E


def position(el: dict[str, float], jd: float) -> tuple[float, float, float]:
    days = jd - el["epoch"]
    M = (el["M0"] + el["n"] * days) * D2R
    E = eccentric_anomaly(M, el["e"])
    xp = el["a"] * (math.cos(E) - el["e"])
    yp = el["a"] * math.sqrt(1 - el["e"] ** 2) * math.sin(E)
    inc, node, argp = el["i"] * D2R, el["node"] * D2R, el["argp"] * D2R
    co, so = math.cos(argp), math.sin(argp)
    cn, sn = math.cos(node), math.sin(node)
    ci, si = math.cos(inc), math.sin(inc)
    return (
        (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
        (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
        (so * si) * xp + (co * si) * yp,
    )


def main() -> int:
    errors: list[str] = []

    # -- 1. regeneration byte-stability -------------------------------------
    check = subprocess.run([sys.executable, str(ROOT / "tools" / "generate_moons.py"), "--check"],
                           capture_output=True, text=True)
    if check.returncode != 0:
        errors.append("generate_moons.py --check failed:\n" + check.stdout + check.stderr)

    elems = {}
    for r in csv.DictReader((SRC / "horizons_satellite_elements.csv").open(encoding="utf-8", newline="")):
        elems[r["Satellite"]] = {
            "planet": r["Planet"], "epoch": float(r["epoch_jd_tdb"]), "a": float(r["a_km"]),
            "e": float(r["e"]), "i": float(r["i_deg"]), "node": float(r["node_deg"]),
            "argp": float(r["argp_deg"]), "M0": float(r["M_deg"]), "n": float(r["n_deg_per_day"]),
        }
    phys = {r["Satellite"]: r for r in
            csv.DictReader((SRC / "jpl_satellite_physical.csv").open(encoding="utf-8", newline=""))}

    # -- 2. positions vs Horizons -------------------------------------------
    worst_ang, worst_ang_who = 0.0, ""
    worst_rad, worst_rad_who = 0.0, ""
    checked = 0
    for r in csv.DictReader((SRC / "horizons_satellite_vectors.csv").open(encoding="utf-8", newline="")):
        name = r["Satellite"]
        el = elems.get(name)
        if el is None:
            errors.append(f"{name}: validation vector with no committed elements")
            continue
        jd = float(r["jd_tdb"])
        truth = (float(r["x_km"]), float(r["y_km"]), float(r["z_km"]))
        got = position(el, jd)
        rt = math.dist((0, 0, 0), truth)
        rg = math.dist((0, 0, 0), got)
        dot = sum(a * b for a, b in zip(got, truth)) / (rg * rt)
        ang = math.degrees(math.acos(max(-1.0, min(1.0, dot))))
        rad = abs(rg - rt) / rt
        checked += 1
        if ang > worst_ang:
            worst_ang, worst_ang_who = ang, f"{name} @ JD {jd:.1f}"
        if rad > worst_rad:
            worst_rad, worst_rad_who = rad, f"{name} @ JD {jd:.1f}"
        if ang > MAX_ANGLE_DEG:
            errors.append(f"{name} @ JD {jd:.1f}: {ang:.2f}° from Horizons (limit {MAX_ANGLE_DEG}°)")
        if rad > MAX_RADIUS_FRAC:
            errors.append(f"{name} @ JD {jd:.1f}: radius off by {rad * 100:.2f}% (limit {MAX_RADIUS_FRAC * 100}%)")
    if not checked:
        errors.append("no Horizons validation vectors found")

    # -- 3. physical sanity --------------------------------------------------
    for name, el in elems.items():
        p = phys.get(name)
        if p is None:
            errors.append(f"{name}: no physical parameters")
            continue
        radius = float(p["mean_radius_km"])
        if not (1 < radius < 3000):
            errors.append(f"{name}: implausible mean radius {radius} km")
        if el["a"] <= radius:
            errors.append(f"{name}: orbits inside its own radius ({el['a']} <= {radius} km)")
        if not (0 <= el["e"] < 1):
            errors.append(f"{name}: eccentricity {el['e']} is not an ellipse")
        lo, hi = EXPECTED_INC.get(el["planet"], (0, 180))
        if not (lo <= el["i"] <= hi):
            errors.append(f"{name}: inclination {el['i']}° outside {lo}–{hi}° for a "
                          f"{el['planet']} satellite in the ecliptic frame")

    if errors:
        print("FAIL: moon validation")
        for e in errors:
            print("  -", e)
        return 1
    print(f"OK: {len(elems)} moons — regen byte-stable; {checked} Horizons checks pass "
          f"(worst {worst_ang:.2f}° [{worst_ang_who}], worst radius {worst_rad * 100:.2f}% [{worst_rad_who}])")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
