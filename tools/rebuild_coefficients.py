#!/usr/bin/env python3
"""Rebuild pinned ephemeris tables offline into a new directory under build/.

Requires installed Node/TypeScript tooling and the exact four files in the
selected pinned profile, including LICENSE. No downloads, dependency installation,
production writes or distribution qualification are performed. Exit 0 means all
three reconstructed blobs match the pinned outputs. The default current profile
also requires equality to shipped bytes; legacy/candidate profiles report that
comparison separately. Exit 1 means admission, calculation, identity or I/O failed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import platform
import re
import struct
import subprocess
import sys
import tempfile
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'tools/ephemeris-data/coefficient-sources.json'
LEGACY_MANIFEST = ROOT / 'tests/fixtures/coefficient-sources-normal-20261103.json'
VSOP08_MANIFEST = ROOT / 'tools/ephemeris-data/coefficient-sources-vsop08.json'
VSOP_BODIES = ('mer', 'ven', 'emb', 'mar', 'jup', 'sat', 'ura', 'nep')
TOP_BODIES = ('jup', 'sat', 'ura', 'nep')


def _array(value: Any, size: int | None = None) -> list:
    if not isinstance(value, list) or len(value) > 100000 or (size is not None and len(value) != size):
        raise ValueError('invalid coefficient array shape')
    return value


def _float(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('coefficient must be finite numeric data')
    try:
        result = float(value)
    except OverflowError as exc:
        raise ValueError('coefficient exceeds binary64') from exc
    if not math.isfinite(result):
        raise ValueError('coefficient must be finite numeric data')
    return result


def _integer(value: Any, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError('coefficient integer is outside its encoded domain')
    return value


def pack_vsop2013(data: dict) -> bytes:
    output = io.BytesIO(); output.write(struct.pack('<I', len(VSOP_BODIES)))
    for body in VSOP_BODIES:
        planet = data[body]; gm = _float(planet['GM'])
        if gm <= 0:
            raise ValueError('planet GM must be positive')
        output.write(struct.pack('<d', gm))
        for element in ('a', 'L', 'k', 'h', 'q', 'p'):
            powers = _array(planet['coeffs'][element]); output.write(struct.pack('<I', len(powers)))
            for terms in powers:
                _array(terms)
                if len(terms) % 3:
                    raise ValueError('VSOP term must be s, c, phase pairs')
                output.write(struct.pack('<I', len(terms) // 3))
                for index in range(0, len(terms), 3):
                    s, c, phases = terms[index:index + 3]; _array(phases)
                    if len(phases) % 2:
                        raise ValueError('VSOP phases must contain index/multiplier pairs')
                    output.write(struct.pack('<ddI', _float(s), _float(c), len(phases) // 2))
                    for phase in range(0, len(phases), 2):
                        output.write(struct.pack('<Bh', _integer(phases[phase], 1, 17),
                                                 _integer(phases[phase + 1], -32768, 32767)))
    return output.getvalue()


def pack_elpmpp02(data: dict) -> bytes:
    output = io.BytesIO(); output.write(struct.pack('<5d', *map(_float, _array(data['w0'], 5))))
    def terms(amplitudes: Any, frequencies: Any) -> None:
        amplitudes = _array(amplitudes); frequencies = _array(frequencies, len(amplitudes))
        output.write(struct.pack('<I', len(amplitudes)))
        for amplitude, frequency in zip(amplitudes, frequencies):
            output.write(struct.pack('<6d', _float(amplitude), *map(_float, _array(frequency, 5))))
    for key in ('CMPB', 'FMPB', 'CPER', 'FPER'):
        _array(data[key], 3)
    for coordinate in range(3):
        terms(data['CMPB'][coordinate], data['FMPB'][coordinate])
    for coordinate in range(3):
        amplitudes = _array(data['CPER'][coordinate]); frequencies = _array(data['FPER'][coordinate], len(amplitudes))
        if len(amplitudes) > 4:
            raise ValueError('ELP has at most four perturbation powers')
        for power in range(4):
            terms(amplitudes[power] if power < len(amplitudes) else [],
                  frequencies[power] if power < len(frequencies) else [])
    return output.getvalue()


def pack_top2013(data: dict) -> bytes:
    frequencies = _array(data['freq'], 5)
    output = io.BytesIO(); output.write(struct.pack('<I', len(TOP_BODIES)))
    for index, body in enumerate(TOP_BODIES):
        output.write(struct.pack('<d', _float(frequencies[index])))
        for powers in _array(data[body]['coeffs'], 6):
            _array(powers); output.write(struct.pack('<I', len(powers)))
            for terms in powers:
                _array(terms)
                if len(terms) % 4:
                    raise ValueError('TOP term must contain multiplier, cosine, sine, period')
                output.write(struct.pack('<I', len(terms) // 4))
                for term in range(0, len(terms), 4):
                    multiplier, cosine, sine, period = terms[term:term + 4]
                    _float(period)  # source period is deliberately not part of the packed format
                    output.write(struct.pack('<idd', _integer(multiplier, -(2**31), 2**31 - 1),
                                             _float(cosine), _float(sine)))
    return output.getvalue()


def _read(path: Path, maximum: int) -> bytes:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > maximum:
        raise ValueError(f'coefficient input unavailable or oversized: {path.name}')
    with path.open('rb') as stream:
        raw = stream.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError(f'coefficient input oversized: {path.name}')
    return raw


def output_path(value: Path) -> Path:
    target = value.resolve()
    build_root = ROOT / 'build'
    if build_root.resolve() != ROOT.resolve() / 'build' \
            or value.is_symlink() or target == build_root.resolve() \
            or not target.is_relative_to(build_root.resolve()) or target.exists():
        raise ValueError('output must be a new directory under build/, never a production path')
    return target


def _unique(pairs: list[tuple[str, Any]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate coefficient manifest key')
        result[key] = value
    return result


def _load_manifest(profile: str = 'current') -> tuple[bytes, dict]:
    paths = {'current': MANIFEST, 'legacy-normal': LEGACY_MANIFEST, 'vsop08': VSOP08_MANIFEST}
    if profile not in paths:
        raise ValueError('unsupported coefficient profile')
    raw = _read(paths[profile], 65536); manifest = json.loads(raw, object_pairs_hook=_unique)
    if not isinstance(manifest, dict) or manifest.get('schema_version') not in ('coefficient-sources.v1','coefficient-sources.v2') \
            or manifest.get('upstream_repository') != 'https://github.com/THRASTRO/ephem.js' \
            or not re.fullmatch(r'[a-f0-9]{40}', str(manifest.get('upstream_revision', ''))):
        raise ValueError('unsupported coefficient manifest identity')
    if manifest['schema_version']=='coefficient-sources.v1':
        if manifest.get('tier')!='06-normal':
            raise ValueError('unsupported legacy coefficient tier')
        tiers = {family:'06-normal' for family in ('vsop2013','elpmpp02','top2013')}
    else:
        tiers = {'vsop2013':'08-big','elpmpp02':'06-normal',
                 'top2013':'08-big' if profile == 'current' else '06-normal'}
        if manifest.get('tier_by_family')!=tiers:
            raise ValueError('unsupported per-family coefficient tiers')
    if not isinstance(manifest.get('inputs'), dict) or not isinstance(manifest.get('outputs'), dict) \
            or set(manifest.get('inputs', {})) != {'vsop2013.js', 'elpmpp02.js', 'top2013.js', 'LICENSE'} \
            or set(manifest.get('outputs', {})) != {'vsop2013.bin', 'elpmpp02.bin', 'top2013.bin'}:
        raise ValueError('coefficient manifest must contain the complete input/output matrix')
    for name, record in manifest['inputs'].items():
        expected_path = 'LICENSE' if name == 'LICENSE' else f'src/{name[:-3]}/dist/{tiers[name[:-3]]}/src/{name}'
        if not isinstance(record, dict) or record.get('path') != expected_path or not re.fullmatch(r'[a-f0-9]{40}', str(record.get('git_blob', ''))):
            raise ValueError('invalid upstream coefficient path or Git identity')
    for name, record in [*manifest['inputs'].items(), *manifest['outputs'].items()]:
        family = name[:-3] if name.endswith('.js') else None
        limit = 3145728 if family in ('vsop2013','top2013') and tiers[family]=='08-big' else 1048576
        if not isinstance(record, dict) or type(record.get('bytes')) is not int or not 0 < record['bytes'] <= limit \
                or not re.fullmatch(r'[a-f0-9]{64}', str(record.get('sha256', ''))):
            raise ValueError('invalid coefficient byte budget or SHA-256 identity')
    helper = manifest.get('lunar_initializer', {})
    if not isinstance(helper, dict) or helper.get('path') != 'tools/ephemeris-data/dump_elp.js' \
            or not re.fullmatch(r'[a-f0-9]{64}', str(helper.get('sha256_lf', ''))):
        raise ValueError('invalid lunar initializer identity')
    return raw, manifest


def _run(arguments: list[str], cwd: Path) -> str:
    return subprocess.run(arguments, cwd=cwd, check=True, capture_output=True,
                          text=True, timeout=30).stdout


def rebuild(source_dir: Path, output_dir: Path, *, profile: str = 'current') -> dict:
    target = output_path(output_dir)
    manifest_raw, manifest = _load_manifest(profile)
    source = source_dir.resolve()
    inputs: dict[str, bytes] = {}
    for name, record in manifest['inputs'].items():
        if name not in ('vsop2013.js', 'elpmpp02.js', 'top2013.js', 'LICENSE'):
            raise ValueError('unsupported coefficient input')
        raw = _read(source / name, record['bytes'])
        blob = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
        if len(raw) != record['bytes'] or hashlib.sha256(raw).hexdigest() != record['sha256'] or blob != record['git_blob']:
            raise ValueError(f'upstream coefficient identity differs: {name}')
        inputs[name] = raw
    helper = ROOT / manifest['lunar_initializer']['path']
    helper_raw = _read(helper, 65536).replace(b'\r\n', b'\n')
    if hashlib.sha256(helper_raw).hexdigest() != manifest['lunar_initializer']['sha256_lf']:
        raise ValueError('lunar initializer identity differs')
    extractor = ROOT / 'tools/ephemeris-data/extract_coefficient_literals.mjs'
    extractor_raw = _read(extractor, 65536).replace(b'\r\n', b'\n')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='coefficient-rebuild-', dir=target.parent) as folder:
        work = Path(folder)
        verified_source = work / 'upstream'; verified_source.mkdir()
        for name, raw in inputs.items():
            (verified_source / name).write_bytes(raw)
        verified_extractor = work / 'extract_coefficient_literals.mjs'; verified_extractor.write_bytes(extractor_raw)
        verified_helper = work / 'dump_elp.cjs'; verified_helper.write_bytes(helper_raw)
        data = {family: json.loads(_run(['node', str(verified_extractor), family, str(verified_source / (family + '.js'))], ROOT))
                for family in ('vsop2013', 'elpmpp02', 'top2013')}
        # The existing helper executes only this generated, numeric-literal input,
        # never upstream JavaScript. Preserve its original initializer arithmetic.
        lunar_input = 'STATE(null,"jpl",2,' + json.dumps(data['elpmpp02']['coeffs'], allow_nan=False) + ');\n'
        (work / 'elpmpp02_numeric_input.js').write_text(lunar_input, encoding='utf-8', newline='\n')
        javascript = ('process.argv[2]="elpmpp02_numeric_input.js";'
                      'require("vm").runInThisContext(require("fs").readFileSync('
                      + json.dumps(str(verified_helper)) + ',"utf8"));')
        _run(['node', '--input-type=commonjs', '-e', javascript], work)
        lunar = json.loads(_read(work / 'elpmpp02_init.json', 1048576))
        blobs = {'vsop2013.bin': pack_vsop2013(data['vsop2013']), 'elpmpp02.bin': pack_elpmpp02(lunar),
                 'top2013.bin': pack_top2013(data['top2013'])}
        outputs = {}
        for name, raw in blobs.items():
            expected = manifest['outputs'][name]; digest = hashlib.sha256(raw).hexdigest()
            current = _read(ROOT / 'crates/solar-ephemeris/data' / name, 1048576)
            if len(raw) != expected['bytes'] or digest != expected['sha256'] or (profile=='current' and raw != current):
                raise ValueError(f'reconstructed coefficient bytes differ: {name}')
            outputs[name] = {'bytes': len(raw), 'sha256': digest, 'matches_shipped': raw==current}
        report = {'schema_version': 'coefficient-rebuild.v1', 'status': 'exact_byte_reconstruction_local',
                  'profile': profile, 'upstream_repository': manifest['upstream_repository'], 'upstream_revision': manifest['upstream_revision'],
                  'manifest_sha256': hashlib.sha256(manifest_raw).hexdigest(),
                  'extractor_sha256_lf': hashlib.sha256(extractor_raw).hexdigest(),
                  'serializer_sha256_lf': hashlib.sha256(_read(Path(__file__), 65536).replace(b'\r\n', b'\n')).hexdigest(),
                  'lunar_initializer_sha256_lf': manifest['lunar_initializer']['sha256_lf'],
                  'completed_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
                  'runtime': {'python': platform.python_version(), 'node': _run(['node', '--version'], ROOT).strip(),
                              'system': platform.system(), 'machine': platform.machine()},
                  'scientific_qualification': 'source_correspondence_only',
                  'distribution_qualification': 'held_upstream_notice_correspondence_review', 'outputs': outputs}
        # mkdir reserves the destination without replacing even an empty directory
        # on POSIX. report.json is written last and marks a complete candidate.
        # I/O failure may leave a clearly incomplete new output; never remove it or
        # overwrite any existing artifact during recovery.
        target.mkdir()
        for name, raw in blobs.items():
            with (target / name).open('xb') as stream:
                stream.write(raw)
        (target / 'upstream').mkdir()
        for name, raw in inputs.items():
            with (target / 'upstream' / name).open('xb') as stream:
                stream.write(raw)
        with (target / 'source-manifest.json').open('xb') as stream:
            stream.write(manifest_raw)
        with (target / 'report.json').open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(json.dumps(report, indent=2) + '\n')
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', required=True, type=Path, help='directory containing the four exact upstream files')
    parser.add_argument('--out-dir', required=True, type=Path, help='new output directory under build/')
    parser.add_argument('--profile', choices=('current','legacy-normal','vsop08'), default='current',
                        help='pinned profile; only current requires equality to the currently shipped tables')
    args = parser.parse_args()
    try:
        report = rebuild(args.source_dir, args.out_dir, profile=args.profile)
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        print(f'Coefficient reconstruction failed: {exc}', file=sys.stderr)
        return 1
    print(f'OK: three exact pinned coefficient reconstructions ({args.profile}); source correspondence only; distribution remains held')
    print(json.dumps(report['outputs'], sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
