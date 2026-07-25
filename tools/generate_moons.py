#!/usr/bin/env python3
"""Generate the major-moon module from the committed pristine sources — offline.

Inputs (tools/ephemeris-data/moons/, see its README for provenance and licences):
  horizons_satellite_elements.csv  JPL Horizons osculating elements, ecliptic J2000, planetocentric
  jpl_satellite_physical.csv       JPL SSD satellite GM / mean radius / mean density

Output (committed; CI verifies regeneration is byte-identical):
  apps/web/js/moons.js

Determinism: pure function of the committed inputs, ordered by JPL body code, fixed float
formatting, no timestamps.

Usage:
    python tools/generate_moons.py            # (re)write the module
    python tools/generate_moons.py --check    # fail if the committed file differs
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "ephemeris-data" / "moons"
OUT = ROOT / "apps" / "web" / "js" / "moons.js"

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


def build() -> str:
    elems = list(csv.DictReader((SRC / "horizons_satellite_elements.csv").open(encoding="utf-8", newline="")))
    phys = {r["Code"]: r for r in
            csv.DictReader((SRC / "jpl_satellite_physical.csv").open(encoding="utf-8", newline=""))}
    if not elems:
        die("no satellite elements found")

    epochs = {r["epoch_jd_tdb"] for r in elems}
    if len(epochs) != 1:
        die(f"elements span more than one epoch: {sorted(epochs)}")
    epoch_jd = float(epochs.pop())

    moons = []
    for r in elems:
        name, code, planet = r["Satellite"], r["Code"], r["Planet"]
        p = phys.get(code) or die(f"no physical parameters for {name}")
        look = LOOK.get(name) or die(f"{name}: no appearance entry — add one to LOOK")
        inc = num(r["i_deg"], 0.0)
        lo, hi = EXPECTED_INC.get(planet, (0, 180))
        if not (lo <= inc <= hi):
            die(f"{name}: inclination {inc}° is outside the {lo}–{hi}° expected for a "
                f"{planet} satellite in the ecliptic frame — wrong reference plane?")
        a_km = num(r["a_km"])
        n = num(r["n_deg_per_day"])
        if not a_km or not n:
            die(f"{name}: missing semi-major axis or mean motion")
        moons.append({
            "n": name, "p": planet, "code": int(code),
            "a": round(a_km, 1), "e": round(num(r["e"], 0.0), 7), "i": round(inc, 5),
            "node": round(num(r["node_deg"], 0.0), 5), "argp": round(num(r["argp_deg"], 0.0), 5),
            "M0": round(num(r["M_deg"], 0.0), 5), "nd": round(n, 8),
            "P": round(360.0 / n, 6),
            "r": round(num(p["mean_radius_km"], 0.0), 1),
            "rho": positive(num(p["mean_density_g_cm3"], None)),
            # JPL writes 0.00000 where a satellite's GM has never been measured — Nereid is one.
            # Carrying that through as a number would put "0.0000 km³/s²" on the card, presenting
            # a missing measurement as a physical fact about a 170 km moon.
            "gm": positive(num(p["GM_km3_s2"], None)),
            "col": look[0], "note": look[1],
        })
    moons.sort(key=lambda m: m["code"])

    by_planet: dict[str, int] = {}
    for m in moons:
        by_planet[m["p"]] = by_planet.get(m["p"], 0) + 1
    summary = ", ".join(f"{k} {v}" for k, v in sorted(by_planet.items()))

    lines = [
        "// GENERATED by tools/generate_moons.py — do not edit.\n",
        "// @lazy-module: loaded on demand via dynamic import (orrery.js) when the 3-D view opens —\n",
        "// must NOT be modulepreloaded or statically imported (validate_web_static enforces both).\n",
        "//\n",
        f"// The {len(moons)} major moons ({summary}) — every satellite with a mean radius of at\n",
        "// least 150 km, plus Mars's two. Osculating elements from JPL Horizons, PLANETOCENTRIC and\n",
        "// already referred to the ecliptic J2000 plane, so they need no frame rotation: they are in\n",
        "// the renderer's own frame. See tools/ephemeris-data/moons/README.md for why the elements\n",
        "// come from Horizons rather than from JPL's satellite mean-elements table.\n",
        "//\n",
        "// ACCURACY — read this before trusting a position. Osculating elements describe the orbit\n",
        "// a moon is on AT THE EPOCH; Kepler-propagating them ignores every perturbation that\n",
        "// changes it afterwards, and satellite orbits are strongly perturbed. Measured against\n",
        "// Horizons by tools/validate_moons.py, which gates the error in CI. Positions are for\n",
        "// showing which side of its planet a moon is on and how the system is arranged — never for\n",
        "// an occultation, a mutual event, or anything that has to be right to the arcminute.\n",
        "//\n",
        "// `col` and `note` are illustrative — JPL publishes GM, radius and density, never colour.\n",
        "\n",
        f"/** Epoch of every element set below: JD {epoch_jd:.1f} TDB. */\n",
        f"export const MOON_EPOCH_JD = {epoch_jd:.6f};\n",
        "\n",
        "/** @typedef {{n:string,p:string,code:number,a:number,e:number,i:number,node:number,\n",
        " *  argp:number,M0:number,nd:number,P:number,r:number,rho:number|null,gm:number|null,\n",
        " *  col:[number,number,number],note:string}} Moon */\n",
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
    return "".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the committed module differs")
    args = ap.parse_args()
    text = build()
    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("ERROR: apps/web/js/moons.js is stale — re-run tools/generate_moons.py", file=sys.stderr)
            return 1
        print("OK: moons.js matches its sources")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
