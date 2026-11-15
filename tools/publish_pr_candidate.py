#!/usr/bin/env python3
"""Prepare, execute and resume verified PR publication; never merge or deploy."""
from __future__ import annotations

import argparse
import re
import sys
import uuid
from dataclasses import asdict
from pathlib import Path

from pr_publication import Intent, PublicationError, reconcile, refname, require
from pr_publication_packet import (DirectoryStore, Journal, Runner, build_packet, digest,
                                   git, json_bytes, read_packet)
from pr_publication_git import NativeGitTransport, bound_packet
from pr_publication_api import ApiGitTransport
from pr_publication_github import GitHubClient


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    subs = p.add_subparsers(dest='command', required=True)
    for name in ('inspect', 'prepare', 'execute', 'resume'):
        sub = subs.add_parser(name)
        sub.add_argument('--checkout', type=Path, default=Path.cwd())
        sub.add_argument('--timeout', type=float, default=180)
        if name in ('inspect', 'prepare'):
            sub.add_argument('--repository', required=True)
            sub.add_argument('--head', required=True)
            sub.add_argument('--base', default='master')
            sub.add_argument('--pr', type=int)
            sub.add_argument('--pr-owner')
            sub.add_argument('--transport', choices=('native', 'api'), default='native')
        if name == 'prepare':
            sub.add_argument('--title')
            sub.add_argument('--allow-path', action='append', required=True)
            sub.add_argument('--workflow', action='append')
        if name != 'inspect':
            sub.add_argument('--store', type=Path, required=True)
            sub.add_argument('--confirm-persistent-store', action='store_true')
            sub.add_argument('--operation', required=name != 'prepare')
    return p


def full_ref(value: str) -> str:
    return refname(value if value.startswith('refs/') else 'refs/heads/'+value)


def workflow_scope(values: list[str]) -> list[str]:
    require(isinstance(values, list) and 0 < len(values) <= 16 and len(values) == len(set(values))
            and all(isinstance(v, str) and bool(re.fullmatch(
                r'\.github/workflows/[A-Za-z0-9_-]+\.ya?ml', v)) for v in values), 'invalid-workflow-scope')
    return values


def descriptor(journal: Journal) -> dict:
    require(journal.records and journal.records[0]['stage'] == 'prepared', 'operation-not-prepared', 4)
    d = journal.records[0]['details']
    require(set(d) == {'intent', 'packet_reference', 'transport', 'pr_number', 'pr_owner',
                       'title', 'workflows'}, 'invalid-operation-descriptor')
    Intent.from_dict(d['intent'])
    require(d['transport'] in ('native', 'api') and isinstance(d['packet_reference'], str)
            and (d['pr_number'] is None or type(d['pr_number']) is int and d['pr_number'] > 0)
            and isinstance(d['pr_owner'], str) and bool(re.fullmatch(
                r'[A-Za-z0-9_\[\]-]+', d['pr_owner'])), 'invalid-operation-scope')
    require((d['pr_number'] is not None and d['title'] is None) or
            (isinstance(d['title'], str) and 0 < len(d['title']) <= 256), 'invalid-pr-intent')
    workflow_scope(d['workflows'])
    return d


def prepare(args, store: DirectoryStore, runner: Runner, client_factory) -> dict:
    operation_id = args.operation or ('publish-' + uuid.uuid4().hex)
    head, base = full_ref(args.head), full_ref(args.base)
    workflows = workflow_scope(args.workflow or ['.github/workflows/ci.yml'])
    client = client_factory(args.repository, args.checkout, runner=runner)
    info = client.preflight(head.removeprefix('refs/heads/'))
    base_sha, expected = client.get_ref(base), client.get_ref(head)
    require(base_sha is not None, 'base-unavailable', 4)
    owner = args.pr_owner or (None if args.pr is not None else client.viewer())
    value = client.find_pr(head.removeprefix('refs/heads/'), base.removeprefix('refs/heads/'), args.pr, owner)
    number = value['number'] if value else None
    owner = owner or (value.get('user', {}).get('login') if value else None)
    require(args.pr is None or number == args.pr, 'requested-pr-unavailable', 4)
    require(number is not None or (isinstance(args.title, str) and 0 < len(args.title) <= 256),
            'new-pr-title-required', 4)
    if args.transport == 'api' and expected is not None:
        require(client.supports_expected_head is True, 'expected-head-capability-unavailable', 4)
    with store.lock(operation_id):
        journal = Journal(store, operation_id)
        require(not journal.records, 'operation-exists-use-resume', 3)
        candidate = git(args.checkout, 'rev-parse', 'HEAD', runner=runner).decode().strip()
        packet = build_packet(args.checkout, expected or base_sha, candidate, args.allow_path, runner=runner)
        manifest, _, _ = read_packet(packet)
        intent = Intent(operation_id, args.repository, info['node_id'], base, head, base_sha,
                        expected, candidate, candidate, manifest['tree_sha'], digest(packet)).validate()
        reference = store.put_packet(packet)
        details = dict(intent=intent.to_dict(), packet_reference=reference, transport=args.transport,
                       pr_number=number, pr_owner=owner, title=None if number else args.title, workflows=workflows)
        journal.append('prepared', details)
        descriptor(journal)
        receipt = journal.append('recovery-persisted', dict(packet_reference=reference, packet_sha256=digest(packet)))
        return dict(state='prepared', operation_id=operation_id, packet_reference=reference,
                    packet_sha256=digest(packet), receipt_reference=receipt, source_published=False)


