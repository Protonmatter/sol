from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
try:
    import orrery_delivery as delivery
except ModuleNotFoundError:
    delivery = None


class PublisherFixture(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(delivery, 'bounded Orrery publisher is missing')
        self.policy = delivery.Policy('owner/repo', 'github-actions[bot]')
        self.candidate = dict(commit_sha='c' * 40, generation_base_sha='b' * 40,
                              expected_head_sha=None, semantic_id='d' * 64,
                              changed_paths=['apps/web/visual-assets.v1.json'])
        self.state = dict(repository='owner/repo', branch='automation/daily-orrery',
                          base_sha='b' * 40, head_sha=None, branch_owner=None,
                          pr_number=None, pr_owner=None, pr_state=None,
                          pr_draft=None, head_validated=False, semantic_id=None,
                          generation_base_sha=None)

    def owned(self, **changes):
        value = {**self.state, 'head_sha': 'a' * 40, 'branch_owner': self.policy.owner,
                 'pr_owner': self.policy.owner, 'pr_number': 7, 'pr_state': 'OPEN',
                 'pr_draft': True, 'head_validated': True,
                 'semantic_id': 'e' * 64, 'generation_base_sha': 'b' * 40}
        value.update(changes)
        return value


class PublisherPolicyTests(PublisherFixture):
    def test_first_cycle_plans_create_without_mutation(self):
        self.assertEqual(delivery.plan(self.policy, self.state, self.candidate)['action'], 'create')

    def test_owned_same_semantics_same_base_is_noop_even_with_different_commit(self):
        candidate = {**self.candidate, 'expected_head_sha': 'a' * 40}
        result = delivery.plan(self.policy, self.owned(semantic_id='d' * 64), candidate)
        self.assertEqual(result['state'], 'no-op')
        self.assertEqual(delivery.plan(self.policy, self.owned(), candidate)['action'], 'update')

    def test_closed_unmerged_holds_and_merged_history_allows_new_cycle(self):
        candidate = {**self.candidate, 'expected_head_sha': 'a' * 40}
        self.assertEqual(delivery.plan(self.policy, self.owned(pr_state='CLOSED'), candidate)['state'], 'blocked')
        self.assertEqual(delivery.plan(self.policy, self.owned(pr_state='MERGED', pr_draft=False), candidate)['action'], 'create')

    def test_unknown_owner_mixed_diff_non_draft_and_base_head_races_hold(self):
        candidate = {**self.candidate, 'expected_head_sha': 'a' * 40}
        for change in ({'branch_owner': 'human'}, {'pr_owner': 'human'}, {'head_validated': False},
                       {'pr_draft': False}, {'base_sha': 'f' * 40}, {'head_sha': 'f' * 40},
                       {'pr_number': None, 'pr_state': None}, {'repository': 'other/repo'}):
            with self.subTest(change=change):
                self.assertEqual(delivery.plan(self.policy, self.owned(**change), candidate)['state'], 'blocked')


class PublisherExecutionTests(PublisherFixture):
    def invoke(self, transport, execute=True):
        with mock.patch.object(delivery, 'verify_candidate', return_value=self.candidate):
            return delivery.publish(ROOT, 'owner/repo', 'github-actions[bot]', self.candidate,
                                    execute=execute, transport=transport)

    def after(self, **changes):
        return self.owned(head_sha='c' * 40, semantic_id='d' * 64, **changes)

    def test_plan_default_never_calls_write_transport(self):
        adapter = mock.Mock()
        adapter.observe.return_value = self.state
        self.assertEqual(self.invoke(adapter, execute=False)['state'], 'planned')
        adapter.compare_and_push.assert_not_called()
        adapter.open_pr.assert_not_called()

    def test_create_readbacks_and_lease_are_pinned_to_observation(self):
        adapter = mock.Mock()
        adapter.observe.side_effect = [self.state, self.state, self.after()]
        self.assertEqual(self.invoke(adapter)['state'], 'awaiting-approval')
        adapter.compare_and_push.assert_called_once_with(self.candidate, expected_head=None)
        adapter.open_pr.assert_called_once_with(self.candidate)

    def test_prewrite_race_stops_push(self):
        adapter = mock.Mock()
        adapter.observe.side_effect = [self.state, {**self.state, 'base_sha': 'f' * 40}]
        self.assertEqual(self.invoke(adapter)['state'], 'blocked')
        adapter.compare_and_push.assert_not_called()

    def test_uncertain_pr_create_is_observed_once_and_never_retried(self):
        adapter = mock.Mock()
        adapter.observe.side_effect = [self.state, self.state, self.after()]
        adapter.open_pr.side_effect = RuntimeError('connection lost after server accepted PR')
        self.assertEqual(self.invoke(adapter)['state'], 'awaiting-approval')
        adapter.open_pr.assert_called_once()

    def test_failed_push_does_not_create_pr_and_postwrite_mismatch_blocks(self):
        adapter = mock.Mock()
        adapter.observe.side_effect = [self.state, self.state, self.state]
        adapter.compare_and_push.side_effect = RuntimeError('unknown push result')
        self.assertEqual(self.invoke(adapter)['state'], 'blocked')
        adapter.open_pr.assert_not_called()
        adapter = mock.Mock()
        adapter.observe.side_effect = [self.state, self.state, self.after(pr_owner='human')]
        self.assertEqual(self.invoke(adapter)['state'], 'blocked')



class GitHubBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(hasattr(delivery, 'GitHubTransport'), 'GitHub transport is missing')
        self.policy = delivery.Policy('owner/repo', 'github-actions[bot]')

    def test_push_uses_exact_create_or_update_lease_and_ephemeral_credentials(self):
        for head in (None, 'a' * 40):
            run = mock.Mock(return_value='')
            adapter = delivery.GitHubTransport(self.policy, ROOT, run=run)
            adapter.compare_and_push({'commit_sha': 'c' * 40}, expected_head=head)
            args = run.call_args.args[0]
            self.assertIn('--force-with-lease=refs/heads/automation/daily-orrery:' + (head or ''), args)
            self.assertEqual(args[-2:], ['https://github.com/owner/repo.git', 'c' * 40 + ':refs/heads/automation/daily-orrery'])
            self.assertIn('credential.helper=', args)
            self.assertIn('credential.https://github.com.helper=!gh auth git-credential', args)
            self.assertNotIn('config', args)

    def test_origin_identity_blocks_writes_to_another_repository(self):
        adapter = delivery.GitHubTransport(self.policy, ROOT, run=mock.Mock(return_value='https://github.com/other/repo.git'))
        with self.assertRaises(ValueError):
            adapter.observe()

    def test_observation_rejects_multiple_open_prs_and_unknown_pr_author(self):
        import json
        good = {'number': 3, 'state': 'open', 'merged_at': None, 'draft': True,
                'body': '<!-- sol:daily-orrery:v1 -->', 'user': {'login': 'github-actions[bot]'},
                'head': {'ref': 'automation/daily-orrery', 'sha': 'a' * 40, 'repo': {'full_name': 'owner/repo'}},
                'base': {'ref': 'master', 'repo': {'full_name': 'owner/repo'}}}
        for prs in ([good, {**good, 'number': 4}], [{**good, 'user': {'login': 'human'}}], [{**good, 'body': 'unmarked'}]):
            def run(args, **kwargs):
                if args[0] == 'git':
                    return 'https://github.com/owner/repo.git'
                endpoint = args[-1]
                if endpoint == 'repos/owner/repo':
                    return json.dumps({'full_name': 'owner/repo', 'default_branch': 'master'})
                if '/pulls?' in endpoint:
                    return json.dumps(prs)
                raise AssertionError(args)
            with self.subTest(prs=prs), self.assertRaises(ValueError):
                delivery.GitHubTransport(self.policy, ROOT, run=run).observe()

    def test_draft_pr_has_fixed_identity_and_no_merge_operation(self):
        run = mock.Mock(return_value='')
        adapter = delivery.GitHubTransport(self.policy, ROOT, run=run)
        adapter.open_pr({'commit_sha': 'c' * 40, 'generation_base_sha': 'b' * 40, 'semantic_id': 'd' * 64})
        args = run.call_args.args[0]
        self.assertEqual(args[:3], ['gh', 'pr', 'create'])
        self.assertIn('--draft', args)
        self.assertEqual(args[args.index('--head') + 1], 'automation/daily-orrery')
        self.assertEqual(args[args.index('--base') + 1], 'master')
        self.assertNotIn('--auto', args)

class GitCandidateFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from test_orrery_earth import DailyEarthTests
        cls.fixtures = DailyEarthTests
        cls.fixtures.setUpClass()

    @classmethod
    def tearDownClass(cls):
        cls.fixtures.tearDownClass()

    def setUp(self):
        import tempfile
        from tools import orrery_earth
        from test_orrery_earth import NOW
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        helper = self.fixtures()
        helper.temp = self.temp
        self.checkout, _ = helper.checkout()
        self.git('init', '--quiet')
        self.git('add', '.')
        self.git('commit', '-qm', 'base')
        self.base = self.git('rev-parse', 'HEAD')
        self.stage = orrery_earth.stage_candidate(self.checkout, self.fixtures.fixture, NOW, apply=True)
        self.git('add', '-A')
        self.git('commit', '-qm', 'candidate')
        self.candidate = {**self.stage, 'generation_base_sha': self.base,
                          'commit_sha': self.git('rev-parse', 'HEAD'), 'expected_head_sha': None}

    def git(self, *args):
        import subprocess
        return subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                               '-c', 'commit.gpgSign=false', '-c', 'core.autocrlf=false', *args],
                              cwd=self.checkout, check=True, capture_output=True, text=True, timeout=30).stdout.strip()

    def recommit(self):
        self.git('add', '-A')
        self.git('commit', '--amend', '--no-edit', '-q')
        self.candidate['commit_sha'] = self.git('rev-parse', 'HEAD')

