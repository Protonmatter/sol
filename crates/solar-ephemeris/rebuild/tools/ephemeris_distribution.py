"""Stage exact ephemeris notices and deterministic corresponding-source materials.

This is an engineering source/inventory check, not legal or release approval.
No network, dependency installation, Cargo invocation or source writes occur.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile
import tomllib

COMPONENT = 'crates/solar-ephemeris'
PORTAL = 'licenses/solar-ephemeris'
MAX_SOURCE_BYTES = 256 * 1024 * 1024
MAX_SOURCE_FILES = 4096
LICENSE_HASHES = {
    'COPYING.LESSER.LGPL-3.0': 'da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768',
    'COPYING.GPL-3.0': '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986',
}
NOTICE_FILES = (*LICENSE_HASHES, 'NOTICE-EPHEMERIS.md', 'COEFFICIENT-SOURCES.json', 'SOURCE-REBUILD.md')
REBUILD_COPIES = ('tools/rebuild_coefficients.py', 'tools/ephemeris_distribution.py', 'tools/ephemeris-data/coefficient-sources.json',
    'tools/ephemeris-data/coefficient-sources-vsop08.json', 'tools/ephemeris-data/extract_coefficient_literals.mjs',
    'tools/ephemeris-data/dump_elp.js', 'package.json', 'package-lock.json')
EXCLUDED_DIRECTORIES = frozenset({'target', 'build', 'node_modules', '__pycache__', '.git', '.claude',
    'coverage', '.venv', 'venv', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.idea', '.vscode'})


def _read(path: Path, *, limit: int = 64 * 1024 * 1024) -> bytes:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise ValueError('invalid or oversized source material: ' + path.name)
    raw = path.read_bytes()
    if len(raw) > limit:
        raise ValueError('source material exceeds size bound: ' + path.name)
    return raw


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _validate_component_snapshot(project: Path) -> tuple[dict, dict[str, str]]:
    """Require the accepted component declaration and complete exact source inputs."""
    project = project.resolve()
    validated: dict[str, str] = {}
    def read(path: Path) -> bytes:
        raw = _read(path)
        name = path.relative_to(project).as_posix()
        digest = _sha(raw)
        if name in validated and validated[name] != digest:
            raise ValueError('component source changed during validation')
        validated[name] = digest
        return raw
    crate = project / COMPONENT
    package = tomllib.loads(read(crate / 'Cargo.toml').decode('utf-8'))['package']
    workspace = tomllib.loads(read(project / 'Cargo.toml').decode('utf-8'))['workspace']['package']
    if package.get('license') != 'LGPL-3.0-only' or workspace.get('license') != 'MIT OR Apache-2.0':
        raise ValueError('component/application license declarations differ from the approved scope')
    for name, expected in LICENSE_HASHES.items():
        if _sha(read(crate / name)) != expected:
            raise ValueError('complete component license text differs: ' + name)
    for name in NOTICE_FILES:
        if not read(crate / name):
            raise ValueError('empty component notice/source material: ' + name)
    manifest_raw = read(crate / 'COEFFICIENT-SOURCES.json')
    if manifest_raw != read(project / 'tools/ephemeris-data/coefficient-sources.json'):
        raise ValueError('coefficient source manifest copy differs')
    manifest = json.loads(manifest_raw)
    if set(manifest['inputs']) != {'vsop2013.js', 'elpmpp02.js', 'top2013.js', 'LICENSE'}:
        raise ValueError('unexpected preferred source input inventory')
    if set(manifest['outputs']) != {'vsop2013.bin', 'elpmpp02.bin', 'top2013.bin'}:
        raise ValueError('unexpected coefficient output inventory')
    for category, relative in [('inputs', 'rebuild/upstream'), ('outputs', 'data')]:
        for name, record in manifest[category].items():
            raw = read(crate / relative / name)
            if len(raw) != record['bytes'] or _sha(raw) != record['sha256']:
                raise ValueError('component source input/output identity differs: ' + name)
    if read(crate / 'rebuild/upstream/LICENSE') != read(crate / 'COPYING.LESSER.LGPL-3.0'):
        raise ValueError('upstream license copy differs')
    if _sha(read(crate / 'rebuild/upstream/README.original.txt')) != '11b355131b8375091e5df2621e6fb3b13f762d32daa5c755e26e5d5a776babec':
        raise ValueError('upstream README capture identity differs')
    read(crate / 'rebuild/upstream/README.md')
    for name in REBUILD_COPIES:
        if read(crate / 'rebuild' / name) != read(project / name):
            raise ValueError('component rebuild copy differs: ' + name)
    return manifest, validated


def validate_component(project: Path) -> dict:
    """Validate the component, retaining the public manifest return contract."""
    return _validate_component_snapshot(project)[0]


def required_package_materials(project: Path) -> dict[str, str]:
    """Raw identities required in a current LGPL component's actual Cargo archive."""
    _, validated = _validate_component_snapshot(project)
    crate = project.resolve() / COMPONENT
    result = {}
    for path in sorted(crate.rglob('*')):
        relative = path.relative_to(crate)
        if any(part in EXCLUDED_DIRECTORIES or part == 'fuzz' for part in relative.parts):
            continue
        if path.is_symlink():
            raise ValueError('symlink component source material')
        if path.is_file() and path.suffix not in {'.pyc', '.pyo'}:
            name = relative.as_posix()
            if name == 'Cargo.toml':
                name = 'Cargo.toml.orig'
            if name not in {'Cargo.lock', '.cargo_vcs_info.json'}:
                digest = _sha(_read(path))
                checked = validated.get(path.relative_to(project.resolve()).as_posix())
                if checked is not None and digest != checked:
                    raise ValueError('validated component source changed before package inventory')
                result[name] = digest
    if _validate_component_snapshot(project)[1] != validated:
        raise ValueError('component source changed during package inventory')
    return result


