#!/usr/bin/env python3
"""Compare the actual native System f64 ABI with retained geometric vectors offline.

Exit 0: all recorded vectors meet the predeclared full-vector budget; 1: failed
admission, numerical gate or I/O; 2: invalid arguments. No network fallback,
dependency installation, source mutation or automatic UI qualification.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import platform
from pathlib import Path
from validation_output import admit_report_path, write_report
import subprocess
import sys

from horizons_vectors import CASES, EPOCHS, ARCSEC_PER_RADIAN, MAXIMUM_ERROR, _NUMBER, load_vector_pack

ROOT = Path(__file__).resolve().parents[1]
COMMAND = ['cargo', 'run', '--quiet', '--locked', '--offline', '-p', 'solar-ephemeris', '--example', 'geometric_vectors']


def native_output() -> str:
    return subprocess.run(COMMAND, cwd=ROOT, capture_output=True, text=True, check=True, timeout=120).stdout


def parse_native(text: str) -> dict:
    try:
        rows = list(csv.reader(io.StringIO(text), strict=True))
    except csv.Error as exc:
        raise ValueError('malformed native vector output') from exc
    if not rows or rows[0] != ['case', 'jd_tdb', 'tt_argument_error_seconds', 'x_au', 'y_au', 'z_au'] \
            or len(rows) != len(CASES) * len(EPOCHS) + 1:
        raise ValueError('complete native vector matrix required')
    expected = {(case[0], jd) for case in CASES for jd in EPOCHS}; result = {}
    for row in rows[1:]:
        if len(row) != 6 or any(_NUMBER.fullmatch(value) is None for value in row[1:]):
            raise ValueError('native vector fields must be complete numeric tokens')
        jd, error, *xyz = map(float, row[1:]); key = (row[0], jd)
        if key not in expected or key in result or not all(math.isfinite(value) for value in (jd, error, *xyz)) \
                or abs(error) > 0.001 or not 0 < math.hypot(*xyz) < math.inf:
            raise ValueError('native vector identity, finite coordinates or dynamical argument differs')
        result[key] = (tuple(xyz), error)
    if set(result) != expected:
        raise ValueError('native vector matrix incomplete')
    return result


def source_hashes() -> dict[str, str]:
    crate = ROOT / 'crates/solar-ephemeris'
    paths = list((crate / 'src').rglob('*.rs')) + list((crate / 'data').glob('*.bin'))
    paths += [crate / 'examples/geometric_vectors.rs', crate / 'data/horizons-vectors-20261104.csv',
              crate / 'Cargo.toml', ROOT / 'Cargo.lock', ROOT / 'Cargo.toml']
    paths += [ROOT / 'rust-toolchain.toml']
    return {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}


def validation_hashes() -> dict[str, str]:
    return {f'tools/{name}': hashlib.sha256((ROOT / 'tools' / name).read_bytes()).hexdigest()
            for name in ('validate_vectors.py', 'horizons_vectors.py', 'horizons_reference.py', 'validation_output.py')}


def validate(directory: Path) -> dict:
    pack = load_vector_pack(directory); before = source_hashes(); validation_before = validation_hashes()
    actual = parse_native(native_output())
    if source_hashes() != before or validation_hashes() != validation_before:
        raise ValueError('native sources changed during vector comparison')
    records = []
    for jd in EPOCHS:
        for key, body, target, center in CASES:
            reference = pack.vectors[(key, jd)]; xyz, error = actual[(key, jd)]
            ref_norm, norm = math.hypot(*reference), math.hypot(*xyz)
            full = math.hypot(*(a-b for a, b in zip(xyz, reference))) / ref_norm * ARCSEC_PER_RADIAN
            u, v = [value/norm for value in xyz], [value/ref_norm for value in reference]
            cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
            angle = math.atan2(math.hypot(*cross), sum(a*b for a, b in zip(u, v))) * ARCSEC_PER_RADIAN
            radial = (norm/ref_norm-1)*1e6
            if not all(math.isfinite(value) for value in (full, angle, radial)):
                raise ValueError('native vector metrics are nonfinite')
            records.append({'case': key, 'body': body, 'target_id': target, 'center_id': center, 'jd_tdb': jd,
                'reference_vector_au': reference, 'native_vector_au': xyz, 'relative_vector_norm_arcsec': full,
                'angular_error_arcsec': angle, 'radial_error_ppm': radial,
                'tt_argument_error_seconds': error, 'passed': full <= MAXIMUM_ERROR})
    return {'schema_version': 'geometric-vector-validation.v1', 'reference_mode': 'offline_replay',
            'reference_manifest_sha256': pack.manifest_sha256, 'native_command': COMMAND,
            'native_source_sha256': before, 'validation_source_sha256': validation_before,
            'host': {'system': platform.system(), 'machine': platform.machine()},
            'metric': 'relative_vector_norm_arcsec',
            'maximum_error': MAXIMUM_ERROR, 'matrix_size': len(records),
            'passed': all(row['passed'] for row in records), 'records': records}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-dir', type=Path, default=ROOT / 'tests/fixtures/horizons-vectors-20261104')
    parser.add_argument('--report', type=Path, help='write only to a new file under build/ or coverage/')
    args = parser.parse_args(argv)
    try:
        target = admit_report_path(ROOT, args.report) if args.report else None
        report = validate(args.reference_dir)
        if target:
            write_report(ROOT, target, report)
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        print(f'Vector validation failed: {exc}', file=sys.stderr)
        if isinstance(exc, subprocess.CalledProcessError): print(exc.stderr[-2000:], file=sys.stderr)
        return 1
    worst = max(report['records'], key=lambda row: row['relative_vector_norm_arcsec'])
    print(f"{'PASS' if report['passed'] else 'FAIL'}: {report['matrix_size']} geometric vectors; "
          f"worst {worst['relative_vector_norm_arcsec']:.9f} arcsecond-equivalent "
          f"({worst['case']} at JD/TDB {worst['jd_tdb']}); budget {MAXIMUM_ERROR}")
    return 0 if report['passed'] else 1


if __name__ == '__main__': raise SystemExit(main())
