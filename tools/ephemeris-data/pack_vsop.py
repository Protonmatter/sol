#!/usr/bin/env python3
"""Pack the dumped VSOP2013 coefficients into a Rust data module."""
import json, io, sys

src = json.load(io.open("vsop2013_data.json", encoding="utf-8"))
PLANETS = ["mer", "ven", "emb", "mar", "jup", "sat", "ura", "nep"]


def f(x):
    return repr(float(x))


def series(powers):
    out = []
    for pw in powers:
        terms = []
        for i in range(0, len(pw), 3):
            s, c, phis = pw[i], pw[i + 1], pw[i + 2]
            pairs = ",".join(f"({int(phis[j])},{int(phis[j+1])})" for j in range(0, len(phis), 2))
            terms.append(f"Term{{s:{f(s)},c:{f(c)},phi:&[{pairs}]}}")
        out.append("&[" + ",".join(terms) + "]")
    return "&[" + ",".join(out) + "]"


lines = [
    "// @generated from VSOP2013 (ephem.js 06-normal tier) — do not edit by hand.",
    "#![allow(clippy::approx_constant, clippy::excessive_precision, clippy::unreadable_literal)]",
    "use super::vsop2013::{Planet, Term};",
    "",
]
for key in PLANETS:
    th = src[key]
    c = th["coeffs"]
    lines.append(f"pub static {key.upper()}: Planet = Planet {{")
    lines.append(f"    gm: {f(th['GM'])},")
    for el in ["a", "L", "k", "h", "q", "p"]:
        lines.append(f"    {el.lower()}: {series(c[el])},")
    lines.append("};")
    lines.append("")

out_path = sys.argv[1]
io.open(out_path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print("wrote", out_path, "bytes:", len("\n".join(lines)))
