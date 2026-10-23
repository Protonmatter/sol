"""Recovery bytes, manifests and immutable storage failure cases."""
import hashlib
import io
import json
import shutil
import sys
import unittest
import zipfile
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from pr_publication import PublicationError
from pr_publication_packet import build_packet, read_packet, restore_packet, DirectoryStore, Journal
from publication_test_support import LocalRepo, git

class PacketTests(unittest.TestCase):
    def setUp(self): self.f = LocalRepo()
    def tearDown(self): self.f.close()
    def packet(self): return build_packet(self.f.repo, self.f.base, self.f.candidate, self.f.paths)
    def mutate(self, data, fn):
        src = zipfile.ZipFile(io.BytesIO(data)); entries = {n: src.read(n) for n in src.namelist()}
        fn(entries); out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as z:
            for n, b in entries.items(): z.writestr(n, b)
        return out.getvalue()
    def test_restore_after_original_deleted(self):
        data = self.packet(); m, blobs, bundle = read_packet(data)
        self.assertEqual(self.f.candidate, m['candidate_sha'])
        self.assertEqual(1677824, len(self.f.binary))
        dest = self.f.root / 'restored'
        git(self.f.root, 'clone', str(self.f.remote), str(dest))
        shutil.rmtree(self.f.repo)
        restored = restore_packet(data, dest)
        self.assertEqual(self.f.candidate, restored['candidate_sha'])
        raw = git(dest, 'cat-file', '-p', self.f.candidate + ':texture.bin', check=False).stdout
        self.assertEqual(self.f.binary, raw)
        self.assertEqual(hashlib.sha256(self.f.binary).hexdigest(), next(
            e['sha256'] for e in m['entries'] if e['path'] == 'texture.bin'))
    def test_corrupt_binary_rejected(self):
        data = self.mutate(self.packet(), lambda e: e.__setitem__(next(n for n in e if n.startswith('blobs/')), b'wrong'))
        with self.assertRaises(PublicationError): read_packet(data)
    def test_missing_binary_rejected(self):
        data = self.mutate(self.packet(), lambda e: e.pop(next(n for n in e if n.startswith('blobs/'))))
        with self.assertRaises(PublicationError): read_packet(data)
    def test_extra_traversal_rejected(self):
        for name in ('../escape', 'extra.txt'):
            data = self.mutate(self.packet(), lambda e: e.__setitem__(name, b'x'))
            with self.assertRaises(PublicationError): read_packet(data)
    def test_undeclared_path(self):
        with self.assertRaises(PublicationError):
            build_packet(self.f.repo, self.f.base, self.f.candidate, ['texture.bin'])
    def test_dirty_tree(self):
        (self.f.repo / 'new.txt').write_text('dirty')
        with self.assertRaises(PublicationError): self.packet()
    def test_filter_divergent_bytes(self):
        git(self.f.repo, 'update-index', '--assume-unchanged', 'texture.bin')
        (self.f.repo / 'texture.bin').write_bytes(b'changed despite clean status')
        with self.assertRaises(PublicationError): self.packet()
    def test_symlink_rejected(self):
        (self.f.repo / 'link').symlink_to(self.f.root)
        git(self.f.repo, 'add', 'link'); git(self.f.repo, 'commit', '-m', 'link')
        with self.assertRaises(PublicationError):
            build_packet(self.f.repo, self.f.base, git(self.f.repo, 'rev-parse', 'HEAD'), self.f.paths + ['link'])
    def test_lfs_rejected(self):
        (self.f.repo / 'texture.bin').write_bytes(b'version https://git-lfs.github.com/spec/v1\noid sha256:abcd\n')
        git(self.f.repo, 'add', '.'); git(self.f.repo, 'commit', '-m', 'pointer')
        with self.assertRaises(PublicationError):
            build_packet(self.f.repo, self.f.base, git(self.f.repo, 'rev-parse', 'HEAD'), self.f.paths)
    def test_wrong_parent_and_bool_size(self):
        def mutate(entries):
            m = json.loads(entries['manifest.json']); m['entries'][0]['size'] = True
            entries['manifest.json'] = json.dumps(m).encode()
        with self.assertRaises(PublicationError): read_packet(self.mutate(self.packet(), mutate))
    def test_missing_prerequisite(self):
        dest = self.f.root / 'empty'; dest.mkdir(); git(dest, 'init')
        with self.assertRaises(PublicationError): restore_packet(self.packet(), dest)

    def test_hidden_change_in_unchanged_tracked_file(self):
        git(self.f.repo, 'update-index', '--assume-unchanged', 'keep.txt')
        (self.f.repo / 'keep.txt').write_bytes(b'hidden uncommitted input')
        with self.assertRaises(PublicationError): self.packet()

class StoreTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.temp = tempfile.TemporaryDirectory(); self.store = DirectoryStore(Path(self.temp.name))
    def tearDown(self): self.temp.cleanup()
    def test_readback_and_chain(self):
        journal = Journal(self.store, 'test-01')
        journal.append('prepared', {'candidate_sha': '1'*40})
        journal.append('ref-write-intent', {'candidate_sha': '1'*40})
        again = Journal(self.store, 'test-01')
        self.assertEqual(2, len(again.records))
        self.assertEqual(journal.records, again.records)
    def test_corrupt_checkpoint(self):
        Journal(self.store, 'test-01').append('prepared', {})
        p = Path(self.temp.name) / 'test-01' / '000000.json'; p.write_bytes(b'{')
        with self.assertRaises(PublicationError): Journal(self.store, 'test-01')
    def test_gap_checkpoint(self):
        self.store.put('test-01', 1, b'{}')
        with self.assertRaises(PublicationError): Journal(self.store, 'test-01')
    def test_readback_failure_stops_next_step(self):
        with mock.patch.object(self.store, 'get', return_value=b'wrong'):
            with self.assertRaises(PublicationError): Journal(self.store, 'test-01').append('prepared', {})
    def test_conflicting_immutable_write(self):
        self.store.put('test-01', 0, b'a')
        self.store.put('test-01', 0, b'a')
        with self.assertRaises(PublicationError): self.store.put('test-01', 0, b'b')
    def test_packet_roundtrip(self):
        ref = self.store.put_packet(b'payload')
        self.assertEqual(b'payload', self.store.get(ref))
    def test_store_rejects_symlink(self):
        (Path(self.temp.name) / 'evil').symlink_to('/tmp')
        with self.assertRaises(PublicationError): self.store.put('evil', 0, b'{}')
    def test_store_rejects_traversal(self):
        with self.assertRaises(PublicationError): self.store.get('../x')
    def test_lock_prevents_second_writer(self):
        with self.store.lock('test-01'):
            with self.assertRaises(PublicationError):
                with self.store.lock('test-01'): pass
    def test_unknown_stage(self):
        with self.assertRaises(PublicationError): Journal(self.store, 'test-01').append('deployed', {})

    def test_parent_directory_is_fsynced_after_new_checkpoint_directory(self):
        import os
        if os.name == 'nt': self.skipTest('POSIX directory fsync only')
        opened, synced = {}, []
        original_open, original_fsync = os.open, os.fsync
        def open_(path, flags, *args, **kwargs):
            fd = original_open(path, flags, *args, **kwargs); opened[fd] = Path(path); return fd
        def sync_(fd):
            if fd in opened: synced.append(opened[fd])
            return original_fsync(fd)
        with mock.patch('os.open', side_effect=open_), mock.patch('os.fsync', side_effect=sync_):
            self.store.put('new-operation', 0, b'{}')
        self.assertIn(Path(self.temp.name), synced)

    def test_runner_sanitizes_deadline_and_missing_program(self):
        import subprocess
        from pr_publication_packet import Runner
        for error, code in ((FileNotFoundError('private detail'),4),
                            (subprocess.TimeoutExpired('private command',1),5)):
            with mock.patch('subprocess.run', side_effect=error):
                with self.assertRaises(PublicationError) as e:
                    Runner()(['unavailable'], Path(self.temp.name))
                self.assertEqual(code, e.exception.code)
                self.assertNotIn('private', str(e.exception))
    def test_windows_lock_protocol_simulation(self):
        import types
        calls = []
        fake = types.SimpleNamespace(LK_NBLCK=1,LK_UNLCK=2,
                                     locking=lambda fd,mode,n: calls.append(mode))
        with mock.patch.dict(sys.modules, {'msvcrt':fake}), mock.patch('os.name','nt'):
            DirectoryStore._sync_directories(self.store.root, self.store.root)
            with self.store.lock('windows-fixture'): pass
            with self.store.lock('windows-fixture'): pass
        self.assertEqual([1,2,1,2], calls)

if __name__ == '__main__': unittest.main()
