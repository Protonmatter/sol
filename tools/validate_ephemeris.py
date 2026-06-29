#!/usr/bin/env python3
"""Validate the solar-ephemeris engine against JPL Horizons (DE441).

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
import urllib.parse
import urllib.request
from pathlib import Path

# (label, UTC, lat_deg, lon_deg_east, elev_m)
CASES = [
    ("Boston", dt.datetime(2026, 6, 29, 16, 0, tzinfo=dt.timezone.utc), 42.36, -71.06, 0.0),
    ("Sydney", dt.datetime(2026, 1, 15, 9, 0, tzinfo=dt.timezone.utc), -33.87, 151.21, 20.0),
]
# Horizons COMMAND ids (planet centres use the "99" suffix).
BODIES = {
    "Sun": "10", "Moon": "301", "Mercury": "199", "Venus": "299", "Mars": "499",
    "Jupiter": "599", "Saturn": "699", "Uranus": "799", "Neptune": "899",
}
TOL_ALT_DEG = 0.006  # ~22" — Sun+planets VSOP2013, Moon ELP-MPP02, proper ecliptic precession.
TOL_AZ_DEG = 0.009   # ~32" (azimuth amplifies near the zenith / for the close Moon)
LOOSE = {}


def find_binary(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit)
    for rel in ("target/release/sky.exe", "target/release/sky", "target/debug/sky.exe", "target/debug/sky"):
        p = Path(rel)
        if p.is_file():
            return p
    sys.exit("sky binary not found; run: cargo build --release -p solar-ephemeris --bin sky")


def engine_altaz(binary: Path, when: dt.datetime, lat: float, lon: float, elev: float) -> dict:
    unix = when.timestamp()
    out = subprocess.run([str(binary), str(unix), str(lat), str(lon), str(elev)],
                         capture_output=True, text=True, check=True).stdout
    snap = json.loads(out)
    return {b["name"]: b for b in snap["bodies"]}


def horizons_altaz(command: str, when: dt.datetime, lat: float, lon: float, elev_m: float) -> tuple[float, float]:
    lon_east = lon % 360.0
    params = {
        "format": "text", "COMMAND": f"'{command}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@399'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_east},{lat},{elev_m / 1000.0}'",
        "START_TIME": "'" + when.strftime("%Y-%m-%d %H:%M") + "'",
        "STOP_TIME": "'" + (when + dt.timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M") + "'",
        "STEP_SIZE": "'1'", "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "APPARENT": "'AIRLESS'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    text = urllib.request.urlopen(url, timeout=40).read().decode()
    block = text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()[0]
    floats = re.findall(r"[-+]?\d+\.\d+", block)
    az, el = float(floats[-2]), float(floats[-1])
    return az, el


def az_diff(a: float, b: float) -> float:
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", help="path to the sky CLI")
    args = parser.parse_args()
    binary = find_binary(args.binary)

    worst = 0.0
    failures = []
    print(f"{'case':<14}{'body':<6}{'d_alt(arcsec)':>14}{'d_az(arcsec)':>14}")
    for label, when, lat, lon, elev in CASES:
        eng = engine_altaz(binary, when, lat, lon, elev)
        for name, cmd in BODIES.items():
            h_az, h_el = horizons_altaz(cmd, when, lat, lon, elev)
            b = eng[name]
            d_alt = abs(b["alt_deg"] - h_el)
            d_az = az_diff(b["az_deg"], h_az)
            worst = max(worst, d_alt, d_az)
            print(f"{label:<10}{name:<9}{d_alt * 3600:>14.1f}{d_az * 3600:>14.1f}")
            tol_alt, tol_az = LOOSE.get(name, (TOL_ALT_DEG, TOL_AZ_DEG))
            if d_alt > tol_alt or d_az > tol_az:
                failures.append(f"{label}/{name}: d_alt={d_alt * 3600:.0f}arcsec d_az={d_az * 3600:.0f}arcsec")

    print(f"\nworst error: {worst * 3600:.1f} arcsec  (tol: alt {TOL_ALT_DEG * 3600:.0f}arcsec, az {TOL_AZ_DEG * 3600:.0f}arcsec)")
    if failures:
        for f in failures:
            print("FAIL:", f, file=sys.stderr)
        return 1
    print("OK: engine matches JPL Horizons within tolerance")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
