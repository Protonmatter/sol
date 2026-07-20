#!/usr/bin/env python3
"""Generate the star catalogue artifacts from the committed pristine sources — offline.

Inputs (committed byte-exact; see tools/ephemeris-data/stars/README.md):
  hipparcos_mag7.json         HIP, RA/Dec (rad), distance (ly), Vmag, B−V  — 15,386 stars
  hipparcos_names.json        HIP -> proper name (96)
  d3celestial_starnames.json  HIP -> Bayer/Flamsteed designation + constellation
  pyephem_bright_stars.edb    name, spectral, RA|pmRA, Dec|pmDec, Vmag (bright set)

Outputs (both committed; CI verifies regeneration is byte-stable AND matches):
  apps/web/js/starcatalog.js            packed naked-eye catalogue (V <= MAG_LIMIT)
                                        + named-star metadata for the 3-D views
  crates/solar-ephemeris/src/stars.rs   engine catalogue: the original 26 SIMBAD-verified
                                        entries verbatim + the PyEphem/BSC bright set
                                        (coords, Vmag, proper motion)

Determinism: pure function of the committed inputs — stars sorted by HIP, fixed float
formatting, no timestamps. Unit-sanity gates abort generation if a source file's
conventions ever shift (e.g. proper-motion units, distance units).

Usage:
    python tools/generate_star_catalog.py           # (re)write both artifacts
    python tools/generate_star_catalog.py --check   # fail if committed files differ
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "ephemeris-data" / "stars"
OUT_JS = ROOT / "apps" / "web" / "js" / "starcatalog.js"
OUT_RS = ROOT / "crates" / "solar-ephemeris" / "src" / "stars.rs"

MAG_LIMIT = 6.5  # complete naked-eye sky
LY_PER_PC = 3.2615637772

# The original hand-curated engine catalogue: J2000 ICRS positions and SIMBAD/Hipparcos
# proper motions (mu_alpha*cos(delta), mu_delta in mas/yr), copied VERBATIM from the
# pre-generator crates/solar-ephemeris/src/stars.rs. These 26 always win over the
# PyEphem values so the engine's validated numbers never drift.
FROZEN_SIMBAD = [
    ("Sirius", 101.287, -16.716, -1.46, -546.01, -1223.07),
    ("Canopus", 95.988, -52.696, -0.74, 19.93, 23.24),
    ("Rigil Kentaurus", 219.902, -60.834, -0.27, -3608.0, 686.0),
    ("Arcturus", 213.915, 19.182, -0.05, -1093.39, -2000.06),
    ("Vega", 279.234, 38.784, 0.03, 200.94, 286.23),
    ("Capella", 79.172, 45.998, 0.08, 75.25, -426.89),
    ("Rigel", 78.634, -8.202, 0.13, 1.31, 0.5),
    ("Procyon", 114.825, 5.225, 0.34, -714.59, -1036.8),
    ("Achernar", 24.429, -57.237, 0.46, 87.0, -38.24),
    ("Betelgeuse", 88.793, 7.407, 0.50, 27.54, 11.3),
    ("Hadar", 210.956, -60.373, 0.61, -33.27, -23.16),
    ("Altair", 297.696, 8.868, 0.76, 536.23, 385.29),
    ("Acrux", 186.650, -63.099, 0.77, -35.83, -14.86),
    ("Aldebaran", 68.980, 16.509, 0.85, 63.45, -188.94),
    ("Spica", 201.298, -11.161, 1.04, -42.35, -30.67),
    ("Antares", 247.352, -26.432, 1.09, -12.11, -23.3),
    ("Pollux", 116.329, 28.026, 1.14, -626.55, -45.8),
    ("Fomalhaut", 344.413, -29.622, 1.16, 328.95, -164.67),
    ("Deneb", 310.358, 45.280, 1.25, 2.01, 1.85),
    ("Mimosa", 191.930, -59.689, 1.25, -42.97, -16.18),
    ("Regulus", 152.093, 11.967, 1.35, -248.73, 5.59),
    ("Adhara", 104.656, -28.972, 1.50, 3.24, 1.33),
    ("Castor", 113.650, 31.888, 1.58, -191.45, -145.19),
    ("Shaula", 263.402, -37.104, 1.62, -8.53, -30.8),
    ("Bellatrix", 81.283, 6.350, 1.64, -8.11, -12.88),
    ("Polaris", 37.954, 89.264, 1.98, 44.48, -11.85),
]

# Measured reference values (literature) used as decode-sanity gates: if the source
# file's units or field order ever change, generation fails instead of emitting garbage.
TRUTH_DISTANCE_LY = {
    "Sirius": (8.60, 0.05),
    "Procyon": (11.46, 0.10),
    "Vega": (25.0, 0.6),
    "Arcturus": (36.7, 1.0),
    "Aldebaran": (65.3, 2.0),
    "Polaris": (433.0, 45.0),
}


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def norm_name(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalpha())


def load_hipparcos() -> list[dict]:
    data = json.loads((SRC / "hipparcos_mag7.json").read_text(encoding="utf-8"))
    stars = []
    for rec in data["stars"]:
        hip, ra_rad, dec_rad, dist_ly, vmag, bv = rec[:6]
        dist = float(dist_ly)
        stars.append(
            {
                "hip": int(hip),
                "ra": math.degrees(float(ra_rad)) % 360.0,
                "dec": math.degrees(float(dec_rad)),
                # A handful of Hipparcos parallaxes are non-positive/unusable; the crate
                # encodes those as absurd distances. Null them rather than pretend.
                "dist": dist if 0.0 < dist < 3.5e5 else None,
                "mag": float(vmag),
                "bv": None if bv is None else float(bv),
            }
        )
    stars.sort(key=lambda s: s["hip"])
    if len(stars) != 15386:
        die(f"hipparcos_mag7.json star count changed: {len(stars)}")
    return stars


def load_names() -> dict[int, dict]:
    names: dict[int, dict] = {}
    for hip, name in json.loads((SRC / "hipparcos_names.json").read_text(encoding="utf-8")):
        names.setdefault(int(hip), {})["name"] = name
    d3 = json.loads((SRC / "d3celestial_starnames.json").read_text(encoding="utf-8"))
    for hip_str, rec in d3.items():
        try:
            hip = int(hip_str)
        except ValueError:
            continue
        slot = names.setdefault(hip, {})
        if rec.get("name") and "name" not in slot:
            slot["name"] = rec["name"]
        if rec.get("bayer"):
            slot["bayer"] = rec["bayer"]
        if rec.get("c"):
            slot["con"] = rec["c"]
    return names


def load_pyephem() -> list[dict]:
    entries: dict[tuple, dict] = {}
    for line in (SRC / "pyephem_bright_stars.edb").read_text(encoding="utf-8").splitlines():
        parts = line.strip().split(",")
        if len(parts) < 5:
            continue
        name = parts[0]
        spectral = parts[1].split("|")[-1]
        ra_field, dec_field, mag = parts[2], parts[3], float(parts[4])
        ra_h, _, pm_ra = ra_field.partition("|")
        dec_d, _, pm_dec = dec_field.partition("|")
        star = {
            "name": name,
            "spectral": spectral,
            "ra": float(ra_h) * 15.0,
            "dec": float(dec_d),
            "mag": mag,
            "pm_ra": float(pm_ra) if pm_ra else 0.0,
            "pm_dec": float(pm_dec) if pm_dec else 0.0,
        }
        # Alias duplicates (e.g. Adara/Adhara) share coordinates — keep one, preferring
        # the spelling used by the frozen SIMBAD table.
        key = (round(star["ra"], 3), round(star["dec"], 3))
        keep = entries.get(key)
        frozen_names = {norm_name(n) for n, *_ in FROZEN_SIMBAD}
        if keep is None or (norm_name(name) in frozen_names and norm_name(keep["name"]) not in frozen_names):
            entries[key] = star
    stars = sorted(entries.values(), key=lambda s: (s["mag"], s["name"]))

    # --- unit-sanity gates -------------------------------------------------
    by_name = {norm_name(s["name"]): s for s in stars}
    sirius = by_name.get("sirius") or die("PyEphem source lost Sirius")
    if abs(sirius["pm_ra"] - (-546.01)) > 30 or abs(sirius["pm_dec"] - (-1223.07)) > 60:
        die(
            "PyEphem proper-motion convention changed (Sirius pm "
            f"{sirius['pm_ra']}, {sirius['pm_dec']} — expected ~ -546, -1223 mas/yr "
            "as mu_alpha*cos(delta), mu_delta)"
        )
    polaris = by_name.get("polaris") or die("PyEphem source lost Polaris")
    if abs(polaris["pm_ra"]) > 300:
        die(
            f"PyEphem RA proper motion looks like mu_alpha WITHOUT cos(delta) "
            f"(Polaris pm_ra={polaris['pm_ra']}); the engine expects mu_alpha*cos(delta)"
        )
    return stars


def build_engine_catalog(pyephem: list[dict]) -> list[dict]:
    """FROZEN_SIMBAD verbatim + PyEphem stars not already covered (coordinate match)."""
    catalog = [
        {"name": n, "ra": ra, "dec": dec, "mag": mag, "pm_ra": pra, "pm_dec": pdc, "frozen": True}
        for n, ra, dec, mag, pra, pdc in FROZEN_SIMBAD
    ]
    for star in pyephem:
        if any(
            abs(star["ra"] - c["ra"]) < 0.2 and abs(star["dec"] - c["dec"]) < 0.2
            for c in catalog
        ):
            continue
        catalog.append({**star, "frozen": False})
    catalog.sort(key=lambda s: (s["mag"], s["name"]))
    return catalog


def spot_check_distances(stars: list[dict], names: dict[int, dict]) -> None:
    by_name = {}
    for s in stars:
        rec = names.get(s["hip"])
        if rec and rec.get("name"):
            by_name.setdefault(norm_name(rec["name"]), s)
    for name, (want, tol) in TRUTH_DISTANCE_LY.items():
        star = by_name.get(norm_name(name))
        if star is None:
            die(f"distance spot-check: {name} not found among named Hipparcos stars")
        got = star["dist"]
        if got is None or abs(got - want) > tol:
            die(
                f"distance spot-check failed for {name}: got {got} ly, expected "
                f"{want}±{tol} — source units/decoding changed?"
            )


def fmt(value: float, places: int) -> str:
    text = f"{value:.{places}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "-0" if text == "-0" else text or "0"


def fmt_dist(value: float | None) -> str:
    if value is None:
        return "null"
    if value >= 1000.0:
        return fmt(value, 0)
    if value >= 100.0:
        return fmt(value, 1)
    return fmt(value, 2)


def emit_js(stars: list[dict], names: dict[int, dict], pyephem: list[dict]) -> str:
    visible = [s for s in stars if s["mag"] <= MAG_LIMIT]
    pyeph_by_coord = [(s["ra"], s["dec"], s["spectral"]) for s in pyephem]

    packed_rows = []
    for s in visible:
        packed_rows.append(
            f'{fmt(s["ra"], 4)},{fmt(s["dec"], 4)},{fmt(s["mag"], 2)},'
            f'{fmt(s["bv"], 2) if s["bv"] is not None else "0"},{fmt_dist(s["dist"])}'
        )

    named = []
    for s in visible:
        rec = names.get(s["hip"]) or {}
        if not rec.get("name"):
            continue
        spectral = ""
        for ra, dec, spec in pyeph_by_coord:
            if abs(ra - s["ra"]) < 0.1 and abs(dec - s["dec"]) < 0.1:
                spectral = spec
                break
        named.append(
            {
                "hip": s["hip"],
                "name": rec["name"],
                "bayer": rec.get("bayer", ""),
                "con": rec.get("con", ""),
                "ra": round(s["ra"], 4),
                "dec": round(s["dec"], 4),
                "mag": s["mag"],
                "bv": s["bv"],
                "dist": None if s["dist"] is None else float(fmt_dist(s["dist"])),
                "spec": spectral,
            }
        )
    named.sort(key=lambda r: (r["mag"], r["name"]))

    lines = [
        "// GENERATED FILE — do not edit. Regenerate: python tools/generate_star_catalog.py",
        "//",
        "// Naked-eye Hipparcos star catalogue (V ≤ " + fmt(MAG_LIMIT, 1) + ") for the 3-D views.",
        "// Positions/distances/photometry: ESA Hipparcos (1997) via the committed extract in",
        "// tools/ephemeris-data/stars/ (provenance + licenses in its README). Distances are",
        "// trigonometric-parallax values in light-years; null = unusable parallax. Derived",
        "// physics (luminosity, temperature, radius, mass estimate) lives in starphysics.js.",
        "",
        f"export const STAR_COUNT = {len(packed_rows)};",
        "export const STAR_STRIDE = 5; // ra_deg, dec_deg, vmag, b_minus_v, dist_ly|null",
        "export const STARS_PACKED = [",
    ]
    lines.extend(f"  {row}," for row in packed_rows)
    lines.append("];")
    lines.append("")
    lines.append("// Stars with proper names — the label/tooltip layer. spec is the")
    lines.append("// spectral type where the bright-star source carries one, else \"\".")
    lines.append("export const NAMED_STARS = [")
    for r in named:
        lines.append(
            "  { hip: %d, name: %s, bayer: %s, con: %s, ra: %s, dec: %s, mag: %s, bv: %s, dist: %s, spec: %s },"
            % (
                r["hip"],
                json.dumps(r["name"], ensure_ascii=False),
                json.dumps(r["bayer"], ensure_ascii=False),
                json.dumps(r["con"], ensure_ascii=False),
                fmt(r["ra"], 4),
                fmt(r["dec"], 4),
                fmt(r["mag"], 2),
                fmt(r["bv"], 2) if r["bv"] is not None else "null",
                "null" if r["dist"] is None else fmt_dist(r["dist"]),
                json.dumps(r["spec"], ensure_ascii=False),
            )
        )
    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def emit_rust(catalog: list[dict]) -> str:
    head = '''//! The bright-star catalogue (J2000 ICRS positions, V mag, proper motion).
//!
//! GENERATED by tools/generate_star_catalog.py — do not edit entries by hand; the
//! sources and provenance live in tools/ephemeris-data/stars/. The original 26
//! hand-curated entries keep their SIMBAD/Hipparcos values verbatim (the generator
//! freezes them); the remainder come from the PyEphem/XEphem bright-star compilation
//! of the Yale Bright Star Catalogue.
//!
//! These flow through the same topocentric reduction as the Sun/Moon/planets (J2000
//! equatorial → J2000 ecliptic → precess to date → nutation → equatorial of date →
//! alt/az), so they appear in both the My Sky dome and the "Up now" list. Stars are at
//! effectively infinite distance, so light-time and parallax are nil; annual aberration
//! (~20″) is omitted (negligible at dome scale). Proper motion IS applied
//! (mu_alpha*cos(delta), mu_delta; mas per Julian year, epoch J2000): the fastest movers
//! (α Cen 3.7″/yr, Arcturus 2.3″/yr) would otherwise drift past the arcminute claim
//! within ~20 years of the catalogue epoch.

pub struct Star {
    pub name: &'static str,
    pub ra_deg: f64,
    pub dec_deg: f64,
    pub mag: f64,
    /// Proper motion mu_alpha*cos(delta), milliarcseconds per Julian year, epoch J2000.
    pub pm_ra_mas_yr: f64,
    /// Proper motion mu_delta, milliarcseconds per Julian year, epoch J2000.
    pub pm_dec_mas_yr: f64,
}

pub static STARS: &[Star] = &[
'''
    body = []
    for s in catalog:
        body.append(
            "    Star {\n"
            f'        name: "{s["name"]}",\n'
            f"        ra_deg: {s['ra']:.6f},\n"
            f"        dec_deg: {s['dec']:.6f},\n"
            f"        mag: {s['mag']:.2f},\n"
            f"        pm_ra_mas_yr: {s['pm_ra']:.2f},\n"
            f"        pm_dec_mas_yr: {s['pm_dec']:.2f},\n"
            "    },\n"
        )
    return head + "".join(body) + "];\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify committed outputs match")
    args = parser.parse_args()

    stars = load_hipparcos()
    names = load_names()
    pyephem = load_pyephem()
    spot_check_distances(stars, names)

    catalog = build_engine_catalog(pyephem)
    js = emit_js(stars, names, pyephem)
    rs = emit_rust(catalog)

    n_visible = js.split("STAR_COUNT = ", 1)[1].split(";", 1)[0]
    print(
        f"catalogue: {n_visible} naked-eye stars (V<={MAG_LIMIT}); "
        f"engine: {len(catalog)} bright stars ({sum(1 for c in catalog if c['frozen'])} frozen SIMBAD)"
    )

    if args.check:
        ok = True
        for path, want in ((OUT_JS, js), (OUT_RS, rs)):
            have = path.read_text(encoding="utf-8") if path.exists() else ""
            if have != want:
                print(f"ERROR: {path.relative_to(ROOT)} is stale — regenerate and commit", file=sys.stderr)
                ok = False
        return 0 if ok else 1

    OUT_JS.write_text(js, encoding="utf-8")
    OUT_RS.write_text(rs, encoding="utf-8")
    print(f"wrote {OUT_JS.relative_to(ROOT)} and {OUT_RS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
