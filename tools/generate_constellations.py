#!/usr/bin/env python3
"""Generate the constellation-figure module from the committed pristine sources — offline.

Inputs (tools/ephemeris-data/stars/, see its README for provenance and licences):
  d3celestial_constellation_lines.json   IAU stick figures as GeoJSON MultiLineStrings
  d3celestial_constellations.json        abbreviation -> name / genitive / rank

Output (committed; CI verifies regeneration is byte-identical):
  apps/web/js/constellations.js

Why coordinates rather than star names: the previous hand-written figures joined stars by
NAME, which meant a figure could only use stars that happened to be in a curated list —
that is why the app drew 7 constellations out of 88. Emitting the polylines as RA/Dec lets
both the 3-D sky and the My Sky dome draw every figure without any star lookup at all.

Determinism: pure function of the committed inputs, sorted by abbreviation, fixed float
formatting, no timestamps.

Usage:
    python tools/generate_constellations.py            # (re)write the module
    python tools/generate_constellations.py --check    # fail if the committed file differs
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "ephemeris-data" / "stars"
OUT = ROOT / "apps" / "web" / "js" / "constellations.js"

# The IAU recognises exactly 88 constellations. The line source carries one extra feature
# because Serpens is drawn as two disjoint halves (Caput and Cauda) that share an id.
IAU_COUNT = 88


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def norm_ra(ra: float) -> float:
    """Source longitudes run -180..180; the renderers expect RA in [0, 360)."""
    return (ra + 360.0) % 360.0


def spherical_center(points: list[tuple[float, float]]) -> tuple[float, float]:
    """Mean direction of the figure's vertices — a label anchor that behaves at the RA
    wrap and near the poles, where averaging raw degrees does not."""
    x = y = z = 0.0
    for ra, dec in points:
        a, d = math.radians(ra), math.radians(dec)
        x += math.cos(d) * math.cos(a)
        y += math.cos(d) * math.sin(a)
        z += math.sin(d)
    n = len(points)
    x, y, z = x / n, y / n, z / n
    if math.hypot(math.hypot(x, y), z) < 1e-9:
        return (0.0, 0.0)
    return (norm_ra(math.degrees(math.atan2(y, x))), math.degrees(math.asin(max(-1.0, min(1.0, z)))))


def fmt(v: float) -> str:
    text = f"{v:.4f}".rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the committed output matches")
    args = parser.parse_args()

    lines_doc = json.loads((SRC / "d3celestial_constellation_lines.json").read_text(encoding="utf-8"))
    names = json.loads((SRC / "d3celestial_constellations.json").read_text(encoding="utf-8"))

    if len(names) != IAU_COUNT:
        die(f"expected {IAU_COUNT} named constellations, source has {len(names)}")

    # Merge features by id so Serpens' two halves land in one entry instead of one of
    # them being silently dropped by a dict overwrite.
    merged: dict[str, list[list[tuple[float, float]]]] = {}
    for feature in lines_doc["features"]:
        abbr = feature["id"]
        if abbr not in names:
            die(f"line feature {abbr!r} has no entry in the names source")
        geom = feature["geometry"]
        if geom["type"] != "MultiLineString":
            die(f"{abbr}: unexpected geometry {geom['type']!r}")
        for seg in geom["coordinates"]:
            if len(seg) < 2:
                continue
            merged.setdefault(abbr, []).append([(norm_ra(float(p[0])), float(p[1])) for p in seg])

    missing = sorted(set(names) - set(merged))
    if missing:
        die(f"no figure lines for: {', '.join(missing)}")

    out_lines = [
        "// GENERATED FILE — do not edit. Regenerate: python tools/generate_constellations.py",
        "//",
        "// All 88 IAU constellation stick figures as RA/Dec polylines (J2000, degrees, RA in",
        "// [0,360)). Sources and licences: tools/ephemeris-data/stars/README.md.",
        "//",
        "// Each entry: { abbr, name, gen, rank, center:[ra,dec], lines:[[ra,dec,ra,dec,...],…] }.",
        "// `lines` holds flat alternating RA/Dec pairs per polyline — draw consecutive points as",
        "// segments. `center` is the mean direction of the vertices, for labelling. Serpens is one",
        "// entry with two disjoint polyline groups, as it is drawn on the sky.",
        "",
        f"export const CONSTELLATION_COUNT = {len(merged)};",
        "export const CONSTELLATIONS = [",
    ]
    total_pts = 0
    for abbr in sorted(merged):
        meta = names[abbr]
        polys = merged[abbr]
        pts = [p for poly in polys for p in poly]
        total_pts += len(pts)
        cra, cdec = spherical_center(pts)
        body = ", ".join(
            "[" + ",".join(f"{fmt(ra)},{fmt(dec)}" for ra, dec in poly) + "]" for poly in polys
        )
        out_lines.append(
            f'  {{ abbr: {json.dumps(abbr)}, name: {json.dumps(meta["name"], ensure_ascii=False)}, '
            f'gen: {json.dumps(meta["gen"], ensure_ascii=False)}, rank: {meta["rank"]}, '
            f"center: [{fmt(cra)},{fmt(cdec)}], lines: [{body}] }},"
        )
    out_lines += ["];", ""]
    text = "\n".join(out_lines)

    print(f"constellations: {len(merged)} figures, "
          f"{sum(len(p) for p in merged.values())} polylines, {total_pts} points")

    if args.check:
        have = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if have != text:
            print(f"ERROR: {OUT.relative_to(ROOT)} is stale — regenerate and commit", file=sys.stderr)
            return 1
        return 0

    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
