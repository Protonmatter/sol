#!/usr/bin/env python3
"""Replay all declared 1900–2200 model samples without network access.

Requires the existing Rust toolchain and offline workspace inputs. Observes an
exact source copy with a read-only appended entry point, without changing the
application's public interface. Separate original-API and worker parity remain
required for a release qualification. Exit 0: every sampled check passes;
1: failed admission/calculation/I/O or numerical checks; 2: invalid arguments.
An incomplete new output directory has no summary.json completion marker.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import logging
import math
from pathlib import Path
import platform
import re
import shutil
import subprocess
import time

import precision_window_reference as reference
from validate_apparent import separation_arcsec

ROOT = Path(__file__).resolve().parents[1]
MAX_NATIVE_BYTES = 16_000_000
HEADER = ['kind', 'case', 'jd_model', 'tt_argument_error_seconds', 'a', 'b', 'c']
COMMAND = ['cargo', 'run', '--quiet', '--release', '--locked', '--offline', '-p',
           'solar-ephemeris', '--bin', 'precision_model_probe', '--']
LOGGER = logging.getLogger(__name__)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_hashes() -> dict[str, str]:
    crate = ROOT / 'crates/solar-ephemeris'
    paths = [p for name in ('src', 'data') for p in (crate / name).rglob('*') if p.is_file()]
    paths += [ROOT / 'Cargo.toml', ROOT / 'Cargo.lock', crate / 'Cargo.toml', crate / 'README.md']
    paths += [ROOT / 'rust-toolchain.toml']
    if any(p.is_symlink() or not p.resolve().is_relative_to(ROOT) for p in paths):
        raise ValueError('source inputs must be ordinary repository files')
    return {p.relative_to(ROOT).as_posix(): sha(p) for p in sorted(paths)}


def validation_hashes() -> dict[str, str]:
    names = ('validate_precision_window.py', 'precision_window_reference.py', 'precision_model_probe.rs.txt',
             'validate_apparent.py', 'horizons_apparent.py', 'horizons_reference.py', 'validation_output.py')
    return {f'tools/{name}': sha(ROOT / 'tools' / name) for name in names}


def output_directory(path: Path) -> Path:
    target = path.resolve(); build = ROOT / 'build'
    if build.resolve() != build or not target.is_relative_to(build) or target == build \
            or target.exists() or path.is_symlink():
        raise ValueError('precision output needs a new directory under an unredirected build/')
    return target


def write_json(path: Path, value: object) -> None:
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, indent=2, allow_nan=False); stream.write('\n')


def observe(out: Path, before: dict[str, str]) -> dict:
    crate = out / 'crates/solar-ephemeris'; crate.mkdir(parents=True)
    original = ROOT / 'crates/solar-ephemeris'
    for name in ('src', 'data'): shutil.copytree(original / name, crate / name)
    for name in ('Cargo.toml', 'README.md'): shutil.copyfile(original / name, crate / name)
    shutil.copyfile(ROOT / 'rust-toolchain.toml', out / 'rust-toolchain.toml')
    workspace, count = re.subn(r'members = \[.*?\]', 'members = ["crates/solar-ephemeris"]',
                              (ROOT / 'Cargo.toml').read_text(encoding='utf-8'), count=1, flags=re.S)
    if count != 1: raise ValueError('workspace declaration unavailable')
    (out / 'Cargo.toml').write_text(workspace, encoding='utf-8', newline='\n')
    epochs = out / 'epochs.txt'
    epochs.write_text(''.join(f'{jd:.9f}\n' for jd in reference.EPOCHS), encoding='utf-8', newline='\n')
    source = (original / 'src/lib.rs').read_bytes()
    entry = (ROOT / 'tools/precision_model_probe.rs.txt').read_bytes()
    probe = crate / 'src/precision_model_probe.rs'; probe.write_bytes(source + entry)
    with (crate / 'Cargo.toml').open('a', encoding='utf-8', newline='\n') as stream:
        stream.write('\n[[bin]]\nname="precision_model_probe"\npath="src/precision_model_probe.rs"\n')
    copied = [name for name in before if '/src/' in name or '/data/' in name or name.endswith('/README.md')
              or name == 'rust-toolchain.toml']
    if any(sha(out / name) != before[name] for name in copied):
        raise ValueError('source copy correspondence differs')
    subprocess.run(['cargo', 'generate-lockfile', '--offline'], cwd=out, capture_output=True,
                   text=True, check=True, timeout=60)
    began = time.monotonic(); command = [*COMMAND, str(epochs)]
    with (out / 'native.csv').open('xb') as stream:
        result = subprocess.run(command, cwd=out, stdout=stream, stderr=subprocess.PIPE,
                                check=True, timeout=180)
    if (out / 'native.csv').stat().st_size > MAX_NATIVE_BYTES:
        raise ValueError('native output exceeds byte bound')
    if source_hashes() != before or any(sha(out / name) != before[name] for name in copied) \
            or probe.read_bytes() != source + entry:
        raise ValueError('owning source/copy changed during observation')
    receipt = {'schema_version': 'precision-native-source-observer.v1',
        'recorded_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'scope': 'Exact owning source copy plus read-only entry point; original-API and worker parity are separate requirements.',
        'command': command, 'epochs': len(reference.EPOCHS), 'expected_records': len(reference.EPOCHS) * 19,
        'elapsed_seconds': time.monotonic() - began, 'product_source_sha256': before,
        'appended_entry_sha256': hashlib.sha256(entry).hexdigest(), 'probe_source_sha256': sha(probe),
        'epochs_sha256': sha(epochs), 'native_csv_sha256': sha(out / 'native.csv'),
        'workspace_cargo_sha256': sha(out / 'Cargo.toml'), 'crate_cargo_sha256': sha(crate / 'Cargo.toml'),
        'lock_sha256': sha(out / 'Cargo.lock'),
        'rustc': subprocess.run(['rustc', '-vV'], capture_output=True, text=True, check=True, timeout=30).stdout,
        'stderr_utf8': result.stderr.decode('utf-8')}
    write_json(out / 'receipt.json', receipt)
    return receipt


def parse_native(text: str) -> dict:
    if len(text.encode('utf-8')) > MAX_NATIVE_BYTES: raise ValueError('native output exceeds byte bound')
    try: rows = list(csv.reader(io.StringIO(text), strict=True))
    except csv.Error as exc: raise ValueError('malformed native precision CSV') from exc
    expected = {('V', case[0], jd) for case in reference.VECTOR_CASES for jd in reference.EPOCHS} \
        | {('A', case[0], jd) for case in reference.APPARENT_CASES for jd in reference.EPOCHS}
    if not rows or rows[0] != HEADER or len(rows) != len(expected) + 1:
        raise ValueError('complete native precision matrix required')
    actual = {}
    for row in rows[1:]:
        if len(row) != 7 or any(reference._NUMBER.fullmatch(value) is None for value in row[2:]):
            raise ValueError('malformed native precision fields')
        jd, error, a, b, c = map(float, row[2:]); key = row[0], row[1], jd
        if key not in expected or key in actual or not all(math.isfinite(v) for v in (jd, error, a, b, c)) \
                or abs(error) > .001:
            raise ValueError('native identity/finite/clock differs')
        if row[0] == 'V' and not 0 < math.hypot(a, b, c) < math.inf:
            raise ValueError('native vector norm differs')
        if row[0] == 'A' and not (0 <= a < 360 and -90 <= b <= 90 and c > 0):
            raise ValueError('native apparent domains differ')
        actual[key] = (a, b, c, error)
    if set(actual) != expected: raise ValueError('native precision matrix differs')
    return actual


def comparisons(pack: reference.PrecisionReferencePack, actual: dict):
    expected = {('V', case, jd) for case, jd in pack.vectors} | {('A', case, jd) for case, jd in pack.apparent}
    if set(actual) != expected: raise ValueError('comparison matrix differs')
    for kind, case, jd in sorted(actual, key=lambda key: (key[2], key[0], key[1])):
        a, b, c, error = actual[(kind, case, jd)]
        source_kind = 'vectors' if kind == 'V' else 'apparent'
        epoch = pack.reference_epochs[(source_kind, case, jd)]
        if kind == 'V':
            truth = pack.vectors[(case, jd)]
            metrics = [('relative_vector_norm_arcsec', math.dist((a, b, c), truth) / math.hypot(*truth) * 206264.80624709636, 10.0)]
        else:
            place = pack.apparent[(case, jd)]; distance = place.range_au * 149597870.7
            truth = (place.ra_deg, place.dec_deg, distance)
            metrics = [('great_circle_arcsec', separation_arcsec(a, b, place.ra_deg, place.dec_deg), 12.0 if case == 'moon' else 10.0),
                       ('absolute_range_km', abs(c - distance), max(1.0, 1e-5 * distance))]
        for metric, value, maximum in metrics:
            if not math.isfinite(value): raise ValueError('nonfinite precision metric')
            yield {'kind': kind, 'case': case, 'jd_model': jd, 'reference_returned_jd': epoch.returned_jd,
                'epoch_offset_seconds': (epoch.returned_jd - jd) * 86400, 'tt_argument_error_seconds': error,
                'metric': metric, 'measured': value, 'maximum': maximum, 'budget_fraction': value / maximum, 'passed': value <= maximum,
                'native_a': a, 'native_b': b, 'native_c': c, 'reference_a': truth[0], 'reference_b': truth[1], 'reference_c': truth[2],
                'raw_sha256': pack.raw_hashes[(source_kind, case, jd)]}


def record_extrema(row: dict, maxima: dict, worst_budget_fraction: dict) -> None:
    """Keep absolute residual and distance-dependent budget utilization separate."""
    name = row['metric'] + ':' + row['case']
    if name not in maxima or row['measured'] > maxima[name]['measured']:
        maxima[name] = row
    if name not in worst_budget_fraction or row['budget_fraction'] > worst_budget_fraction[name]['budget_fraction']:
        worst_budget_fraction[name] = row


def validate(directory: Path, output: Path) -> dict:
    target = output_directory(output); pack = reference.load_precision_pack(directory)
    before = source_hashes(); validators = validation_hashes()
    target.mkdir(parents=True)
    observer = target / 'observer'; receipt = observe(observer, before)
    actual = parse_native((observer / 'native.csv').read_text(encoding='utf-8'))
    maxima = {}; worst_budget_fraction = {}; counts = {}; failures = []; total = 0
    with (target / 'all-comparisons.csv').open('x', encoding='utf-8', newline='') as stream:
        writer = None
        for row in comparisons(pack, actual):
            if writer is None:
                writer = csv.DictWriter(stream, fieldnames=list(row), lineterminator='\n'); writer.writeheader()
            writer.writerow(row); total += 1
            name = row['metric'] + ':' + row['case']; counts[name] = counts.get(name, 0) + 1
            record_extrema(row, maxima, worst_budget_fraction)
            if not row['passed']: failures.append(row)
    if source_hashes() != before or validation_hashes() != validators \
            or reference.load_precision_pack(directory).manifest_sha256 != pack.manifest_sha256:
        raise ValueError('model, validator or reference changed during comparison')
    report = {'schema_version': 'precision-window-model-validation.v1', 'reference_mode': 'offline_replay',
        'status': 'passed_sampled_model_checks' if not failures else 'failed_sampled_model_checks',
        'scope': 'Sampled model characterization; original-API, worker, observer/event and release qualification remain separate.',
        'recorded_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'reference_manifest_sha256': pack.manifest_sha256, 'native_source_sha256': before, 'validation_source_sha256': validators,
        'observer_receipt_sha256': sha(observer / 'receipt.json'), 'native_csv_sha256': receipt['native_csv_sha256'],
        'all_comparisons_sha256': sha(target / 'all-comparisons.csv'),
        'host': {'system': platform.system(), 'machine': platform.machine()}, 'acceptance': reference.ACCEPTANCE,
        'epochs': len(reference.EPOCHS), 'native_records': len(actual), 'checks': total, 'failure_count': len(failures),
        'passed': not failures, 'counts_by_metric_body': counts, 'maxima_by_metric_body': maxima,
        'worst_budget_fraction_by_metric_body': worst_budget_fraction, 'failures': failures}
    write_json(target / 'summary.json', report)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference-dir', type=Path, default=ROOT / 'tests/fixtures/horizons-precision-1900-2200-20261104')
    parser.add_argument('--out-dir', type=Path, required=True, help='new directory under build/')
    args = parser.parse_args(argv)
    try: report = validate(args.reference_dir, args.out_dir)
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        LOGGER.error('Precision validation failed: %s', exc)
        if isinstance(exc, subprocess.CalledProcessError): LOGGER.error('%s', str(exc.stderr)[-2000:])
        return 1
    LOGGER.info('%s: %d checks at %d model epochs; %d failures', 'PASS' if report['passed'] else 'FAIL',
                report['checks'], report['epochs'], report['failure_count'])
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    raise SystemExit(main())