def prepare_rebuild_workspace(component: Path, output: Path, *, node_modules: Path | None = None) -> Path:
    """Prepare a new owned scratch workspace from an extracted component package."""
    component, output = component.resolve(), output.resolve()
    if output.exists() or not output.is_relative_to(component / 'build'):
        raise ValueError('rebuild output must be new and inside the component build directory')
    manifest = json.loads(_read(component / 'COEFFICIENT-SOURCES.json'))
    if set(manifest['inputs']) != {'vsop2013.js', 'elpmpp02.js', 'top2013.js', 'LICENSE'} \
            or set(manifest['outputs']) != {'vsop2013.bin', 'elpmpp02.bin', 'top2013.bin'}:
        raise ValueError('rebuild source inventory differs')
    files: dict[str, bytes] = {}
    for name, record in manifest['inputs'].items():
        raw = _read(component / 'rebuild/upstream' / name)
        if len(raw) != record['bytes'] or _sha(raw) != record['sha256']:
            raise ValueError('rebuild preferred source identity differs')
        files['upstream/' + name] = raw
    for name, record in manifest['outputs'].items():
        raw = _read(component / 'data' / name)
        if len(raw) != record['bytes'] or _sha(raw) != record['sha256']:
            raise ValueError('rebuild original table identity differs')
        files['crates/solar-ephemeris/data/' + name] = raw
    for name in REBUILD_COPIES:
        files[name] = _read(component / 'rebuild' / name)
    compiler = None
    if node_modules is not None:
        compiler = node_modules.resolve() / 'typescript'
        if compiler.is_symlink():
            raise ValueError('symlink compiler input is not permitted')
        expected = json.loads(files['package-lock.json'])['packages']['node_modules/typescript']['version']
        if json.loads(_read(compiler / 'package.json'))['version'] != expected:
            raise ValueError('installed TypeScript version differs from the included lock')
        for path in compiler.rglob('*'):
            if path.is_symlink():
                raise ValueError('symlink compiler input is not permitted')
    created = False
    try:
        output.mkdir(parents=True, exist_ok=False)
        created = True
        for name, raw in files.items():
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        if compiler is not None:
            shutil.copytree(compiler, output / 'node_modules/typescript')
    except BaseException:
        # Only this newly created scratch directory is owned by this operation.
        if created and output.exists() and not output.is_symlink() and output.resolve().is_relative_to(component / 'build'):
            shutil.rmtree(output)
        raise
    return output


