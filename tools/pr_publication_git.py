"""Native publication: frozen bytes, explicit lease, no history rewrite, readback."""
from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Callable

from pr_publication import Intent, Observation, PublicationError, reconcile, require
from pr_publication_packet import Journal, Runner, digest, git, read_packet, restore_packet


def bound_packet(intent: Intent, journal: Journal) -> tuple[bytes, dict, dict]:
    intent.validate()
    require(journal.operation_id == intent.operation_id and journal.records
            and journal.records[0]['stage'] == 'prepared', 'prepared-checkpoint-required', 4)
    prepared = journal.records[0]['details']
    require(prepared.get('intent') == intent.to_dict(), 'journal-intent-mismatch')
    reference = prepared.get('packet_reference')
    require(isinstance(reference, str), 'packet-reference-required')
    packet = journal.store.get(reference)
    require(digest(packet) == intent.packet_sha256, 'persisted-packet-checksum-mismatch')
    manifest, blobs, _ = read_packet(packet)
    require(manifest['candidate_sha'] == intent.candidate_sha
            and manifest['tree_sha'] == intent.tree_sha
            and manifest['anchor_sha'] == (intent.expected_head_sha or intent.observed_base_sha),
            'packet-intent-identity-mismatch')
    return packet, manifest, blobs


class NativeGitTransport:
    """The caller supplies an identity-checking observer and holds the journal lock.

    CLI remotes are derived from the verified GitHub repository, never free-form
    input. Dependency injection also permits real offline bare-repository tests.
    """
    def __init__(self, checkout: Path, remote: str,
                 observer: Callable[[Intent], Observation], journal: Journal,
                 *, runner: Runner | None = None):
        self.checkout, self.remote = Path(checkout), remote
        self.observer, self.journal = observer, journal
        self.runner = runner or Runner()

    def observe(self, intent: Intent) -> Observation:
        result = self.observer(intent)
        require(isinstance(result, Observation), 'invalid-remote-observation')
        return result

    def publish(self, intent: Intent) -> None:
        packet, manifest, _ = bound_packet(intent, self.journal)
        resolved = git(self.checkout, 'ls-remote', '--get-url', self.remote,
                       runner=self.runner).decode().strip()
        require(resolved == self.remote, 'git-url-rewrite-rejected', 4)
        require(intent.source_commit_sha == intent.candidate_sha, 'native-source-identity-mismatch')
        restore_packet(packet, self.checkout, runner=self.runner)
        git(self.checkout, 'merge-base', '--is-ancestor', manifest['anchor_sha'],
            intent.candidate_sha, runner=self.runner)
        # At most one retry, and only after an ambiguous timeout was reconciled.
        for attempt in range(2):
            before = self.observe(intent)
            decision = reconcile(intent, before)
            if decision.action in ('verified', 'reconcile-pr'):
                self.journal.append('remote-ref-verified', asdict(before))
                return
            require(decision.action == 'publish', decision.reason,
                    3 if decision.action == 'conflict' else 4)
            self.journal.append('ref-write-intent', dict(candidate_sha=intent.candidate_sha,
                expected_head_sha=intent.expected_head_sha, head_ref=intent.head_ref, attempt=attempt))
            failure = None
            try:
                self.runner(['git', 'push', '--porcelain', '--no-follow-tags',
                    '--recurse-submodules=no',
                    f'--force-with-lease={intent.head_ref}:{intent.expected_head_sha or ""}',
                    self.remote, f'{intent.candidate_sha}:{intent.head_ref}'], self.checkout)
            except PublicationError as exc:
                failure = exc
            # An accepted push and a lost response are indistinguishable until readback.
            after = self.observe(intent)
            if after.head_sha == intent.candidate_sha:
                self.journal.append('remote-ref-verified', asdict(after))
                d = reconcile(intent, after)
                require(d.action in ('verified', 'reconcile-pr'), d.reason, 4)
                return
            require(after.head_sha == intent.expected_head_sha, 'head-changed-during-publication', 3)
            if not failure or failure.code != 5 or attempt == 1:
                raise PublicationError('publication-not-applied' if failure else 'ref-readback-mismatch',
                                       failure.code if failure else 5)
        raise PublicationError('publication-uncertain', 5)
