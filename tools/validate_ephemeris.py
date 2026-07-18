#!/usr/bin/env python3
"""Validate ephemeris-snapshot.v2 against JPL Horizons observer quantities 2, 4, and 49.

Runs the `sky` CLI (apparent topocentric alt/az from the engine) and compares to
Horizons' airless Az/El for the same instant + site. This is the "grounded in
facts" gate from docs/SOLAR_SYSTEM_SPEC.md. Needs network for Horizons; the
deterministic Meeus unit tests gate CI offline.

Build the CLI first:  cargo build --release -p solar-ephemeris --bin sky
Run:                   python tools/validate_ephemeris.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# (label, UTC, lat_deg, lon_deg_east, elev_m) — spread over season, hemisphere, and latitude
# (equatorial → sub-arctic) so the gate characterises an envelope, not one geometry.
CASES = [
    ("Boston", dt.datetime(2026, 7, 1, 2, 13, 47, tzinfo=dt.timezone.utc), 42.36, -71.06, 10.0),
    ("Sydney", dt.datetime(2026, 7, 1, 8, 31, 19, tzinfo=dt.timezone.utc), -33.87, 151.21, 20.0),
    ("Reykjavik", dt.datetime(2026, 7, 1, 14, 44, 3, tzinfo=dt.timezone.utc), 64.13, -21.90, 25.0),
    ("Nairobi", dt.datetime(2026, 7, 1, 20, 57, 41, tzinfo=dt.timezone.utc), -1.29, 36.82, 1660.0),
]
# Horizons COMMAND ids (planet centres use the "99" suffix).
BODIES = {
    "Sun": "10", "Moon": "301", "Mercury": "199", "Venus": "299", "Mars": "499",
    "Jupiter": "599", "Saturn": "699", "Uranus": "799", "Neptune": "899",
}
# The headline gate is the great-circle POINTING error (`sep`), which — unlike raw d_az —
# does not blow up near the zenith/nadir. d_alt is also gated; d_az is reported for context.
DEFAULT_TOL_ARCSEC = 30.0
MOON_TOL_ARCSEC = 60.0
DUT1_TOL_SECONDS = 0.003


def find_binary(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    for rel in ("target/release/sky.exe", "target/release/sky", "target/debug/sky.exe", "target/debug/sky"):
        p = Path(rel)
        if p.is_file():
            return p
    sys.exit("sky binary not found; run: cargo build --release -p solar-ephemeris --bin sky")


def engine_snapshot(binary: Path, when: dt.datetime, lat: float, lon: float, elev: float) -> dict:
    out = subprocess.run(
        [str(binary), str(when.timestamp()), str(lat), str(lon), str(elev)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    snapshot = json.loads(out)
    if snapshot.get("schema_version") != "ephemeris-snapshot.v2":
        raise RuntimeError("engine did not emit ephemeris-snapshot.v2")
    return snapshot


def horizons_observation(command: str, when: dt.datetime, lat: float, lon: float, elev_m: float) -> dict:
    jd_utc = when.timestamp() / 86400.0 + 2440587.5
    params = {
        "format": "text", "COMMAND": f"'{command}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@399'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon % 360.0},{lat},{elev_m / 1000.0}'",
        "TLIST": f"'{jd_utc:.12f}'", "TLIST_TYPE": "'JD'", "TIME_TYPE": "'UT'",
        "TIME_DIGITS": "'FRACSEC'", "QUANTITIES": "'2,4,49'", "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'", "EXTRA_PREC": "'YES'", "CSV_FORMAT": "'YES'", "ELEV_CUT": "'-90'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    payload = fetch_with_retry(url)
    if "$$SOE" not in payload or "$$EOE" not in payload:
        raise RuntimeError(f"Horizons response lacks ephemeris block: {payload[:500]}")
    line = payload.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip().splitlines()[0]
    values = [float(value) for value in re.findall(r"[-+]?\d+(?:\.\d+)(?:[Ee][-+]?\d+)?", line)]
    if len(values) < 5:
        raise RuntimeError(f"could not parse Horizons quantities 2,4,49: {line}")
    ra, dec, az, el, dut1 = values[-5:]
    return {"ra_deg": ra, "dec_deg": dec, "az_deg": az, "el_deg": el, "dut1_seconds": dut1}


def fetch_with_retry(url: str, attempts: int = 4) -> str:
    """Horizons rate-limits bursts (429/503). This gate fires 36 serial queries; the old
    single-attempt fetch flaked red on rate-limit days — the same failure mode
    services/ephemeris-server already handles. Also paces requests slightly."""
    import time

    last: Exception | None = None
    for attempt in range(attempts):
        try:
            text = urllib.request.urlopen(url, timeout=40).read().decode()
            time.sleep(0.3)  # be gentle between the serial queries
            return text
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code not in (429, 503):
                raise
        except urllib.error.URLError as exc:  # transient network — the most retryable class
            last = exc
        time.sleep(1.2 * (attempt + 1))
    raise last if last is not None else RuntimeError(f"fetch failed: {url}")


def az_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def angular_sep(alt1: float, az1: float, alt2: float, az2: float) -> float:
    """Great-circle separation (deg) between two horizontal directions — the true pointing
    error, which (unlike raw d_az) stays finite near the zenith/nadir."""
    import math
    a1, a2 = math.radians(alt1), math.radians(alt2)
    daz = math.radians(az_diff(az1, az2))
    c = math.sin(a1) * math.sin(a2) + math.cos(a1) * math.cos(a2) * math.cos(daz)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", help="path to the sky CLI")
    parser.add_argument("--report", help="write machine-readable validation evidence")
    args = parser.parse_args()
    binary = find_binary(args.binary)

    records = []
    failures = []
    print(f"{'case':<11}{'body':<9}{'radec(arcsec)':>15}{'altaz(arcsec)':>15}{'d_alt(arcsec)':>15}{'d_dut1(ms)':>13}")
    for label, when, lat, lon, elev in CASES:
        snapshot = engine_snapshot(binary, when, lat, lon, elev)
        bodies = {body["name"]: body for body in snapshot["bodies"]}
        engine_dut1 = float(snapshot["time"]["dut1_seconds"])
        for name, command in BODIES.items():
            reference = horizons_observation(command, when, lat, lon, elev)
            body = bodies[name]
            radec = angular_sep(
                body["topocentric_apparent_dec_deg"],
                body["topocentric_apparent_ra_deg"],
                reference["dec_deg"],
                reference["ra_deg"],
            )
            altaz = angular_sep(body["alt_deg"], body["az_deg"], reference["el_deg"], reference["az_deg"])
            d_alt = abs(body["alt_deg"] - reference["el_deg"])
            d_dut1 = abs(engine_dut1 - reference["dut1_seconds"])
            tolerance = MOON_TOL_ARCSEC if name == "Moon" else DEFAULT_TOL_ARCSEC
            passed = (
                radec * 3600.0 <= tolerance
                and altaz * 3600.0 <= tolerance
                and d_alt * 3600.0 <= tolerance
                and d_dut1 <= DUT1_TOL_SECONDS
            )
            record = {
                "case": label,
                "utc": when.isoformat(),
                "body": name,
                "radec_error_arcsec": radec * 3600.0,
                "altaz_error_arcsec": altaz * 3600.0,
                "altitude_error_arcsec": d_alt * 3600.0,
                "dut1_error_seconds": d_dut1,
                "tolerance_arcsec": tolerance,
                "passed": passed,
            }
            records.append(record)
            print(
                f"{label:<11}{name:<9}{record['radec_error_arcsec']:>15.2f}"
                f"{record['altaz_error_arcsec']:>15.2f}{record['altitude_error_arcsec']:>15.2f}"
                f"{record['dut1_error_seconds'] * 1000.0:>13.3f}"
            )
            if not passed:
                failures.append(
                    f"{label}/{name}: RADEC={record['radec_error_arcsec']:.2f} arcsec "
                    f"ALTAZ={record['altaz_error_arcsec']:.2f} arcsec DUT1={d_dut1:.6f} s"
                )

    report = {
        "schema_version": "ephemeris-validation-report.v2",
        "reference": "JPL Horizons observer quantities 2,4,49; airless; exact UT TLIST",
        "matrix_size": len(records),
        "thresholds": {
            "default_arcsec": DEFAULT_TOL_ARCSEC,
            "moon_arcsec": MOON_TOL_ARCSEC,
            "dut1_seconds": DUT1_TOL_SECONDS,
        },
        "maxima": {
            "radec_error_arcsec": max(row["radec_error_arcsec"] for row in records),
            "altaz_error_arcsec": max(row["altaz_error_arcsec"] for row in records),
            "altitude_error_arcsec": max(row["altitude_error_arcsec"] for row in records),
            "dut1_error_seconds": max(row["dut1_error_seconds"] for row in records),
        },
        "passed": not failures,
        "records": records,
    }
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if failures:
        for failure in failures:
            print("FAIL:", failure, file=sys.stderr)
        return 1
    print("OK: topocentric RA/Dec, alt/az, and DUT1 satisfy the Horizons matrix")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