class CommittedCandidateTests(GitCandidateFixture):
    def test_actual_committed_candidate_passes_without_trusting_claimed_paths(self):
        self.candidate['changed_paths'] = ['forged/claim']
        result = delivery.verify_candidate(self.checkout, self.candidate)
        self.assertEqual(result['changed_paths'], self.stage['changed_paths'])
        self.assertEqual(result['semantic_id'], self.stage['semantic_id'])

    def test_actual_forbidden_code_change_rejected_even_when_omitted_from_claims(self):
        (self.checkout / 'unexpected.py').write_text('print("unsafe")')
        self.recommit()
        with self.assertRaises(ValueError):
            delivery.verify_candidate(self.checkout, self.candidate)

    def test_generated_module_tamper_cannot_hide_in_allowed_path(self):
        path = self.checkout / delivery.MODULE
        path.write_text(path.read_text() + '\nthrow new Error("injected");\n', encoding='utf-8')
        self.recommit()
        with self.assertRaises(ValueError):
            delivery.verify_candidate(self.checkout, self.candidate)

    def test_wrong_parent_dirty_checkout_and_mutable_head_rejected(self):
        for field, value in (('commit_sha', self.base), ('generation_base_sha', 'a' * 40)):
            with self.subTest(field=field), self.assertRaises(ValueError):
                delivery.verify_candidate(self.checkout, {**self.candidate, field: value})
        (self.checkout / 'untracked.txt').write_text('dirty')
        with self.assertRaises(ValueError):
            delivery.verify_candidate(self.checkout, self.candidate)

    def test_mode_change_and_unrelated_inventory_edit_rejected(self):
        import json
        path = self.checkout / delivery.INVENTORY
        data = json.loads(path.read_text())
        data['mapped_references'][0]['label'] = 'unexpected change'
        path.write_text(json.dumps(data), encoding='utf-8')
        self.recommit()
        with self.assertRaises(ValueError):
            delivery.verify_candidate(self.checkout, self.candidate)

    def test_executable_generated_file_rejected(self):
        self.git('update-index', '--chmod=+x', delivery.MODULE)
        self.git('commit', '--amend', '--no-edit', '-q')
        self.candidate['commit_sha'] = self.git('rev-parse', 'HEAD')
        with self.assertRaises(ValueError):
            delivery.verify_candidate(self.checkout, self.candidate)