def ensure_pr(client, intent: Intent, journal: Journal) -> int:
    def read():
        return client.find_pr(intent.head_ref.removeprefix('refs/heads/'),
            intent.base_ref.removeprefix('refs/heads/'), client.pr_number, client.pr_owner)
    value = read()
    if value is None:
        require(client.pr_number is None and client.title, 'requested-pr-unavailable', 4)
        journal.append('pr-write-intent', dict(head_ref=intent.head_ref, base_ref=intent.base_ref,
                                              candidate_sha=intent.candidate_sha))
        try:
            number = client.create_pr(intent)
            journal.append('pr-write-result', {'pr_number': number})
        except PublicationError:
            pass
        value = read()  # Never retry PR creation merely because the response was lost.
    require(value is not None and value['head']['sha'] == intent.candidate_sha
            and value['base']['sha'] == intent.observed_base_sha,
            'pr-creation-or-head-not-verified', 5)
    return value['number']


def execute(args, store: DirectoryStore, runner: Runner, client_factory) -> dict:
    with store.lock(args.operation):
        journal = Journal(store, args.operation)
        try:
            d = descriptor(journal); intent = Intent.from_dict(d['intent'])
            require(intent.operation_id == args.operation, 'operation-identity-mismatch')
            client = client_factory(intent.repository, args.checkout, runner=runner)
            client.pr_number, client.pr_owner, client.title = d['pr_number'], d['pr_owner'], d['title']
            if d['transport'] == 'native':
                transport = NativeGitTransport(args.checkout, client.git_remote(), client.observe, journal, runner=runner)
            else:
                transport = ApiGitTransport(args.checkout, client, journal, runner=runner)
            transport.publish(intent)
            effective = transport.effective_intent(intent) if d['transport'] == 'api' else intent
            number = ensure_pr(client, effective, journal)
            observed = client.observe(effective)
            decision = reconcile(effective, observed)
            require(decision.action == 'verified', decision.reason, 3 if decision.action == 'conflict' else 5)
            _, manifest, _ = bound_packet(intent, journal)
            commit = client.get_commit(effective.candidate_sha)
            require(isinstance(commit, dict) and commit.get('tree', {}).get('sha') == intent.tree_sha
                    and [p.get('sha') for p in commit.get('parents', [])] == manifest['parents'],
                    'published-tree-or-parents-mismatch', 5)
            journal.append('pr-verified', asdict(observed))
            ci = client.ci_evidence(effective, number, d['workflows'])
            if ci['ci_observed']: journal.append('ci-observed', ci)
            final = client.observe(effective)
            decision = reconcile(effective, final)
            require(decision.action == 'verified', decision.reason, 3 if decision.action == 'conflict' else 5)
            result = dict(state='source-published', operation_id=intent.operation_id,
                source_commit_sha=intent.source_commit_sha, published_commit_sha=effective.candidate_sha,
                tree_sha=intent.tree_sha, pr_number=number, pr_url=f'https://github.com/{intent.repository}/pull/{number}',
                observed_at=final.observed_at, source_published=True, merged=False, deployed=False, **ci)
            reference = journal.append('complete', result)
            return dict(result, receipt_reference=reference, receipt_sha256=journal.last_digest)
        except (PublicationError, OSError) as exc:
            failure = exc if isinstance(exc, PublicationError) else PublicationError('storage-or-local-io-failed', 5)
            try:
                journal.append('uncertain' if failure.code == 5 else 'blocked', {'reason': failure.reason, 'exit_code': failure.code})
            except (PublicationError, OSError):
                pass  # No false claim that a failed storage operation was persisted.
            raise failure


def main(argv: list[str] | None = None, *, client_factory=GitHubClient) -> int:
    args = parser().parse_args(argv)
    try:
        runner = Runner(args.timeout)
        args.checkout = args.checkout.absolute()
        if args.command == 'inspect':
            client = client_factory(args.repository, args.checkout, runner=runner)
            head, base = full_ref(args.head), full_ref(args.base)
            info = client.preflight(head.removeprefix('refs/heads/'))
            result = dict(state='inspected', repository=args.repository, repository_id=info['node_id'],
                head_ref=head, head_sha=client.get_ref(head), base_ref=base, base_sha=client.get_ref(base),
                expected_head_capability=client.supports_expected_head, source_published=False)
        else:
            require(args.confirm_persistent_store, 'persistent-store-confirmation-required', 4)
            store_path, checkout = args.store.absolute(), args.checkout.resolve()
            require(not store_path.resolve().is_relative_to(checkout)
                    and not checkout.is_relative_to(store_path.resolve()), 'store-must-be-outside-checkout')
            store = DirectoryStore(store_path)
            result = prepare(args, store, runner, client_factory) if args.command == 'prepare' else execute(args, store, runner, client_factory)
        print(json_bytes(result).decode(), end='')
        return 0
    except PublicationError as exc:
        print(json_bytes(dict(state='uncertain' if exc.code == 5 else 'blocked', reason=exc.reason,
                              exit_code=exc.code, source_published=None)).decode(), end='')
        return exc.code
    except (OSError, ValueError, TypeError, KeyError, UnicodeError):
        print(json_bytes(dict(state='blocked', reason='local-or-input-operation-failed',
                              exit_code=2, source_published=None)).decode(), end='')
        return 2


if __name__ == '__main__':
    sys.exit(main())
