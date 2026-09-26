"""Real Git leases, including races and successful writes with lost responses."""
import dataclasses
import hashlib
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from pr_publication import Intent, Observation, PublicationError
from pr_publication_packet import build_packet, read_packet, DirectoryStore, Journal, Runner
from pr_publication_git import NativeGitTransport
from publication_test_support import LocalRepo, git

class NativeTests(unittest.TestCase):
    def setUp(self):
        self.f = LocalRepo()
        self.packet = build_packet(self.f.repo, self.f.base, self.f.candidate, self.f.paths)
        m, _, _ = read_packet(self.packet)
        self.intent = Intent('native-01', 'fixture/sol', 'R_fixture', 'refs/heads/master',
                             'refs/heads/feature', self.f.base, None, self.f.candidate,
                             self.f.candidate, m['tree_sha'], hashlib.sha256(self.packet).hexdigest())
        self.store = DirectoryStore(self.f.root / 'durable')
        self.journal = Journal(self.store, 'native-01')
        ref = self.store.put_packet(self.packet)
        self.journal.append('prepared', {'intent': self.intent.to_dict(), 'packet_reference': ref})
        self.journal.append('recovery-persisted', {'packet_reference': ref})
    def tearDown(self): self.f.close()
    def observe(self, intent):
        result = git(self.f.remote, 'rev-parse', '--verify', intent.head_ref, check=False)
        head = result.stdout.decode().strip() if result.returncode == 0 else None
        return Observation('fixture/sol', intent.head_ref, head, intent.base_ref,
                           self.f.base, None, None, None, '2026-09-25T08:00:00Z')
    def transport(self, runner=None):
        return NativeGitTransport(self.f.repo, str(self.f.remote), self.observe,
                                  self.journal, runner=runner)
    def test_new_branch_and_binary(self):
        self.transport().publish(self.intent)
        self.assertEqual(self.f.candidate, git(self.f.remote, 'rev-parse', 'refs/heads/feature'))
        raw = git(self.f.remote, 'cat-file', '-p', self.f.candidate+':texture.bin', check=False).stdout
        self.assertEqual(self.f.binary, raw)
    def test_duplicate_is_noop(self):
        t = self.transport(); t.publish(self.intent)
        class NoPush(Runner):
            def __call__(self, args, cwd, data=None):
                if 'push' in args: raise AssertionError('duplicate push')
                return super().__call__(args, cwd, data)
        self.transport(NoPush()).publish(self.intent)
        self.assertEqual(self.f.candidate, git(self.f.remote, 'rev-parse', 'feature'))
    def test_lost_success_response_reconciles(self):
        class LostReply(Runner):
            def __call__(self, args, cwd, data=None):
                result = super().__call__(args, cwd, data)
                if 'push' in args: raise PublicationError('command-timed-out', 5)
                return result
        self.transport(LostReply()).publish(self.intent)
        self.assertEqual(self.f.candidate, git(self.f.remote, 'rev-parse', 'feature'))
        self.assertEqual('remote-ref-verified', self.journal.records[-1]['stage'])
    def test_create_collision_rejected(self):
        git(self.f.remote, 'update-ref', 'refs/heads/feature', self.f.base)
        with self.assertRaises(PublicationError): self.transport().publish(self.intent)
        self.assertEqual(self.f.base, git(self.f.remote, 'rev-parse', 'feature'))
    def test_race_preserves_winner(self):
        remote, base = self.f.remote, self.f.base
        class Race(Runner):
            def __call__(self, args, cwd, data=None):
                if 'push' in args: git(remote, 'update-ref', 'refs/heads/feature', base)
                return super().__call__(args, cwd, data)
        with self.assertRaises(PublicationError): self.transport(Race()).publish(self.intent)
        self.assertEqual(base, git(remote, 'rev-parse', 'feature'))
    def test_existing_branch_fast_forward(self):
        git(self.f.remote, 'update-ref', 'refs/heads/feature', self.f.base)
        self.intent = dataclasses.replace(self.intent, expected_head_sha=self.f.base)
        self.journal = Journal(self.store, 'native-02')
        self.intent = dataclasses.replace(self.intent, operation_id='native-02')
        self.journal.append('prepared', {'intent': self.intent.to_dict(),
            'packet_reference': self.store.put_packet(self.packet)})
        self.transport().publish(self.intent)
        self.assertEqual(self.f.candidate, git(self.f.remote, 'rev-parse', 'feature'))
    def test_unpersisted_candidate_rejected(self):
        journal = Journal(self.store, 'unpersisted')
        t = NativeGitTransport(self.f.repo, str(self.f.remote), self.observe, journal)
        with self.assertRaises(PublicationError): t.publish(self.intent)
        self.assertIsNone(self.observe(self.intent).head_sha)
    def test_wrong_tree_and_intent_rejected(self):
        with self.assertRaises(PublicationError):
            self.transport().publish(dataclasses.replace(self.intent, tree_sha='f'*40))
        self.assertIsNone(self.observe(self.intent).head_sha)
    def test_storage_failure_before_push(self):
        from unittest import mock
        with mock.patch.object(self.store, 'put', side_effect=OSError('disk unavailable')):
            with self.assertRaises(OSError): self.transport().publish(self.intent)
        self.assertIsNone(self.observe(self.intent).head_sha)

    def test_url_rewrite_cannot_publish_to_another_remote(self):
        other = self.f.root / 'other.git'
        git(self.f.root, 'clone', '--bare', str(self.f.remote), str(other))
        git(self.f.repo, 'config', 'url.'+str(other)+'.insteadOf', str(self.f.remote))
        with self.assertRaises(PublicationError): self.transport().publish(self.intent)
        value = git(other, 'rev-parse', '--verify', 'refs/heads/feature', check=False)
        self.assertNotEqual(0, value.returncode, 'rewritten remote must remain untouched')

    def test_timeout_before_acceptance_retries_only_after_observation(self):
        class Once(Runner):
            calls = 0
            def __call__(self, args, cwd, data=None):
                if 'push' in args:
                    self.calls += 1
                    if self.calls == 1: raise PublicationError('timeout-before-write', 5)
                return super().__call__(args, cwd, data)
        runner = Once(); self.transport(runner).publish(self.intent)
        self.assertEqual(2, runner.calls)
        self.assertEqual(self.f.candidate, self.observe(self.intent).head_sha)
    def test_persistent_timeout_has_bounded_attempts(self):
        class Always(Runner):
            calls = 0
            def __call__(self, args, cwd, data=None):
                if 'push' in args:
                    self.calls += 1; raise PublicationError('timeout', 5)
                return super().__call__(args, cwd, data)
        runner = Always()
        with self.assertRaises(PublicationError): self.transport(runner).publish(self.intent)
        self.assertEqual(2, runner.calls); self.assertIsNone(self.observe(self.intent).head_sha)

if __name__ == '__main__': unittest.main()
