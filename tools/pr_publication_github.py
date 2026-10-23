"""Concrete GitHub client through an existing, authorized gh login.

Only canonical github.com endpoints are used. Provider response bodies and
credential diagnostics never become failure messages or receipt contents.
"""
from __future__ import annotations

import base64
import re
from pathlib import Path
from urllib.parse import urlencode, quote

from pr_publication import Intent, Observation, PublicationError, json_bytes, loads, oid, require, utc_now
from pr_publication_packet import Runner, git_oid


def decode_response(status: int, raw: bytes, *, missing: bool = False):
    raw = raw.replace(b'\r\n', b'\n')
    header, separator, body = raw.partition(b'\n\n')
    first = header.split(b'\n', 1)[0]
    match = re.fullmatch(rb'HTTP/\S+ ([0-9]{3})(?: .*)?', first)
    require(separator and match is not None, 'invalid-api-response', 5)
    http = int(match.group(1))
    if http == 404 and missing: return None
    require(200 <= http < 300 and status == 0, 'github-request-rejected',
            5 if http == 429 or http >= 500 else 4)
    return loads(body)


class GitHubClient:
    # The concrete gh client can invoke GraphQL. A connected-app bridge that
    # cannot invoke updateRefs MUST declare this capability false instead.
    supports_expected_head = True

    def __init__(self, repository: str, cwd: Path, *, runner: Runner | None = None):
        require(bool(re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository)), 'invalid-repository')
        self.repository, self.cwd = repository, Path(cwd)
        self.runner = runner or Runner()
        self.pr_number, self.pr_owner, self.title = None, None, None

    def request(self, method: str, endpoint: str, payload=None, *, missing: bool = False):
        require(method in ('GET', 'POST') and (endpoint == 'graphql' or endpoint == 'user'
                or endpoint == f'repos/{self.repository}'
                or endpoint.startswith(f'repos/{self.repository}/')), 'unsupported-api-route')
        args = ['gh', 'api', '--hostname', 'github.com', '--include', '--method', method, endpoint]
        data = None
        if payload is not None:
            args += ['--input', '-']; data = json_bytes(payload)
        status, output = self.runner.capture(args, self.cwd, data)
        return decode_response(status, output, missing=missing)

    def info(self) -> dict:
        value = self.request('GET', f'repos/{self.repository}')
        require(isinstance(value, dict) and value.get('full_name') == self.repository
                and isinstance(value.get('node_id'), str)
                and isinstance(value.get('default_branch'), str), 'repository-identity-mismatch')
        return value

    def preflight(self, head: str) -> dict:
        info = self.info()
        require(head != info['default_branch'] and info.get('permissions', {}).get('push') is True,
                'repository-write-access-or-target-unavailable', 4)
        return info

    def viewer(self) -> str:
        value = self.request('GET', 'user')
        require(isinstance(value, dict) and isinstance(value.get('login'), str), 'viewer-unavailable', 4)
        return value['login']

    def git_remote(self) -> str:
        return f'https://github.com/{self.repository}.git'

    def get_ref(self, full_ref: str) -> str | None:
        value = self.request('GET', f'repos/{self.repository}/git/ref/' +
                             quote(full_ref.removeprefix('refs/'), safe='/'), missing=True)
        if value is None: return None
        require(isinstance(value, dict) and value.get('ref') == full_ref
                and value.get('object', {}).get('type') == 'commit', 'unexpected-reference-result')
        return oid(value['object']['sha'])

    def pages(self, endpoint: str, key: str | None = None) -> list:
        all_items = []
        for page in range(1, 101):
            suffix = ('&' if '?' in endpoint else '?') + f'per_page=100&page={page}'
            value = self.request('GET', endpoint + suffix)
            items = value.get(key) if key and isinstance(value, dict) else value
            require(isinstance(items, list), 'invalid-paginated-response')
            all_items.extend(items)
            if len(items) < 100: return all_items
        raise PublicationError('pagination-limit-reached', 4)

    def find_pr(self, head: str, base: str, number: int | None, owner: str | None):
        if number is not None:
            require(type(number) is int and number > 0, 'invalid-pr-number')
            value = self.request('GET', f'repos/{self.repository}/pulls/{number}')
            values = [value]
        else:
            query = urlencode(dict(state='all', head=f'{self.repository.split("/")[0]}:{head}', base=base))
            values = self.pages(f'repos/{self.repository}/pulls?{query}')
        require(len(values) <= 1, 'ambiguous-pr-history', 3)
        if not values: return None
        value = values[0]
        require(isinstance(value, dict) and value.get('state') == 'open'
                and value.get('merged_at') is None
                and value.get('head', {}).get('ref') == head
                and value.get('base', {}).get('ref') == base
                and value.get('head', {}).get('repo', {}).get('full_name') == self.repository
                and value.get('base', {}).get('repo', {}).get('full_name') == self.repository
                and (owner is None or value.get('user', {}).get('login') == owner),
                'pr-scope-or-owner-mismatch', 3)
        require(type(value.get('number')) is int and value['number'] > 0
                and (number is None or value['number'] == number), 'invalid-pr-number')
        oid(value['head'].get('sha')); oid(value['base'].get('sha'))
        return value

    def observe(self, intent: Intent) -> Observation:
        intent.validate()
        info = self.preflight(intent.head_ref.removeprefix('refs/heads/'))
        require(intent.repository == self.repository and info['node_id'] == intent.repository_id,
                'repository-node-id-mismatch')
        head, base = self.get_ref(intent.head_ref), self.get_ref(intent.base_ref)
        require(base is not None, 'base-ref-unavailable', 4)
        value = self.find_pr(intent.head_ref.removeprefix('refs/heads/'),
            intent.base_ref.removeprefix('refs/heads/'), self.pr_number, self.pr_owner)
        return Observation(self.repository, intent.head_ref, head, intent.base_ref, base,
            value['number'] if value else None, value['head']['sha'] if value else None,
            value['state'] if value else None, utc_now())

    def get_blob(self, sha: str) -> bytes | None:
        value = self.request('GET', f'repos/{self.repository}/git/blobs/{oid(sha)}', missing=True)
        if value is None: return None
        require(value.get('sha') == sha and value.get('encoding') == 'base64'
                and isinstance(value.get('content'), str), 'invalid-blob-response')
        try: raw = base64.b64decode(''.join(value['content'].split()), validate=True)
        except (ValueError, TypeError) as exc: raise PublicationError('invalid-blob-base64') from exc
        require(git_oid('blob', raw) == sha and value.get('size') == len(raw), 'remote-blob-identity-mismatch')
        return raw

    def put_blob(self, raw: bytes) -> str:
        value = self.request('POST', f'repos/{self.repository}/git/blobs',
            dict(encoding='base64', content=base64.b64encode(raw).decode('ascii')))
        return oid(value.get('sha'))

    def get_tree(self, sha: str):
        value = self.request('GET', f'repos/{self.repository}/git/trees/{oid(sha)}', missing=True)
        if value is not None:
            require(value.get('sha') == sha and not value.get('truncated'), 'invalid-tree-response')
        return value

    def put_tree(self, base: str, entries: list) -> str:
        value = self.request('POST', f'repos/{self.repository}/git/trees',
                             dict(base_tree=oid(base), tree=entries))
        return oid(value.get('sha'))

    def get_commit(self, sha: str):
        value = self.request('GET', f'repos/{self.repository}/git/commits/{oid(sha)}', missing=True)
        if value is not None: require(value.get('sha') == sha, 'commit-response-mismatch')
        return value

    def put_commit(self, payload: dict) -> str:
        value = self.request('POST', f'repos/{self.repository}/git/commits', payload)
        return oid(value.get('sha'))

    def update_refs(self, intent: Intent) -> None:
        intent.validate()
        require(intent.repository == self.repository, 'repository-mismatch')
        result = self.request('POST', 'graphql', {
            'query': 'mutation Publish($input: UpdateRefsInput!) { updateRefs(input: $input) { clientMutationId } }',
            'variables': {'input': {'repositoryId': intent.repository_id,
                'clientMutationId': intent.operation_id, 'refUpdates': [{
                    'name': intent.head_ref, 'beforeOid': intent.expected_head_sha or '0'*40,
                    'afterOid': intent.candidate_sha, 'force': False}]}}})
        require(isinstance(result, dict) and not result.get('errors')
                and isinstance(result.get('data', {}).get('updateRefs'), dict), 'graphql-update-rejected', 5)

    def create_ref(self, intent: Intent) -> None:
        intent.validate()
        require(intent.expected_head_sha is None and intent.repository == self.repository,
                'create-only-ref-required')
        self.request('POST', f'repos/{self.repository}/git/refs',
                     dict(ref=intent.head_ref, sha=intent.candidate_sha))

    def create_pr(self, intent: Intent) -> int:
        require(isinstance(self.title, str) and 0 < len(self.title) <= 256
                and self.pr_number is None, 'new-pr-title-required', 4)
        value = self.request('POST', f'repos/{self.repository}/pulls', dict(
            title=self.title, head=intent.head_ref.removeprefix('refs/heads/'),
            base=intent.base_ref.removeprefix('refs/heads/'), draft=True,
            body=f'Published candidate `{intent.candidate_sha}`. Required checks and human review remain separate. No merge or deployment is requested.'))
        require(type(value.get('number')) is int and value['number'] > 0, 'invalid-pr-create-response', 5)
        return value['number']

    def ci_evidence(self, intent: Intent, number: int, workflows: list[str]) -> dict:
        require(isinstance(workflows, list) and workflows and len(workflows) == len(set(workflows))
                and all(isinstance(p, str) and bool(re.fullmatch(
                    r'\.github/workflows/[A-Za-z0-9_-]+\.ya?ml', p)) for p in workflows), 'invalid-workflow-scope')
        query = urlencode(dict(event='pull_request', branch=intent.head_ref.removeprefix('refs/heads/')))
        runs = self.pages(f'repos/{self.repository}/actions/runs?{query}', 'workflow_runs')
        selected = {}
        for run in runs:
            if (run.get('event') != 'pull_request' or run.get('path') not in workflows
                    or run.get('repository', {}).get('full_name') != self.repository
                    or run.get('head_repository', {}).get('full_name') != self.repository
                    or run.get('head_branch') != intent.head_ref.removeprefix('refs/heads/')
                    or type(run.get('id')) is not int or type(run.get('run_attempt')) is not int
                    or run['id'] <= 0 or run['run_attempt'] <= 0):
                continue
            matches = [p for p in run.get('pull_requests', []) if p.get('number') == number
                       and p.get('head', {}).get('sha') == intent.candidate_sha
                       and p.get('base', {}).get('sha') == intent.observed_base_sha]
            if not matches: continue
            sha = run.get('head_sha')
            if sha != intent.candidate_sha:
                commit = self.get_commit(sha)
                if not commit or [p.get('sha') for p in commit.get('parents', [])] != [
                        intent.observed_base_sha, intent.candidate_sha]: continue
            path = run['path']
            if path not in selected or (run['id'], run['run_attempt']) > (
                    selected[path]['id'], selected[path]['run_attempt']): selected[path] = run
        evidence = []
        for path, run in sorted(selected.items()):
            passed = run.get('status') == 'completed' and run.get('conclusion') == 'success'
            if passed:
                jobs = self.pages(f'repos/{self.repository}/actions/runs/{run["id"]}/attempts/{run["run_attempt"]}/jobs', 'jobs')
                passed = bool(jobs) and all(j.get('status') == 'completed' and
                                           j.get('conclusion') == 'success' for j in jobs)
            evidence.append(dict(workflow=path, run_id=run['id'], run_attempt=run['run_attempt'],
                head_sha=run['head_sha'], status=run.get('status'), conclusion=run.get('conclusion'),
                passed=passed))
        return dict(ci_observed=bool(evidence), ci_passed=len(evidence) == len(workflows)
                    and all(e['passed'] for e in evidence), runs=evidence)
