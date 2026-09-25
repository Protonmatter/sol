"""Immutable publication identities and fail-closed reconciliation (no I/O)."""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, fields
from datetime import datetime, timezone
from typing import Literal, Protocol


class PublicationError(Exception):
    """Sanitized, stable failure category; never include provider diagnostics."""
    def __init__(self, reason: str, code: int = 2):
        super().__init__(reason)
        self.reason, self.code = reason, code


def require(condition: bool, reason: str, code: int = 2) -> None:
    if not condition:
        raise PublicationError(reason, code)


def oid(value: object, length: int = 40) -> str:
    require(isinstance(value, str) and bool(re.fullmatch(r'[a-f0-9]{%d}' % length, value))
            and value != '0' * length, 'invalid-object-identity')
    return value


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False,
                       separators=(',', ':')) + '\n').encode('utf-8')


def loads(value: str | bytes) -> object:
    def pairs(items):
        result = {}
        for key, item in items:
            require(key not in result, 'duplicate-json-key')
            result[key] = item
        return result
    def bad_constant(_):
        raise PublicationError('non-finite-json')
    try:
        return json.loads(value, object_pairs_hook=pairs, parse_constant=bad_constant)
    except (ValueError, UnicodeError, TypeError, RecursionError) as exc:
        raise PublicationError('invalid-json') from exc


def safe_path(path: object) -> str:
    require(isinstance(path, str) and 0 < len(path.encode('utf-8')) <= 4096,
            'invalid-path')
    require(not any(ord(c) < 32 or ord(c) == 127 for c in path)
            and '\\' not in path and ':' not in path, 'invalid-path')
    require(all(part not in ('', '.', '..') and part.lower() != '.git'
                and not part.endswith((' ', '.')) for part in path.split('/')), 'invalid-path')
    return path


def refname(ref: object) -> str:
    require(isinstance(ref, str) and ref.startswith('refs/heads/'), 'invalid-head-ref')
    name = ref[len('refs/heads/'):]
    safe_path(name)
    require(not name.startswith('-') and not any(p.startswith('.') or p.endswith('.lock')
            for p in name.split('/')) and not any(c in name for c in ' ~^:?*[\\')
            and '..' not in name and '@{' not in name, 'invalid-head-ref')
    return ref


@dataclass(frozen=True)
class Intent:
    operation_id: str
    repository: str
    repository_id: str
    base_ref: str
    head_ref: str
    observed_base_sha: str
    expected_head_sha: str | None
    source_commit_sha: str | None
    candidate_sha: str
    tree_sha: str
    packet_sha256: str

    def validate(self) -> Intent:
        require(isinstance(self.operation_id, str) and bool(re.fullmatch(
            r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', self.operation_id)), 'invalid-operation-id')
        require(isinstance(self.repository, str) and bool(re.fullmatch(
            r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', self.repository))
            and all(p not in ('.', '..') for p in self.repository.split('/')), 'invalid-repository')
        require(isinstance(self.repository_id, str) and bool(re.fullmatch(
            r'[A-Za-z0-9_=-]{3,128}', self.repository_id))
            and not self.repository_id.isdigit(), 'graphql-repository-node-id-required')
        refname(self.base_ref); refname(self.head_ref)
        name = self.head_ref[len('refs/heads/'):].lower()
        require(name not in ('master', 'main') and name.split('/')[0] not in ('release', 'releases')
                and self.head_ref != self.base_ref, 'protected-publication-target')
        for value in (self.observed_base_sha, self.candidate_sha, self.tree_sha): oid(value)
        for value in (self.expected_head_sha, self.source_commit_sha):
            if value is not None: oid(value)
        oid(self.packet_sha256, 64)
        return self

    @classmethod
    def from_dict(cls, value: object) -> Intent:
        require(isinstance(value, dict) and set(value) == {f.name for f in fields(cls)},
                'invalid-intent-fields')
        return cls(**value).validate()

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class Observation:
    repository: str
    head_ref: str
    head_sha: str | None
    base_ref: str
    base_sha: str
    pr_number: int | None
    pr_head_sha: str | None
    pr_state: str | None
    observed_at: str


@dataclass(frozen=True)
class Decision:
    action: Literal['publish', 'reconcile-pr', 'verified', 'conflict', 'blocked']
    reason: str


class DurableStore(Protocol):
    def put(self, operation_id: str, sequence: int, payload: bytes) -> str: ...
    def get(self, reference: str) -> bytes: ...


class Transport(Protocol):
    def observe(self, intent: Intent) -> Observation: ...
    def publish(self, intent: Intent) -> None: ...


def reconcile(intent: Intent, observed: Observation) -> Decision:
    intent.validate()
    if (observed.repository, observed.head_ref, observed.base_ref) != (
            intent.repository, intent.head_ref, intent.base_ref):
        return Decision('blocked', 'repository-or-ref-mismatch')
    if observed.base_sha != intent.observed_base_sha:
        return Decision('blocked', 'base-changed-revalidation-required')
    if observed.pr_number is not None and (type(observed.pr_number) is not int
            or observed.pr_number <= 0 or observed.pr_state != 'open'):
        return Decision('blocked', 'invalid-or-closed-pr')
    if observed.pr_number is None and (observed.pr_head_sha is not None or observed.pr_state is not None):
        return Decision('blocked', 'inconsistent-pr-evidence')
    if observed.head_sha == intent.candidate_sha:
        if observed.pr_number and observed.pr_head_sha == intent.candidate_sha:
            return Decision('verified', 'remote-ref-and-pr-verified')
        return Decision('reconcile-pr', 'remote-ref-verified-pr-not-yet-verified')
    if observed.head_sha == intent.expected_head_sha:
        if observed.pr_number and observed.pr_head_sha != observed.head_sha:
            return Decision('blocked', 'inconsistent-pr-head')
        return Decision('publish', 'expected-head-observed')
    return Decision('conflict', 'head-changed')
