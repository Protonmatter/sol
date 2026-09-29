"""Pure admission and reconciliation regressions; no network."""
import dataclasses
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from pr_publication import Intent, Observation, reconcile, loads, PublicationError, safe_path

class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.intent = Intent('test-01', 'fixture/sol', 'R_fixture', 'refs/heads/master',
                             'refs/heads/feature', '3'*40, '2'*40, '1'*40,
                             '1'*40, '4'*40, '5'*64)
        self.observed = Observation('fixture/sol', 'refs/heads/feature', '2'*40,
                                    'refs/heads/master', '3'*40, 116, '2'*40,
                                    'open', '2026-09-25T08:00:00Z')
    def test_ready(self):
        self.assertEqual('publish', reconcile(self.intent, self.observed).action)
    def test_changed_head_is_not_adopted(self):
        obs = dataclasses.replace(self.observed, head_sha='f'*40)
        self.assertEqual('conflict', reconcile(self.intent, obs).action)
    def test_remote_commit_without_pr_needs_reconciliation(self):
        obs = dataclasses.replace(self.observed, head_sha='1'*40, pr_number=None,
                                  pr_head_sha=None, pr_state=None)
        self.assertEqual('reconcile-pr', reconcile(self.intent, obs).action)
    def test_matching_open_pr_verifies(self):
        obs = dataclasses.replace(self.observed, head_sha='1'*40, pr_head_sha='1'*40)
        self.assertEqual('verified', reconcile(self.intent, obs).action)
    def test_base_change_blocks(self):
        self.assertEqual('blocked', reconcile(self.intent, dataclasses.replace(
            self.observed, base_sha='a'*40)).action)
    def test_closed_pr_blocks_before_write(self):
        for state in ('closed', 'merged'):
            self.assertEqual('blocked', reconcile(self.intent, dataclasses.replace(
                self.observed, pr_state=state)).action)
    def test_wrong_identity_blocks(self):
        for field in ('repository', 'base_ref', 'head_ref'):
            self.assertEqual('blocked', reconcile(self.intent, dataclasses.replace(
                self.observed, **{field: 'wrong'})).action)
    def test_bad_input(self):
        for value in ('0'*40, 'a'*39, 'A'*40, True, None):
            with self.subTest(value=value), self.assertRaises(PublicationError):
                dataclasses.replace(self.intent, candidate_sha=value).validate()
        for ref in ('refs/heads/master', 'refs/heads/main', 'refs/tags/test',
                    'refs/heads/release/x', 'refs/heads/a..b', 'refs/heads/x.lock',
                    'refs/heads/ab@{x', 'refs/heads/.hidden', 'refs/heads/-bad'):
            with self.subTest(ref=ref), self.assertRaises(PublicationError):
                dataclasses.replace(self.intent, head_ref=ref).validate()
    def test_json_strict(self):
        for data in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}'):
            with self.assertRaises(PublicationError): loads(data)
        d = dataclasses.asdict(self.intent); d['secret'] = 'not permitted'
        with self.assertRaises(PublicationError): Intent.from_dict(d)
    def test_paths(self):
        for p in ('../a', '/etc/x', 'a//b', './a', 'a/../b', 'a\\b', '.git/config',
                  'a/.GIT/config', 'C:/x', 'a\x00b', 'a\nb'):
            with self.subTest(p=p), self.assertRaises(PublicationError): safe_path(p)
        self.assertEqual('texture files/日本語.png', safe_path('texture files/日本語.png'))
    def test_absent_and_bool_pr(self):
        intent = dataclasses.replace(self.intent, expected_head_sha=None)
        obs = dataclasses.replace(self.observed, head_sha=None, pr_number=None,
                                  pr_head_sha=None, pr_state=None)
        self.assertEqual('publish', reconcile(intent, obs).action)
        self.assertEqual('blocked', reconcile(self.intent, dataclasses.replace(
            self.observed, pr_number=True)).action)

    def test_inconsistent_pr_evidence_blocks(self):
        for fields in ({'pr_number':None}, {'pr_head_sha':'f'*40}):
            self.assertEqual('blocked', reconcile(self.intent,
                dataclasses.replace(self.observed, **fields)).action)

if __name__ == '__main__': unittest.main()
