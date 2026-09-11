#!/usr/bin/env python3
"""Generate the major-moon module from the committed pristine sources — offline.

Inputs (tools/ephemeris-data/moons/, see its README for provenance and licences):
  horizons_satellite_elements.csv  JPL Horizons osculating elements, ecliptic J2000, planetocentric
  jpl_satellite_physical.csv       JPL SSD satellite GM / mean radius / mean density

Outputs (committed; qualified canonical generation must be byte-identical):
  apps/web/js/moons.js
  apps/web/js/moonelements.js

Determinism: pure function of the committed inputs, ordered by JPL body code, fixed float
formatting, no timestamps.

Usage:
    python tools/generate_moons.py            # write only with reviewed canonical qualification
    python tools/generate_moons.py --check    # read-only source/output comparison on any host
    python tools/generate_moons.py --check --require-canonical  # strict qualification gate
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import platform
import re
import sys
from pathlib import Path

from moon_model import equinoctial_knots, interpolate, knot_step_days, load_element_groups

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "ephemeris-data" / "moons"
OUT = ROOT / "apps" / "web" / "js" / "moons.js"
OUT_ELEMENTS = ROOT / "apps" / "web" / "js" / "moonelements.js"
REFERENCE_JD = 2461041.5

# Appearance and one-line context. These are ILLUSTRATIVE, exactly like the `col` values in
# smallbodies.js: JPL publishes GM, radius and density, never colour. The module header says so,
# and the detail card labels the colour as a rendering choice rather than a measurement.
LOOK = {
    "Phobos": ([0.42, 0.38, 0.35], "Battered, grooved, and spiralling inward — it will break up in ~50 Myr."),
    "Deimos": ([0.48, 0.44, 0.40], "The smaller, smoother, outer Martian moon."),
    "Io": ([0.94, 0.84, 0.42], "The most volcanically active world in the solar system — sulfur frosts, 400+ volcanoes."),
    "Europa": ([0.86, 0.82, 0.74], "A cracked ice shell over a global salt-water ocean holding twice Earth's water."),
    "Ganymede": ([0.66, 0.61, 0.55], "Largest moon in the solar system — bigger than Mercury, and the only one with its own magnetic field."),
    "Callisto": ([0.42, 0.39, 0.37], "The most heavily cratered object known; geologically dead for ~4 billion years."),
    "Mimas": ([0.72, 0.72, 0.70], "Herschel crater spans a third of its diameter."),
    "Enceladus": ([0.94, 0.96, 0.97], "Brightest surface in the solar system, venting water ice from a subsurface ocean."),
    "Tethys": ([0.80, 0.80, 0.78], "Almost pure water ice, scarred by the vast Ithaca Chasma."),
    "Dione": ([0.76, 0.76, 0.74], "Wispy ice cliffs streak its trailing hemisphere."),
    "Rhea": ([0.74, 0.73, 0.71], "Saturn's second largest — an ancient, cratered iceball."),
    "Titan": ([0.86, 0.66, 0.34], "The only moon with a thick atmosphere, and the only other world with standing liquid — methane lakes."),
    "Iapetus": ([0.62, 0.58, 0.52], "Two-toned: one hemisphere as dark as coal, the other as bright as snow."),
    "Miranda": ([0.70, 0.71, 0.72], "Cliffs up to 20 km high — the tallest known anywhere."),
    "Ariel": ([0.76, 0.77, 0.78], "The brightest Uranian moon, resurfaced by past tectonics."),
    "Umbriel": ([0.55, 0.55, 0.56], "The darkest of the five, with one puzzlingly bright ring-shaped feature."),
    "Titania": ([0.72, 0.70, 0.68], "Largest Uranian moon, cut by enormous rift valleys."),
    "Oberon": ([0.68, 0.65, 0.62], "The outermost large Uranian moon, its crater floors filled with dark material."),
    "Triton": ([0.84, 0.80, 0.80], "Orbits BACKWARDS — a captured Kuiper-belt object with nitrogen geysers and the coldest measured surface."),
    "Nereid": ([0.70, 0.70, 0.72], "One of the most eccentric orbits of any moon: 1.4 to 9.7 million km."),
    "Proteus": ([0.52, 0.52, 0.53], "About as large as a body can get without gravity pulling it round."),
}

# A moon's ecliptic inclination should echo its planet's obliquity, because regular satellites
# orbit near their planet's equator. Checking that here turns a silently mis-framed element set
# — the failure mode that sank the mean-elements table — into a build error.
EXPECTED_INC = {"Mars": (15, 40), "Jupiter": (0, 10), "Saturn": (15, 40),
                "Uranus": (85, 110), "Neptune": (0, 180)}


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(2)


def positive(v: float | None) -> float | None:
    """None unless v is a real positive measurement — see the GM note in build()."""
    return v if v is not None and v > 0 else None


def num(v: str, default: float | None = None) -> float | None:
    v = (v or "").strip().rstrip(".")
    if not v or v == "-":
        return default
    try:
        return float(v)
    except ValueError:
        return default


def build() -> tuple[str, str]:
    groups = load_element_groups(SRC / "horizons_satellite_elements.csv")
    phys = {r["Code"]: r for r in
            csv.DictReader((SRC / "jpl_satellite_physical.csv").open(encoding="utf-8", newline=""))}
    if not groups:
        die("no satellite elements found")

    check_dates: dict[str, list[float]] = {}
    with (SRC / "horizons_satellite_vectors.csv").open(encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            check_dates.setdefault(row["Satellite"], []).append(float(row["jd_tdb"]))
    if set(check_dates) != set(groups):
        die("element and held-out-vector moon sets differ")
    # Intersection, not union: every moon is independently checked across this whole interval.
    valid_min_jd = max(min(dates) for dates in check_dates.values())
    valid_max_jd = min(max(dates) for dates in check_dates.values())
    if valid_max_jd <= valid_min_jd:
        die("held-out validation intervals do not overlap")

    moons = []
    for name, rows in groups.items():
        first = rows[0]
        code, planet = str(first["code"]), str(first["planet"])
        p = phys.get(code) or die(f"no physical parameters for {name}")
        look = LOOK.get(name) or die(f"{name}: no appearance entry — add one to LOOK")
        knots = equinoctial_knots(rows)
        step_days = knot_step_days(knots)
        representative = interpolate(knots, REFERENCE_JD)
        inc = representative["i"]
        lo, hi = EXPECTED_INC.get(planet, (0, 180))
        if not (lo <= inc <= hi):
            die(f"{name}: inclination {inc}° is outside the {lo}–{hi}° expected for a "
                f"{planet} satellite in the ecliptic frame — wrong reference plane?")
        mean_motion = (knots[-1]["L"] - knots[0]["L"]) / (knots[-1]["jd"] - knots[0]["jd"])
        if representative["a"] <= 0 or mean_motion <= 0:
            die(f"{name}: missing semi-major axis or mean motion")
        flat_elements: list[float] = []
        for knot in knots:
            flat_elements.extend([
                round(knot["a"], 4),
                round(knot["h"], 12),
                round(knot["k"], 12),
                round(knot["p"], 12),
                round(knot["q"], 12),
                round(knot["L"], 6),
            ])
        moons.append({
            "n": name, "p": planet, "code": int(code),
            "a": round(representative["a"], 1),
            "e": round(representative["e"], 7),
            "i": round(inc, 5),
            "node": round(representative["node"] % 360.0, 5),
            "argp": round(representative["argp"] % 360.0, 5),
            "M0": round(representative["M"] % 360.0, 5),
            "nd": round(mean_motion, 8),
            "P": round(360.0 / mean_motion, 6),
            "r": round(num(p["mean_radius_km"], 0.0), 1),
            "rho": positive(num(p["mean_density_g_cm3"], None)),
            # JPL writes 0.00000 where a satellite's GM has never been measured — Nereid is one.
            # Carrying that through as a number would put "0.0000 km³/s²" on the card, presenting
            # a missing measurement as a physical fact about a 170 km moon.
            "gm": positive(num(p["GM_km3_s2"], None)),
            "col": look[0], "note": look[1],
            "t0": round(knots[0]["jd"], 6),
            "step": round(step_days, 6),
            "el": flat_elements,
        })
    moons.sort(key=lambda m: m["code"])

    by_planet: dict[str, int] = {}
    for m in moons:
        by_planet[m["p"]] = by_planet.get(m["p"], 0) + 1
    summary = ", ".join(f"{k} {v}" for k, v in sorted(by_planet.items()))

    lines = [
        "// GENERATED by tools/generate_moons.py — do not edit.\n",
        "// Static 3-D dependency: the Focus control and accessible positions list promise these\n",
        "// 21 curated moons on first entry; optional geography and star enrichment remain lazy.\n",
        "// This module carries identity only — name, parent, size, period, appearance. The weekly\n",
        "// element knots are ~99% of the data and live in the lazily imported moonelements.js, so\n",
        "// widening the validated window cannot put a megabyte on the first-paint path.\n",
        "//\n",
        f"// The {len(moons)} major moons ({summary}) — every satellite with a mean radius of at\n",
        "// least 150 km, plus Mars's two. Osculating elements from JPL Horizons, PLANETOCENTRIC and\n",
        "// already referred to the ecliptic J2000 plane, so they need no frame rotation: they are in\n",
        "// the renderer's own frame. See tools/ephemeris-data/moons/README.md for why the elements\n",
        "// come from Horizons rather than from JPL's satellite mean-elements table.\n",
        "//\n",
        "// ACCURACY — the renderer linearly interpolates weekly modified-equinoctial element knots\n",
        "// (3.5-day knots for Mimas and Enceladus), then solves Kepler at the requested instant.\n",
        "// tools/validate_moons.py gates the result against Horizons vectors halfway between knots,\n",
        "// so the checks are predictions rather than training-row lookups. Positions are for\n",
        "// showing which side of its planet a moon is on and how the system is arranged — never for\n",
        "// an occultation, a mutual event, or anything that has to be right to the arcminute.\n",
        "//\n",
        "// `col` and `note` are illustrative — JPL publishes GM, radius and density, never colour.\n",
        "\n",
        f"/** Reference epoch used for representative facts: JD {REFERENCE_JD:.1f} TDB. */\n",
        f"export const MOON_EPOCH_JD = {REFERENCE_JD:.6f};\n",
        "/** Every moon is independently validated throughout this exact interval. */\n",
        f"export const MOON_VALID_MIN_JD = {valid_min_jd:.6f};\n",
        f"export const MOON_VALID_MAX_JD = {valid_max_jd:.6f};\n",
        "\n",
        "/** @typedef {{n:string,p:string,code:number,a:number,e:number,i:number,node:number,\n",
        " *  argp:number,M0:number,nd:number,P:number,r:number,rho:number|null,gm:number|null,\n",
        " *  col:[number,number,number],note:string,t0?:number,step?:number,el?:number[]}} Moon */\n",
        "\n",
        "/** @type {Moon[]} */\n",
        "export const MOONS = [\n",
    ]
    for m in moons:
        rho = "null" if m["rho"] is None else m["rho"]
        gm = "null" if m["gm"] is None else m["gm"]
        lines.append(
            f'  {{n:{json.dumps(m["n"])},p:{json.dumps(m["p"])},code:{m["code"]},'
            f'a:{m["a"]},e:{m["e"]},i:{m["i"]},node:{m["node"]},argp:{m["argp"]},'
            f'M0:{m["M0"]},nd:{m["nd"]},P:{m["P"]},r:{m["r"]},rho:{rho},gm:{gm},'
            f'col:[{m["col"][0]},{m["col"][1]},{m["col"][2]}],note:{json.dumps(m["note"])}}},\n'
        )
    lines.append("];\n\n")
    lines.append("/** Moons of a given planet, innermost first. */\n")
    lines.append("export function moonsOf(planet) {\n")
    lines.append("  return MOONS.filter((m) => m.p === planet).sort((x, y) => x.a - y.a);\n")
    lines.append("}\n\n")
    lines.append("/** Planets that have at least one moon in this catalogue. */\n")
    lines.append("export const MOON_PARENTS = [...new Set(MOONS.map((m) => m.p))];\n")

    elements = [
        "// GENERATED by tools/generate_moons.py — do not edit.\n",
        "// @lazy-module: loaded on demand via dynamic import (orrery.js) when the 3-D view\n",
        "// opens — must NOT be modulepreloaded or statically imported (validate_web_static\n",
        "// enforces both), so the Sun / My Sky first paint never pays for this data.\n",
        "//\n",
        "// The weekly modified-equinoctial element knots for the moons in moons.js, split out of\n",
        "// that module because they are ~99% of its bytes and only the 3-D positions need them.\n",
        "// moons.js stays static so the Focus control and the accessible positions list keep\n",
        "// their first-entry guarantee.\n",
        "//\n",
        "// Keyed by moon name. `t0` is the first knot's JD, `step` the knot spacing in days, and\n",
        "// `el` a flat [a,h,k,p,q,L] × N table — see moonorbits.js for the interpolation.\n",
        "\n",
        "/** @type {Record<string,{t0:number,step:number,el:number[]}>} */\n",
        "export const MOON_ELEMENTS = {\n",
    ]
    for m in moons:
        elements.append(
            f'  {json.dumps(m["n"])}:{{t0:{m["t0"]},step:{m["step"]},'
            f'el:{json.dumps(m["el"], separators=(",", ":"))}}},\n'
        )
    elements.append("};\n")
    return "".join(lines), "".join(elements)


def runtime_identity() -> dict[str, str]:
    """Observed runtime facts, separate from a declared container digest."""
    return {
        "system": platform.system(), "machine": platform.machine().lower(),
        "implementation": platform.python_implementation(),
        "python_version": platform.python_version(),
    }


def load_generation_manifest() -> dict:
    path = ROOT / "tools" / "ephemeris-data" / "generation-manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != "scientific-generation-manifest.v1":
        raise ValueError("unsupported scientific generation manifest")
    return manifest


def verify_source_identity(manifest: dict) -> None:
    expected_sources = {
        "horizons_satellite_elements.csv", "horizons_satellite_vectors.csv",
        "jpl_satellite_physical.csv",
    }
    sources = manifest.get("sources", {})
    if set(sources) != expected_sources:
        raise ValueError("generation manifest must bind exactly the three pristine moon sources")
    for name, record in sources.items():
        observed = hashlib.sha256((SRC / name).read_bytes()).hexdigest()
        if observed != record.get("sha256"):
            raise ValueError(f"source hash mismatch: {name}; review source and manifest together")
    generators = manifest.get("generator", {}).get("files", {})
    expected_generators = {"tools/generate_moons.py", "tools/moon_model.py"}
    if set(generators) != expected_generators:
        raise ValueError("generation manifest must bind generator and numerical model source")
    for name, expected in generators.items():
        observed = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        if observed != expected:
            raise ValueError(f"generator hash mismatch: {name}; refresh reviewed source correspondence")


def canonical_errors(manifest: dict, runtime: dict[str, str], image_digest: str | None) -> list[str]:
    canonical = manifest.get("canonical", {})
    errors: list[str] = []
    if canonical.get("status") != "qualified":
        errors.append("canonical Linux x86_64 image qualification is pending")
    expected_digest = canonical.get("image_digest", "")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", expected_digest):
        errors.append("canonical image digest is not pinned")
    elif image_digest != expected_digest:
        errors.append("running container image digest is not attested by the invoking workflow")
    if runtime.get("system") != "Linux" or runtime.get("machine") not in ("x86_64", "amd64"):
        errors.append("this host is noncanonical; Linux x86_64 is required")
    if runtime.get("implementation") != "CPython" or runtime.get("python_version") != canonical.get("python_version"):
        errors.append("Python implementation/version differs from the canonical pin")
    evidence = canonical.get("qualification", {})
    if not isinstance(evidence, dict) or evidence.get("identical_runs", 0) < 2 or not evidence.get("reviewed_evidence"):
        errors.append("two canonical runs and reviewed source/output evidence are not recorded")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the committed module differs")
    ap.add_argument("--require-canonical", action="store_true", help="also require qualified pinned Linux x86_64 execution")
    args = ap.parse_args()
    try:
        manifest = load_generation_manifest()
        verify_source_identity(manifest)
        reasons = canonical_errors(manifest, runtime_identity(), os.environ.get("SOL_MOON_GENERATOR_IMAGE_DIGEST"))
        if reasons and (not args.check or args.require_canonical):
            raise ValueError("; ".join(reasons))
    except (OSError, ValueError, TypeError) as exc:
        print(f"ERROR: {exc}. Authoritative files were not changed. See docs/CANONICAL_GENERATION.md.", file=sys.stderr)
        return 2
    text, elements = build()
    targets = [(OUT, text), (OUT_ELEMENTS, elements)]
    output_hashes = manifest.get("outputs", {})
    expected_keys = {"apps/web/js/moons.js", "apps/web/js/moonelements.js"}
    if set(output_hashes) != expected_keys:
        print("ERROR: generation manifest must bind both moon outputs", file=sys.stderr)
        return 2
    generated_hashes = {f"apps/web/js/{path.name}": hashlib.sha256(want.encode("utf-8")).hexdigest() for path, want in targets}
    if generated_hashes != output_hashes:
        print("ERROR: generated bytes differ from reviewed output hashes; preserve authoritative files and compare in the canonical image. See docs/CANONICAL_GENERATION.md.", file=sys.stderr)
        return 1
    if args.check:
        stale = [p for p, want in targets
                 if (p.read_bytes() if p.exists() else b"") != want.encode("utf-8")]
        if stale:
            names = ", ".join(str(p.relative_to(ROOT)).replace("\\", "/") for p in stale)
            print(f"ERROR: {names} differs from pinned source/output identity; use docs/CANONICAL_GENERATION.md", file=sys.stderr)
            return 1
        print("OK: moons.js + moonelements.js match their sources")
        if reasons:
            print("NOTE: noncanonical comparison only; this does not qualify authoritative generation: " + "; ".join(reasons))
        return 0
    for path, want in targets:
        path.write_bytes(want.encode("utf-8"))
        print(f"wrote {str(path.relative_to(ROOT)).replace(chr(92), '/')} ({len(want)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
