#!/usr/bin/env python3
"""Live ephemeris v3 validation; --historical-v2 explicitly validates frozen copies."""
from __future__ import annotations
import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any
import jsonschema_min
from validate_ephemeris_snapshot_v2 import (
    finite, finite_tree, check_time, local_solar_day_start, MAJOR_BODIES,
)
ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "docs/ephemeris-snapshot-v3.schema.json"
COMPASS_POINTS = (
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
)

def reject_constant(value: str) -> None:
    raise ValueError(f"non-JSON numeric constant {value}")

def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key}")
        result[key] = value
    return result

def parse_snapshot(text: str) -> Any:
    return json.loads(text, parse_constant=reject_constant, object_pairs_hook=unique_object)

def validate(data: Any) -> list[str]:
    errors = list(jsonschema_min.validate(data, json.loads(SCHEMA.read_text(encoding="utf-8"))))
    if errors:
        return errors
    return semantic_checks(data)

def semantic_checks(data: dict[str, Any]) -> list[str]:
    errors = list(check_time(data["time"]))
    time, observer = data["time"], data["observer"]
    if not 1721425.5 <= time["jd_utc"] < 5373484.5:
        errors.append("unsupported proleptic Gregorian epoch")
    start = local_solar_day_start(time["jd_utc"], observer["terrestrial_lon_deg_east"])
    window = data["events_window"]
    if window["start_jd"] != start or window["end_jd"] != start + 1:
        errors.append("events_window differs from observer local mean-solar day")
    if (time["input_time_semantics"] == "historical_ut1_proxy") != (time["jd_tai"] is None):
        errors.append("time input semantics disagree with historical approximation")
    if time["input_time_semantics"] == "historical_ut1_proxy" and time["earth_orientation"]["quality"] != "pre_utc_ut1_proxy":
        errors.append("historical time requires degraded UT1-proxy quality")
    accuracy = data["accuracy"]
    if accuracy["eop_status"] != time["earth_orientation"]["quality"]:
        errors.append("accuracy.eop_status must match time EOP quality")
    if (accuracy["evidence_status"] == "unvalidated") != (len(accuracy["evidence_record_ids"]) == 0):
        errors.append("accuracy evidence status disagrees with evidence records")
    # Current immutable registry has only heliocentric source-theory parity,
    # not independent apparent-place/range/event evidence qualifying this feed.
    if accuracy["evidence_status"] != "unvalidated":
        errors.append("no registered independent evidence qualifies this snapshot")
    names = [body["name"] for body in data["bodies"]]
    if len(names) != len(set(names)) or MAJOR_BODIES - set(names):
        errors.append("body names must be unique and include all major bodies")
    for body in data["bodies"]:
        name = body["name"]
        # Same sixteen clockwise sectors as both producers, based on serialized azimuth.
        expected_compass = COMPASS_POINTS[int(((body["az_deg"] + 11.25) % 360.0) / 22.5)]
        if body["compass"] != expected_compass:
            errors.append(f"{name}.compass must agree with az_deg")
        for alias, explicit in [("ra_deg", "topocentric_apparent_ra_deg"), ("dec_deg", "topocentric_apparent_dec_deg")]:
            if abs(body[alias] - body[explicit]) > 1e-9:
                errors.append(f"{name}.{alias} must alias {explicit}")
        geo, obs = body["geocentric_range_km"], body["observer_range_km"]
        infinite = body["range_approximation"] == "infinite_catalogue_star"
        if infinite:
            if name in MAJOR_BODIES or body["kind"] != "star" or geo is not None or obs is not None:
                errors.append(f"{name} invalid infinite catalogue-star ranges")
            for quantity in ["ra", "dec"]:
                if body[f"geocentric_apparent_{quantity}_deg"] != body[f"topocentric_apparent_{quantity}_deg"]:
                    errors.append(f"{name} infinite star has parallax")
        elif geo is None or obs is None:
            errors.append(f"{name} finite ranges cannot be null")
        if body["above_horizon"] != (body["alt_refracted_deg"] > 0):
            errors.append(f"{name}.above_horizon must use refracted altitude")
        for key, event in body["events"].items():
            jd, calculation, occurrence = event["jd"], event["calculation_status"], event["occurrence_status"]
            if jd is not None:
                if calculation != "calculated" or occurrence != "occurs" or not start <= jd < start + 1:
                    errors.append(f"{name}.{key} invalid calculated event or window")
            elif calculation == "calculated":
                if occurrence != "none_in_window":
                    errors.append(f"{name}.{key} calculated null must mean none_in_window")
            elif occurrence != "unknown":
                errors.append(f"{name}.{key} unavailable calculation must mean unknown")
        transit = body["events"]["transit"]
        if (transit["jd"] is None) != (transit["altitude_deg"] is None):
            errors.append(f"{name}.transit time and altitude must both be null or both numeric")
        if name == "Moon" and abs(body["geocentric_apparent_ra_deg"]-body["ra_deg"]) + abs(body["geocentric_apparent_dec_deg"]-body["dec_deg"]) <= 1e-6:
            errors.append("Moon topocentric coordinates must not be geocentric aliases")
    return errors

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    parser.add_argument("--historical-v2", action="store_true", help="Validate an unchanged archived v2 copy, never a live feed")
    args = parser.parse_args()
    try:
        data = parse_snapshot(Path(args.snapshot).read_text(encoding="utf-8"))
        if args.historical_v2:
            from validate_ephemeris_snapshot_v2 import validate as historical_validate
            errors = historical_validate(data)
        else:
            errors = validate(data)
    except Exception as exc:
        errors = [str(exc)]
    if errors:
        for error in errors: print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"OK: {args.snapshot} ({'historical v2' if args.historical_v2 else 'live v3'})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
