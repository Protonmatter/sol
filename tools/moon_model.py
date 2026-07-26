#!/usr/bin/env python3
"""Shared multi-epoch moon-orbit model used by the generator and validator.

Horizons osculating elements are converted to modified equinoctial elements before
interpolation. The representation is nonsingular for nearly circular and low-inclination
orbits, where the classical node and argument of periapsis can jump by 180 degrees even
though the physical orbit remains continuous.
"""
from __future__ import annotations

import csv
import math
from collections import defaultdict
from pathlib import Path

D2R = math.pi / 180


def nearest_angle(value: float, target: float) -> float:
    """Return the 360-degree equivalent of value nearest target."""
    return value + 360 * round((target - value) / 360)


def load_element_groups(path: Path) -> dict[str, list[dict[str, float | str]]]:
    groups: dict[str, list[dict[str, float | str]]] = defaultdict(list)
    with path.open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            groups[row["Satellite"]].append({
                "planet": row["Planet"],
                "name": row["Satellite"],
                "code": row["Code"],
                "jd": float(row["jd_tdb"]),
                "a": float(row["a_km"]),
                "e": float(row["e"]),
                "i": float(row["i_deg"]),
                "node": float(row["node_deg"]),
                "argp": float(row["argp_deg"]),
                "M": float(row["M_deg"]),
                "n": float(row["n_deg_per_day"]),
            })
    for rows in groups.values():
        rows.sort(key=lambda row: float(row["jd"]))
    return dict(groups)


def equinoctial_knots(rows: list[dict[str, float | str]]) -> list[dict[str, float]]:
    """Classical Horizons elements -> continuous modified-equinoctial knots."""
    knots: list[dict[str, float]] = []
    previous_longitude: float | None = None
    previous_n: float | None = None
    previous_jd: float | None = None
    for row in rows:
        jd = float(row["jd"])
        node_deg = float(row["node"])
        argp_deg = float(row["argp"])
        e = float(row["e"])
        i = float(row["i"])
        n = float(row["n"])
        raw_longitude = node_deg + argp_deg + float(row["M"])
        if previous_longitude is None:
            longitude = raw_longitude
        else:
            assert previous_n is not None and previous_jd is not None
            predicted = previous_longitude + 0.5 * (previous_n + n) * (jd - previous_jd)
            longitude = nearest_angle(raw_longitude, predicted)

        node = node_deg * D2R
        varpi = (node_deg + argp_deg) * D2R
        half_i = math.tan(i * D2R / 2)
        knots.append({
            "jd": jd,
            "a": float(row["a"]),
            "h": e * math.sin(varpi),
            "k": e * math.cos(varpi),
            "p": half_i * math.sin(node),
            "q": half_i * math.cos(node),
            "L": longitude,
        })
        previous_longitude, previous_n, previous_jd = longitude, n, jd
    return knots


def knot_step_days(knots: list[dict[str, float]]) -> float:
    if len(knots) < 2:
        raise ValueError("at least two element knots are required")
    step = knots[1]["jd"] - knots[0]["jd"]
    if step <= 0:
        raise ValueError("element knots must increase in time")
    for left, right in zip(knots, knots[1:]):
        if abs((right["jd"] - left["jd"]) - step) > 1e-7:
            raise ValueError("element knots are not uniformly spaced")
    return step


def interpolate(knots: list[dict[str, float]], jd: float) -> dict[str, float]:
    """Linearly interpolate nonsingular elements, then recover classical elements."""
    if len(knots) < 2:
        raise ValueError("at least two element knots are required")
    if jd <= knots[0]["jd"]:
        left, right = knots[0], knots[1]
    elif jd >= knots[-1]["jd"]:
        left, right = knots[-2], knots[-1]
    else:
        lo, hi = 0, len(knots) - 1
        while lo + 1 < hi:
            mid = (lo + hi) // 2
            if knots[mid]["jd"] <= jd:
                lo = mid
            else:
                hi = mid
        left, right = knots[lo], knots[hi]
    fraction = (jd - left["jd"]) / (right["jd"] - left["jd"])

    def lerp(key: str) -> float:
        return left[key] + (right[key] - left[key]) * fraction

    h, k, p, q = lerp("h"), lerp("k"), lerp("p"), lerp("q")
    node = math.atan2(p, q)
    varpi = math.atan2(h, k)
    return {
        "a": lerp("a"),
        "e": math.hypot(h, k),
        "i": 2 * math.atan(math.hypot(p, q)) / D2R,
        "node": node / D2R,
        "argp": (varpi - node) / D2R,
        "M": lerp("L") - varpi / D2R,
    }


def eccentric_anomaly(mean_anomaly: float, eccentricity: float) -> float:
    mean_anomaly = math.fmod(mean_anomaly, 2 * math.pi)
    if mean_anomaly > math.pi:
        mean_anomaly -= 2 * math.pi
    elif mean_anomaly < -math.pi:
        mean_anomaly += 2 * math.pi
    estimate = mean_anomaly + 0.85 * eccentricity * (-1 if mean_anomaly < 0 else 1)
    for _ in range(60):
        delta = (
            estimate - eccentricity * math.sin(estimate) - mean_anomaly
        ) / (1 - eccentricity * math.cos(estimate))
        estimate -= delta
        if abs(delta) < 1e-14:
            break
    return estimate


def position(elements: dict[str, float]) -> tuple[float, float, float]:
    """Planetocentric ecliptic-J2000 position in kilometres."""
    eccentricity = elements["e"]
    anomaly = eccentric_anomaly(elements["M"] * D2R, eccentricity)
    xp = elements["a"] * (math.cos(anomaly) - eccentricity)
    yp = elements["a"] * math.sqrt(1 - eccentricity**2) * math.sin(anomaly)
    inc, node, argp = (
        elements["i"] * D2R,
        elements["node"] * D2R,
        elements["argp"] * D2R,
    )
    co, so = math.cos(argp), math.sin(argp)
    cn, sn = math.cos(node), math.sin(node)
    ci, si = math.cos(inc), math.sin(inc)
    return (
        (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
        (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
        so * si * xp + co * si * yp,
    )
