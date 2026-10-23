"""Resumable Git object staging with an explicitly capable expected-head adapter."""
from __future__ import annotations

import re
from dataclasses import asdict, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pr_publication import Intent, PublicationError, oid, reconcile, require
from pr_publication_git import bound_packet
from pr_publication_packet import Journal, Runner, commit_fields, git_oid, restore_packet


def commit_payload(raw: bytes) -> dict:
    """Freeze all identity metadata, so retry never substitutes the current time.

    Native transport preserves arbitrary/signed commits. This API path refuses
    additional headers or encodings it cannot round-trip faithfully.
    """
    try:
        header, message = raw.decode('utf-8').split('\n\n', 1)
        values = {}
        for line in header.splitlines():
            key, value = line.split(' ', 1)
            require(key in ('tree', 'parent', 'author', 'committer'), 'api-unsupported-commit-header', 4)
            values.setdefault(key, []).append(value)
        require(all(len(values.get(k, [])) == 1 for k in ('tree', 'author', 'committer')),
                'invalid-commit-identity')
        def actor(value):
            match = re.fullmatch(r'([^\r\n<>]+) <([^\r\n<>]+)> ([0-9]+) ([+-])([0-9]{2})([0-9]{2})', value)
            require(match is not None, 'api-unsupported-actor', 4)
            name, email, stamp, sign, hours, minutes = match.groups()
            require(int(hours) < 24 and int(minutes) < 60, 'invalid-actor-timezone')
            offset = (int(hours)*60 + int(minutes)) * (1 if sign == '+' else -1)
            date = datetime.fromtimestamp(int(stamp), timezone(timedelta(minutes=offset))).isoformat()
            return dict(name=name, email=email, date=date)
        return dict(tree=oid(values['tree'][0]), parents=[oid(p) for p in values.get('parent', [])],
                    message=message, author=actor(values['author'][0]), committer=actor(values['committer'][0]))
    except (ValueError, UnicodeError, OverflowError, OSError) as exc:
        raise PublicationError('api-unsupported-commit-metadata', 4) from exc


