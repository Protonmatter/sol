#!/usr/bin/env python3
"""Generate the surface-geography module from the committed pristine sources — offline.

Inputs (tools/ephemeris-data/geography/, see its README for provenance and licences):
  ne_110m_land.geojson             Natural Earth coastlines (public domain)
  ne_110m_lakes.geojson            major inland water
  ne_110m_glaciated_areas.geojson  permanent ice
  iau_surface_features.csv         IAU/USGS named features for the Moon, Mars, Mercury

Output (committed; CI verifies regeneration is byte-identical):
  apps/web/js/geography.js

Why this exists: apps/web/textures/ is .gitignore'd, so every deployment rendered planets with
the procedural shader — Earth's "continents" were value noise. This module gives the renderer
real geography that the repository actually carries, with no network and no binary assets.

Determinism: pure function of the committed inputs, fixed iteration order, integer quantisation,
no timestamps.

Usage:
    python tools/generate_geography.py            # (re)write the module
    python tools/generate_geography.py --check    # fail if the committed file differs
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "ephemeris-data" / "geography"
OUT = ROOT / "apps" / "web" / "js" / "geography.js"

# Integer units per degree for the committed coastline rings. The renderer rasterises into a
# 2048-wide equirectangular map, i.e. 0.176°/pixel, so 0.05° is ~3.5x finer than one pixel —
# quantisation is invisible, and delta-encoded integers keep the module small and diffable.
QUANT = 20

# Contrast by feature type. The gazetteer records position and extent, never albedo, so this
# is the one derived quantity here that is not measured — and it is only defensible because of
# WHICH types are listed. Mare, oceanus, lacus, sinus and palus are flood-basalt units: the type
# name identifies the rock, basalt is dark, and the highland anorthosite around it is bright.
# "The maria are the dark parts" is a definition, not an inference.
#
# Nothing else is listed, and that is deliberate — see the SELECT comment in
# tools/fetch_geography.py for why Mars and Mercury cannot be classified this way without
# getting Hellas Planitia (bright) backwards.
CONTRAST = {
    "Mare, maria": -0.55, "Oceanus, oceani": -0.55, "Lacus, lacūs": -0.45,
    "Sinus, sinūs": -0.45, "Palus, paludes": -0.40,
}

# Short kind tags handed to the renderer, so the rasteriser never parses Latin plurals.
KIND = {
    "Mare, maria": "basalt", "Oceanus, oceani": "basalt", "Lacus, lacūs": "basalt",
    "Sinus, sinūs": "basalt", "Palus, paludes": "basalt",
}


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(2)


# ------------------------------------------------------------------ Earth coastline vectors
def polygons_of(geometry: dict) -> list[list[list[list[float]]]]:
    """Each polygon as [outer_ring, hole, hole, ...] — grouping preserved.

    GeoJSON's second and later rings are HOLES, not more land. Flattening them into one list
    (as this did first) makes the rasteriser fill each independently, painting the gap solid:
    the committed land and glaciated-area files each carry one such ring, so a lake-in-an-island
    and a gap in the ice sheet were both rendered as ground.
    """
    t, c = geometry["type"], geometry["coordinates"]
    if t == "Polygon":
        return [list(c)]
    if t == "MultiPolygon":
        return [list(poly) for poly in c]
    die(f"unexpected geometry type {t}")
    return []


def encode_ring(ring: list[list[float]]) -> list[int]:
    """Quantise to 1/QUANT degree and delta-encode: [lon0, lat0, dlon, dlat, ...].

    Consecutive duplicates after quantisation are dropped — they would render as zero-length
    segments and only cost bytes. Rings that collapse below a triangle are dropped by the caller.
    """
    out: list[int] = []
    prev_x = prev_y = None
    for lon, lat in ring:
        x = int(round(lon * QUANT))
        y = int(round(lat * QUANT))
        if prev_x is None:
            out += [x, y]
        else:
            if x == prev_x and y == prev_y:
                continue
            out += [x - prev_x, y - prev_y]
        prev_x, prev_y = x, y
    return out


def load_polygons(filename: str) -> list[list[list[int]]]:
    """[[outer, hole, ...], ...] with every ring delta-encoded. Holes are kept with their parent
    so the renderer can subtract them with an even-odd fill instead of painting over them."""
    doc = json.loads((SRC / filename).read_text(encoding="utf-8"))
    out = []
    for feat in doc["features"]:
        for poly in polygons_of(feat["geometry"]):
            enc = [e for e in (encode_ring(r) for r in poly) if len(e) >= 8]
            if enc:
                out.append(enc)
    return out


# ------------------------------------------------------------------ IAU named features
def normalise_lon(lon: float, coordsys: str) -> float:
    """Any gazetteer convention -> east-positive [0, 360).

    Mercury is published WEST-positive. Skipping this step mirrors the planet while still
    looking plausible, so it is asserted rather than assumed: an unrecognised convention
    string is a hard failure, never a silent pass-through.
    """
    if "+East" in coordsys:
        east = lon
    elif "+West" in coordsys:
        east = -lon
    else:
        die(f"unrecognised longitude convention: {coordsys!r}")
        return 0.0
    return east % 360.0


def load_features() -> dict[str, list[dict]]:
    bodies: dict[str, list[dict]] = {}
    with (SRC / "iau_surface_features.csv").open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            ftype = row["feature_type"]
            kind = KIND.get(ftype)
            if kind is None:
                continue
            target = row["target"]
            cs = row["coordinate_system"]
            lat = float(row["center_lat_deg"])
            lon = normalise_lon(float(row["center_lon_deg"]), cs)
            diam = float(row["diameter_km"])
            if diam <= 0:
                continue
            # Extent from the bounding box where it is real, else the mean diameter. The box is
            # in the body's own convention too, so its span is taken BEFORE normalising.
            north, south = float(row["north_lat_deg"]), float(row["south_lat_deg"])
            lat_span = abs(north - south)
            contrast = CONTRAST[ftype]
            bodies.setdefault(target, []).append({
                "n": row["name"], "k": kind,
                "lat": round(lat, 3), "lon": round(lon, 3),
                "d": round(diam, 1), "ls": round(lat_span, 3),
                "c": round(contrast, 3),
            })
    for name in bodies:
        bodies[name].sort(key=lambda f: f["n"])
    return bodies


# ------------------------------------------------------------------ emit
def js_polygons(polys: list[list[list[int]]], indent: str) -> str:
    """Each polygon emits as [outerRing, hole...]; a ring is a flat delta-encoded int array."""
    return ",\n".join(
        f"{indent}[{','.join('[' + ','.join(str(v) for v in r) + ']' for r in poly)}]"
        for poly in polys)


def js_features(feats: list[dict], indent: str) -> str:
    lines = []
    for f in feats:
        lines.append(
            f'{indent}{{n:{json.dumps(f["n"], ensure_ascii=False)},k:"{f["k"]}",'
            f'lat:{f["lat"]},lon:{f["lon"]},d:{f["d"]},ls:{f["ls"]},c:{f["c"]}}}'
        )
    return ",\n".join(lines)


def build() -> str:
    land = load_polygons("ne_110m_land.geojson")
    lakes = load_polygons("ne_110m_lakes.geojson")
    ice = load_polygons("ne_110m_glaciated_areas.geojson")
    feats = load_features()

    total_pts = sum(len(r) // 2 for poly in land + lakes + ice for r in poly)
    holes = sum(len(poly) - 1 for poly in land + lakes + ice)
    parts = [
        "// GENERATED by tools/generate_geography.py — do not edit.\n",
        "// @lazy-module: loaded on demand via dynamic import (orrery.js) when the 3-D view opens —\n",
        "// must NOT be modulepreloaded or statically imported (validate_web_static enforces both),\n",
        "// so the Sun / My Sky first paint never pays for this data.\n",
        "// Real surface geography for the 3-D view, derived from the committed pristine sources in\n",
        "// tools/ephemeris-data/geography/ (see its README for provenance, licences, and the\n",
        "// longitude-convention trap this module normalises away).\n",
        "//\n",
        "// Earth polygons are Natural Earth 1:110m vectors, quantised to 1/%d degree and delta-encoded\n" % QUANT,
        "// as [lon0, lat0, dlon, dlat, ...] in integer units — decode with decodeRing(). A polygon\n"
        "// is [outerRing, ...holes]; GeoJSON's inner rings are holes and must SUBTRACT, not fill.\n",
        "// Named features are IAU/USGS gazetteer entries normalised to EAST-POSITIVE [0,360).\n",
        "//\n",
        "// `c` (contrast) is NOT measured: the gazetteer records position and extent, never albedo.\n",
        "// It is assigned from feature type — see the CONTRAST table in the generator — and every\n",
        "// surface that shows it to a user labels it as an approximation.\n",
        "\n",
        f"export const QUANT = {QUANT};\n",
        "\n",
        "/** Decode a delta-encoded ring to [[lonDeg, latDeg], ...]. */\n",
        "export function decodeRing(r) {\n",
        "  const out = [];\n",
        "  let x = r[0], y = r[1];\n",
        "  out.push([x / QUANT, y / QUANT]);\n",
        "  for (let i = 2; i < r.length; i += 2) {\n",
        "    x += r[i]; y += r[i + 1];\n",
        "    out.push([x / QUANT, y / QUANT]);\n",
        "  }\n",
        "  return out;\n",
        "}\n",
        "\n",
        f"// {len(land)} land polygons, {len(lakes)} lakes, {len(ice)} ice sheets "
        f"({total_pts} points, {holes} interior holes).\n",
        "// Each entry is [outerRing, ...holes] — draw with an even-odd fill so holes subtract.\n",
        "export const EARTH = {\n",
        "  land: [\n", js_polygons(land, "    "), "\n  ],\n",
        "  lakes: [\n", js_polygons(lakes, "    "), "\n  ],\n",
        "  ice: [\n", js_polygons(ice, "    "), "\n  ],\n",
        "};\n",
        "\n",
        "// name, kind, centre lat/lon (east-positive degrees), mean diameter km, latitude span, contrast.\n",
        "export const FEATURES = {\n",
    ]
    for body in sorted(feats):
        parts += [f"  {body}: [\n", js_features(feats[body], "    "), "\n  ],\n"]
    parts.append("};\n")
    return "".join(parts)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the committed module differs")
    args = ap.parse_args()

    text = build()
    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("ERROR: apps/web/js/geography.js is stale — re-run tools/generate_geography.py",
                  file=sys.stderr)
            return 1
        print("OK: geography.js matches its sources")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
