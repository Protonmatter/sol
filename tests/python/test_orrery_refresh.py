from __future__ import annotations

import datetime as dt
import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import orrery_refresh as refresh


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 9, 29, tzinfo=dt.timezone.utc)
        self.base = 'a' * 40
        self.digest = 'b' * 64
        self.plan = {'state': 'validated', 'data_date': '2026-09-28',
                     'semantic_id': 'c' * 64, 'changed_paths': ['apps/web/test.png'],
                     'allowed_paths': ['apps/web/test.png'], 'manifest_sha256': self.digest}
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.candidate = self.root / 'candidate'
        self.candidate.mkdir()
        self.command = patch.object(refresh, 'command', return_value=self.base).start()
        self.addCleanup(patch.stopall)
        self.stage = patch.object(refresh, 'stage_candidate', return_value=self.plan.copy()).start()
        self.validate = patch.object(refresh, 'validate_candidate', return_value=Mock(manifest_sha256=self.digest)).start()
        self.clean = patch.object(refresh, 'require_clean').start()
        self.commit = patch.object(refresh, 'commit_candidate', return_value='d' * 40).start()
        self.publish = patch.object(refresh, 'publish', return_value={'state': 'awaiting-approval'}).start()
        self.adapter = Mock()
        self.adapter.observe.return_value = {'base_sha': self.base, 'head_sha': None}

    def run_refresh(self, **kwargs):
        return refresh.run_refresh(self.root, self.candidate, self.now, **kwargs)

    def test_default_is_local_preview_without_remote_or_commit(self):
        result = self.run_refresh()
        self.assertEqual(result['generation_base_sha'], self.base)
        self.stage.assert_called_once_with(self.root, self.candidate, self.now, apply=False)
        self.publish.assert_not_called()
        self.commit.assert_not_called()
        self.adapter.observe.assert_not_called()

    def test_stage_applies_without_commit(self):
        self.run_refresh(stage=True)
        self.clean.assert_called_once_with(self.root)
        self.assertTrue(self.stage.call_args.kwargs['apply'])
        self.commit.assert_not_called()

    def test_publish_requires_explicit_proof_before_stage_or_remote(self):
        for kwargs in ({}, {'repository': 'owner/repo'},
                       {'repository': 'owner/repo', 'expected_base': self.base}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.run_refresh(execute=True, **kwargs)
        self.stage.assert_not_called()
        self.adapter.observe.assert_not_called()

    def test_nonboolean_modes_and_malformed_identities_fail_without_mutation(self):
        for kwargs in ({'stage': 'false'}, {'execute': 1}, {'expected_base': 'master'},
                       {'expected_manifest': 'not a hash'}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.run_refresh(**kwargs)
        self.stage.assert_not_called()
        self.commit.assert_not_called()

    def test_wrong_base_and_manifest_fail_before_mutation(self):
        for base, digest in [('e' * 40, self.digest), (self.base, 'f' * 64)]:
            with self.subTest(base=base), self.assertRaises(ValueError):
                self.run_refresh(stage=True, expected_base=base, expected_manifest=digest)
        self.stage.assert_not_called()
        self.commit.assert_not_called()

    def test_remote_base_race_stops_before_stage(self):
        self.adapter.observe.return_value['base_sha'] = 'e' * 40
        with self.assertRaises(ValueError):
            self.run_refresh(execute=True, repository='owner/repo', expected_base=self.base,
                             expected_manifest=self.digest, transport=self.adapter)
        self.stage.assert_not_called()

    def test_noop_never_creates_commit_or_publishes(self):
        self.plan.update(state='no-op', changed_paths=[])
        self.stage.return_value = self.plan
        result = self.run_refresh(execute=True, repository='owner/repo', expected_base=self.base,
                                  expected_manifest=self.digest, transport=self.adapter)
        self.assertEqual(result['state'], 'no-op')
        self.commit.assert_not_called()
        self.publish.assert_not_called()

    def test_publication_carries_observed_head_and_original_base(self):
        self.adapter.observe.return_value['head_sha'] = 'e' * 40
        result = self.run_refresh(execute=True, repository='owner/repo', expected_base=self.base,
                                  expected_manifest=self.digest, transport=self.adapter)
        self.assertEqual(result['state'], 'awaiting-approval')
        candidate = self.publish.call_args.args[3]
        self.assertEqual(candidate['generation_base_sha'], self.base)
        self.assertEqual(candidate['expected_head_sha'], 'e' * 40)
        self.assertEqual(candidate['commit_sha'], 'd' * 40)
        self.assertTrue(self.publish.call_args.kwargs['execute'])

    def test_invalid_stage_result_fails_without_commit(self):
        self.stage.return_value = {'state': 'blocked'}
        with self.assertRaises(ValueError):
            self.run_refresh(stage=True)
        self.commit.assert_not_called()

    def test_candidate_replaced_during_staging_is_not_committed(self):
        self.stage.return_value['manifest_sha256'] = 'e' * 64
        with self.assertRaises(ValueError):
            self.run_refresh(execute=True, repository='owner/repo', expected_base=self.base,
                             expected_manifest=self.digest, transport=self.adapter)
        self.commit.assert_not_called()
        self.publish.assert_not_called()

    def test_clean_check_rejects_tracked_and_untracked_changes(self):
        patch.stopall()
        for status in [' M README.md', '?? unexpected.txt']:
            with patch.object(refresh, 'command', return_value=status), self.assertRaises(ValueError):
                refresh.require_clean(self.root)

    def test_commit_stages_only_exact_declared_paths_and_disables_hooks(self):
        patch.stopall()
        responses = iter(['', 'apps/web/test.png', '', 'd' * 40, ''])
        with patch.object(refresh, 'command', side_effect=lambda *_args, **_kwargs: next(responses)) as run:
            self.assertEqual(refresh.commit_candidate(self.root, self.plan), 'd' * 40)
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(commands[0], ['git', 'add', '--', 'apps/web/test.png'])
        self.assertIn('core.hooksPath=' + os.devnull, commands[2])
        self.assertFalse(any('-A' in args or '--all' in args for args in commands))

    def test_commit_rejects_extra_index_paths(self):
        patch.stopall()
        with patch.object(refresh, 'command', side_effect=['', 'README.md\napps/web/test.png']) as run:
            with self.assertRaises(ValueError):
                refresh.commit_candidate(self.root, self.plan)
        self.assertEqual(run.call_count, 2)

    def test_cli_outputs_reviewable_evidence_and_never_overwrites_it(self):
        out = self.root / 'evidence/result.json'
        with patch.object(refresh, 'run_refresh', return_value=self.plan) as run, contextlib.redirect_stdout(io.StringIO()) as stdout:
            self.assertEqual(refresh.main(['--candidate-dir', str(self.candidate), '--out', str(out)]), 0)
            self.assertEqual(json.loads(stdout.getvalue())['state'], 'validated')
            self.assertFalse(run.call_args.kwargs['execute'])
            self.assertEqual(json.loads(out.read_text())['manifest_sha256'], self.digest)
            with self.assertLogs(refresh.LOG, level='ERROR'):
                self.assertEqual(refresh.main(['--candidate-dir', str(self.candidate), '--out', str(out)]), 1)
            self.assertEqual(run.call_count, 1)

    def test_cli_blocked_and_remote_errors_return_failure_without_secret_output(self):
        with patch.object(refresh, 'run_refresh', return_value={'state': 'blocked'}), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(refresh.main(['--candidate-dir', str(self.candidate)]), 1)
        with patch.object(refresh, 'run_refresh', side_effect=RuntimeError('secret payload')):
            with self.assertLogs(refresh.LOG, level='ERROR') as logs:
                self.assertEqual(refresh.main(['--candidate-dir', str(self.candidate)]), 1)
            self.assertNotIn('secret payload', str(logs.output))

    def test_real_script_entrypoint_imports_and_fails_cleanly_for_missing_candidate(self):
        script = Path(__file__).resolve().parents[2] / 'tools/orrery_refresh.py'
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONPATH'}
        completed = subprocess.run([sys.executable, str(script), '--candidate-dir', str(self.root / 'absent'),
                                    '--checkout', str(script.parents[1])],
                                   cwd=self.root, env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(completed.returncode, 1)
        self.assertIn('Orrery refresh failed:', completed.stderr)
        self.assertNotIn('Traceback', completed.stderr)

    def test_commit_empty_unallowed_paths_or_invalid_git_identity_rejected(self):
        patch.stopall()
        for changes in ([], ['elsewhere.txt']):
            with patch.object(refresh, 'command') as run, self.assertRaises(ValueError):
                refresh.commit_candidate(self.root, {**self.plan, 'changed_paths': changes})
            run.assert_not_called()
        with patch.object(refresh, 'command', side_effect=['', 'apps/web/test.png', '', 'unknown']):
            with self.assertRaises(ValueError):
                refresh.commit_candidate(self.root, self.plan)


if __name__ == '__main__':
    unittest.main()
