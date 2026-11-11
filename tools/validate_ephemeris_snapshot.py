#!/usr/bin/env python3
"""Live ephemeris v4 validation; --historical-v3/--historical-v2 validate frozen copies."""
from __future__ import annotations
import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any
import jsonschema_min
from validate_ephemeris_snapshot_v2 import (
    finite, finite_tree, SECONDS_PER_DAY, local_solar_day_start, MAJOR_BODIES,
)
ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "docs/ephemeris-snapshot-v4.schema.json"
# The published v3 contract, kept unchanged for archived snapshots. v4 added fields.
HISTORICAL_V3_SCHEMA = ROOT / "docs/ephemeris-snapshot-v3.schema.json"
COMPASS_POINTS = (
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
)
# Direction coherence, not an accuracy claim: allow the standalone provider's
# disclosed mean/apparent sidereal and degraded EOP difference (one arcminute).
# Unit-vector distance is conditioned at zenith/nadir and azimuth wraparound.
HORIZONTAL_CHORD_LIMIT = 2 * math.sin(math.pi / (180 * 60 * 2)) + 1e-12


def horizontal_direction_agrees(body: dict, time: dict, observer: dict) -> bool:
    hour = math.radians(time["lst_deg"] - body["topocentric_apparent_ra_deg"])
    dec = math.radians(body["topocentric_apparent_dec_deg"])
    lat = math.radians(observer["polar_motion_corrected_lat_deg"])
    alt, az = math.radians(body["alt_deg"]), math.radians(body["az_deg"])
    equatorial = (-math.cos(dec) * math.sin(hour),
                  math.sin(dec) * math.cos(lat) - math.cos(dec) * math.cos(hour) * math.sin(lat),
                  math.sin(dec) * math.sin(lat) + math.cos(dec) * math.cos(hour) * math.cos(lat))
    horizontal = (math.cos(alt) * math.sin(az), math.cos(alt) * math.cos(az), math.sin(alt))
    return math.dist(equatorial, horizontal) <= HORIZONTAL_CHORD_LIMIT

def reject_constant(value: str) -> None:
    raise ValueError(f"non-JSON numeric constant {value}")


def delta_t_consistent(time: dict[str, Any]) -> bool:
    delta_t = float(time['delta_t_seconds'])
    expected_jd = (float(time['jd_tt']) - float(time['jd_ut1'])) * SECONDS_PER_DAY
    if abs(delta_t - expected_jd) <= 5e-5:
        return True
    offset, dut1 = time.get('tai_minus_utc_seconds'), time.get('dut1_seconds')
    if not all(finite(value) for value in (offset, dut1)):
        return False
    # Keep the legacy JD path and its 50us allowance. Accurate atomic offsets
    # avoid large-JD construction quantization. Two 9dp fields add at most1ns;
    # scalar floating-point parsing/arithmetic adds the bounded epsilon term.
    scale = max(32.184, abs(delta_t), abs(float(offset)), abs(float(dut1)))
    tolerance = 1e-9 + 16 * sys.float_info.epsilon * scale
    if tolerance > 5e-5:
        return False
    return abs(delta_t - (float(offset) + 32.184 - float(dut1))) <= tolerance


