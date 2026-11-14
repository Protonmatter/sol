#!/usr/bin/env python3
"""Compare native geocentric apparent directions with the retained JD/TT pack.

Exit0: all144 recorded directions pass the predeclared10/12-arcsecond budgets;
exit1: failed admission, scientific comparison, native calculation or I/O;
argparse uses2 for invalid usage. Offline only; no automatic qualification.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from validation_output import admit_report_path, write_report
import platform
import subprocess
import sys

from horizons_apparent import CASES, EPOCHS, MOON_ARCSEC, SUN_PLANET_ARCSEC, load_apparent_pack
from horizons_reference import _keys, _reject_constant, _unique

ROOT = Path(__file__).resolve().parents[1]
COMMAND = ['cargo', 'run', '--quiet', '--release', '--locked', '--offline', '-p',
           'solar-ephemeris', '--example', 'apparent_places']


def separation_arcsec(ra_a: float, dec_a: float, ra_b: float, dec_b: float) -> float:
    if not all(type(value) in (int, float) and math.isfinite(value) for value in (ra_a, dec_a, ra_b, dec_b)) \
            or not all(0 <= value < 360 for value in (ra_a, ra_b)) \
            or not all(-90 <= value <= 90 for value in (dec_a, dec_b)):
        raise ValueError('pointing comparison needs finite, bounded degree coordinates')
    def vector(ra: float, dec: float) -> tuple[float, float, float]:
        a, d = math.radians(ra), math.radians(dec)
        return math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)
    a, b = vector(ra_a, dec_a), vector(ra_b, dec_b)
    cross = (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
    return math.degrees(math.atan2(math.hypot(*cross), sum(x*y for x, y in zip(a, b)))) * 3600.0


def native_output() -> str:
    return subprocess.run(COMMAND, cwd=ROOT, capture_output=True, text=True, check=True, timeout=180).stdout


def _finite(value: object) -> bool:
    return type(value) in (int, float) and math.isfinite(value)


def parse_native(text: str) -> dict:
    # Consume only explicit geocentric fields. This is not a replacement for
    # the full v3 contract gate, which has separate native/browser coverage.
    if not isinstance(text, str) or len(text) > 4_000_000:
        raise ValueError('native apparent output is unavailable or oversized')
    lines = text.splitlines()
    if len(lines) != len(EPOCHS):
        raise ValueError('complete native apparent epoch matrix required')
    result = {}
    for line, jd in zip(lines, EPOCHS):
        row = json.loads(line, object_pairs_hook=_unique, parse_constant=_reject_constant)
        _keys(row, {'requested_jd_tt', 'tt_argument_error_seconds', 'snapshot'}, 'native apparent row')
        if not _finite(row['requested_jd_tt']) or row['requested_jd_tt'] != jd \
                or not _finite(row['tt_argument_error_seconds']) or abs(row['tt_argument_error_seconds']) > 0.001:
            raise ValueError('native apparent epoch/order/model argument differs')
        snapshot = row['snapshot']
        if not isinstance(snapshot, dict) or snapshot.get('schema_version') != 'ephemeris-snapshot.v4':
            raise ValueError('native apparent snapshot schema differs')
        timing, observer = snapshot.get('time'), snapshot.get('observer')
        if not isinstance(timing, dict) or not _finite(timing.get('jd_tt')) or not _finite(timing.get('jd_utc')) \
                or abs((timing['jd_tt'] - jd) * 86400 - row['tt_argument_error_seconds']) > 1e-9 \
                or not 1721425.5 <= timing['jd_utc'] < 5373484.5 \
                or not isinstance(observer, dict) or any(not _finite(observer.get(key)) or observer[key] != 0 for key in
                    ('terrestrial_lat_deg', 'terrestrial_lon_deg_east', 'elev_m')):
            raise ValueError('native snapshot TT/UTC or diagnostic observer binding differs')
        bodies = snapshot.get('bodies')
        if not isinstance(bodies, list) or not all(isinstance(body, dict) and isinstance(body.get('name'), str) for body in bodies):
            raise ValueError('native apparent body array differs')
        names = [body['name'] for body in bodies]
        if len(set(names)) != len(names) or not {case[1] for case in CASES}.issubset(names):
            raise ValueError('native apparent bodies are duplicated or incomplete')
        by_name = {body['name']: body for body in bodies}
        for case, name, _ in CASES:
            body = by_name[name]
            ra, dec = body.get('geocentric_apparent_ra_deg'), body.get('geocentric_apparent_dec_deg')
            if body.get('coordinate_frame') != 'true_equator_and_equinox_of_date' \
                    or not _finite(ra) or not _finite(dec) or not (0 <= ra < 360 and -90 <= dec <= 90):
                raise ValueError('native geocentric apparent frame/coordinates differ')
            result[(case, jd)] = ((ra, dec), row['tt_argument_error_seconds'])
    return result


def source_hashes() -> dict[str, str]:
    crate = ROOT / 'crates/solar-ephemeris'
    paths = list((crate / 'src').rglob('*.rs')) + list((crate / 'data').glob('*.bin'))
    paths += [crate / 'examples/apparent_places.rs', crate / 'data/horizons-apparent-20261104.csv',
              crate / 'Cargo.toml', ROOT / 'Cargo.lock', ROOT / 'Cargo.toml']
    paths += [ROOT / 'rust-toolchain.toml']
    return {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}


def validation_hashes() -> dict[str, str]:
    return {f'tools/{name}': hashlib.sha256((ROOT / 'tools' / name).read_bytes()).hexdigest()
            for name in ('validate_apparent.py', 'horizons_apparent.py', 'horizons_reference.py', 'validation_output.py')}


def validate(directory: Path) -> dict:
    pack = load_apparent_pack(directory); before = source_hashes(); validation_before = validation_hashes()
    actual = parse_native(native_output())
    if source_hashes() != before or validation_hashes() != validation_before:
        raise ValueError('sources changed during apparent comparison')
    records = []
    for jd in EPOCHS:
        for case, body, target in CASES:
            reference = pack.places[(case, jd)]; (ra, dec), argument_error = actual[(case, jd)]
            error = separation_arcsec(ra, dec, reference.ra_deg, reference.dec_deg)
            maximum = MOON_ARCSEC if body == 'Moon' else SUN_PLANET_ARCSEC
            records.append({'case': case, 'body': body, 'target_id': target, 'center_id': 399, 'jd_tt': jd,
                'reference_ra_deg': reference.ra_deg, 'reference_dec_deg': reference.dec_deg,
                'reference_icrf_ra_deg': reference.icrf_ra_deg, 'reference_icrf_dec_deg': reference.icrf_dec_deg,
                'reference_tdb_minus_ut_seconds': reference.tdb_minus_ut_seconds,
                'native_ra_deg': ra, 'native_dec_deg': dec, 'angular_error_arcsec': error,
                'maximum_error_arcsec': maximum, 'tt_argument_error_seconds': argument_error, 'passed': error <= maximum})
    return {'schema_version': 'geocentric-apparent-validation.v1', 'reference_mode': 'offline_replay',
        'reference_manifest_sha256': pack.manifest_sha256, 'native_command': COMMAND,
        'native_source_sha256': before, 'validation_source_sha256': validation_before,
        'host': {'system': platform.system(), 'machine': platform.machine()}, 'metric': 'great_circle_arcsec',
        'sun_planet_arcsec': SUN_PLANET_ARCSEC, 'moon_arcsec': MOON_ARCSEC,
        'matrix_size': len(records), 'passed': all(row['passed'] for row in records), 'records': records}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-dir', type=Path, default=ROOT / 'tests/fixtures/horizons-apparent-20261104')
    parser.add_argument('--report', type=Path, help='write only to a new file under build/ or coverage/')
    args = parser.parse_args(argv)
    try:
        target = admit_report_path(ROOT, args.report) if args.report else None
        report = validate(args.reference_dir)
        if target:
            write_report(ROOT, target, report)
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        print(f'Apparent validation failed: {exc}', file=sys.stderr)
        if isinstance(exc, subprocess.CalledProcessError): print(exc.stderr[-2000:], file=sys.stderr)
        return 1
    worst = max(report['records'], key=lambda row: row['angular_error_arcsec'])
    failed = sum(not row['passed'] for row in report['records'])
    print(f"{'PASS' if report['passed'] else 'FAIL'}: {report['matrix_size']} apparent directions; {failed} failures; "
          f"worst {worst['angular_error_arcsec']:.9f} arcseconds ({worst['body']} at JD/TT {worst['jd_tt']})")
    return 0 if report['passed'] else 1


if __name__ == '__main__': raise SystemExit(main())
