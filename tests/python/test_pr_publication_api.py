"""API-boundary failure injection backed by real Git object bytes."""
import dataclasses
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from pr_publication import Intent, Observation, PublicationError
from pr_publication_packet import DirectoryStore, Journal, build_packet, read_packet, digest, git_oid, commit_fields
from pr_publication_api import ApiGitTransport, commit_payload
from publication_test_support import LocalRepo, git

class ObjectAPI:
    supports_expected_head = True
    def __init__(self, f, m, raw):
        self.f, self.m, self.raw = f, m, raw
        self.blobs, self.trees = {}, {m['base_tree_sha']: {'sha': m['base_tree_sha']}}
        self.commits = {f.base: {'sha': f.base, 'tree': {'sha': m['base_tree_sha']}, 'parents': []}}
        self.head, self.fail, self.different = None, None, False
        self.writes = []; self.race = False
    def observe(self, i):
        return Observation(i.repository, i.head_ref, self.head, i.base_ref,
                           i.observed_base_sha, None, None, None, '2026-09-25T08:00:00Z')
    def get_blob(self, sha): return self.blobs.get(sha)
    def put_blob(self, raw):
        sha = git_oid('blob', raw); self.blobs[sha] = raw; self.writes.append('blob')
        if self.fail == 'blob': self.fail = None; raise PublicationError('lost-reply', 5)
        return sha
    def get_tree(self, sha): return self.trees.get(sha)
    def put_tree(self, base, entries):
        self.writes.append('tree')
        # Construct the fixture's real root tree, retaining unchanged base entries.
        raw = git(self.f.repo, 'ls-tree', base).splitlines()
        tree = {}
        for line in raw:
            header, name = line.split('\t'); mode, kind, sha = header.split()
            tree[name] = (mode, sha)
        for e in entries:
            if e['sha'] is None: tree.pop(e['path'], None)
            else: tree[e['path']] = (e['mode'], e['sha'])
        data = b''.join(mode.encode()+b' '+name.encode()+b'\0'+bytes.fromhex(sha)
                        for name, (mode, sha) in sorted(tree.items()))
        sha = git_oid('tree', data); self.trees[sha] = {'sha': sha}
        if self.fail == 'tree': self.fail = None; raise PublicationError('lost-reply', 5)
        return sha
    def get_commit(self, sha): return self.commits.get(sha)
    def put_commit(self, payload):
        self.writes.append('commit')
        raw = self.raw.replace(b'committer Fixture ', b'committer Publisher ') if self.different else self.raw
        sha = git_oid('commit', raw); tree, parents = commit_fields(raw)
        self.commits[sha] = {'sha': sha, 'tree': {'sha': tree}, 'parents': [{'sha': p} for p in parents]}
        if self.fail == 'commit': self.fail = None; raise PublicationError('lost-reply', 5)
        return sha
    def update_refs(self, i):
        self.writes.append('ref')
        if self.race: self.head = self.f.base
        if self.head != i.expected_head_sha: raise PublicationError('stale-head', 3)
        self.head = i.candidate_sha
        if self.fail == 'ref': self.fail = None; raise PublicationError('lost-reply', 5)
    def create_ref(self, i):
        if i.expected_head_sha is not None: raise AssertionError('existing-ref fallback')
        self.update_refs(i)

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.f = LocalRepo()
        self.packet = build_packet(self.f.repo, self.f.base, self.f.candidate, self.f.paths)
        self.m, self.blobs, _ = read_packet(self.packet)
        self.intent = Intent('api-01', 'fixture/sol', 'R_fixture', 'refs/heads/master',
            'refs/heads/feature', self.f.base, None, self.f.candidate, self.f.candidate,
            self.m['tree_sha'], digest(self.packet))
        self.store = DirectoryStore(self.f.root / 'durable'); self.journal = Journal(self.store, 'api-01')
        self.journal.append('prepared', {'intent': self.intent.to_dict(),
            'packet_reference': self.store.put_packet(self.packet)})
        self.client = ObjectAPI(self.f, self.m, self.blobs['commit'])
    def tearDown(self): self.f.close()
    def transport(self): return ApiGitTransport(self.f.repo, self.client, self.journal)
    def test_binary_tree_commit_ref(self):
        self.transport().publish(self.intent)
        self.assertEqual(self.f.candidate, self.client.head)
        entry = next(e for e in self.m['entries'] if e['path'] == 'texture.bin')
        self.assertEqual(self.f.binary, self.client.blobs[entry['oid']])
    def test_lost_replies_each_boundary(self):
        for stage in ('blob', 'tree', 'commit', 'ref'):
            with self.subTest(stage=stage):
                self.client = ObjectAPI(self.f, self.m, self.blobs['commit']); self.client.fail = stage
                self.transport().publish(self.intent)
                self.assertEqual(self.f.candidate, self.client.head)
    def test_commit_created_ref_not_moved_resume(self):
        original = self.client.update_refs
        def fail(i): raise PublicationError('network-unavailable', 5)
        self.client.update_refs = fail
        with self.assertRaises(PublicationError): self.transport().publish(self.intent)
        self.assertIsNone(self.client.head)
        count = self.client.writes.count('commit')
        self.client.update_refs = original
        self.transport().publish(self.intent)
        self.assertEqual(count, self.client.writes.count('commit'))
        self.assertEqual(self.f.candidate, self.client.head)
    def test_server_commit_identity_retained_separately(self):
        self.client.different = True
        t = self.transport(); t.publish(self.intent)
        effective = t.effective_intent(self.intent)
        self.assertNotEqual(self.f.candidate, effective.candidate_sha)
        self.assertEqual(self.f.candidate, effective.source_commit_sha)
        self.assertEqual(effective.candidate_sha, self.client.head)
        count = len(self.client.writes)
        t.publish(self.intent)
        self.assertEqual(count, len(self.client.writes))
    def test_no_weak_existing_ref_fallback(self):
        self.client.supports_expected_head = False
        intent = dataclasses.replace(self.intent, expected_head_sha=self.f.base, operation_id='api-02')
        j = Journal(self.store, 'api-02'); j.append('prepared', {'intent': intent.to_dict(),
            'packet_reference': self.store.put_packet(self.packet)})
        t = ApiGitTransport(self.f.repo, self.client, j)
        with self.assertRaises(PublicationError): t.publish(intent)
        self.assertEqual([], self.client.writes)
    def test_new_ref_only_bridge(self):
        self.client.supports_expected_head = False
        self.transport().publish(self.intent)
        self.assertEqual(self.f.candidate, self.client.head)
    def test_racing_update_is_not_overwritten(self):
        self.client.race = True
        with self.assertRaises(PublicationError): self.transport().publish(self.intent)
        self.assertEqual(self.f.base, self.client.head)
    def test_blob_oid_mismatch_stops_before_ref(self):
        self.client.put_blob = lambda raw: 'f'*40
        with self.assertRaises(PublicationError): self.transport().publish(self.intent)
        self.assertIsNone(self.client.head)
    def test_tree_oid_mismatch_stops_before_commit(self):
        self.client.put_tree = lambda base, entries: 'f'*40
        with self.assertRaises(PublicationError): self.transport().publish(self.intent)
        self.assertNotIn('commit', self.client.writes)
    def test_unknown_commit_header_rejected_before_upload(self):
        with self.assertRaises(PublicationError):
            commit_payload(self.blobs['commit'].replace(b'\n\n', b'\nencoding ISO-8859-1\n\n', 1))
    def test_commit_payload_fixes_metadata(self):
        payload = commit_payload(self.blobs['commit'])
        self.assertEqual(self.m['parents'], payload['parents'])
        self.assertEqual(self.m['tree_sha'], payload['tree'])
        self.assertIn('date', payload['committer'])
    def test_checkpoint_failure_prevents_ref(self):
        original = self.journal.append
        def fail(stage, detail):
            if stage == 'ref-write-intent': raise OSError('storage lost')
            return original(stage, detail)
        self.journal.append = fail
        with self.assertRaises(OSError): self.transport().publish(self.intent)
        self.assertIsNone(self.client.head)

    def test_returned_commit_id_survives_failed_readback(self):
        self.client.different = True
        original = self.client.get_commit
        self.client.get_commit = lambda sha: original(sha) if sha == self.f.base else None
        with self.assertRaises(PublicationError): self.transport().publish(self.intent)
        self.assertTrue(any(r['stage'] == 'commit-write-result' for r in self.journal.records))
        self.client.get_commit = original
        self.transport().publish(self.intent)
        self.assertEqual(1, self.client.writes.count('commit'))
        self.assertIsNotNone(self.client.head)

    def test_existing_objects_are_reused(self):
        self.client.blobs = {k:v for k,v in self.blobs.items() if k != 'commit'}
        self.client.trees[self.m['tree_sha']] = {'sha':self.m['tree_sha']}
        self.transport().publish(self.intent)
        self.assertEqual(['commit','ref'], self.client.writes)
    def test_invalid_object_write_errors_are_not_retried(self):
        for method in ('put_blob','put_tree','put_commit'):
            self.client = ObjectAPI(self.f, self.m, self.blobs['commit'])
            def bad(*a): raise PublicationError('invalid-input', 2)
            setattr(self.client, method, bad)
            with self.subTest(method=method), self.assertRaises(PublicationError) as e:
                self.transport().publish(self.intent)
            self.assertEqual(2, e.exception.code); self.assertIsNone(self.client.head)
    def test_lost_normalized_commit_response_replays_fixed_metadata(self):
        self.client.different = True; self.client.fail = 'commit'
        self.transport().publish(self.intent)
        self.assertEqual(2, len(self.client.commits))
        self.assertNotEqual(self.f.candidate, self.client.head)
    def test_equivalent_racing_publication_does_not_rewrite_ref(self):
        original = self.client.put_commit
        def create(payload):
            sha = original(payload); self.client.head = sha; return sha
        self.client.put_commit = create
        self.transport().publish(self.intent)
        self.assertNotIn('ref', self.client.writes)

if __name__ == '__main__': unittest.main()