def _source_paths(project: Path) -> set[str]:
    captured = project / 'SOURCE-INPUTS.json'
    if not (project / '.git').exists() and captured.is_file():
        document = json.loads(_read(captured, limit=16 * 1024 * 1024))
        if document.get('schema_version') != 'sol-source-inputs.v1' or not isinstance(document.get('files'), dict):
            raise ValueError('captured source file inventory invalid')
        names = set(document['files'])
    elif (project / '.git').exists():
        try:
            raw = subprocess.check_output(['git', '--no-optional-locks', '-c', 'core.fsmonitor=false',
                '-C', str(project), 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
                env=dict(os.environ, GIT_OPTIONAL_LOCKS='0', GIT_NO_LAZY_FETCH='1'), timeout=30, stderr=subprocess.PIPE)
        except (OSError, subprocess.SubprocessError) as error:
            raise ValueError('read-only source inventory unavailable') from error
        names = set(raw.decode('utf-8').split('\0')) - {''}
    else:
        raise ValueError('source delivery requires a Git checkout or its captured SOURCE-INPUTS.json')
    for name in names:
        path = PurePosixPath(name)
        if not name or path.as_posix() != name or path.is_absolute() or '\\' in name or '..' in path.parts:
            raise ValueError('unsafe source inventory path')
    return names


def _collect(project: Path, web: Path, web_source_sha256: dict[str, str] | None = None,
             captured_data: dict[str, bytes] | None = None) -> dict[str, Path | bytes]:
    result: dict[str, Path | bytes] = {}
    folded: set[str] = set()
    def add(name: str, path: Path, boundary: Path) -> None:
        if not path.resolve().is_relative_to(boundary) or path.is_symlink():
            raise ValueError('unsafe source material path')
        if name.casefold() in folded:
            raise ValueError('source material path collision')
        folded.add(name.casefold())
        result[name] = path
    root_files = {'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'LICENSE-MIT', 'LICENSE-APACHE',
                 'package.json', 'package-lock.json', '.gitattributes', '.gitignore', 'README.md',
                 'BUILD_NOTES.md', 'CONTRIBUTING.md', 'CHANGELOG.md'}
    roots = {'crates', 'tools', 'python', 'services', 'docs', 'tests', '.github'}
    for name in sorted(_source_paths(project)):
        parts = PurePosixPath(name).parts
        if name in root_files:
            path, boundary = project / name, project
        else:
            is_web = name.startswith('apps/web/')
            if is_web and web_source_sha256 is not None:
                web_relative = name.removeprefix('apps/web/')
                # Offline regeneration and tests still read these legacy source
                # fixtures, independently of the selected bundle's served data.
                # Captured aliases retain precedence when already supplied.
                migration_input = web_relative.startswith('data/series/') or web_relative in {
                    'data/latest-state.json', 'data/latest-observations.json', 'data/feed-status.json'}
                if not migration_input or web_relative in web_source_sha256 or web_relative in (captured_data or {}):
                    continue
            if not is_web and parts[0] not in roots:
                continue
            relative = PurePosixPath(name.removeprefix('apps/web/')) if is_web else PurePosixPath(*parts[1:])
            if any(part in EXCLUDED_DIRECTORIES or part.startswith('.') for part in relative.parts):
                continue
            if is_web and relative.parts[0] in {'pkg', 'releases'}:
                continue
            path = web / relative if is_web else project / name
            boundary = web if is_web else project
        if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent.is_relative_to(boundary)):
            raise ValueError('symlink source material')
        if path.is_file() and path.suffix not in {'.pyc', '.pyo'}:
            add(name, path, boundary)
    for name, expected in (web_source_sha256 or {}).items():
        relative = PurePosixPath(name)
        if relative.is_absolute() or '\\' in name or any(part in {'.', '..'} or part.startswith('.') for part in relative.parts):
            raise ValueError('unsafe captured web source path')
        path = web / name
        if _sha(_read(path)) != expected:
            raise ValueError('captured web source changed before source delivery')
        add('apps/web/' + name, path, web)
    for name, raw in (captured_data or {}).items():
        relative = PurePosixPath(name)
        if not name.startswith('data/') or relative.is_absolute() or '\\' in name or '..' in relative.parts:
            raise ValueError('unsafe captured data path')
        archive_name = 'apps/web/' + name
        if archive_name.casefold() in folded or not isinstance(raw, bytes):
            raise ValueError('captured data source collision or invalid bytes')
        folded.add(archive_name.casefold())
        result[archive_name] = raw
    if len(result) > MAX_SOURCE_FILES:
        raise ValueError('source file count exceeds bound')
    return dict(sorted(result.items()))


def _material(value: Path | bytes) -> bytes:
    return value if isinstance(value, bytes) else _read(value)


def _records(paths: dict[str, Path | bytes]) -> dict:
    result = {}
    total = 0
    for name, path in paths.items():
        raw = _material(path)
        total += len(raw)
        if total > MAX_SOURCE_BYTES:
            raise ValueError('source archive exceeds size bound')
        result[name] = {'bytes': len(raw), 'sha256': _sha(raw)}
    return result


