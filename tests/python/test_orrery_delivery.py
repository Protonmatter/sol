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


class ReconciliationTests(PublisherFixture):
    """Known stale API reads may converge; writes and authority never retry."""

    def setUp(self):
        super().setUp()
        self.candidate['expected_head_sha'] = 'a' * 40
        self.before = self.owned()
        self.sleep = mock.patch('time.sleep').start()
        self.clock = mock.patch('time.monotonic', return_value=100.0).start()
        self.addCleanup(mock.patch.stopall)

    def invoke(self, transport):
        with mock.patch.object(delivery, 'verify_candidate', return_value=self.candidate):
            return delivery.publish(ROOT, self.policy.repository, self.policy.owner, self.candidate,
                                    execute=True, transport=transport)

    def after(self, **changes):
        return self.owned(**{'head_sha': 'c' * 40, 'semantic_id': 'd' * 64, **changes})

    def mismatch(self, pr_head='a' * 40, ref_head='c' * 40, **changes):
        import json
        pr = {'number': 7, 'state': 'open', 'draft': True, 'merged_at': None,
              'body': delivery.MARKER, 'user': {'login': self.policy.owner},
              'head': {'ref': delivery.BRANCH, 'sha': pr_head, 'repo': {'full_name': self.policy.repository}},
              'base': {'ref': 'master', 'repo': {'full_name': self.policy.repository}}}
        pr.update(changes)

        def run(args, **kwargs):
            if args[0] == 'git':
                return 'https://github.com/owner/repo.git'
            endpoint = args[-1]
            if endpoint == 'repos/owner/repo':
                value = {'full_name': self.policy.repository, 'default_branch': 'master'}
            elif '/pulls?' in endpoint:
                value = [pr]
            elif '/matching-refs/' in endpoint:
                value = [{'ref': 'refs/heads/' + delivery.BRANCH, 'object': {'sha': ref_head}}]
            elif endpoint.endswith('/git/ref/heads/master'):
                value = {'object': {'sha': 'b' * 40}}
            else:
                raise AssertionError('Mismatch must fail before commit/blob reads: ' + endpoint)
            return json.dumps(value)

        try:
            delivery.GitHubTransport(self.policy, ROOT, run=run).observe()
        except ValueError as exc:
            return exc
        self.fail('Inconsistent PR/ref identities must never pass observation')

    def adapter(self, *after):
        adapter = mock.Mock()
        adapter.observe.side_effect = [self.before, self.before, *after]
        return adapter

    def test_stale_pr_head_converges_without_repeating_push_or_creating_pr(self):
        adapter = self.adapter(self.mismatch(), self.after())
        result = self.invoke(adapter)
        self.assertEqual(result['state'], 'awaiting-approval')
        self.assertEqual(result.get('phase'), 'complete')
        self.assertEqual(result.get('observation_attempt'), 2)
        self.assertEqual(result.get('write_outcome'), 'confirmed')
        adapter.compare_and_push.assert_called_once_with(self.candidate, expected_head='a' * 40)
        adapter.open_pr.assert_not_called()

    def test_prior_complete_observation_can_converge(self):
        adapter = self.adapter(self.before, self.after())
        self.assertEqual(self.invoke(adapter)['state'], 'awaiting-approval')
        adapter.compare_and_push.assert_called_once()

    def test_frozen_clock_still_exhausts_finite_observation_budget(self):
        adapter = self.adapter(*[self.mismatch() for _ in range(8)])
        result = self.invoke(adapter)
        self.assertEqual(result['state'], 'blocked')
        self.assertEqual(result.get('reason_code'), 'reconciliation-exhausted')
        self.assertEqual(result.get('phase'), 'post-write-observation')
        self.assertLessEqual(adapter.observe.call_count, 6)
        self.assertEqual(result.get('observed_ref_sha'), 'c' * 40)
        self.assertEqual(result.get('observed_pr_head_sha'), 'a' * 40)
        adapter.compare_and_push.assert_called_once()
        adapter.open_pr.assert_not_called()

    def test_elapsed_budget_stops_even_if_attempts_remain(self):
        self.clock.side_effect = [100.0, 100.0, 121.0]
        adapter = self.adapter(self.mismatch())
        result = self.invoke(adapter)
        self.assertEqual(result.get('reason_code'), 'reconciliation-exhausted')
        self.assertEqual(result.get('observation_attempt'), 1)
        self.sleep.assert_not_called()

    def test_read_finishing_after_deadline_cannot_claim_success(self):
        self.clock.side_effect = [100.0, 100.0, 121.0]
        result = self.invoke(self.adapter(self.after()))
        self.assertEqual(result['state'], 'blocked')
        self.assertEqual(result.get('reason_code'), 'reconciliation-exhausted')

    def test_unknown_third_head_never_retries(self):
        adapter = self.adapter(self.mismatch(ref_head='f' * 40), self.after())
        result = self.invoke(adapter)
        self.assertEqual(result.get('reason_code'), 'pr-head-ref-mismatch')
        self.assertEqual(adapter.observe.call_count, 3)
        self.sleep.assert_not_called()

    def test_ownership_draft_base_parent_semantic_and_pr_replacement_hold_immediately(self):
        for change in ({'pr_owner': 'human'}, {'branch_owner': 'human'}, {'pr_draft': False},
                       {'base_sha': 'f' * 40}, {'generation_base_sha': 'f' * 40},
                       {'semantic_id': 'f' * 64}, {'head_validated': False}, {'pr_number': 8}):
            with self.subTest(change=change):
                adapter = self.adapter(self.after(**change), self.after())
                result = self.invoke(adapter)
                self.assertEqual(result['state'], 'blocked')
                self.assertEqual(adapter.observe.call_count, 3)
                adapter.compare_and_push.assert_called_once()
                adapter.open_pr.assert_not_called()

    def test_stale_mismatch_with_ready_pr_or_replaced_pr_is_terminal(self):
        for change in ({'draft': False}, {'number': 8}):
            with self.subTest(change=change):
                adapter = self.adapter(self.mismatch(**change), self.after())
                result = self.invoke(adapter)
                self.assertEqual(result['state'], 'blocked')
                self.assertEqual(adapter.observe.call_count, 3)

    def test_untyped_validation_or_transport_failure_is_not_retried_or_echoed(self):
        import json
        for exc in (ValueError('secret payload'), RuntimeError('secret payload')):
            with self.subTest(kind=type(exc).__name__):
                adapter = self.adapter(exc, self.after())
                result = self.invoke(adapter)
                self.assertEqual(result['state'], 'blocked')
                self.assertEqual(result.get('phase'), 'post-write-observation')
                self.assertEqual(result.get('write_outcome'), 'acknowledged')
                self.assertNotIn('secret payload', json.dumps(result))
                self.assertEqual(adapter.observe.call_count, 3)

    def test_candidate_failure_is_diagnosed_before_any_remote_read(self):
        adapter = mock.Mock()
        with mock.patch.object(delivery, 'verify_candidate', side_effect=ValueError('secret payload')):
            result = delivery.publish(ROOT, self.policy.repository, self.policy.owner, self.candidate,
                                      execute=True, transport=adapter)
        self.assertEqual(result.get('phase'), 'candidate-verification')
        self.assertEqual(result.get('reason_code'), 'candidate-verification-failed')
        self.assertIs(result.get('write_attempted'), False)
        adapter.observe.assert_not_called()
        adapter.compare_and_push.assert_not_called()

    def test_push_exception_and_failed_readback_preserve_unknown_write_outcome(self):
        adapter = self.adapter(RuntimeError('secret read payload'))
        adapter.compare_and_push.side_effect = RuntimeError('secret push payload')
        result = self.invoke(adapter)
        self.assertEqual(result['state'], 'blocked')
        self.assertEqual(result.get('reason_code'), 'push-outcome-uncertain')
        self.assertEqual(result.get('write_outcome'), 'unknown')
        self.assertIs(result.get('write_attempted'), True)
        self.assertNotIn('secret', str(result))
        adapter.compare_and_push.assert_called_once()
        adapter.open_pr.assert_not_called()

    def test_corrupt_remote_blob_has_specific_safe_failure_code(self):
        import json
        transport = delivery.GitHubTransport(self.policy, ROOT, run=mock.Mock(return_value=json.dumps(
            {'encoding': 'base64', 'size': 4, 'content': 'ZXZpbA=='})))
        try:
            transport._blob('a' * 40)
        except ValueError as exc:
            failure = exc
        else:
            self.fail('Corrupt blob must be rejected')
        adapter = self.adapter(failure, self.after())
        result = self.invoke(adapter)
        self.assertEqual(result.get('reason_code'), 'remote-blob-identity-mismatch')
        self.assertEqual(result.get('phase'), 'post-write-observation')
        self.assertEqual(adapter.observe.call_count, 3)

    def test_prewrite_stale_read_holds_without_entering_reconciliation(self):
        adapter = mock.Mock()
        adapter.observe.side_effect = [self.before, self.mismatch(), self.after()]
        result = self.invoke(adapter)
        self.assertEqual(result.get('phase'), 'pre-write-observation')
        self.assertEqual(result.get('reason_code'), 'pr-head-ref-mismatch')
        self.assertIs(result.get('write_attempted'), False)
        adapter.compare_and_push.assert_not_called()
        self.sleep.assert_not_called()

    def test_production_transport_caps_each_read_to_remaining_budget_and_restores_scope(self):
        import subprocess
        adapter = delivery.GitHubTransport(self.policy, ROOT)
        self.clock.return_value = 107.0
        with mock.patch.object(adapter, 'observe', side_effect=lambda: adapter._run(['gh', 'api', 'example'])), \
                mock.patch.object(subprocess, 'run', return_value=mock.Mock(stdout='read result\n')) as run:
            self.assertEqual(adapter.observe_until(110.0), 'read result')
            self.assertEqual(run.call_args.kwargs['timeout'], 3.0)
            run.reset_mock()
            # The deadline must not leak into a later ordinary operation.
            self.clock.return_value = 200.0
            adapter.observe()
            self.assertEqual(run.call_args.kwargs['timeout'], 120)

    def test_production_transport_expired_deadline_issues_no_command(self):
        adapter = delivery.GitHubTransport(self.policy, ROOT)
        with mock.patch.object(delivery.subprocess, 'run') as run:
            with self.assertRaises(ValueError) as raised:
                adapter.observe_until(100.0)
            self.assertEqual(getattr(raised.exception, 'reason_code', None), 'reconciliation-exhausted')
            run.assert_not_called()

    def test_deadline_expiring_between_attempts_prevents_another_read(self):
        self.clock.side_effect = [100.0, 100.0, 100.0, 120.0]
        adapter = self.adapter(self.mismatch(), self.after())
        result = self.invoke(adapter)
        self.assertEqual(result['reason_code'], 'reconciliation-exhausted')
        self.assertEqual(result['observation_attempt'], 1)
        self.assertEqual(adapter.observe.call_count, 3)

    def test_production_command_timeout_is_safe_and_restores_deadline(self):
        adapter = delivery.GitHubTransport(self.policy, ROOT)
        self.clock.return_value = 107.0
        failure = delivery.subprocess.TimeoutExpired(['secret command'], 3, output='secret output')
        with mock.patch.object(adapter, 'observe', side_effect=lambda: adapter._run(['gh', 'api', 'example'])), \
                mock.patch.object(delivery.subprocess, 'run', side_effect=failure) as run:
            with self.assertRaises(ValueError) as raised:
                adapter.observe_until(110.0)
            self.assertEqual(getattr(raised.exception, 'reason_code', None), 'reconciliation-exhausted')
            self.assertNotIn('secret', str(raised.exception))
            run.side_effect = None
            run.return_value = mock.Mock(stdout='ordinary read')
            self.clock.return_value = 200.0
            self.assertEqual(adapter.observe(), 'ordinary read')
            self.assertEqual(run.call_args.kwargs['timeout'], 120)

    def test_injected_runner_cannot_claim_an_overdue_read(self):
        adapter = delivery.GitHubTransport(self.policy, ROOT, run=mock.Mock(return_value='late result'))
        self.clock.side_effect = [107.0, 111.0]
        with mock.patch.object(adapter, 'observe', side_effect=lambda: adapter._run(['gh', 'api', 'example'])):
            with self.assertRaises(ValueError) as raised:
                adapter.observe_until(110.0)
        self.assertEqual(getattr(raised.exception, 'reason_code', None), 'reconciliation-exhausted')

    def test_uncertain_push_with_stale_readback_keeps_both_diagnostics_without_retry(self):
        adapter = self.adapter(self.mismatch(), self.after())
        adapter.compare_and_push.side_effect = RuntimeError('secret payload')
        result = self.invoke(adapter)
        self.assertEqual(result['reason_code'], 'push-outcome-uncertain')
        self.assertEqual(result['observation_reason_code'], 'pr-head-ref-mismatch')
        self.assertEqual(result['observed_ref_sha'], 'c' * 40)
        self.assertEqual(result['observed_pr_head_sha'], 'a' * 40)
        self.assertEqual(result['write_outcome'], 'unknown')
        self.assertEqual(adapter.observe.call_count, 3)
        adapter.open_pr.assert_not_called()
        self.sleep.assert_not_called()

    def test_invalid_observed_identity_is_not_echoed_in_diagnostics(self):
        adapter = self.adapter(self.after(head_sha='secret payload', pr_head_sha='secret payload'))
        result = self.invoke(adapter)
        self.assertEqual(result['state'], 'blocked')
        self.assertIsNone(result['observed_ref_sha'])
        self.assertIsNone(result['observed_pr_head_sha'])
        self.assertNotIn('secret payload', str(result))

    def test_uncertain_creation_and_failed_read_keep_separate_write_outcomes(self):
        self.candidate['expected_head_sha'] = None
        adapter = mock.Mock()
        adapter.observe.side_effect = [self.state, self.state, RuntimeError('secret read')]
        adapter.open_pr.side_effect = RuntimeError('secret create')
        result = self.invoke(adapter)
        self.assertEqual(result['state'], 'blocked')
        self.assertEqual(result['write_outcome'], 'acknowledged')
        self.assertEqual(result['pr_creation_outcome'], 'unknown')
        self.assertIs(result['pr_creation_attempted'], True)
        self.assertNotIn('secret', str(result))
        adapter.compare_and_push.assert_called_once()
        adapter.open_pr.assert_called_once()


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

