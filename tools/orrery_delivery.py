"""Bounded Earth/weather rolling draft PR delivery; no merge or branch deletion.

The solar research-feed adapter is intentionally independent. Caller-supplied
metadata is never sufficient to authorize a publication: committed tree contents
and current GitHub ownership are verified again at this boundary.
"""
from __future__ import annotations

import base64
import hashlib
import re
import subprocess
import time
from pathlib import Path
from typing import Callable, Protocol

from dataclasses import dataclass
from delivery_lifecycle import Policy as FeedPolicy, SHA, command
from validate_snapshot import loads_strict

BRANCH = 'automation/daily-orrery'
MARKER = '<!-- sol:daily-orrery:v1 -->'
INVENTORY = 'apps/web/visual-assets.v1.json'
MODULE = 'apps/web/js/visualAssetManifest.js'
RASTER = 'apps/web/textures/reference/earth-weather-daily.png'
FAILURES = (OSError, ValueError, KeyError, TypeError, AttributeError, IndexError, RuntimeError, subprocess.SubprocessError)
POST_WRITE_ATTEMPTS = 4
POST_WRITE_SECONDS = 20.0
POST_WRITE_INTERVAL = 2.0


class EvidenceError(ValueError):
    """A controlled diagnostic code, never arbitrary exception text."""

    def __init__(self, reason_code: str):
        super().__init__(reason_code)
        self.reason_code = reason_code


class ObservationMismatch(EvidenceError):
    """A validated PR identity whose separately read ref does not yet agree."""

    def __init__(self, observed: dict):
        super().__init__('pr-head-ref-mismatch')
        self.observed = observed


def _observation_evidence(observed: dict) -> dict:
    """Only bounded immutable identities may reach diagnostic output."""
    result = {}
    for source, target in (('head_sha', 'observed_ref_sha'), ('pr_head_sha', 'observed_pr_head_sha'),
                           ('base_sha', 'observed_base_sha')):
        value = observed.get(source)
        result[target] = value if isinstance(value, str) and SHA.fullmatch(value) else None
    return result


def _known_transition(policy: Policy, candidate: dict, before: dict, observed: dict) -> bool:
    """Retry reads only for the same owned draft and the two known commit SHAs."""
    previous = candidate['expected_head_sha']
    return (previous is not None and before.get('pr_state') == 'OPEN'
            and observed.get('repository') == policy.repository and observed.get('branch') == BRANCH
            and observed.get('base_sha') == candidate['generation_base_sha']
            and observed.get('pr_number') == before.get('pr_number')
            and observed.get('pr_owner') == policy.owner and observed.get('pr_state') == 'OPEN'
            and observed.get('pr_draft') is True
            and observed.get('head_sha') in (previous, candidate['commit_sha'])
            and observed.get('pr_head_sha') in (previous, candidate['commit_sha'])
            and observed.get('head_sha') != observed.get('pr_head_sha'))


@dataclass(frozen=True)
class Policy(FeedPolicy):
    def __post_init__(self):
        super().__post_init__()
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}', self.repository):
            raise ValueError('explicit canonical GitHub repository required')


def hold(reason: str, **details: object) -> dict:
    return {'state': 'blocked', 'action': 'hold', 'reason': reason, **details}


def plan(policy: Policy, observed: dict, candidate: dict) -> dict:
    """Pure lifecycle decision over already verified immutable evidence."""
    if observed.get('repository') != policy.repository or observed.get('branch') != BRANCH:
        return hold('repository or fixed branch identity differs')
    for key in ('commit_sha', 'generation_base_sha'):
        if not isinstance(candidate.get(key), str) or not SHA.fullmatch(candidate[key]):
            return hold('candidate SHA evidence missing')
    if observed.get('base_sha') != candidate['generation_base_sha']:
        return hold('master changed; regenerate candidate')
    if observed.get('head_sha') != candidate.get('expected_head_sha'):
        return hold('automation branch changed; regenerate candidate')
    state = observed.get('pr_state')
    if state not in (None, 'OPEN', 'MERGED'):
        return hold('closed unmerged PR requires operator reconciliation')
    if state is not None and (observed.get('pr_owner') != policy.owner or not observed.get('pr_number')):
        return hold('PR ownership unavailable or mismatched')
    if observed.get('head_sha') is not None:
        if observed.get('branch_owner') != policy.owner or not observed.get('head_validated') or state is None:
            return hold('branch ownership or committed diff proof unavailable')
    if state == 'OPEN' and (not observed.get('pr_draft') or observed.get('head_sha') is None):
        return hold('only an existing owned draft PR may be updated')
    if not candidate.get('changed_paths'):
        return {'state': 'no-op', 'action': 'none', 'reason': 'candidate has no data changes'}
    if (state == 'OPEN' and observed.get('generation_base_sha') == candidate['generation_base_sha']
            and observed.get('semantic_id') == candidate.get('semantic_id')):
        return {'state': 'no-op', 'action': 'none', 'reason': 'same semantic data already proposed at this base'}
    return {'state': 'planned', 'action': 'update' if state == 'OPEN' else 'create',
            'reason': 'owned draft PR only; human review and required checks remain'}


