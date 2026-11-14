#!/usr/bin/env python3
"""Compare native v3 ranges with a verified, captured Horizons Q20 pack offline.

No network fallback. Requires a built sky CLI. Exit 0 means all recorded samples
pass the predeclared 10 ppm / 1 km budget; exit 1 means failed admission or a
numerical regression; argparse uses 2 for invalid usage. This does not qualify
continuous orbits, events, navigation or UI accuracy registry status.
"""
from __future__ import annotations

import argparse
import importlib.util
import math
from pathlib import Path
import subprocess
import sys
import urllib.parse

from horizons_ranges import ABSOLUTE_FLOOR_KM, RELATIVE_TOLERANCE, load_range_pack
from validate_ephemeris import BODIES, CASES, engine_snapshot, find_binary
from validation_output import admit_report_path, write_report

ROOT = Path(__file__).resolve().parents[1]


def provider_module():
    spec = importlib.util.spec_from_file_location('_sol_range_reference_provider', ROOT / 'services/ephemeris-server/server.py')
    module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
    return module


def expected_requests(provider) -> dict[tuple[str, str, str], str]:
    requests = {}
    for label, when, lat, lon, elev in CASES:
        for body, command in BODIES.items():
            for kind in ('observer', 'geocentric'):
                observer = kind == 'observer'
                params = provider._horizons_params(when, command, 'coord@399' if observer else '500@399',
                    '2,4,20' if observer else '2,20', f'{lon},{lat},{elev / 1000}' if observer else None)
                requests[(label, body, kind)] = provider.HORIZONS + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    return requests


def validate(binary: Path, directory: Path) -> dict:
    pack = load_range_pack(directory, expected_requests(provider_module()))
    records = []
    for label, when, lat, lon, elev in CASES:
        snapshot = engine_snapshot(binary, when, lat, lon, elev)
        bodies = {body['name']: body for body in snapshot['bodies']}
        for body in BODIES:
            for kind, field in [('geocentric', 'geocentric_range_km'), ('observer', 'observer_range_km')]:
                reference = pack.ranges[(label, body, kind)]; actual = bodies[body][field]
                if isinstance(actual, bool) or not isinstance(actual, (int, float)) or not math.isfinite(actual) or actual <= 0:
                    raise ValueError('native range must be finite and positive')
                residual = actual - reference; tolerance = max(ABSOLUTE_FLOOR_KM, RELATIVE_TOLERANCE * reference)
                records.append({'case': label, 'body': body, 'quantity': field, 'reference_range_km': reference,
                    'native_range_km': actual, 'error_km': residual, 'error_ppm': 1e6 * residual / reference,
                    'tolerance_km': tolerance, 'passed': abs(residual) <= tolerance})
    return {'schema_version': 'range-validation.v1', 'reference_mode': 'offline_replay',
            'reference_manifest_sha256': pack.manifest_sha256, 'matrix_size': len(records),
            'relative_range_tolerance': RELATIVE_TOLERANCE, 'absolute_floor_km': ABSOLUTE_FLOOR_KM,
            'passed': all(row['passed'] for row in records), 'records': records}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', help='path to the existing sky CLI')
    parser.add_argument('--reference-dir', type=Path, default=ROOT / 'tests/fixtures/horizons-ranges-20261103')
    parser.add_argument('--report', type=Path, help='write only to a new JSON file under build/ or coverage/')
    args = parser.parse_args()
    try:
        target = admit_report_path(ROOT, args.report) if args.report else None
        report = validate(find_binary(args.binary), args.reference_dir)
        if target:
            write_report(ROOT, target, report)
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        print(f'Range validation failed: {exc}', file=sys.stderr)
        return 1
    failures = [row for row in report['records'] if not row['passed']]
    for row in failures:
        print(f"FAIL {row['case']}/{row['body']}/{row['quantity']}: {row['error_km']:.6f} km, limit {row['tolerance_km']:.6f} km", file=sys.stderr)
    print(f"Range matrix: {len(report['records']) - len(failures)}/{len(report['records'])} passed; sampled evidence only")
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
