"""Binary-safe candidate packets and create-only, read-back-verified journals."""
from __future__ import annotations

import contextlib
import hashlib
import io
import os
import re
import stat
import subprocess
import tempfile
import time
import uuid
import zipfile
from pathlib import Path

from pr_publication import PublicationError, json_bytes, loads, oid, require, safe_path, utc_now

MAX_PACKET = 256 * 1024 * 1024
MAX_BLOB = 32 * 1024 * 1024
STAGES = {'prepared', 'recovery-persisted', 'object-write-intent', 'object-verified',
          'object-write-result', 'commit-write-intent', 'commit-write-result', 'commit-verified', 'ref-write-intent',
          'remote-ref-verified', 'pr-write-intent', 'pr-write-result', 'pr-verified', 'ci-observed',
          'blocked', 'uncertain', 'complete'}


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def git_oid(kind: str, raw: bytes) -> str:
    return hashlib.sha1(f'{kind} {len(raw)}\0'.encode() + raw).hexdigest()


class Runner:
    """A single invocation deadline; captured subprocess diagnostics are not logged."""
    def __init__(self, seconds: float = 120):
        require(0 < seconds <= 3600, 'invalid-deadline')
        self.end = time.monotonic() + seconds

    def capture(self, args: list[str], cwd: Path, data: bytes | None = None) -> tuple[int, bytes]:
        remaining = self.end - time.monotonic()
        require(remaining > 0, 'deadline-exceeded', 5)
        env = os.environ.copy()
        for key in ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
                    'GIT_ALTERNATE_OBJECT_DIRECTORIES'):
            env.pop(key, None)
        env.update(GIT_TERMINAL_PROMPT='0', GIT_NO_REPLACE_OBJECTS='1', LC_ALL='C')
        try:
            result = subprocess.run(args, cwd=cwd, input=data, capture_output=True,
                                    timeout=min(remaining, 120), env=env, check=False)
        except subprocess.TimeoutExpired as exc:
            raise PublicationError('command-timed-out', 5) from exc
        except OSError as exc:
            raise PublicationError('command-unavailable', 4) from exc
        require(len(result.stdout) <= MAX_PACKET, 'command-output-too-large')
        return result.returncode, result.stdout

    def __call__(self, args: list[str], cwd: Path, data: bytes | None = None) -> bytes:
        status, output = self.capture(args, cwd, data)
        require(status == 0, 'command-failed', 4)
        return output


def git(repo: Path, *args: str, runner: Runner | None = None, data: bytes | None = None) -> bytes:
    return (runner or Runner())(['git', *args], Path(repo), data)


def regular(root: Path, relative: str) -> Path:
    safe_path(relative)
    path = root
    for component in relative.split('/'):
        path = path / component
        require(not path.is_symlink(), 'symlink-path-rejected')
    require(path.is_file() and stat.S_ISREG(path.stat().st_mode), 'regular-file-required')
    return path


def tree(repo: Path, revision: str, runner: Runner) -> dict:
    records = git(repo, 'ls-tree', '-rz', '--full-tree', revision, runner=runner)
    result = {}
    for record in records.split(b'\0'):
        if not record: continue
        header, name = record.split(b'\t', 1)
        mode, kind, sha = header.decode('ascii').split()
        path = safe_path(name.decode('utf-8'))
        require(mode in ('100644', '100755') and kind == 'blob', 'unsupported-tree-entry')
        result[path] = (mode, oid(sha))
    return result


def commit_fields(raw: bytes) -> tuple[str, list[str]]:
    header = raw.split(b'\n\n', 1)[0].splitlines()
    trees = [line[5:].decode('ascii') for line in header if line.startswith(b'tree ')]
    parents = [line[7:].decode('ascii') for line in header if line.startswith(b'parent ')]
    require(len(trees) == 1 and len(parents) >= 1, 'invalid-candidate-commit')
    return oid(trees[0]), [oid(p) for p in parents]