def check_time(time: dict[str, Any]) -> list[str]:
    """Live v4 clock policy (also applied to archived v3); historical v2 remains frozen."""
    errors = []
    jd_utc, jd_ut1, jd_tt, jd_tai = (time.get(key) for key in ('jd_utc', 'jd_ut1', 'jd_tt', 'jd_tai'))
    dut1, delta_t, offset = (time.get(key) for key in ('dut1_seconds', 'delta_t_seconds', 'tai_minus_utc_seconds'))
    if all(finite(value) for value in (jd_utc, jd_ut1, dut1)):
        if abs(float(jd_ut1) - float(jd_utc) - float(dut1) / SECONDS_PER_DAY) > 2e-9:
            errors.append('time.jd_ut1 must equal jd_utc + dut1_seconds/86400')
    if all(finite(value) for value in (jd_tt, jd_ut1, delta_t)) and not delta_t_consistent(time):
        errors.append('time.delta_t_seconds must agree with rounded Julian dates or atomic offsets')
    if jd_tai is None or offset is None:
        if jd_tai is not None or offset is not None:
            errors.append('time.jd_tai and tai_minus_utc_seconds must both be null or both numeric')
    elif all(finite(value) for value in (jd_utc, jd_tai, jd_tt, offset)):
        if abs(float(jd_tai) - float(jd_utc) - float(offset) / SECONDS_PER_DAY) > 2e-9:
            errors.append('time.jd_tai must equal jd_utc + TAI-UTC')
        if abs(float(jd_tt) - float(jd_tai) - 32.184 / SECONDS_PER_DAY) > 2e-9:
            errors.append('time.jd_tt must equal jd_tai + 32.184 seconds')
    eop = time.get('earth_orientation')
    if isinstance(eop, dict):
        if eop.get('quality') in {'rapid', 'predicted'} and not str(eop.get('source', '')).startswith('IERS Bulletin A'):
            errors.append('precision EOP must identify its IERS Bulletin A source')
        uncertainty = eop.get('dut1_uncertainty_seconds')
        if finite(uncertainty) and float(uncertainty) < 0:
            errors.append('EOP uncertainty must be non-negative')
        future = time.get('input_time_semantics') == 'future_nominal_utc'
        if future != (eop.get('quality') == 'modeled_future'):
            errors.append('future nominal UTC requires modeled-future quality')
        if (uncertainty is None) != future:
            errors.append('only the future model has unknown uncertainty')
        if not future and finite(dut1) and abs(float(dut1)) > .9:
            errors.append('DUT1 must remain within UTC steering bounds')
    return errors

def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key}")
        result[key] = value
    return result

def parse_snapshot(text: str) -> Any:
    return json.loads(text, parse_constant=reject_constant, object_pairs_hook=unique_object)

def validate(data: Any, schema: Path = SCHEMA) -> list[str]:
    errors = list(jsonschema_min.validate(data, json.loads(schema.read_text(encoding="utf-8"))))
    if errors:
        return errors
    return semantic_checks(data)


def validate_historical_v3(data: Any) -> list[str]:
    """Archived v3 copies only; live readers accept v4."""
    return validate(data, HISTORICAL_V3_SCHEMA)

def semantic_checks(data: dict[str, Any]) -> list[str]:
    errors = list(check_time(data["time"]))
    time, observer = data["time"], data["observer"]
    if not 1721425.5 <= time["jd_utc"] < 5373484.5:
        errors.append("unsupported proleptic Gregorian epoch")
    start = local_solar_day_start(time["jd_utc"], observer["terrestrial_lon_deg_east"])
    window = data["events_window"]
    if window["start_jd"] != start or window["end_jd"] != start + 1:
        errors.append("events_window differs from observer local mean-solar day")
    future_boundary = window.get('future_nominal_utc_after_jd')
    if future_boundary is not None and not 1721425.5 <= future_boundary < window['end_jd'] + 1 / 144:
        errors.append('events_window future model boundary must intersect event calculation support')
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
        if not horizontal_direction_agrees(body, time, observer):
            errors.append(f"{name} horizontal direction disagrees with equatorial position and observer/time")
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
    historical = parser.add_mutually_exclusive_group()
    historical.add_argument("--historical-v2", action="store_true", help="Validate an unchanged archived v2 copy, never a live feed")
    historical.add_argument("--historical-v3", action="store_true", help="Validate an unchanged archived v3 copy, never a live feed")
    args = parser.parse_args()
    try:
        data = parse_snapshot(Path(args.snapshot).read_text(encoding="utf-8"))
        if args.historical_v2:
            from validate_ephemeris_snapshot_v2 import validate as historical_validate
            errors = historical_validate(data)
        elif args.historical_v3:
            errors = validate_historical_v3(data)
        else:
            errors = validate(data)
    except Exception as exc:
        errors = [str(exc)]
    if errors:
        for error in errors: print(f"ERROR: {error}", file=sys.stderr)
        return 1
    kind = 'historical v2' if args.historical_v2 else 'historical v3' if args.historical_v3 else 'live v4'
    print(f"OK: {args.snapshot} ({kind})")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
