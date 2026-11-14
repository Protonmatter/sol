#!/usr/bin/env python3
"""Read-only JSON evidence for one native pinned-image moon comparison.

Run in the manifest's exact Linux x86_64 CPython image. The trusted launcher
must inspect/pin that image and supply SOL_MOON_GENERATOR_IMAGE_DIGEST; this
environment assertion alone is not container attestation. No network or writes
are performed by comparison mode. Pending qualification is never promoted.
--snapshot creates only a bounded input copy under build/ for a read-only
container mount, excluding .git and credentials.
Exit 0: comparison passed (possibly still pending); 1: comparison failed;
2: runtime/image/source admission refused. See docs/CANONICAL_GENERATION.md.
"""
from __future__ import annotations

import contextlib
import argparse
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys

import generate_moons as generator
import validate_moons as validator

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = ('apps/web/js/moons.js', 'apps/web/js/moonelements.js')
INPUTS = ('tools/generate_moons.py', 'tools/moon_model.py', 'tools/validate_moons.py',
          'tools/collect_moon_evidence.py', 'tools/ephemeris-data/generation-manifest.json',
          'tools/ephemeris-data/moons/horizons_satellite_elements.csv',
          'tools/ephemeris-data/moons/horizons_satellite_vectors.csv',
          'tools/ephemeris-data/moons/jpl_satellite_physical.csv', *OUTPUTS)


def input_bytes() -> dict[str, bytes]:
    result = {}
    for name in INPUTS:
        path = ROOT / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 32 * 1024 * 1024:
            raise ValueError('moon evidence input unavailable, redirected or oversized')
        with path.open('rb') as stream:
            raw = stream.read(32 * 1024 * 1024 + 1)
        if len(raw) > 32 * 1024 * 1024:
            raise ValueError('moon evidence input exceeds its byte budget')
        result[name] = raw
    return result


def fingerprints() -> dict[str, str]:
    return {name: hashlib.sha256(raw).hexdigest() for name, raw in input_bytes().items()}


def snapshot(destination: Path) -> dict:
    generator.verify_source_identity(generator.load_generation_manifest())
    target = destination.resolve(); build_root = ROOT / 'build'
    if build_root.resolve() != ROOT.resolve() / 'build' or destination.is_symlink() \
            or not target.is_relative_to(build_root.resolve()) or target.exists():
        raise ValueError('snapshot must use a new directory under build/')
    sources = input_bytes()
    target.mkdir(parents=True)
    for name, raw in sources.items():
        path = target / name; path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as stream:
            stream.write(raw)
    before = {name: hashlib.sha256(raw).hexdigest() for name, raw in sources.items()}
    if fingerprints() != before:
        raise ValueError('sources changed while preparing the snapshot; preserve incomplete output')
    return {'schema_version': 'canonical-moon-inputs.v1', 'snapshot_created': True,
            'qualification_granted': False, 'source_sha256': before}


def collect() -> dict:
    manifest = generator.load_generation_manifest()
    generator.verify_source_identity(manifest)
    canonical = manifest['canonical']; runtime = generator.runtime_identity()
    digest = os.environ.get('SOL_MOON_GENERATOR_IMAGE_DIGEST')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', str(canonical.get('image_digest', ''))) or digest != canonical['image_digest']:
        raise ValueError('trusted launcher must assert the exact pinned image digest')
    if runtime['system'] != 'Linux' or runtime['machine'] not in ('x86_64', 'amd64') \
            or runtime['implementation'] != 'CPython' or runtime['python_version'] != canonical['python_version']:
        raise ValueError('native pinned Linux x86_64 CPython runtime required')
    if canonical['status'] not in ('pending', 'qualified'):
        raise ValueError('unsupported canonical qualification state')
    if canonical['status'] == 'qualified' and generator.canonical_errors(manifest, runtime, digest):
        raise ValueError('recorded qualification conditions are incomplete')
    revision = os.environ.get('GITHUB_SHA')
    if revision is not None and re.fullmatch(r'[a-f0-9]{40}', revision) is None:
        raise ValueError('source revision must be a complete Git SHA')
    if set(manifest['outputs']) != set(OUTPUTS):
        raise ValueError('both authoritative outputs must be pinned')
    before = fingerprints()
    built = generator.build()
    if len(built) != len(OUTPUTS) or not all(isinstance(text, str) for text in built):
        raise ValueError('generator must return exactly two UTF-8 module strings')
    generated = {name: hashlib.sha256(text.encode('utf-8')).hexdigest() for name, text in zip(OUTPUTS, built)}
    log = io.StringIO()
    with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
        numerical_exit = validator.main(['--require-canonical'] if canonical['status'] == 'qualified' else [])
    after = fingerprints()
    committed = {name: after[name] for name in OUTPUTS}
    passed = before == after and generated == manifest['outputs'] == committed and numerical_exit == 0
    return {'schema_version': 'canonical-moon-evidence.v1',
            'status': 'comparison_passed' if passed else 'comparison_failed',
            'comparison_passed': passed, 'qualification_status': canonical['status'],
            'qualification_granted': False, 'source_revision': revision,
            'completed_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
            'runtime': runtime, 'launcher_asserted_image_digest': digest,
            'scope': 'One full source/output/numerical comparison; two fresh native image runs and independent review are still required for qualification.',
            'source_sha256_before': before, 'source_sha256_after': after,
            'generated_sha256': generated, 'committed_sha256': committed,
            'numerical_validator_exit': numerical_exit, 'validator_log': log.getvalue()}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, help='copy only fixed public inputs into a new build directory; does not qualify them')
    args = parser.parse_args(argv)
    try:
        report = snapshot(args.snapshot) if args.snapshot is not None else collect()
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print(json.dumps({'schema_version': 'canonical-moon-evidence.v1', 'status': 'refused',
                          'comparison_passed': False, 'qualification_granted': False,
                          'error': str(exc)}, allow_nan=False))
        return 2
    print(json.dumps(report, indent=2, allow_nan=False))
    return 0 if report.get('snapshot_created') or report['comparison_passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