def inspect_candidate(repo: Path, anchor: str, candidate: str, allowed: list[str],
                      *, working: bool = True, runner: Runner | None = None) -> tuple[dict, dict]:
    runner = runner or Runner()
    oid(anchor); oid(candidate)
    require(git(repo, 'rev-parse', '--show-object-format', runner=runner).strip() == b'sha1',
            'unsupported-object-format')
    require(git(repo, 'rev-parse', '--is-shallow-repository', runner=runner).strip() == b'false',
            'shallow-checkout-rejected')
    git(repo, 'merge-base', '--is-ancestor', anchor, candidate, runner=runner)
    if working:
        require(git(repo, 'rev-parse', 'HEAD', runner=runner).decode().strip() == candidate,
                'candidate-not-checked-out')
        require(not git(repo, 'status', '--porcelain', '--untracked-files=all', runner=runner),
                'dirty-checkout')
    require(isinstance(allowed, list) and all(isinstance(p, str) for p in allowed)
            and len(allowed) == len(set(allowed)), 'invalid-allowed-paths')
    for path in allowed: safe_path(path)
    before, after = tree(repo, anchor, runner), tree(repo, candidate, runner)
    if working:
        # Git's assume-unchanged/skip-worktree flags can conceal dirty inputs.
        # Compare every tracked working file to the immutable tree, not only the diff.
        for path, (_, sha) in after.items():
            source = regular(repo, path)
            require(source.stat().st_size <= MAX_BLOB, 'blob-size-limit')
            require(git_oid('blob', source.read_bytes()) == sha,
                    'working-bytes-differ-from-commit')
    paths = sorted(p for p in before.keys() | after.keys() if before.get(p) != after.get(p))
    require(paths and paths == sorted(allowed), 'changed-path-allowlist-mismatch')
    entries, blobs = [], {}
    for path in paths:
        if path not in after:
            entries.append(dict(path=path, action='delete', mode=before[path][0],
                                oid=None, size=0, sha256=None))
            continue
        mode, sha = after[path]
        size = int(git(repo, 'cat-file', '-s', sha, runner=runner))
        require(size <= MAX_BLOB, 'blob-size-limit')
        raw = git(repo, 'cat-file', 'blob', sha, runner=runner)
        require(git_oid('blob', raw) == sha and len(raw) == size, 'blob-identity-mismatch')
        require(not raw.startswith(b'version https://git-lfs.github.com/spec/v1'),
                'lfs-pointer-rejected')
        if working:
            require(regular(repo, path).read_bytes() == raw, 'working-bytes-differ-from-commit')
        blobs[sha] = raw
        entries.append(dict(path=path, action='modify' if path in before else 'add',
                            mode=mode, oid=sha, size=size, sha256=digest(raw)))
    raw_commit = git(repo, 'cat-file', 'commit', candidate, runner=runner)
    candidate_tree, parents = commit_fields(raw_commit)
    return dict(schema='pr-candidate.v1', anchor_sha=anchor, candidate_sha=candidate,
                tree_sha=candidate_tree, parents=parents,
                base_tree_sha=git(repo, 'rev-parse', anchor+'^{tree}', runner=runner).decode().strip(),
                entries=entries), {**blobs, 'commit': raw_commit}


def build_packet(repo: Path, anchor: str, candidate: str, allowed: list[str],
                 *, runner: Runner | None = None) -> bytes:
    runner = runner or Runner()
    manifest, blobs = inspect_candidate(repo, anchor, candidate, allowed, runner=runner)
    ref = 'refs/heads/sol-publication-' + uuid.uuid4().hex
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'candidate.bundle'
        git(repo, 'update-ref', ref, candidate, '0'*40, runner=runner)
        try:
            git(repo, 'bundle', 'create', str(path), ref, '^'+anchor, runner=runner)
            git(repo, 'bundle', 'verify', str(path), runner=runner)
            bundle = path.read_bytes()
        finally:
            # Delete only our temporary ref, only if it still has our exact value.
            git(repo, 'update-ref', '-d', ref, candidate, runner=Runner())
    manifest.update(bundle_ref=ref, bundle_sha256=digest(bundle))
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, raw in [('manifest.json', json_bytes(manifest)), ('candidate.bundle', bundle),
                          ('commit.bin', blobs.pop('commit')),
                          *[(f'blobs/{sha}', raw) for sha, raw in sorted(blobs.items())]]:
            archive.writestr(name, raw)
    packet = out.getvalue()
    read_packet(packet)
    return packet