class RemoteHistoryTests(GitCandidateFixture):
    def test_over_100_historical_prs_allow_owned_open_and_merged_cycles(self):
        import base64
        import json
        import subprocess
        policy = delivery.Policy('owner/repo', 'github-actions[bot]')
        head = self.candidate['commit_sha']
        parent = self.candidate['generation_base_sha']
        def tree(sha):
            entries = self.git('ls-tree', '-r', '-z', sha).split('\0')
            return {'truncated': False, 'tree': [dict(zip(('mode', 'type', 'sha'), e.split('\t', 1)[0].split(' ')), path=e.split('\t', 1)[1]) for e in entries if e]}
        for state, merged, want in (('open', None, 'none'), ('closed', '2026-09-28T12:00:00Z', 'create'), ('closed', None, 'hold')):
            pr = {'number': 151, 'state': state, 'merged_at': merged, 'draft': state == 'open',
                  'body': delivery.MARKER, 'user': {'login': policy.owner},
                  'head': {'ref': delivery.BRANCH, 'sha': head, 'repo': {'full_name': policy.repository}},
                  'base': {'ref': 'master', 'repo': {'full_name': policy.repository}}}
            history = [{**pr, 'number': number, 'state': 'closed', 'merged_at': '2026-09-27T12:00:00Z',
                        'user': {'login': 'retired-bot'}} for number in range(1, 151)] + [pr]
            queries = []
            def run(args, **kwargs):
                if args[0] == 'git':
                    return 'https://github.com/owner/repo.git'
                path = args[-1]
                if path == 'repos/owner/repo':
                    result = {'full_name': policy.repository, 'default_branch': 'master'}
                elif '/pulls?' in path:
                    from urllib.parse import parse_qs
                    query = {key: values[0] for key, values in parse_qs(path.split('?', 1)[1]).items()}
                    queries.append(query)
                    records = [item for item in history if query['state'] == 'all' or item['state'] == query['state']]
                    result = sorted(records, key=lambda item: item['number'], reverse=True)[:int(query['per_page'])]
                elif '/matching-refs/' in path:
                    result = [{'ref': 'refs/heads/' + delivery.BRANCH, 'object': {'sha': head}}]
                elif path.endswith('/git/ref/heads/master'):
                    result = {'object': {'sha': parent}}
                elif path.endswith('/commits/' + head):
                    result = {'sha': head, 'author': {'login': policy.owner}, 'parents': [{'sha': parent}], 'commit': {'tree': {'sha': self.git('rev-parse', head + '^{tree}')}}}
                elif path.endswith('/git/commits/' + parent):
                    result = {'tree': {'sha': self.git('rev-parse', parent + '^{tree}')}}
                elif '/git/trees/' in path:
                    result = tree(path.rsplit('/', 1)[1].split('?')[0])
                elif '/git/blobs/' in path:
                    raw = subprocess.run(['git', 'cat-file', 'blob', path.rsplit('/', 1)[1]], cwd=self.checkout, check=True, capture_output=True, timeout=30).stdout
                    result = {'size': len(raw), 'encoding': 'base64', 'content': base64.b64encode(raw).decode()}
                else:
                    raise AssertionError(args)
                return json.dumps(result)
            with self.subTest(state=state, merged=merged):
                try:
                    observed = delivery.GitHubTransport(policy, self.checkout, run=run).observe()
                except ValueError as exc:
                    self.fail('bounded current-state discovery must survive 150 prior PRs: ' + str(exc))
                self.assertEqual(observed['pr_number'], 151)
                self.assertTrue(observed['head_validated'])
                self.assertEqual([(q['state'], q['per_page']) for q in queries],
                                 [('open', '2')] if state == 'open' else [('open', '2'), ('closed', '1')])
                if state == 'closed':
                    self.assertEqual((queries[-1]['sort'], queries[-1]['direction']), ('created', 'desc'))
                candidate = {**self.candidate, 'expected_head_sha': head}
                self.assertEqual(delivery.plan(policy, observed, candidate)['action'], want)

