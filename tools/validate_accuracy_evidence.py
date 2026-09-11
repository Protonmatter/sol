#!/usr/bin/env python3
"""Re-run the bounded committed TOP2013 parity evidence (offline, no new packages)."""
from __future__ import annotations
import hashlib
import json
import math
import re
from pathlib import Path
import subprocess
import jsonschema_min

ROOT = Path(__file__).resolve().parents[1]

def main() -> int:
    catalog = json.loads((ROOT / "apps/web/data/accuracy-evidence.json").read_text())
    schema = json.loads((ROOT / "docs/accuracy-evidence-v1.schema.json").read_text())
    errors = list(jsonschema_min.validate(catalog, schema))
    if errors:
        raise ValueError(errors)
    output = subprocess.run(["cargo", "run", "--quiet", "--locked", "-p", "solar-ephemeris", "--example", "accuracy_evidence"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    rows = output.strip().splitlines()
    if len(rows) != len(catalog["records"]):
        raise ValueError("native evidence sample count differs")
    for record, row in zip(catalog["records"], rows):
        index, years, *xyz = map(float, row.split())
        reference = record["reference"]
        # Normalize line endings only, preserving every other source byte.
        source = (ROOT / reference["path"]).read_bytes().replace(b"\r\n", b"\n")
        if hashlib.sha256(source).hexdigest() != reference["sha256_lf"]:
            raise ValueError("immutable source literal identity differs")
        committed = {
            (int(i),float(t)): [float(value) for value in vector.split(",")]
            for i,t,vector in re.findall(r"\((\d+),\s*(-?\d+\.0),\s*\[([^\]]+)\]\)",source.decode("utf-8"))
        }
        if reference["vector_au"] != committed.get((int(index),years)):
            raise ValueError("record vector differs from the hashed committed source literal")
        archived = subprocess.run(["git","show",f"{reference['git_revision']}:{reference['path']}"],cwd=ROOT,check=True,capture_output=True).stdout.replace(b"\r\n",b"\n")
        if hashlib.sha256(archived).hexdigest() != reference["sha256_lf"]:
            raise ValueError("reference revision does not contain the identified source")
        assert record["body"] == ["Jupiter", "Saturn", "Uranus", "Neptune"][int(index)]
        assert record["tested_epochs_jd"] == [2451545 + years * 365.25]
        truth = reference["vector_au"]
        error = math.dist(xyz, truth) / math.hypot(*truth) * 206264.806
        if abs(error - record["measured_error"]["value"]) > 1e-12:
            raise ValueError(f"measured evidence drift: {record['id']}")
        if error >= record["measured_error"]["acceptance_threshold"]:
            raise ValueError(f"source-parity regression: {record['id']}")
    print(f"OK: {len(rows)} bounded source-theory parity records; no independent JPL accuracy claim")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