def read_packet(packet: bytes) -> tuple[dict, dict, bytes]:
    require(type(packet) is bytes and len(packet) <= MAX_PACKET, 'packet-size-limit')
    try:
        with zipfile.ZipFile(io.BytesIO(packet)) as archive:
            info = archive.infolist(); names = [i.filename for i in info]
            require(len(names) == len(set(names)) and len(names) <= 10004
                    and sum(i.file_size for i in info) <= MAX_PACKET, 'invalid-packet-members')
            require(all(not i.is_dir() and not (i.flag_bits & 1)
                        and stat.S_IFMT(i.external_attr >> 16) != stat.S_IFLNK for i in info),
                    'invalid-packet-member-type')
            manifest = loads(archive.read('manifest.json'))
            keys = {'schema', 'anchor_sha', 'candidate_sha', 'tree_sha', 'parents',
                    'base_tree_sha', 'entries', 'bundle_ref', 'bundle_sha256'}
            require(isinstance(manifest, dict) and set(manifest) == keys
                    and manifest['schema'] == 'pr-candidate.v1', 'invalid-packet-manifest')
            for key in ('anchor_sha', 'candidate_sha', 'tree_sha', 'base_tree_sha'): oid(manifest[key])
            oid(manifest['bundle_sha256'], 64)
            require(isinstance(manifest['parents'], list) and manifest['parents']
                    and len(manifest['parents']) == len(set(manifest['parents'])), 'invalid-parents')
            for parent in manifest['parents']: oid(parent)
            require(isinstance(manifest['bundle_ref'], str) and bool(re.fullmatch(
                r'refs/heads/sol-publication-[a-f0-9]{32}', manifest['bundle_ref'])), 'invalid-bundle-ref')
            entries = manifest['entries']
            require(isinstance(entries, list) and 0 < len(entries) <= 10000, 'invalid-entries')
            expected = {'manifest.json', 'candidate.bundle', 'commit.bin'}
            blobs, paths = {}, []
            for entry in entries:
                require(isinstance(entry, dict) and set(entry) == {
                    'path', 'action', 'mode', 'oid', 'size', 'sha256'}, 'invalid-entry-fields')
                paths.append(safe_path(entry['path']))
                require(entry['action'] in ('add', 'modify', 'delete')
                        and entry['mode'] in ('100644', '100755')
                        and type(entry['size']) is int and 0 <= entry['size'] <= MAX_BLOB,
                        'invalid-entry-value')
                if entry['action'] == 'delete':
                    require(entry['oid'] is None and entry['sha256'] is None and entry['size'] == 0,
                            'invalid-deletion')
                else:
                    sha = oid(entry['oid']); oid(entry['sha256'], 64)
                    name = 'blobs/' + sha; expected.add(name)
                    raw = archive.read(name)
                    require(len(raw) == entry['size'] and digest(raw) == entry['sha256']
                            and git_oid('blob', raw) == sha, 'packet-blob-mismatch')
                    require(not raw.startswith(b'version https://git-lfs.github.com/spec/v1'),
                            'lfs-pointer-rejected')
                    blobs[sha] = raw
            require(paths == sorted(set(paths)) and set(names) == expected, 'packet-inventory-mismatch')
            bundle, commit = archive.read('candidate.bundle'), archive.read('commit.bin')
            require(digest(bundle) == manifest['bundle_sha256']
                    and git_oid('commit', commit) == manifest['candidate_sha'], 'packet-object-mismatch')
            require(commit_fields(commit) == (manifest['tree_sha'], manifest['parents']),
                    'commit-metadata-mismatch')
            return manifest, {**blobs, 'commit': commit}, bundle
    except (zipfile.BadZipFile, KeyError, ValueError, UnicodeError, TypeError, RuntimeError) as exc:
        raise PublicationError('invalid-candidate-packet') from exc


def restore_packet(packet: bytes, repo: Path, *, runner: Runner | None = None) -> dict:
    runner = runner or Runner()
    manifest, _, bundle = read_packet(packet)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'candidate.bundle'; path.write_bytes(bundle)
        git(repo, 'cat-file', '-e', manifest['anchor_sha']+'^{commit}', runner=runner)
        git(repo, 'bundle', 'verify', str(path), runner=runner)
        advertised = git(repo, 'bundle', 'list-heads', str(path), runner=runner).decode().splitlines()
        require(advertised == [manifest['candidate_sha']+' '+manifest['bundle_ref']],
                'bundle-ref-mismatch')
        git(repo, 'fetch', '--no-tags', '--no-write-fetch-head', str(path),
            manifest['bundle_ref'], runner=runner)
    check, _ = inspect_candidate(repo, manifest['anchor_sha'], manifest['candidate_sha'],
        [e['path'] for e in manifest['entries']], working=False, runner=runner)
    require(all(check[k] == manifest[k] for k in check), 'restored-inventory-mismatch')
    return manifest


def operation(value: str) -> str:
    require(isinstance(value, str) and bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', value)),
            'invalid-operation-id')
    return value