class InputAndIntegrityTests(unittest.TestCase):
    def test_repository_path_segments_cannot_select_another_api_target(self):
        for repository in ('../repo', 'owner/..', '-owner/repo', 'owner/.'):
            with self.subTest(repository=repository), self.assertRaises(ValueError):
                delivery.GitHubTransport(delivery.Policy(repository, 'github-actions[bot]'), ROOT)

    def test_remote_blob_must_hash_to_the_tree_object_id(self):
        import json
        run = mock.Mock(return_value=json.dumps({'encoding': 'base64', 'size': 4, 'content': 'ZXZpbA=='}))
        adapter = delivery.GitHubTransport(delivery.Policy('owner/repo', 'github-actions[bot]'), ROOT, run=run)
        with self.assertRaises(ValueError):
            adapter._blob('a' * 40)

class ExecuteOptInTests(PublisherFixture):
    def test_truthy_nonboolean_execute_cannot_trigger_remote_writes(self):
        adapter = mock.Mock()
        adapter.observe.return_value = self.state
        with mock.patch.object(delivery, 'verify_candidate', return_value=self.candidate):
            result = delivery.publish(ROOT, self.policy.repository, self.policy.owner, self.candidate,
                                      execute='false', transport=adapter)
        self.assertEqual(result['state'], 'blocked')
        adapter.compare_and_push.assert_not_called()
        adapter.open_pr.assert_not_called()


if __name__ == "__main__":
    unittest.main()
