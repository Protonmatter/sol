#!/usr/bin/env python3
"""Refresh the pristine geography sources in tools/ephemeris-data/geography/ — needs network.

This is the ONLY networked step in the geography pipeline, and it is not run by CI. It writes
the committed source files; `tools/generate_geography.py` then derives the shipped module from
them offline and deterministically, exactly like the star catalogue.

Sources:
  • Natural Earth 1:110m physical vectors (land, lakes, glaciated areas) — public domain,
    written byte-verbatim from the natural-earth-vector repository.
  • IAU/USGS Gazetteer of Planetary Nomenclature — the authoritative register of named
    planetary surface features. Its search page emits the full table for a target; we keep a
    small ROW+FIELD SUBSET as CSV, because the raw pages are ~24 MB of HTML each.

Why a subset is still honest provenance: the extraction rule is mechanical and recorded here
(feature types + a diameter floor, approved features only), the fields kept are copied
verbatim, and `--check` re-derives and compares, so drift is detectable.

Usage:  python tools/fetch_geography.py [--check]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "ephemeris-data" / "geography"

NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
NE_FILES = ["ne_110m_land.geojson", "ne_110m_lakes.geojson", "ne_110m_glaciated_areas.geojson"]

GAZ = "https://planetarynames.wr.usgs.gov/SearchResults?Target={code}"

# Which named features we can honestly paint, per body.
#
# ONLY the Moon qualifies, and the bar it clears is worth stating because two plausible-looking
# alternatives fail it.
#
# The Moon passes because its type names identify the ROCK. Mare, oceanus, lacus, sinus and
# palus are all flood-basalt units; basalt is dark and the surrounding highland anorthosite is
# bright. Saying "the maria are the dark parts" is a definition, not an inference.
#
# Mars and Mercury FAIL, and are deliberately absent:
#   • The gazetteer's own "Albedo Feature" type — the classical telescopic markings — is stored
#     as bare points: diameter 0.00 with all four bounding-box values equal to the centre. It
#     records where a marking is named, not how big it is, so painting it means inventing every
#     extent.
#   • The mapped geological units DO carry real extents, but their type does not predict albedo.
#     A "lowlands are dark" rule gets Acidalia and Utopia Planitia right and Hellas, Amazonis,
#     Elysium and Arcadia Planitia backwards — Hellas is one of the brightest features on the
#     planet. That is a coin flip wearing the costume of a model, so Mars and Mercury keep the
#     procedural shader and this pipeline stays quiet about them.
#
# Real photographic maps for every body remain available via tools/fetch_textures.py, and the
# renderer prefers them over anything generated here whenever they are present.
SELECT = {
    "16_Moon": {
        "types": {"Mare, maria", "Oceanus, oceani", "Lacus, lacūs", "Sinus, sinūs", "Palus, paludes"},
        "min_diameter_km": 0.0,
        "extra_types": set(),
        "extra_min_diameter_km": 0.0,
    },
}

# Column indices in the gazetteer's results table (verified against its header row).
C_ID, C_NAME, C_TARGET, C_DIAM = 0, 1, 3, 4
C_LAT, C_LON = 5, 6
C_NORTH, C_SOUTH, C_EAST, C_WEST = 7, 8, 9, 10
C_COORDSYS, C_TYPE, C_APPROVAL = 11, 14, 17

CSV_NAME = "iau_surface_features.csv"
CSV_HEADER = ["target", "name", "feature_type", "diameter_km", "center_lat_deg", "center_lon_deg",
              "north_lat_deg", "south_lat_deg", "east_lon_deg", "west_lon_deg", "coordinate_system"]


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Sol geography fetcher)"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def gazetteer_rows(code: str) -> list[list[str]]:
    doc = get(GAZ.format(code=code)).decode("utf-8", "replace")
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", doc, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(cells) >= 19:
            rows.append(cells)
    if not rows:
        raise SystemExit(f"gazetteer returned no parseable rows for {code}")
    return rows


def build_csv() -> str:
    out: list[list[str]] = []
    for code, sel in SELECT.items():
        kept = 0
        for r in gazetteer_rows(code):
            if r[C_APPROVAL] != "Approved":
                continue
            ftype = r[C_TYPE]
            try:
                diam = float(r[C_DIAM]) if r[C_DIAM] else 0.0
            except ValueError:
                continue
            if ftype in sel["types"] and diam >= sel["min_diameter_km"]:
                pass
            elif ftype in sel["extra_types"] and diam >= sel["extra_min_diameter_km"]:
                pass
            else:
                continue
            try:
                lat, lon = float(r[C_LAT]), float(r[C_LON])
                n, s = float(r[C_NORTH]), float(r[C_SOUTH])
                e, w = float(r[C_EAST]), float(r[C_WEST])
            except ValueError:
                continue
            out.append([r[C_TARGET], r[C_NAME], ftype, f"{diam:.2f}",
                        f"{lat:.4f}", f"{lon:.4f}",
                        f"{n:.4f}", f"{s:.4f}", f"{e:.4f}", f"{w:.4f}", r[C_COORDSYS]])
            kept += 1
        print(f"  {code}: kept {kept}")
    # Deterministic order: target, then name — independent of the server's row order.
    out.sort(key=lambda r: (r[0], r[1]))
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(CSV_HEADER)
    w.writerows(out)
    return buf.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the committed sources differ")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    payloads: dict[str, bytes] = {}
    for name in NE_FILES:
        print(f"fetching {name}")
        payloads[name] = get(f"{NE_BASE}/{name}")
    print("fetching IAU/USGS gazetteer")
    payloads[CSV_NAME] = build_csv().encode("utf-8")

    bad = False
    for name, data in payloads.items():
        dst = OUT / name
        if args.check:
            cur = dst.read_bytes() if dst.exists() else b""
            if cur != data:
                print(f"DRIFT: {name} differs from upstream")
                bad = True
        else:
            dst.write_bytes(data)
        print(f"  {name}: {len(data)} bytes  sha256 {hashlib.sha256(data).hexdigest()}")
    if args.check and bad:
        return 1
    print("OK" if args.check else f"wrote {len(payloads)} files to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
