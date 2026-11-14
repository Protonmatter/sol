#!/usr/bin/env python3
"""Re-run bounded TOP2013 source parity, retaining historical reference checks."""
from __future__ import annotations
import hashlib
import json
import math
import re
from pathlib import Path
import subprocess
import jsonschema_min

ROOT = Path(__file__).resolve().parents[1]
BODIES = ("Jupiter", "Saturn", "Uranus", "Neptune")
SAMPLES = tuple((index, years) for index in range(4) for years in (5000.0, -5000.0))
SOURCE_PATH = "crates/solar-ephemeris/src/top2013.rs"
UPSTREAM_REFERENCE = {
    "git_revision": "2f679a1f698b4f20f9579d94da24af51559458ed",
    "path": "src/top2013/dist/08-big/src/top2013.js",
    "sha256_lf": "c75e7f713d7e5b1bea1278efeb62b06236098754c6db49717700ae61b6f5ab15",
    "symbol": "top2k_theory",
}
UPSTREAM_BLOB = "e44c705f4f569db31211c6fead7bf3a56c050c6c"


def validate_metadata(records: list[dict]) -> None:
    """This executable reproduces exactly the current TOP2013 parity matrix."""
    if len(records) != len(SAMPLES):
        raise ValueError("evidence must contain the complete eight-sample source-parity matrix")
    ids: set[str] = set()
    expected = {"method": "source_theory_parity", "quantity": "heliocentric_ecliptic_j2000_position",
                "time_scale": "TT_model_argument", "observer_domain": "not_applicable_heliocentric"}
    for record, (index, years) in zip(records, SAMPLES):
        identity = record["id"]
        if not identity.strip() or identity in ids:
            raise ValueError("evidence record IDs must be nonblank and unique")
        ids.add(identity)
        for key, value in expected.items():
            if record[key] != value:
                raise ValueError(f"{identity}: unsupported {key}; this validator proves source parity only")
        if record["body"] != BODIES[index] or record["tested_epochs_jd"] != [2451545 + years * 365.25]:
            raise ValueError(f"{identity}: body or epoch differs from the native sample")
        reference, measured = record["reference"], record["measured_error"]
        if reference["path"] == SOURCE_PATH:
            if reference["symbol"] != "tests::matches_top2013_source_deep_time":
                raise ValueError(f"{identity}: unsupported historical source symbol")
        elif any(reference.get(key) != value for key, value in UPSTREAM_REFERENCE.items()):
            raise ValueError(f"{identity}: unsupported immutable upstream reference")
        if not re.fullmatch(r"[0-9a-fA-F]{40}", reference["git_revision"]) or not re.fullmatch(r"[0-9a-fA-F]{64}", reference["sha256_lf"]):
            raise ValueError(f"{identity}: malformed immutable reference identity")
        if len(reference["vector_au"]) != 3 or math.hypot(*reference["vector_au"]) == 0:
            raise ValueError(f"{identity}: relative vector metric requires a nonzero three-component reference")
        if measured["metric"] != "relative_vector_norm_arcsec" or measured["acceptance_threshold"] != 0.5:
            raise ValueError(f"{identity}: metric or threshold differs from the supported source-parity gate")


def source_vectors(source: bytes) -> dict[tuple[int, float], list[float]]:
    """Extract only the named, complete source-parity literal matrix.

    The archived file's full hash remains immutable. Current documentation may
    change, but its actual test literals must still match that archived matrix.
    Native output is independently compared below, so this is not code approval.
    """
    blocks = re.findall(r"^    fn matches_top2013_source_deep_time\(\) \{\n(.*?)^    \}",
                        source.decode('utf-8'), re.M | re.S)
    if len(blocks) != 1:
        raise ValueError('source must contain exactly one named parity matrix')
    rows = re.findall(r"\((\d+),\s*(-?\d+\.0),\s*\[([^\]]+)\]\)", blocks[0])
    result = {}
    for index, years, vector in rows:
        key = (int(index), float(years)); xyz = [float(value) for value in vector.split(',')]
        if key in result or len(xyz) != 3 or not all(math.isfinite(value) for value in xyz):
            raise ValueError('source parity literals must be unique finite vectors')
        result[key] = xyz
    if len(rows) != len(SAMPLES) or set(result) != set(SAMPLES):
        raise ValueError('source parity literal matrix is incomplete')
    return result