class ReconciledTreeTests(GitCandidateFixture):
    def test_reconciliation_repeats_full_committed_proof_and_rejects_corrupt_blob(self):
        import base64
        import json
        import subprocess
        policy = delivery.Policy('owner/repo', 'github-actions[bot]')
        head, parent, prior = self.candidate['commit_sha'], self.base, 'a' * 40
        candidate = {**self.candidate, 'expected_head_sha': prior}
        trees = {}
        blobs = {}
        for commit in (parent, head):
            tree_sha = self.git('rev-parse', commit + '^{tree}')
            entries = []
            for entry in self.git('ls-tree', '-r', '-z', commit).split('\0'):
                if not entry:
                    continue
                meta, path = entry.split('\t', 1)
                mode, kind, oid = meta.split(' ')
                entries.append({'path': path, 'mode': mode, 'type': kind, 'sha': oid})
                blobs[oid] = subprocess.run(['git', 'cat-file', 'blob', oid], cwd=self.checkout,
                                            capture_output=True, check=True, timeout=30).stdout
            trees[tree_sha] = {'truncated': False, 'tree': entries}
        for corrupt in (False, True):
            with self.subTest(corrupt=corrupt):
                calls, pushes, blob_reads = [], [], []
                pr = {'number': 7, 'state': 'open', 'draft': True, 'body': delivery.MARKER,
                      'user': {'login': policy.owner}, 'merged_at': None,
                      'head': {'ref': delivery.BRANCH, 'sha': head, 'repo': {'full_name': policy.repository}},
                      'base': {'ref': 'master', 'repo': {'full_name': policy.repository}}}

                def run(args, **kwargs):
                    if args[0] == 'git':
                        if 'push' in args:
                            pushes.append(args)
                            return ''
                        return 'https://github.com/owner/repo.git'
                    endpoint = args[-1]
                    if endpoint == 'repos/owner/repo':
                        value = {'full_name': policy.repository, 'default_branch': 'master'}
                    elif '/pulls?' in endpoint:
                        value = [{**pr, 'head': {**pr['head'], 'sha': prior if len(calls) == 3 else head}}]
                    elif '/matching-refs/' in endpoint:
                        value = [{'ref': 'refs/heads/' + delivery.BRANCH, 'object': {'sha': head}}]
                    elif endpoint.endswith('/git/ref/heads/master'):
                        value = {'object': {'sha': parent}}
                    elif endpoint.endswith('/commits/' + head):
                        value = {'sha': head, 'author': {'login': policy.owner}, 'parents': [{'sha': parent}],
                                 'commit': {'tree': {'sha': self.git('rev-parse', head + '^{tree}')}}}
                    elif endpoint.endswith('/git/commits/' + parent):
                        value = {'tree': {'sha': self.git('rev-parse', parent + '^{tree}')}}
                    elif '/git/trees/' in endpoint:
                        value = trees[endpoint.rsplit('/', 1)[1].split('?')[0]]
                    elif '/git/blobs/' in endpoint:
                        oid = endpoint.rsplit('/', 1)[1]
                        blob_reads.append(oid)
                        raw = b'evil' if corrupt else blobs[oid]
                        value = {'size': len(raw), 'encoding': 'base64', 'content': base64.b64encode(raw).decode()}
                    else:
                        raise AssertionError(endpoint)
                    return json.dumps(value)

                adapter = delivery.GitHubTransport(policy, self.checkout, run=run)
                real_observe = adapter.observe
                before = dict(repository=policy.repository, branch=delivery.BRANCH, base_sha=parent,
                              head_sha=prior, branch_owner=policy.owner, pr_number=7, pr_owner=policy.owner,
                              pr_state='OPEN', pr_draft=True, head_validated=True,
                              generation_base_sha=parent, semantic_id='e' * 64)

                def observe():
                    calls.append('read')
                    return before.copy() if len(calls) <= 2 else real_observe()

                with mock.patch.object(adapter, 'observe', side_effect=observe), \
                        mock.patch('time.monotonic', return_value=100.0), mock.patch('time.sleep'):
                    result = delivery.publish(self.checkout, policy.repository, policy.owner, candidate,
                                              execute=True, transport=adapter)
                self.assertEqual(len(pushes), 1)
                self.assertEqual(len(calls), 4)
                self.assertTrue(blob_reads, 'Convergence must run remote blob validation')
                self.assertEqual(result['state'], 'blocked' if corrupt else 'awaiting-approval')
                self.assertEqual(result['reason_code'], 'remote-blob-identity-mismatch' if corrupt else 'post-write-confirmed')


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