def stage_distribution(project: Path, web: Path, staged: Path, *, release_id: str, source_sha: str,
                       web_source_sha256: dict[str, str] | None = None,
                       captured_data: dict[str, bytes] | None = None) -> dict | None:
    """Called inside the builder's private namespace before final asset inventory."""
    project, web, staged = project.resolve(), web.resolve(), staged.resolve()
    if not (web / PORTAL).exists():
        index = web / 'index.html'
        if index.is_file() and b'licenses/solar-ephemeris/' in _read(index):
            raise ValueError('component license/source portal is missing')
        return None  # Historical fixture/application contract.
    _, validated = _validate_component_snapshot(project)
    def check_notice_copies() -> dict[str, str]:
        snapshots = {}
        for name in NOTICE_FILES:
            expected = validated[COMPONENT + '/' + name]
            if _sha(_read(web / PORTAL / name)) != expected or _sha(_read(staged / PORTAL / name)) != expected:
                raise ValueError('web component notice/source copy differs: ' + name)
            snapshots['apps/web/' + PORTAL + '/' + name] = expected
        return snapshots
    checked = {**validated, **check_notice_copies()}
    _read(web / PORTAL / 'index.html')
    destination = staged / PORTAL
    archive = destination / 'sol-source.tar.gz'
    receipt = destination / 'SOURCE-MANIFEST.json'
    if archive.exists() or receipt.exists():
        raise ValueError('source distribution output already exists')
    paths = _collect(project, web, web_source_sha256, captured_data)
    required = {'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'LICENSE-MIT', 'LICENSE-APACHE',
        'package.json', 'package-lock.json', 'tools/build_wasm.py', 'tools/build_web.py',
        'tools/validate_release_manifest.py', 'tools/ephemeris_distribution.py'}
    required.update(COMPONENT + '/' + ('Cargo.toml' if name == 'Cargo.toml.orig' else name)
        for name in required_package_materials(project))
    if not required.issubset(paths):
        raise ValueError('source inventory omits required component/build materials')
    files = _records(paths)
    if any(name not in files or files[name]['sha256'] != digest for name, digest in checked.items()):
        raise ValueError('validated source identities changed before capture')
    inputs = {'schema_version': 'sol-source-inputs.v1', 'component_license': 'LGPL-3.0-only',
        'application_original_terms': 'MIT OR Apache-2.0', 'release_id': release_id,
        'source_sha_label': source_sha, 'source_correspondence': 'Raw input inventory; independent clean-source/release admission is required.',
        'scope': 'Source/build materials and application data; generated binaries, caches and private configuration directories excluded.',
        'captured_data_paths': sorted(captured_data or {}),
        'files': files}
    metadata = (json.dumps(inputs, sort_keys=True, indent=2) + '\n').encode('utf-8')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix='.sol-source-', suffix='.tmp', dir=destination, delete=False) as stream:
            temporary = Path(stream.name)
            with gzip.GzipFile(filename='', fileobj=stream, mode='wb', mtime=0, compresslevel=6) as compressed:
                with tarfile.open(fileobj=compressed, mode='w|', format=tarfile.PAX_FORMAT) as package:
                    def put(name: str, raw: bytes) -> None:
                        member = tarfile.TarInfo('sol-source/' + name)
                        member.size, member.mode, member.mtime = len(raw), 0o644, 0
                        package.addfile(member, io.BytesIO(raw))
                    for name, path in paths.items():
                        raw = _material(path)
                        if {'bytes': len(raw), 'sha256': _sha(raw)} != files[name]:
                            raise ValueError('source material changed during archive creation')
                        put(name, raw)
                    put('SOURCE-INPUTS.json', metadata)
        if _records(_collect(project, web, web_source_sha256, captured_data)) != files:
            raise ValueError('source material drift after archive creation')
        if _validate_component_snapshot(project)[1] != validated or check_notice_copies() != {
                name: digest for name, digest in checked.items() if name.startswith('apps/web/')}:
            raise ValueError('component source validation changed before publication')
        result = {**inputs, 'archive': 'sol-source.tar.gz', 'archive_bytes': temporary.stat().st_size,
            'archive_sha256': _sha(temporary.read_bytes()), 'source_files': len(files),
            'source_bytes': sum(row['bytes'] for row in files.values()), 'qualification_granted': False}
        temporary.replace(archive)
        temporary = None
        receipt.write_text(json.dumps(result, sort_keys=True, indent=2) + '\n', encoding='utf-8')
        return result
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description='Prepare an offline coefficient-rebuild scratch workspace; install nothing.')
    parser.add_argument('--prepare-rebuild', type=Path, required=True, help='extracted solar-ephemeris component directory')
    parser.add_argument('--out-dir', type=Path, required=True, help='new directory inside that component build/ directory')
    parser.add_argument('--node-modules-dir', type=Path, help='optional existing locked compiler tooling; copies TypeScript only')
    args = parser.parse_args()
    try:
        output = prepare_rebuild_workspace(args.prepare_rebuild, args.out_dir, node_modules=args.node_modules_dir)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, 'ERROR: rebuild workspace could not be prepared: ' + str(error) + '\n')
    print(json.dumps({'status': 'prepared', 'workspace': str(output), 'dependencies_installed': False}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