def source_cartesian(elements: list[float]) -> list[float]:
    """Standard elliptic reduction, independent of the Rust converter under test."""
    if not isinstance(elements, (list, tuple)) or len(elements) != 6 or any(isinstance(v, bool) or not isinstance(v, (int, float))
                                 or not math.isfinite(v) for v in elements):
        raise ValueError('Six finite source elements required')
    a, longitude, k, h, q, p = elements
    eccentricity = math.hypot(k, h)
    if a <= 0 or eccentricity >= 1 or math.hypot(q, p) > 1:
        raise ValueError('Unsupported source orbit')
    perihelion, node = math.atan2(h, k), math.atan2(p, q)
    inclination = 2 * math.asin(math.hypot(q, p))
    omega, mean = perihelion - node, longitude - perihelion
    eccentric = mean
    for _ in range(50):
        delta = (eccentric - eccentricity * math.sin(eccentric) - mean) / (1 - eccentricity * math.cos(eccentric))
        eccentric -= delta
        if abs(delta) < 1e-14:
            break
    else:
        raise ValueError('Source Kepler reduction did not converge')
    x, y = a * (math.cos(eccentric) - eccentricity), a * math.sqrt(1 - eccentricity**2) * math.sin(eccentric)
    co, so, cn, sn = math.cos(omega), math.sin(omega), math.cos(node), math.sin(node)
    ci, si = math.cos(inclination), math.sin(inclination)
    vector = [(co*cn-so*sn*ci)*x+(-so*cn-co*sn*ci)*y,
              (co*sn+so*cn*ci)*x+(-so*sn+co*cn*ci)*y, so*si*x+co*si*y]
    if not all(math.isfinite(v) for v in vector):
        raise ValueError('Nonfinite source vector')
    return [round(v, 8) for v in vector]


def upstream_vectors() -> dict[tuple[int, float], list[float]]:
    """Evaluate only the fixed, hash-bound preferred-source element function."""
    output = subprocess.run(['node', str(ROOT/'tools/top2013_source_reference.mjs')], cwd=ROOT,
                            check=True, capture_output=True, text=True, encoding='utf-8', timeout=30).stdout
    document = json.loads(output)
    if not isinstance(document, dict) or document.get('schema_version') != 'top2013-source-elements.v1' \
            or document.get('source') != {**UPSTREAM_REFERENCE, 'git_blob': UPSTREAM_BLOB} \
            or not isinstance(document.get('samples'), list) or len(document['samples']) != len(SAMPLES):
        raise ValueError('Source reference identity or complete sample set differs')
    vectors = {}
    for sample, (index, years) in zip(document['samples'], SAMPLES):
        if not isinstance(sample, dict) or set(sample) != {'index', 'years', 'elements'} \
                or isinstance(sample.get('index'), bool) or isinstance(sample.get('years'), bool) \
                or sample.get('index') != index or sample.get('years') != years:
            raise ValueError('Source reference sample binding differs')
        vectors[(index, years)] = source_cartesian(sample['elements'])
    return vectors


def main() -> int:
    catalog = json.loads((ROOT / "apps/web/data/accuracy-evidence.json").read_text())
    schema = json.loads((ROOT / "docs/accuracy-evidence-v1.schema.json").read_text())
    errors = list(jsonschema_min.validate(catalog, schema))
    if errors:
        raise ValueError(errors)
    validate_metadata(catalog["records"])
    upstream = upstream_vectors() if any(record['reference']['path'] == UPSTREAM_REFERENCE['path']
                                       for record in catalog['records']) else None
    output = subprocess.run(["cargo", "run", "--quiet", "--locked", "--offline", "-p", "solar-ephemeris", "--example", "accuracy_evidence"], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    rows = output.strip().splitlines()
    if len(rows) != len(catalog["records"]):
        raise ValueError("native evidence sample count differs")
    for record, row, expected_sample in zip(catalog["records"], rows, SAMPLES):
        values = list(map(float, row.split()))
        if len(values) != 5 or not all(math.isfinite(value) for value in values):
            raise ValueError(f"native sample must contain five finite numbers: {record['id']}")
        index, years, *xyz = values
        if (index, years) != expected_sample:
            raise ValueError(f"native sample identity differs: {record['id']}")
        reference = record["reference"]
        # The reference identifies this immutable historical file, not today's
        # comments. Normalize only line endings before its full-file hash check.
        if reference['path'] == SOURCE_PATH:
            archived = subprocess.run(["git","show",f"{reference['git_revision']}:{reference['path']}"],cwd=ROOT,check=True,capture_output=True).stdout.replace(b"\r\n",b"\n")
            if hashlib.sha256(archived).hexdigest() != reference["sha256_lf"]:
                raise ValueError("reference revision does not contain the identified source")
            expected_vectors = source_vectors(archived)
        else:
            expected_vectors = upstream
        current = (ROOT / SOURCE_PATH).read_bytes().replace(b'\r\n', b'\n')
        if source_vectors(current) != expected_vectors:
            raise ValueError('current parity literals differ from the immutable reference')
        if reference['vector_au'] != expected_vectors[(int(index), years)]:
            raise ValueError('record vector differs from the hashed committed source literal')
        truth = reference["vector_au"]
        error = math.dist(xyz, truth) / math.hypot(*truth) * 206264.806
        if not math.isfinite(error):
            raise ValueError(f"nonfinite measured source-parity error: {record['id']}")
        if abs(error - record["measured_error"]["value"]) > 1e-12:
            raise ValueError(f"measured evidence drift: {record['id']}")
        if error >= record["measured_error"]["acceptance_threshold"]:
            raise ValueError(f"source-parity regression: {record['id']}")
    print(f"OK: {len(rows)} bounded source-theory parity records; no independent JPL accuracy claim")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
