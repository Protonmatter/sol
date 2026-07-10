#!/usr/bin/env python3
"""Validate ephemeris-snapshot.v2 structure and numerical semantics."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import jsonschema_min

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "docs" / "ephemeris-snapshot-v2.schema.json"
SECONDS_PER_DAY = 86400.0
MAJOR_BODIES = {"Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"}


def reject_constant(value: str) -> None:
    raise ValueError(f"non-JSON numeric constant {value}")


def finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def close(left: float, right: float, tolerance: float) -> bool:
    return abs(left - right) <= tolerance


def local_solar_day_start(jd_utc: float, lon_east_deg: float) -> float:
    """Mirror solar-ephemeris' local mean-solar-day boundary.

    Rise/transit/set are defined over the observer's longitude-based mean-solar
    day, not over a ±12-hour window around the query instant. Keeping the
    validator on the same explicit convention prevents valid events west/east
    of Greenwich from being rejected merely because the query is near UTC
    midnight.
    """
    offset_days = lon_east_deg / 360.0
    return math.floor(jd_utc - 0.5 + offset_days) + 0.5 - offset_days


def validate(data: Any) -> list[str]:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    errors = list(jsonschema_min.validate(data, schema))
    errors.extend(semantic_checks(data))
    return errors


def semantic_checks(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return errors
    errors.extend(finite_tree(data))

    time = data.get("time")
    if isinstance(time, dict):
        errors.extend(check_time(time))

    observer = data.get("observer")
    if isinstance(observer, dict):
        for key in (
            "terrestrial_lat_deg",
            "terrestrial_lon_deg_east",
            "polar_motion_corrected_lat_deg",
            "polar_motion_corrected_lon_deg_east",
            "elev_m",
        ):
            if key in observer and not finite(observer[key]):
                errors.append(f"observer.{key} must be finite")

    accuracy = data.get("accuracy")
    if isinstance(accuracy, dict) and isinstance(time, dict):
        eop = time.get("earth_orientation") or {}
        if accuracy.get("eop_status") != eop.get("quality"):
            errors.append("accuracy.eop_status must equal time.earth_orientation.quality")
        if eop.get("quality") == "degraded":
            if "degraded" not in str(accuracy.get("class", "")).lower():
                errors.append("degraded EOP requires a degraded accuracy class")
            warnings = data.get("warnings") or []
            if not any("degraded" in str(item).lower() for item in warnings):
                errors.append("degraded EOP requires an explicit warning")

    bodies = data.get("bodies")
    if isinstance(bodies, list):
        errors.extend(check_bodies(bodies, time, observer))
    return errors


def finite_tree(value: Any, path: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(value, float) and not math.isfinite(value):
        errors.append(f"{path} must be finite")
    elif isinstance(value, dict):
        for key, child in value.items():
            errors.extend(finite_tree(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            errors.extend(finite_tree(child, f"{path}[{index}]"))
    return errors


def check_time(time: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    jd_utc = time.get("jd_utc")
    jd_ut1 = time.get("jd_ut1")
    jd_tt = time.get("jd_tt")
    jd_tai = time.get("jd_tai")
    dut1 = time.get("dut1_seconds")
    delta_t = time.get("delta_t_seconds")
    tai_minus_utc = time.get("tai_minus_utc_seconds")

    if all(finite(value) for value in (jd_utc, jd_ut1, dut1)):
        expected = float(jd_utc) + float(dut1) / SECONDS_PER_DAY
        if not close(float(jd_ut1), expected, 2.0e-9):
            errors.append("time.jd_ut1 must equal jd_utc + dut1_seconds/86400")
    if all(finite(value) for value in (jd_tt, jd_ut1, delta_t)):
        expected = (float(jd_tt) - float(jd_ut1)) * SECONDS_PER_DAY
        if not close(float(delta_t), expected, 5.0e-5):
            errors.append("time.delta_t_seconds must equal (jd_tt - jd_ut1)*86400")
    if jd_tai is None or tai_minus_utc is None:
        if jd_tai is not None or tai_minus_utc is not None:
            errors.append("time.jd_tai and tai_minus_utc_seconds must both be null or both numeric")
    elif all(finite(value) for value in (jd_utc, jd_tai, jd_tt, tai_minus_utc)):
        expected_tai = float(jd_utc) + float(tai_minus_utc) / SECONDS_PER_DAY
        if not close(float(jd_tai), expected_tai, 2.0e-9):
            errors.append("time.jd_tai must equal jd_utc + TAI-UTC")
        expected_tt = float(jd_tai) + 32.184 / SECONDS_PER_DAY
        if not close(float(jd_tt), expected_tt, 2.0e-9):
            errors.append("time.jd_tt must equal jd_tai + 32.184 seconds")

    eop = time.get("earth_orientation")
    if isinstance(eop, dict):
        if eop.get("quality") in {"rapid", "predicted"} and not str(eop.get("source", "")).startswith("IERS Bulletin A"):
            errors.append("precision EOP must identify its IERS Bulletin A source")
        uncertainty = eop.get("dut1_uncertainty_seconds")
        if finite(uncertainty) and float(uncertainty) < 0.0:
            errors.append("EOP uncertainty must be non-negative")
        if finite(dut1) and abs(float(dut1)) > 0.9:
            errors.append("DUT1 must remain within UTC steering bounds")
    return errors


def check_bodies(bodies: list[Any], time: Any, observer: Any) -> list[str]:
    errors: list[str] = []
    names = [body.get("name") for body in bodies if isinstance(body, dict)]
    if len(names) != len(set(names)):
        errors.append("body names must be unique")
    missing = sorted(MAJOR_BODIES - set(names))
    if missing:
        errors.append(f"missing major bodies: {', '.join(missing)}")

    jd_utc = time.get("jd_utc") if isinstance(time, dict) else None
    lon_east = observer.get("terrestrial_lon_deg_east") if isinstance(observer, dict) else None
    day_start = None
    if finite(jd_utc) and finite(lon_east):
        day_start = local_solar_day_start(float(jd_utc), float(lon_east))
    for index, body in enumerate(bodies):
        if not isinstance(body, dict):
            continue
        prefix = f"bodies[{index}]"
        ra = body.get("ra_deg")
        dec = body.get("dec_deg")
        top_ra = body.get("topocentric_apparent_ra_deg")
        top_dec = body.get("topocentric_apparent_dec_deg")
        if all(finite(value) for value in (ra, top_ra)) and not close(float(ra), float(top_ra), 1.0e-10):
            errors.append(f"{prefix}.ra_deg must alias topocentric_apparent_ra_deg")
        if all(finite(value) for value in (dec, top_dec)) and not close(float(dec), float(top_dec), 1.0e-10):
            errors.append(f"{prefix}.dec_deg must alias topocentric_apparent_dec_deg")
        if body.get("above_horizon") != (finite(body.get("alt_refracted_deg")) and float(body["alt_refracted_deg"]) > 0.0):
            errors.append(f"{prefix}.above_horizon disagrees with refracted altitude")
        if body.get("distance_km") is None and body.get("kind") != "star":
            errors.append(f"{prefix}.distance_km may be null only for catalogue stars")
        if body.get("kind") == "star":
            geo_ra = body.get("geocentric_apparent_ra_deg")
            geo_dec = body.get("geocentric_apparent_dec_deg")
            if all(finite(value) for value in (geo_ra, top_ra)) and not close(float(geo_ra), float(top_ra), 1.0e-10):
                errors.append(f"{prefix} infinite-distance star must have equal geocentric/topocentric RA")
            if all(finite(value) for value in (geo_dec, top_dec)) and not close(float(geo_dec), float(top_dec), 1.0e-10):
                errors.append(f"{prefix} infinite-distance star must have equal geocentric/topocentric Dec")
        for event_name in ("rise_jd", "transit_jd", "set_jd"):
            event = body.get(event_name)
            if event is not None and finite(event) and day_start is not None:
                tolerance = 2.0e-7
                if not day_start - tolerance <= float(event) <= day_start + 1.0 + tolerance:
                    errors.append(
                        f"{prefix}.{event_name} lies outside the observer local mean-solar day"
                    )

    moon = next((body for body in bodies if isinstance(body, dict) and body.get("name") == "Moon"), None)
    if moon:
        separation = abs(float(moon["topocentric_apparent_ra_deg"]) - float(moon["geocentric_apparent_ra_deg"]))
        separation += abs(float(moon["topocentric_apparent_dec_deg"]) - float(moon["geocentric_apparent_dec_deg"]))
        if separation <= 1.0e-6:
            errors.append("Moon topocentric coordinates must not be geocentric aliases")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    args = parser.parse_args()
    path = Path(args.snapshot)
    try:
        data = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
        errors = validate(data)
    except Exception as exc:  # noqa: BLE001
        errors = [f"{path}: {exc}"]
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {path} is ephemeris-snapshot.v2")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