class Transport(Protocol):
    def observe(self) -> dict: ...
    def compare_and_push(self, candidate: dict, *, expected_head: str | None) -> None: ...
    def open_pr(self, candidate: dict) -> None: ...


def _confirmed(policy: Policy, candidate: dict, after: dict) -> bool:
    return (after.get('repository') == policy.repository and after.get('branch') == BRANCH
            and after.get('base_sha') == candidate['generation_base_sha']
            and after.get('head_sha') == candidate['commit_sha']
            and after.get('branch_owner') == policy.owner and after.get('pr_owner') == policy.owner
            and after.get('pr_state') == 'OPEN' and after.get('pr_draft') is True
            and bool(after.get('pr_number')) and after.get('head_validated') is True
            and after.get('generation_base_sha') == candidate['generation_base_sha']
            and after.get('semantic_id') == candidate['semantic_id'])


def publish(checkout: Path, repository: str, owner: str, candidate: dict, *,
            execute: bool = False, transport: Transport | None = None) -> dict:
    """Verify actual commit, discover current state, then optionally publish once.

    No network write occurs unless execute=True. Only known post-push read
    transitions are polled; neither push nor PR creation is ever retried.
    """
    phase = 'input-validation'
    evidence = {'write_attempted': False, 'write_outcome': 'not-attempted',
                'pr_creation_attempted': False, 'pr_creation_outcome': 'not-attempted',
                'observation_attempt': 0}

    def finish(result: dict, code: str) -> dict:
        return {**result, **evidence, 'phase': phase, 'reason_code': code}

    def exhausted() -> dict:
        return finish(hold('post-write observation budget exhausted; inspect before retry'),
                      'reconciliation-exhausted')

    try:
        if type(execute) is not bool:
            raise ValueError('execution requires an explicit boolean opt-in')
        policy = Policy(repository, owner)
        phase = 'candidate-verification'
        verified = verify_candidate(checkout, candidate)
        evidence.update(candidate_sha=verified['commit_sha'], expected_head_sha=verified['expected_head_sha'])
        adapter = transport if transport is not None else GitHubTransport(policy, checkout)
        phase = 'initial-observation'
        before = adapter.observe()
        evidence.update(_observation_evidence(before))
        phase = 'planning'
        decision = plan(policy, before, verified)
        if decision['action'] in ('hold', 'none') or not execute:
            return finish(decision, 'policy-hold' if decision['action'] == 'hold' else decision['state'])
        # Re-observe immediately before the lease-protected write. Even an owned
        # newly opened PR or changed draft status invalidates this attempt.
        phase = 'pre-write-observation'
        latest = adapter.observe()
        evidence.update(_observation_evidence(latest))
        if latest != before:
            return finish(hold('remote state changed before write; re-observe and regenerate'),
                          'pre-write-state-changed')
        phase = 'push'
        evidence.update(write_attempted=True, write_outcome='unknown')
        try:
            adapter.compare_and_push(verified, expected_head=before.get('head_sha'))
        except FAILURES as exc:
            # Preserve the primary uncertain-write diagnostic even if its one
            # readback also fails. Never create a PR following a failed push.
            phase = 'push-reconciliation'
            evidence['observation_attempt'] = 1
            try:
                evidence.update(_observation_evidence(adapter.observe()))
            except FAILURES as observation_error:
                evidence['observation_error_type'] = type(observation_error).__name__
                if isinstance(observation_error, ObservationMismatch):
                    evidence.update(_observation_evidence(observation_error.observed))
                    evidence['observation_reason_code'] = 'pr-head-ref-mismatch'
            return finish(hold('push outcome uncertain; no PR creation attempted',
                               error_type=type(exc).__name__), 'push-outcome-uncertain')
        evidence['write_outcome'] = 'acknowledged'
        creation_uncertain = False
        if decision['action'] == 'create':
            phase = 'pr-creation'
            evidence.update(pr_creation_attempted=True, pr_creation_outcome='unknown')
            try:
                adapter.open_pr(verified)
                evidence['pr_creation_outcome'] = 'acknowledged'
            except FAILURES:
                creation_uncertain = True
        phase = 'post-write-observation'
        deadline = time.monotonic() + POST_WRITE_SECONDS
        for attempt in range(1, POST_WRITE_ATTEMPTS + 1):
            if time.monotonic() >= deadline:
                return exhausted()
            evidence['observation_attempt'] = attempt
            try:
                after = (adapter.observe_until(deadline) if isinstance(adapter, GitHubTransport)
                         else adapter.observe())
            except ObservationMismatch as exc:
                evidence.update(_observation_evidence(exc.observed))
                if not _known_transition(policy, verified, before, exc.observed):
                    raise
            else:
                evidence.update(_observation_evidence(after))
                if time.monotonic() >= deadline:
                    return exhausted()
                same_pr = decision['action'] == 'create' or after.get('pr_number') == before.get('pr_number')
                if _confirmed(policy, verified, after) and same_pr:
                    phase = 'complete'
                    evidence['write_outcome'] = 'confirmed'
                    if evidence['pr_creation_attempted']:
                        evidence['pr_creation_outcome'] = 'confirmed'
                    return finish({'state': 'awaiting-approval', 'action': decision['action'],
                                   'head_sha': after['head_sha'], 'pr_number': after['pr_number'],
                                   'semantic_id': verified['semantic_id'], 'url': after.get('pr_url'),
                                   'creation_reconciled': creation_uncertain}, 'post-write-confirmed')
                # A completely unchanged, previously verified owned draft is
                # also a known stale read. Every other inconsistency holds.
                if decision['action'] != 'update' or after != before:
                    return finish(hold('post-write state is not confirmed; inspect before retry',
                                       uncertain_creation=creation_uncertain), 'post-write-state-mismatch')
            remaining = deadline - time.monotonic()
            if attempt == POST_WRITE_ATTEMPTS or remaining <= POST_WRITE_INTERVAL:
                return exhausted()
            time.sleep(POST_WRITE_INTERVAL)
        return exhausted()
    except FAILURES as exc:
        code = exc.reason_code if isinstance(exc, EvidenceError) else phase + '-failed'
        if isinstance(exc, ObservationMismatch):
            evidence.update(_observation_evidence(exc.observed))
        return finish(hold('candidate or remote evidence failed; no success claimed',
                           error_type=type(exc).__name__), code)