class ApiGitTransport:
    """Injected client may be the CLI's GitHub API or a connected-app bridge.

    The bridge must implement readback and immutable object operations. An
    existing branch additionally requires updateRefs/beforeOid, not REST's
    force=false. A new branch may use server-enforced create-only createRef.
    """
    def __init__(self, checkout: Path, client, journal: Journal, *, runner: Runner | None = None):
        self.checkout, self.client, self.journal = Path(checkout), client, journal
        self.runner = runner or Runner()

    def _verify_commit(self, sha: str, tree: str, parents: list[str]) -> None:
        value = self.client.get_commit(oid(sha))
        require(isinstance(value, dict) and value.get('sha') == sha
                and value.get('tree', {}).get('sha') == tree
                and [p.get('sha') for p in value.get('parents', [])] == parents,
                'remote-commit-identity-mismatch', 5)

    def effective_intent(self, intent: Intent) -> Intent:
        _, manifest, _ = bound_packet(intent, self.journal)
        for record in reversed(self.journal.records):
            d = record['details']
            if record['stage'] in ('commit-verified', 'commit-write-result') and d.get('source_commit_sha') == intent.candidate_sha:
                actual = oid(d.get('published_commit_sha'))
                if actual == intent.candidate_sha and record['stage'] == 'commit-verified': return intent
                self._verify_commit(actual, manifest['tree_sha'], manifest['parents'])
                if record['stage'] == 'commit-write-result':
                    self.journal.append('commit-verified', dict(source_commit_sha=intent.candidate_sha,
                        published_commit_sha=actual, tree_sha=manifest['tree_sha'], parents=manifest['parents']))
                return replace(intent, candidate_sha=actual)
        return intent

    def observe(self, intent: Intent):
        return self.client.observe(intent)

    def publish(self, intent: Intent) -> None:
        capable = self.client.supports_expected_head is True
        require(capable or (intent.expected_head_sha is None and callable(
            getattr(self.client, 'create_ref', None))), 'expected-head-capability-unavailable', 4)
        packet, manifest, blobs = bound_packet(intent, self.journal)
        restore_packet(packet, self.checkout, runner=self.runner)
        payload = commit_payload(blobs['commit'])
        effective = self.effective_intent(intent)
        decision = reconcile(effective, self.observe(effective))
        require(decision.action not in ('blocked', 'conflict'), decision.reason,
                3 if decision.action == 'conflict' else 4)
        if decision.action in ('verified', 'reconcile-pr'):
            self._verify_commit(effective.candidate_sha, manifest['tree_sha'], manifest['parents'])
            self.journal.append('remote-ref-verified', asdict(self.observe(effective)))
            return
        # Parents must already be reachable by the API. For unpushed multi-commit
        # history use native transport rather than silently changing parentage.
        for parent in manifest['parents']:
            require(self.client.get_commit(parent) is not None, 'api-parent-object-unavailable-use-native', 4)
        existing = self.client.get_commit(effective.candidate_sha)
        if existing is None:
            for sha, raw in sorted((k, v) for k, v in blobs.items() if k != 'commit'):
                remote = self.client.get_blob(sha)
                if remote is None:
                    self.journal.append('object-write-intent', dict(kind='blob', oid=sha))
                    actual = None
                    try:
                        actual = self.client.put_blob(raw)
                    except PublicationError as exc:
                        if exc.code not in (4, 5): raise
                    if actual is not None:
                        self.journal.append('object-write-result', dict(kind='blob', oid=oid(actual)))
                        require(actual == sha, 'uploaded-blob-oid-mismatch')
                    remote = self.client.get_blob(sha)
                require(remote == raw and git_oid('blob', remote) == sha, 'remote-blob-readback-mismatch', 5)
                self.journal.append('object-verified', dict(kind='blob', oid=sha))
            target_tree = manifest['tree_sha']
            remote_tree = self.client.get_tree(target_tree)
            if remote_tree is None:
                elements = [dict(path=e['path'], mode=e['mode'], type='blob', sha=e['oid'])
                            for e in manifest['entries']]
                self.journal.append('object-write-intent', dict(kind='tree', oid=target_tree))
                actual = None
                try:
                    actual = self.client.put_tree(manifest['base_tree_sha'], elements)
                except PublicationError as exc:
                    if exc.code not in (4, 5): raise
                if actual is not None:
                    self.journal.append('object-write-result', dict(kind='tree', oid=oid(actual)))
                    require(actual == target_tree, 'uploaded-tree-oid-mismatch')
                remote_tree = self.client.get_tree(target_tree)
            require(isinstance(remote_tree, dict) and remote_tree.get('sha') == target_tree,
                    'remote-tree-readback-mismatch', 5)
            self.journal.append('object-verified', dict(kind='tree', oid=target_tree))
            self.journal.append('commit-write-intent', dict(source_commit_sha=intent.candidate_sha,
                tree_sha=target_tree, parents=manifest['parents']))
            try:
                actual = oid(self.client.put_commit(payload))
            except PublicationError as exc:
                if exc.code not in (4, 5): raise
                # Fixed metadata permits a content-addressed lookup first. When a
                # server normalizes identity, replay the same frozen request once.
                if self.client.get_commit(intent.candidate_sha) is not None:
                    actual = intent.candidate_sha
                else:
                    actual = oid(self.client.put_commit(payload))
            self.journal.append('commit-write-result', dict(source_commit_sha=intent.candidate_sha,
                published_commit_sha=actual, tree_sha=target_tree, parents=manifest['parents']))
            self._verify_commit(actual, target_tree, manifest['parents'])
            self.journal.append('commit-verified', dict(source_commit_sha=intent.candidate_sha,
                published_commit_sha=actual, tree_sha=target_tree, parents=manifest['parents']))
            effective = replace(intent, candidate_sha=actual)
        else:
            self._verify_commit(effective.candidate_sha, manifest['tree_sha'], manifest['parents'])
        # Refresh immediately before the mutation; the server precondition still
        # performs the race protection. No REST downgrade after a rejected CAS.
        before = self.observe(effective); decision = reconcile(effective, before)
        require(decision.action in ('publish', 'verified', 'reconcile-pr'), decision.reason,
                3 if decision.action == 'conflict' else 4)
        if decision.action == 'publish':
            self.journal.append('ref-write-intent', dict(candidate_sha=effective.candidate_sha,
                expected_head_sha=effective.expected_head_sha, head_ref=effective.head_ref))
            try:
                if capable: self.client.update_refs(effective)
                else: self.client.create_ref(effective)
            except PublicationError:
                pass  # A lost reply is not a failed mutation; read the remote.
        after = self.observe(effective)
        require(after.head_sha == effective.candidate_sha,
                'ref-write-not-verified' if after.head_sha == effective.expected_head_sha else 'head-conflict',
                5 if after.head_sha == effective.expected_head_sha else 3)
        self.journal.append('remote-ref-verified', asdict(after))
        decision = reconcile(effective, after)
        require(decision.action in ('verified', 'reconcile-pr'), decision.reason, 4)
