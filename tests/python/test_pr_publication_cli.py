"""End-to-end CLI against a real local remote with injected GitHub metadata."""
import contextlib
import io
import json
import shutil
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from publish_pr_candidate import main
from pr_publication import Observation, PublicationError
from publication_test_support import LocalRepo, git

class LocalClient:
    supports_expected_head = True
    def __init__(self, f):
        self.f = f; self.pr = None; self.creates = 0; self.lost = False
        self.repository = 'fixture/sol'; self.pr_number = self.pr_owner = self.title = None
    def preflight(self, head):
        if head == 'master': raise PublicationError('protected-target', 4)
        return dict(node_id='R_fixture', full_name='fixture/sol', default_branch='master', permissions={'push':True})
    def viewer(self): return 'fixture'
    def get_ref(self, ref):
        r = git(self.f.remote, 'rev-parse', '--verify', ref, check=False)
        return r.stdout.decode().strip() if r.returncode == 0 else None
    def find_pr(self, head, base, number, owner): return self.pr
    def git_remote(self): return str(self.f.remote)
    def observe(self, i):
        return Observation(i.repository, i.head_ref, self.get_ref(i.head_ref), i.base_ref,
            self.get_ref(i.base_ref), self.pr['number'] if self.pr else None,
            self.pr['head']['sha'] if self.pr else None, self.pr['state'] if self.pr else None,
            '2026-09-25T08:00:00Z')
    def create_pr(self, i):
        self.creates += 1
        self.pr = {'number':120, 'state':'open', 'user':{'login':'fixture'},
                   'head':{'sha':i.candidate_sha}, 'base':{'sha':i.observed_base_sha}}
        if self.lost: raise PublicationError('reply-lost', 5)
        return 120
    def get_commit(self, sha):
        tree = git(self.f.remote, 'rev-parse', sha+'^{tree}')
        parents = git(self.f.remote, 'rev-list', '--parents', '-n', '1', sha).split()[1:]
        return {'sha':sha,'tree':{'sha':tree},'parents':[{'sha':p} for p in parents]}
    def ci_evidence(self, i, number, workflows): return {'ci_observed':False,'ci_passed':False,'runs':[]}

class CliTests(unittest.TestCase):
    def setUp(self):
        self.f = LocalRepo(); self.client = LocalClient(self.f)
        self.store = self.f.root / 'durable'
        self.common = ['--store',str(self.store),'--confirm-persistent-store','--operation','cli-01',
                       '--checkout',str(self.f.repo)]
    def tearDown(self): self.f.close()
    def call(self, args):
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            status = main(args, client_factory=lambda *a, **k: self.client)
        return status, json.loads(stream.getvalue())
    def prepare(self, extra=None):
        args = ['prepare','--repository','fixture/sol','--base','master','--head','feature',
                '--title','Test publication',*self.common]
        for p in self.f.paths: args += ['--allow-path',p]
        return self.call(args + (extra or []))
    def test_full_publish_and_resume_no_duplicate(self):
        code, result = self.prepare(); self.assertEqual(0, code, result)
        code, result = self.call(['execute',*self.common]); self.assertEqual(0, code, result)
        self.assertTrue(result['source_published']); self.assertFalse(result['ci_passed'])
        self.assertEqual(self.f.candidate, result['published_commit_sha'])
        code, result = self.call(['resume',*self.common]); self.assertEqual(0, code, result)
        self.assertEqual(1, self.client.creates)
    def test_lost_pr_creation_response(self):
        self.prepare(); self.client.lost = True
        code, result = self.call(['execute',*self.common]); self.assertEqual(0, code, result)
        self.assertEqual(1, self.client.creates)
    def test_resume_after_working_directory_loss(self):
        self.prepare(); shutil.rmtree(self.f.repo)
        git(self.f.root, 'clone', str(self.f.remote), str(self.f.repo))
        code, result = self.call(['resume',*self.common]); self.assertEqual(0, code, result)
        self.assertTrue(result['source_published'])
    def test_racing_ref_holds_and_keeps_packet(self):
        self.prepare(); git(self.f.remote,'update-ref','refs/heads/feature',self.f.base)
        code, result = self.call(['execute',*self.common]); self.assertEqual(3, code, result)
        self.assertEqual(self.f.base, self.client.get_ref('refs/heads/feature'))
        self.assertTrue(list((self.store/'packets').glob('*.zip')))
    def test_missing_operation_never_creates_ref(self):
        code, result = self.call(['resume',*self.common]); self.assertEqual(4, code, result)
        self.assertIsNone(self.client.get_ref('refs/heads/feature'))
    def test_unconfirmed_store_rejected(self):
        args = ['resume',*[x for x in self.common if x != '--confirm-persistent-store']]
        code, result = self.call(args); self.assertEqual(4, code, result)
    def test_store_inside_checkout_rejected(self):
        self.store = self.f.repo / 'store'; self.common[self.common.index('--store')+1] = str(self.store)
        code, result = self.prepare(); self.assertNotEqual(0, code, result)
    def test_repeat_prepare_requires_resume(self):
        self.prepare(); code, result = self.prepare(); self.assertEqual(3, code, result)
    def test_dirty_prepare_and_default_branch(self):
        (self.f.repo/'dirty').write_bytes(b'x')
        code, result = self.prepare(); self.assertNotEqual(0, code, result)
        self.assertIsNone(self.client.get_ref('refs/heads/feature'))
    def test_raw_error_not_reported(self):
        self.client.preflight = lambda h: (_ for _ in ()).throw(OSError('SENSITIVE_TOKEN'))
        code, result = self.prepare(); self.assertNotEqual(0, code, result)
        self.assertNotIn('SENSITIVE', json.dumps(result))

    def test_failure_after_publication_reports_unknown_not_false(self):
        self.prepare()
        self.client.ci_evidence = lambda *a: (_ for _ in ()).throw(PublicationError('ci-unavailable', 5))
        code, result = self.call(['execute', *self.common])
        self.assertEqual(5, code, result)
        self.assertIsNone(result['source_published'])
        self.assertEqual(self.f.candidate, self.client.get_ref('refs/heads/feature'))
    def test_absent_ci_does_not_emit_ci_observed_checkpoint(self):
        from pr_publication_packet import DirectoryStore, Journal
        self.prepare(); code, result = self.call(['execute', *self.common])
        self.assertEqual(0, code, result)
        records = Journal(DirectoryStore(self.store), 'cli-01').records
        self.assertFalse(any(r['stage'] == 'ci-observed' for r in records))

    def test_inspect_is_read_only(self):
        code, result=self.call(['inspect','--repository','fixture/sol','--head','feature'])
        self.assertEqual(0,code,result); self.assertEqual('inspected',result['state'])
        self.assertIsNone(self.client.get_ref('refs/heads/feature'))
    def test_entrypoint_help_runs_without_credentials(self):
        import subprocess
        result=subprocess.run([sys.executable, str(Path(__file__).resolve().parents[2]/'tools/publish_pr_candidate.py'), '--help'],
                              capture_output=True,text=True)
        self.assertEqual(0,result.returncode); self.assertIn('resume',result.stdout)
    def test_api_existing_head_without_capability_fails_during_prepare(self):
        git(self.f.remote,'update-ref','refs/heads/feature',self.f.base)
        self.client.supports_expected_head=False
        code,result=self.prepare(['--transport','api']); self.assertEqual(4,code,result)
        self.assertFalse((self.store/'packets').exists())

if __name__ == '__main__': unittest.main()
