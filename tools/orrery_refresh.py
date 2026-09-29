"""Preview, stage, or explicitly publish a validated daily Earth reference.

Acquisition is separate: fetch_earth_reference.py writes an immutable candidate.
The default here reads that candidate and the checkout without GitHub access.
Only --publish creates a local commit and performs bounded draft-PR delivery.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import re
import subprocess
from pathlib import Path

from delivery_lifecycle import SHA, command
from orrery_delivery import GitHubTransport, Policy, Transport, publish
from orrery_earth import stage_candidate, validate_candidate

BOT = 'github-actions[bot]'
LOG = logging.getLogger(__name__)


def require_clean(checkout: Path) -> None:
    if command(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=checkout).strip():
        raise ValueError('staging/publication requires a clean dedicated checkout')


def commit_candidate(checkout: Path, candidate: dict) -> str:
    paths = candidate['changed_paths']
    if (not paths or paths != sorted(set(paths)) or
            any(path not in candidate['allowed_paths'] for path in paths)):
        raise ValueError('candidate changed paths must be an exact, sorted allowlist subset')
    command(['git', 'add', '--', *paths], cwd=checkout)
    actual = command(['git', 'diff', '--cached', '--name-only'], cwd=checkout).splitlines()
    if sorted(actual) != paths:
        raise ValueError('index contains missing or unexpected candidate paths')
    command(['git', '-c', 'user.name=github-actions[bot]',
             '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
             '-c', 'core.hooksPath=' + os.devnull, '-c', 'commit.gpgsign=false',
             'commit', '-m', f"data: refresh Earth reference for {candidate['data_date']}"], cwd=checkout)
    head = command(['git', 'rev-parse', 'HEAD'], cwd=checkout).strip()
    if not SHA.fullmatch(head):
        raise ValueError('committed candidate identity unavailable')
    require_clean(checkout)
    return head


def run_refresh(checkout: Path, candidate_dir: Path, now: dt.datetime, *, stage: bool = False,
                execute: bool = False, repository: str | None = None,
                expected_base: str | None = None, expected_manifest: str | None = None,
                transport: Transport | None = None) -> dict:
    """One attempt; a changed base or uncertain write requires operator inspection."""
    if type(stage) is not bool or type(execute) is not bool:
        raise ValueError('stage and publication modes require explicit boolean opt-in')
    # Preserve lexical ancestors so the source/staging validator can reject
    # symlink or reparse-point aliases before touching candidate files.
    checkout = checkout.absolute()
    candidate_dir = candidate_dir.absolute()
    if execute and (not repository or not expected_base or not expected_manifest):
        raise ValueError('publication requires repository, expected base and manifest SHA-256')
    if expected_base is not None and not SHA.fullmatch(expected_base):
        raise ValueError('expected base must be a full commit SHA')
    if expected_manifest is not None and not re.fullmatch('[0-9a-f]{64}', expected_manifest):
        raise ValueError('expected manifest must be a SHA-256')
    head = command(['git', 'rev-parse', 'HEAD'], cwd=checkout).strip()
    if not SHA.fullmatch(head) or (expected_base is not None and head != expected_base):
        raise ValueError('checkout differs from the acquisition base; regenerate candidate')
    proof = validate_candidate(candidate_dir, now)
    if expected_manifest is not None and proof.manifest_sha256 != expected_manifest:
        raise ValueError('acquisition manifest changed during artifact handoff')
    if stage or execute:
        require_clean(checkout)
    adapter = None
    observed = None
    if execute:
        adapter = transport or GitHubTransport(Policy(repository, BOT), checkout)
        observed = adapter.observe()
        if observed.get('base_sha') != head:
            raise ValueError('remote master changed since acquisition; regenerate candidate')
    result = stage_candidate(checkout, candidate_dir, now, apply=stage or execute)
    if result.get('state') not in ('validated', 'no-op'):
        raise ValueError('candidate staging did not return a validated result')
    if result.get('manifest_sha256') != proof.manifest_sha256:
        raise ValueError('candidate changed between validation and staging; no commit created')
    result = {**result, 'generation_base_sha': head,
              'manifest_sha256': proof.manifest_sha256,
              'mode': 'publish' if execute else ('stage' if stage else 'preview')}
    if not execute or result['state'] == 'no-op':
        return result
    result['expected_head_sha'] = observed.get('head_sha')
    result['commit_sha'] = commit_candidate(checkout, result)
    delivery = publish(checkout, repository, BOT, result, execute=True, transport=adapter)
    return {**result, **delivery}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate-dir', type=Path, required=True)
    parser.add_argument('--checkout', type=Path, default=Path.cwd())
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--stage', action='store_true', help='Apply local candidate files; do not commit')
    mode.add_argument('--publish', action='store_true', help='Commit and deliver one owned draft PR')
    parser.add_argument('--repository', help='Explicit owner/repository, required for publication')
    parser.add_argument('--expected-base', help='Exact acquisition commit; required for publication')
    parser.add_argument('--expected-manifest-sha256', help='Acquisition evidence hash; required for publication')
    parser.add_argument('--out', type=Path, help='New JSON evidence file; existing evidence is never replaced')
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    try:
        if args.out is not None and args.out.exists():
            raise ValueError('output already exists; preserve previous attempt evidence')
        result = run_refresh(args.checkout, args.candidate_dir, dt.datetime.now(dt.timezone.utc),
                             stage=args.stage, execute=args.publish, repository=args.repository,
                             expected_base=args.expected_base, expected_manifest=args.expected_manifest_sha256)
        encoded = json.dumps(result, indent=2, sort_keys=True) + '\n'
        if args.out is not None:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            with args.out.open('x', encoding='utf-8', newline='\n') as stream:
                stream.write(encoded)
        print(encoded, end='')
        return 1 if result['state'] == 'blocked' else 0
    except (OSError, ValueError, TypeError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        # Remote command errors can contain command/environment details; only
        # controlled ValueError diagnostics are safe to include in workflow logs.
        LOG.error('Orrery refresh failed: %s', str(error) if isinstance(error, ValueError) else type(error).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
