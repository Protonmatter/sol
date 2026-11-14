"""Bind trusted local Cargo outputs to exact workspace source materials.

This catches accidental stale/cross-source packaging. The unsigned receipt is
not compiler attestation, a hermetic build recipe or scientific qualification.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
from typing import Any

RECEIPT_NAME = 'wasm-build.v1.json'
BUILD_PROFILE = 'wasm-release'
# Receipts written before the dedicated browser profile existed name Cargo's plain
# release profile. They stay readable only for the root manifest that had no browser
# profile to select; exact source/output binding still applies. A plain release build of
# any later manifest optimizes the ephemeris for size and must not pass as a receipt.
LEGACY_PROFILE = 'release'
LEGACY_PROFILE_MANIFESTS = frozenset({
    '98f5c3251cdc1e4f37011ead4c9bc510bd0cd36e5ccecf8f3a540109082e6b34',  # Cargo.toml through 02aaec8
})
SUPPORTED_PROFILES = (LEGACY_PROFILE, BUILD_PROFILE)
WASM_FILES = ('solar_wasm.wasm', 'solar_ephemeris.wasm')
CRATES = ('solar-core', 'solar-wasm', 'solar-ephemeris')
ROOT_FILES = ('Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml',
              'tools/build_wasm.py', 'tools/wasm_provenance.py')
ESSENTIAL_INPUTS = frozenset(ROOT_FILES) | {f'crates/{crate}/{name}' for crate in CRATES
                                         for name in ('Cargo.toml', 'src/lib.rs')}
MAX_RECEIPT_BYTES = 1024 * 1024
MAX_SOURCE_FILES = 10_000
MAX_SOURCE_BYTES = 128 * 1024 * 1024
MAX_WASM_BYTES = 64 * 1024 * 1024
EXCLUDED = {'target', 'build', 'fuzz', '__pycache__'}
SHA256 = re.compile(r'[0-9a-f]{64}\Z')


def _canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')


def _digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def capture_source_inputs(project: Path) -> dict[str, str]:
    project = Path(project).resolve()
    paths = [project / name for name in ROOT_FILES]
    for crate in CRATES:
        root = project / 'crates' / crate
        if root.is_symlink() or not root.is_dir():
            raise ValueError('missing or symlink WASM source crate: ' + crate)
        for directory, folders, files in os.walk(root):
            folders[:] = sorted(name for name in folders if name not in EXCLUDED and not name.startswith('.'))
            if any((Path(directory) / name).is_symlink() for name in folders):
                raise ValueError('symlink WASM source directory')
            paths.extend(Path(directory) / name for name in sorted(files)
                         if not name.startswith('.') and Path(name).suffix not in {'.pyc', '.pyo'})
    if len(paths) > MAX_SOURCE_FILES:
        raise ValueError('WASM source file count exceeds limit')
    result: dict[str, str] = {}
    folded = set()
    size = 0
    for path in sorted(paths):
        if (path.is_symlink() or not path.is_file()
                or any(parent.is_symlink() for parent in path.parents if parent.is_relative_to(project) and parent != project)):
            raise ValueError('missing or symlink WASM source material: ' + path.name)
        size += path.stat().st_size
        if size > MAX_SOURCE_BYTES:
            raise ValueError('WASM source bytes exceed limit')
        name = path.relative_to(project).as_posix()
        if name.casefold() in folded:
            raise ValueError('case-colliding WASM source materials')
        folded.add(name.casefold())
        result[name] = _digest(path)
    if not ESSENTIAL_INPUTS.issubset(result):
        raise ValueError('missing essential WASM source materials')
    return result


def _wasm_hashes(root: Path) -> dict[str, str]:
    result = {}
    for name in WASM_FILES:
        path = root / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_WASM_BYTES:
            raise ValueError('missing, symlink or oversized WASM input: ' + name)
        raw = path.read_bytes()
        if not raw.startswith(b'\0asm\1\0\0\0'):
            raise ValueError('invalid WASM input header: ' + name)
        result[name] = hashlib.sha256(raw).hexdigest()
    return result


def write_receipt(project: Path, wasm_root: Path, *, profile: str = BUILD_PROFILE,
                  expected_inputs: dict[str, str] | None = None) -> dict:
    """Record the profile the caller requested from Cargo; only the browser profile is admitted."""
    if profile != BUILD_PROFILE:
        raise ValueError(f'WASM built with profile {profile!r}, not {BUILD_PROFILE}; no receipt written')
    inputs = capture_source_inputs(project)
    if expected_inputs is not None and inputs != expected_inputs:
        raise ValueError('WASM source materials changed during build')
    document = {'schema_version': 'wasm-build.v1', 'target': 'wasm32-unknown-unknown',
                'profile': profile, 'locked': True, 'source_inputs': inputs,
                'source_inputs_sha256': hashlib.sha256(_canonical(inputs)).hexdigest(),
                'wasm_sha256': _wasm_hashes(wasm_root)}
    raw = _canonical(document)
    if len(raw) > MAX_RECEIPT_BYTES:
        raise ValueError('WASM receipt exceeds size limit before publication')
    destination = wasm_root / RECEIPT_NAME
    if destination.is_symlink():
        raise ValueError('symlink WASM receipt')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix='.wasm-build-', suffix='.tmp', dir=wasm_root, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(raw)
        os.replace(temporary, destination)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return document


def _unique(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError('duplicate WASM receipt JSON key')
        result[name] = value
    return result


def read_receipt(wasm_root: Path) -> tuple[dict, bytes]:
    path = wasm_root / RECEIPT_NAME
    if path.is_symlink():
        raise ValueError('symlink WASM receipt')
    if not path.is_file():
        raise ValueError('missing WASM build receipt; rebuild with tools/build_wasm.py')
    if path.stat().st_size > MAX_RECEIPT_BYTES:
        raise ValueError('WASM receipt exceeds size limit')
    raw = path.read_bytes()
    document = json.loads(raw, object_pairs_hook=_unique,
                          parse_constant=lambda value: (_ for _ in ()).throw(ValueError('invalid WASM receipt JSON number')))
    if (not isinstance(document, dict) or document.get('schema_version') != 'wasm-build.v1'
            or document.get('target') != 'wasm32-unknown-unknown' or document.get('profile') not in SUPPORTED_PROFILES
            or document.get('locked') is not True):
        raise ValueError('invalid WASM build receipt recipe')
    inputs = document.get('source_inputs')
    if not isinstance(inputs, dict) or not ESSENTIAL_INPUTS.issubset(inputs) or len(inputs) > MAX_SOURCE_FILES:
        raise ValueError('invalid WASM source input inventory')
    folded = set()
    for name, digest in inputs.items():
        path = PurePosixPath(name)
        if (not name or path.is_absolute() or '\\' in name or '..' in path.parts
                or name.casefold() in folded or not isinstance(digest, str) or not SHA256.fullmatch(digest)):
            raise ValueError('invalid WASM source path or digest')
        folded.add(name.casefold())
    if document.get('source_inputs_sha256') != hashlib.sha256(_canonical(inputs)).hexdigest():
        raise ValueError('WASM source inventory digest mismatch')
    if document['profile'] == LEGACY_PROFILE and inputs['Cargo.toml'] not in LEGACY_PROFILE_MANIFESTS:
        raise ValueError(f'WASM receipt profile {LEGACY_PROFILE} is not valid for this root manifest; rebuild WASM')
    if document.get('wasm_sha256') != _wasm_hashes(wasm_root):
        raise ValueError('WASM output differs from source receipt')
    return document, raw


def validate_receipt(project: Path, wasm_root: Path) -> bytes:
    document, raw = read_receipt(wasm_root)
    if document['source_inputs'] != capture_source_inputs(project):
        raise ValueError('WASM source receipt does not match current source materials; rebuild WASM')
    # Historical profiles stay readable for archived evidence, but the current sources are
    # only ever built by tools/build_wasm.py with the dedicated browser profile.
    if document['profile'] != BUILD_PROFILE:
        raise ValueError(f"WASM receipt profile {document['profile']} is not {BUILD_PROFILE}; rebuild WASM")
    return raw


def validate_archived_sources(document: dict, files: dict) -> None:
    if not isinstance(files, dict):
        raise ValueError('invalid archived source inventory')
    for name, expected in document['source_inputs'].items():
        record = files.get(name)
        if not isinstance(record, dict) or record.get('sha256') != expected:
            raise ValueError('WASM receipt differs from archived source material: ' + name)
