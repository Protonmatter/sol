#!/usr/bin/env python3
"""Pack the ELP-MPP02 init tables (CMPB/FMPB/CPER/FPER/W0) into a Rust data module."""
import json, io, sys

d = json.load(io.open("elpmpp02_init.json", encoding="utf-8"))


def f(x):
    return repr(float(x))


def terms(amps, freqs):
    out = []
    for n in range(len(amps)):
        fr = freqs[n]
        out.append("T{amp:%s,f:[%s]}" % (f(amps[n]), ",".join(f(v) for v in fr)))
    return "&[" + ",".join(out) + "]"


lines = [
    "// @generated from ELP-MPP02 (ephem.js 'jpl'/DE405 fit, normal tier) — do not edit by hand.",
    "#![allow(clippy::approx_constant, clippy::excessive_precision, clippy::unreadable_literal, clippy::all)]",
    "use super::elpmpp02::{Term, Term as T};",
    "",
]

names = ["LON", "LAT", "DIST"]
# Main-problem series (one slice per coordinate).
for iv in range(3):
    lines.append(f"static {names[iv]}_MAIN: &[Term] = {terms(d['CMPB'][iv], d['FMPB'][iv])};")
lines.append("")
lines.append(f"pub static MAIN: [&[Term]; 3] = [{names[0]}_MAIN, {names[1]}_MAIN, {names[2]}_MAIN];")
lines.append("")

# Perturbation series (4 time-power groups per coordinate).
for iv in range(3):
    groups = d["CPER"][iv]
    fgroups = d["FPER"][iv]
    slice_names = []
    for it in range(4):
        if it < len(groups) and len(groups[it]) > 0:
            sname = f"{names[iv]}_P{it}"
            lines.append(f"static {sname}: &[Term] = {terms(groups[it], fgroups[it])};")
            slice_names.append(sname)
        else:
            slice_names.append("&[]")
    lines.append(f"static {names[iv]}_PERT: [&[Term]; 4] = [{', '.join(slice_names)}];")
    lines.append("")

lines.append(f"pub static PERT: [[&[Term]; 4]; 3] = [{names[0]}_PERT, {names[1]}_PERT, {names[2]}_PERT];")
lines.append("")
lines.append(f"pub static W0: [f64; 5] = [{', '.join(f(v) for v in d['w0'])}];")
lines.append("")

out_path = sys.argv[1]
io.open(out_path, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print("wrote", out_path, "bytes:", len("\n".join(lines)))