class DirectoryStore:
    """Operator-declared persistent filesystem. Never infers that /mnt/data is durable."""
    def __init__(self, root: Path):
        absolute = Path(root).absolute()
        require(not any(p.is_symlink() for p in (absolute, *absolute.parents)), 'symlink-store-rejected')
        existing = absolute
        while not existing.exists(): existing = existing.parent
        absolute.mkdir(parents=True, exist_ok=True)
        self.root = absolute
        self._sync_directories(absolute, existing)

    @staticmethod
    def _sync_directories(directory: Path, stop: Path) -> None:
        if os.name == 'nt': return  # Directory fsync is not exposed here on Windows.
        while True:
            fd = os.open(directory, os.O_RDONLY)
            try: os.fsync(fd)
            finally: os.close(fd)
            if directory == stop: return
            directory = directory.parent

    def _path(self, relative: str) -> Path:
        safe_path(relative)
        path = self.root
        for part in relative.split('/'):
            path = path / part
            require(not path.is_symlink(), 'symlink-store-rejected')
        return path

    def get(self, reference: str) -> bytes:
        path = self._path(reference)
        require(path.stat().st_size <= MAX_PACKET, 'stored-file-too-large')
        return path.read_bytes()

    def _put(self, name: str, payload: bytes) -> str:
        path = self._path(name); path.parent.mkdir(parents=True, exist_ok=True)
        # Same-directory temporary bytes are fsynced before atomic, create-only linking.
        fd, temporary = tempfile.mkstemp(prefix='.publication-', dir=path.parent)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(payload); stream.flush(); os.fsync(stream.fileno())
            try: os.link(temporary, path)
            except FileExistsError:
                require(self.get(name) == payload, 'immutable-store-conflict', 3)
            self._sync_directories(path.parent, self.root)
        finally:
            os.unlink(temporary)
        require(self.get(name) == payload, 'durable-readback-mismatch', 5)
        return name

    def put(self, operation_id: str, sequence: int, payload: bytes) -> str:
        operation(operation_id)
        require(type(sequence) is int and 0 <= sequence < 1000000, 'invalid-sequence')
        return self._put(f'{operation_id}/{sequence:06d}.json', payload)

    def put_packet(self, payload: bytes) -> str:
        return self._put(f'packets/{digest(payload)}.zip', payload)

    def sequences(self, operation_id: str) -> list[int]:
        directory = self._path(operation(operation_id))
        if not directory.exists(): return []
        result = []
        for path in directory.glob('*.json'):
            require(bool(re.fullmatch(r'[0-9]{6}\.json', path.name)), 'invalid-checkpoint-name')
            result.append(int(path.stem))
        return sorted(result)

    @contextlib.contextmanager
    def lock(self, operation_id: str):
        path = self._path(operation(operation_id) + '/writer.lock')
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('a+b') as stream:
            try:
                if os.name == 'nt':
                    import msvcrt
                    if stream.tell() == 0: stream.write(b'0'); stream.flush()
                    stream.seek(0); msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                raise PublicationError('publication-writer-active', 3) from exc
            try: yield
            finally:
                if os.name == 'nt':
                    stream.seek(0); msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                else: fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


class Journal:
    """Immutable chain. Caller holds the store's per-operation lock during writes."""
    def __init__(self, store: DirectoryStore, operation_id: str):
        self.store, self.operation_id = store, operation(operation_id)
        self.records, self.last_digest = [], None
        sequences = store.sequences(operation_id)
        require(sequences == list(range(len(sequences))), 'checkpoint-gap')
        for sequence in sequences:
            raw = store.get(f'{operation_id}/{sequence:06d}.json'); record = loads(raw)
            require(isinstance(record, dict) and set(record) == {
                'schema', 'operation_id', 'sequence', 'previous_sha256', 'stage', 'at', 'details'},
                'invalid-checkpoint')
            require(record['schema'] == 'pr-publication-checkpoint.v1'
                    and record['operation_id'] == operation_id and type(record['sequence']) is int
                    and record['sequence'] == sequence and record['previous_sha256'] == self.last_digest
                    and record['stage'] in STAGES and isinstance(record['details'], dict),
                    'invalid-checkpoint-chain')
            self.records.append(record); self.last_digest = digest(raw)

    def append(self, stage: str, details: dict) -> str:
        require(stage in STAGES and isinstance(details, dict), 'invalid-checkpoint-stage')
        record = dict(schema='pr-publication-checkpoint.v1', operation_id=self.operation_id,
                      sequence=len(self.records), previous_sha256=self.last_digest,
                      stage=stage, at=utc_now(), details=details)
        raw = json_bytes(record)
        reference = self.store.put(self.operation_id, len(self.records), raw)
        require(self.store.get(reference) == raw, 'checkpoint-readback-mismatch', 5)
        self.records.append(record); self.last_digest = digest(raw)
        return reference
