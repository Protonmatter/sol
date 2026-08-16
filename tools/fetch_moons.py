#!/usr/bin/env python3
"""Refresh the committed multi-epoch moon sources from NASA/JPL Horizons.

This is the only networked step in the moon pipeline and is never run by CI.
`generate_moons.py` compiles these sources offline; `validate_moons.py` tests
interpolated positions against Horizons vectors at times deliberately offset
halfway between the element knots.

Usage:  python tools/fetch_moons.py [--check]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "ephemeris-data" / "moons"

PHYS_URL = "https://ssd.jpl.nasa.gov/sats/phys_par/"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"

# The model spans two years. Elements are sampled every seven days; Mimas and
# Enceladus use 3.5-day knots because their rapid radial perturbations otherwise
# dominate the global error. Validation vectors are shifted by half a knot, so
# none of them can be reproduced by simply returning a training row.
MODEL_START = "2021-01-01"
MODEL_STOP = "2031-01-01"
DEFAULT_STEP = "7 d"
DEFAULT_CHECK_START = "2021-01-04 12:00"
DEFAULT_CHECK_STOP = "2030-12-28 12:00"
FINE_STEP = "84 h"
FINE_CHECK_START = "2021-01-02 18:00"
FINE_CHECK_STOP = "2030-12-30 18:00"
FINE_MOONS = {"Mimas", "Enceladus"}

MIN_RADIUS_KM = 150.0
ALWAYS = {"Phobos", "Deimos"}
EXCLUDE_PLANETS = {"Earth", "Pluto"}
PLANET_CENTER = {
    "Mars": "500@499",
    "Jupiter": "500@599",
    "Saturn": "500@699",
    "Uranus": "500@799",
    "Neptune": "500@899",
}

PHYS_COLS = [
    "Planet", "Satellite", "Code", "GM_km3_s2",
    "mean_radius_km", "mean_density_g_cm3",
]
ELEM_COLS = [
    "Planet", "Satellite", "Code", "jd_tdb", "a_km", "e", "i_deg",
    "node_deg", "argp_deg", "M_deg", "n_deg_per_day",
]
VEC_COLS = ["Satellite", "Code", "jd_tdb", "x_km", "y_km", "z_km"]


def get(url: str, params: dict[str, str] | None = None) -> str:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (Sol moon fetcher)"}
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read().decode("utf-8", "replace")


def horizons(
    code: str,
    center: str,
    ephem_type: str,
    start: str,
    stop: str,
    step: str,
) -> str:
    document = get(HORIZONS, {
        "format": "text",
        "COMMAND": f"'{code}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": f"'{ephem_type}'",
        "CENTER": f"'{center}'",
        "REF_PLANE": "'ECLIPTIC'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
        "OUT_UNITS": "'KM-S'",
        "VEC_TABLE": "'1'",
    })
    body = re.search(r"\$\$SOE(.*?)\$\$EOE", document, re.S)
    if not body:
        raise SystemExit(f"Horizons returned no ephemeris for {code}:\n{document[:400]}")
    return body.group(1)


def phys_table() -> dict[str, list[str]]:
    document = get(PHYS_URL)
    out: dict[str, list[str]] = {}
    for table_row in re.findall(r"<tr[^>]*>(.*?)</tr>", document, re.S):
        cells = []
        for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", table_row, re.S):
            parts = html.unescape(re.sub(r"<[^>]+>", " ", cell)).replace("\xa0", " ").split()
            cells.append(parts[0] if parts else "")
        if len(cells) >= 6 and cells[2].isdigit():
            out[cells[2]] = cells[:6]
    if not out:
        raise SystemExit("could not parse the satellite physical-parameters table")
    return out


def parse_elements(block: str, planet: str, name: str, code: str) -> list[list[str]]:
    records: list[list[str]] = []
    starts = list(re.finditer(r"^\s*([\d.]+) = A\.D\.", block, re.M))
    for index, match in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(block)
        chunk = block[match.start():end]
        values = {
            key: float(value)
            for key, value in re.findall(
                r"(?<![A-Za-z])([A-Z]{1,2})\s*=\s*(-?[\d.]+E?[-+]?\d*)",
                chunk,
            )
        }
        for key in ("A", "EC", "IN", "OM", "W", "MA", "N"):
            if key not in values:
                raise SystemExit(f"{name}: Horizons element record missing {key}")
        records.append([
            planet, name, code, f"{float(match.group(1)):.6f}",
            f"{values['A']:.6f}", f"{values['EC']:.12f}",
            f"{values['IN']:.9f}", f"{values['OM']:.9f}",
            f"{values['W']:.9f}", f"{values['MA']:.9f}",
            f"{values['N'] * 86400:.12f}",
        ])
    if not records:
        raise SystemExit(f"{name}: no Horizons element records parsed")
    return records


def parse_vectors(block: str, name: str, code: str) -> list[list[str]]:
    pattern = re.compile(
        r"^\s*([\d.]+) = A\.D\.[^\n]*\n"
        r"\s*X =\s*(-?[\d.E+]+)\s*Y =\s*(-?[\d.E+]+)\s*Z =\s*(-?[\d.E+]+)",
        re.M,
    )
    rows = [
        [
            name, code, f"{float(match.group(1)):.6f}",
            f"{float(match.group(2)):.6f}",
            f"{float(match.group(3)):.6f}",
            f"{float(match.group(4)):.6f}",
        ]
        for match in pattern.finditer(block)
    ]
    if not rows:
        raise SystemExit(f"{name}: no Horizons vector records parsed")
    return rows


def to_csv(header: list[str], rows: list[list[str]]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def build() -> dict[str, bytes]:
    physical = phys_table()
    chosen: list[tuple[str, list[str]]] = []
    for code, row in physical.items():
        planet, name = row[0], row[1]
        if planet in EXCLUDE_PLANETS or planet not in PLANET_CENTER:
            continue
        try:
            radius = float(row[4])
        except ValueError:
            continue
        if radius >= MIN_RADIUS_KM or name in ALWAYS:
            chosen.append((code, row))
    chosen.sort(key=lambda item: int(item[0]))

    element_rows: list[list[str]] = []
    vector_rows: list[list[str]] = []
    for code, row in chosen:
        planet, name = row[0], row[1]
        center = PLANET_CENTER[planet]
        step = FINE_STEP if name in FINE_MOONS else DEFAULT_STEP
        check_start = FINE_CHECK_START if name in FINE_MOONS else DEFAULT_CHECK_START
        check_stop = FINE_CHECK_STOP if name in FINE_MOONS else DEFAULT_CHECK_STOP
        print(f"  {name:10s} elements {step}, held-out vectors {step}")
        element_rows.extend(parse_elements(
            horizons(code, center, "ELEMENTS", MODEL_START, MODEL_STOP, step),
            planet,
            name,
            code,
        ))
        vector_rows.extend(parse_vectors(
            horizons(code, center, "VECTORS", check_start, check_stop, step),
            name,
            code,
        ))
        time.sleep(0.2)

    return {
        "jpl_satellite_physical.csv": to_csv(PHYS_COLS, [row for _, row in chosen]),
        "horizons_satellite_elements.csv": to_csv(ELEM_COLS, element_rows),
        "horizons_satellite_vectors.csv": to_csv(VEC_COLS, vector_rows),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if committed sources differ")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    payloads = build()
    drift = False
    for name, data in payloads.items():
        destination = OUT / name
        if args.check:
            if (destination.read_bytes() if destination.exists() else b"") != data:
                print(f"DRIFT: {name} differs from upstream")
                drift = True
        else:
            destination.write_bytes(data)
        print(f"  {name}: {len(data)} bytes  sha256 {hashlib.sha256(data).hexdigest()}")
    if args.check and drift:
        return 1
    print("OK" if args.check else f"wrote {len(payloads)} files to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