def verify_candidate(checkout: Path, candidate: dict, *, run: Callable = command) -> dict:
    """Require clean HEAD, one exact parent and bounded actual committed blobs."""
    checkout = Path(checkout).resolve()
    def git(*args: str) -> str:
        return run(['git', '--no-replace-objects', *args], cwd=checkout)
    head, base = candidate.get('commit_sha'), candidate.get('generation_base_sha')
    if any(not isinstance(sha, str) or not SHA.fullmatch(sha) for sha in (head, base)):
        raise ValueError('immutable commit and generation base SHAs required')
    expected = candidate.get('expected_head_sha')
    if expected is not None and (not isinstance(expected, str) or not SHA.fullmatch(expected)):
        raise ValueError('expected branch head must be exact or absent')
    if git('rev-parse', 'HEAD') != head or git('status', '--porcelain=v1', '--untracked-files=all'):
        raise ValueError('candidate must be the clean current checkout HEAD')
    if git('rev-list', '--parents', '-n', '1', head).split() != [head, base]:
        raise ValueError('candidate must have exactly the pinned generation base as parent')

    def tree(sha: str) -> dict:
        result = {}
        for entry in git('ls-tree', '-r', '-z', '--full-tree', sha).split('\0'):
            if not entry:
                continue
            metadata, path = entry.split('\t', 1)
            mode, kind, oid = metadata.split(' ')
            if path in result:
                raise ValueError('duplicate Git tree path')
            result[path] = (mode, kind, oid)
        return result

    def blob(oid: str) -> bytes:
        if not SHA.fullmatch(oid) or not 0 < int(git('cat-file', '-s', oid)) <= 32 * 1024 * 1024:
            raise ValueError('oversized or invalid committed blob')
        return subprocess.run(['git', '--no-replace-objects', 'cat-file', 'blob', oid], cwd=checkout,
                              check=True, capture_output=True, timeout=120).stdout

    base_tree, head_tree = tree(base), tree(head)
    proof = verify_trees(base_tree, head_tree, blob)
    # Match the checked-out generated paths as well; skip-worktree/assume-unchanged
    # flags must not hide a different local candidate from this boundary.
    import stat
    for path in proof['changed_paths']:
        target = checkout / path
        for part in (target, *target.parents):
            if part == checkout.parent:
                break
            if part.is_symlink() or (part.exists() and getattr(part.lstat(), 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT):
                raise ValueError('generated checkout path is linked or redirected')
        entry = head_tree.get(path)
        if entry is None:
            if target.exists():
                raise ValueError('deleted candidate raster still exists in checkout')
        elif not target.is_file() or target.read_bytes() != blob(entry[2]):
            raise ValueError('working data differs from committed candidate')
    return {**proof, 'commit_sha': head, 'generation_base_sha': base, 'expected_head_sha': expected}

class GitHubTransport:
    """Bounded GitHub.com adapter; ownership requires PR and commit evidence."""

    def __init__(self, policy: Policy, checkout: Path, *, run: Callable = command):
        self.policy, self.checkout, self.run = policy, Path(checkout), run
        self._read_deadline: float | None = None

    def _run(self, args: list[str]) -> str:
        if self._read_deadline is None:
            return self.run(args, cwd=self.checkout)
        remaining = self._read_deadline - time.monotonic()
        if remaining <= 0:
            raise EvidenceError('reconciliation-exhausted')
        # The production runner enforces the remaining total budget on every
        # command, including all API requests within one full observation.
        if self.run is command:
            try:
                result = subprocess.run(args, cwd=self.checkout, check=True, capture_output=True,
                                        text=True, timeout=min(120, remaining)).stdout.strip()
            except subprocess.TimeoutExpired as exc:
                raise EvidenceError('reconciliation-exhausted') from exc
        else:
            result = self.run(args, cwd=self.checkout)
        if time.monotonic() >= self._read_deadline:
            raise EvidenceError('reconciliation-exhausted')
        return result

    def observe_until(self, deadline: float) -> dict:
        """Bound the normal read path; preserve observe() and injected runners."""
        previous = self._read_deadline
        try:
            self._read_deadline = deadline
            return self.observe()
        finally:
            self._read_deadline = previous

    def _api(self, endpoint: str) -> object:
        return loads_strict(self._run(['gh', 'api', '--hostname', 'github.com', endpoint]))

    def _origin(self) -> None:
        expected = {f'https://github.com/{self.policy.repository}',
                    f'https://github.com/{self.policy.repository}.git',
                    f'git@github.com:{self.policy.repository}.git',
                    f'ssh://git@github.com/{self.policy.repository}.git'}
        for direction in ([], ['--push']):
            values = self._run(['git', 'remote', 'get-url', '--all', *direction, 'origin']).splitlines()
            if len(values) != 1 or values[0] not in expected:
                raise EvidenceError('origin-identity-mismatch')

    def _tree(self, tree_sha: str) -> dict:
        if not SHA.fullmatch(tree_sha):
            raise EvidenceError('remote-tree-sha-invalid')
        value = self._api(f'repos/{self.policy.repository}/git/trees/{tree_sha}?recursive=1')
        if value.get('truncated') is not False or not isinstance(value.get('tree'), list):
            raise EvidenceError('remote-tree-incomplete')
        result = {}
        for item in value['tree']:
            if item['type'] == 'tree':
                continue
            path = item['path']
            if path in result:
                raise EvidenceError('remote-tree-path-duplicate')
            result[path] = (item['mode'], item['type'], item['sha'])
        return result

    def _blob(self, sha: str) -> bytes:
        if not SHA.fullmatch(sha):
            raise EvidenceError('remote-blob-sha-invalid')
        value = self._api(f'repos/{self.policy.repository}/git/blobs/{sha}')
        if value.get('encoding') != 'base64' or type(value.get('size')) is not int or not 0 < value['size'] <= 32 * 1024 * 1024:
            raise EvidenceError('remote-blob-shape-invalid')
        raw = base64.b64decode(''.join(value['content'].splitlines()), validate=True)
        if len(raw) != value['size'] or hashlib.sha1(b'blob ' + str(len(raw)).encode('ascii') + b'\0' + raw).hexdigest() != sha:
            raise EvidenceError('remote-blob-identity-mismatch')
        return raw

    def observe(self) -> dict:
        self._origin()
        repo = self.policy.repository
        info = self._api(f'repos/{repo}')
        if info.get('full_name') != repo or info.get('default_branch') != 'master':
            raise EvidenceError('repository-identity-mismatch')
        query = f'head={repo.split("/")[0]}:{BRANCH}&base=master'
        # Only current ownership and the latest completed cycle authorize the
        # next action. Historical PR count must never impose a lifetime limit.
        prs = self._api(f'repos/{repo}/pulls?state=open&{query}&per_page=2')
        if not isinstance(prs, list) or len(prs) > 1:
            raise EvidenceError('open-pr-discovery-invalid')
        expected_state = 'open'
        if not prs:
            prs = self._api(f'repos/{repo}/pulls?state=closed&{query}&sort=created&direction=desc&per_page=1')
            if not isinstance(prs, list) or len(prs) > 1:
                raise EvidenceError('closed-pr-discovery-invalid')
            expected_state = 'closed'
        for pr in prs:
            if (pr['user']['login'] != self.policy.owner or MARKER not in (pr.get('body') or '')
                    or pr['head']['ref'] != BRANCH or pr['head']['repo']['full_name'] != repo
                    or pr['base']['ref'] != 'master' or pr['base']['repo']['full_name'] != repo
                    or type(pr['number']) is not int or pr['number'] <= 0
                    or pr['state'] != expected_state):
                raise EvidenceError('pr-ownership-or-identity-mismatch')
        pr = prs[0] if prs else None
        refs = self._api(f'repos/{repo}/git/matching-refs/heads/{BRANCH}')
        refs = [item for item in refs if item['ref'] == f'refs/heads/{BRANCH}']
        if len(refs) > 1:
            raise EvidenceError('rolling-ref-ambiguous')
        head = refs[0]['object']['sha'] if refs else None
        base = self._api(f'repos/{repo}/git/ref/heads/master')['object']['sha']
        if not SHA.fullmatch(base) or (head is not None and not SHA.fullmatch(head)):
            raise EvidenceError('observed-sha-invalid')
        result = dict(repository=repo, branch=BRANCH, base_sha=base, head_sha=head,
                      pr_head_sha=pr['head']['sha'] if pr else None,
                      branch_owner=None, pr_number=pr['number'] if pr else None,
                      pr_owner=pr['user']['login'] if pr else None,
                      pr_state=('OPEN' if pr['state'] == 'open' else 'MERGED' if pr.get('merged_at') else 'CLOSED') if pr else None,
                      pr_draft=pr.get('draft') if pr else None, pr_url=pr.get('html_url') if pr else None,
                      head_validated=False, generation_base_sha=None, semantic_id=None)
        if head:
            if pr is None or pr['head']['sha'] != head:
                raise ObservationMismatch(result)
            commit = self._api(f'repos/{repo}/commits/{head}')
            if commit.get('sha') != head or (commit.get('author') or {}).get('login') != self.policy.owner or len(commit['parents']) != 1:
                raise EvidenceError('commit-ownership-or-parent-invalid')
            parent = commit['parents'][0]['sha']
            if not isinstance(parent, str) or not SHA.fullmatch(parent):
                raise EvidenceError('remote-parent-sha-invalid')
            parent_commit = self._api(f'repos/{repo}/git/commits/{parent}')
            old = self._tree(parent_commit['tree']['sha'])
            new = self._tree(commit['commit']['tree']['sha'])
            try:
                proof = verify_trees(old, new, self._blob)
            except EvidenceError:
                raise
            except ValueError as exc:
                raise EvidenceError('remote-data-proof-invalid') from exc
            result.update(branch_owner=self.policy.owner, head_validated=True,
                          generation_base_sha=parent, semantic_id=proof['semantic_id'])
        return result

    def compare_and_push(self, candidate: dict, *, expected_head: str | None) -> None:
        sha = candidate.get('commit_sha', '')
        if not SHA.fullmatch(sha) or (expected_head is not None and not SHA.fullmatch(expected_head)):
            raise ValueError('push requires immutable commit and exact expected head')
        import os
        self._run(['git', '-c', 'credential.helper=', '-c',
                   'credential.https://github.com.helper=!gh auth git-credential',
                   '-c', 'core.hooksPath=' + os.devnull,
                   'push', '--porcelain',
                   f'--force-with-lease=refs/heads/{BRANCH}:{expected_head or ""}',
                   f'https://github.com/{self.policy.repository}.git', f'{sha}:refs/heads/{BRANCH}'])

    def open_pr(self, candidate: dict) -> None:
        # Body uses fixed prose: metadata cannot choose commands, labels, links,
        # reviewers, merge controls or repository settings.
        body = (MARKER + '\n\nRefresh the source-qualified Earth weather reference from the fixed NASA recipe.\n\n'
                'This is a draft data-only candidate. Human review and required checks are still required. '
                'No automatic merge or deployment is requested.\n')
        import tempfile
        with tempfile.TemporaryDirectory(prefix='sol-orrery-pr-') as folder:
            path = Path(folder) / 'body.md'
            path.write_text(body, encoding='utf-8')
            self._run(['gh', 'pr', 'create', '--repo', 'github.com/' + self.policy.repository,
                       '--head', BRANCH, '--base', 'master', '--draft',
                       '--title', 'Refresh daily Earth weather reference', '--body-file', str(path)])


def verify_trees(before: dict, after: dict, read_blob: Callable[[str], bytes]) -> dict:
    """Check every changed path and exact admitted bytes in two complete trees."""
    from orrery_earth import get_weather, validate_inventory_transition
    changed = sorted(path for path in before.keys() | after.keys() if before.get(path) != after.get(path))

    def content(tree: dict, path: str) -> bytes:
        mode, kind, oid = tree[path]
        if mode != '100644' or kind != 'blob' or not SHA.fullmatch(oid):
            raise ValueError('generated data must be a non-executable regular Git blob')
        return read_blob(oid)

    base_inventory = content(before, INVENTORY)
    old_weather = get_weather(loads_strict(base_inventory.decode('utf-8')))
    old_path = 'apps/web/' + old_weather['path']
    if not re.fullmatch(r'apps/web/textures/reference/earth-weather-(?:\d{8}|daily)\.png', old_path):
        raise ValueError('base weather raster path is not an admitted target')
    allowed = {INVENTORY, MODULE, RASTER, old_path}
    if not changed or not set(changed).issubset(allowed):
        raise ValueError('actual commit diff exceeds exact generated-data allowlist')
    if old_path != RASTER and (old_path not in before or old_path in after):
        raise ValueError('only the inventoried previous weather raster may be deleted')
    if any(path not in after and path != old_path for path in changed):
        raise ValueError('required generated file deleted')
    for path in changed:
        for tree in (before, after):
            if path in tree:
                mode, kind, _ = tree[path]
                if mode != '100644' or kind != 'blob':
                    raise ValueError('changed Git mode is not a regular data file')
    old_raster = content(before, old_path)
    if hashlib.sha256(old_raster).hexdigest() != old_weather['sha256'] or len(old_raster) != old_weather['bytes']:
        raise ValueError('base raster differs from its inventory')
    weather = validate_inventory_transition(base_inventory, content(after, INVENTORY),
                                            content(after, RASTER), content(after, MODULE))
    if weather['path'] != 'textures/reference/earth-weather-daily.png':
        raise ValueError('candidate raster path differs from fixed publication target')
    semantic_id = weather['automated_refresh']['semantic_id']
    if not isinstance(semantic_id, str) or not re.fullmatch(r'[a-f0-9]{64}', semantic_id):
        raise ValueError('candidate semantic identity invalid')
    return {'changed_paths': changed, 'semantic_id': semantic_id, 'sha256': weather['sha256'],
            'data_date': weather['automated_refresh']['data_date']}
