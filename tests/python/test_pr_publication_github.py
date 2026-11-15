"""Identity, pagination, CAS shape and current-PR CI association."""
import base64
import dataclasses
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
from pr_publication import Intent, PublicationError
from pr_publication_github import GitHubClient, decode_response

class FixtureClient(GitHubClient):
    def __init__(self):
        super().__init__('fixture/sol', Path('.'))
        self.responses = {}; self.calls = []
    def request(self, method, endpoint, payload=None, *, missing=False):
        self.calls.append((method, endpoint, payload))
        return self.responses.get(endpoint)

def pr(number=116, head='1'*40, owner='fixture', state='open'):
    return {'number': number, 'state': state, 'merged_at': None, 'user': {'login': owner},
        'head': {'ref': 'feature', 'sha': head, 'repo': {'full_name': 'fixture/sol'}},
        'base': {'ref': 'master', 'sha': '3'*40, 'repo': {'full_name': 'fixture/sol'}}}

class GitHubTests(unittest.TestCase):
    def setUp(self):
        self.c = FixtureClient()
        self.i = Intent('gh-01', 'fixture/sol', 'R_fixture', 'refs/heads/master',
            'refs/heads/feature', '3'*40, '2'*40, '1'*40, '1'*40, '4'*40, '5'*64)
    def test_http_404_is_only_missing_when_requested(self):
        raw = b'HTTP/2.0 404 Not Found\r\ncontent-type: application/json\r\n\r\n{"message":"Not Found"}'
        self.assertIsNone(decode_response(1, raw, missing=True))
        with self.assertRaises(PublicationError): decode_response(1, raw)
    def test_http_failure_never_leaks_body(self):
        with self.assertRaises(PublicationError) as e:
            decode_response(1, b'HTTP/2.0 403 Forbidden\n\n{"message":"SENSITIVE"}')
        self.assertNotIn('SENSITIVE', str(e.exception))
    def test_cas_contains_precondition_and_no_force(self):
        self.c.responses['graphql'] = {'data': {'updateRefs': {'clientMutationId': 'gh-01'}}}
        self.c.update_refs(self.i)
        args = self.c.calls[-1][2]['variables']['input']
        self.assertEqual('R_fixture', args['repositoryId'])
        self.assertEqual([{'name': self.i.head_ref, 'beforeOid': '2'*40,
                          'afterOid': '1'*40, 'force': False}], args['refUpdates'])
    def test_graphql_errors_are_errors(self):
        self.c.responses['graphql'] = {'errors': [{'message': 'private provider detail'}]}
        with self.assertRaises(PublicationError): self.c.update_refs(self.i)
    def test_missing_blob_base64_mismatch(self):
        self.c.responses['repos/fixture/sol/git/blobs/'+'1'*40] = {
            'sha': '1'*40, 'encoding': 'base64', 'content': base64.b64encode(b'wrong').decode()}
        with self.assertRaises(PublicationError): self.c.get_blob('1'*40)
    def test_pagination(self):
        self.c.responses['items?per_page=100&page=1'] = list(range(100))
        self.c.responses['items?per_page=100&page=2'] = [100]
        self.assertEqual(list(range(101)), self.c.pages('items'))
    def test_explicit_wrong_pr_rejected(self):
        wrong = pr(); wrong['head']['ref'] = 'unrelated'
        self.c.responses['repos/fixture/sol/pulls/116'] = wrong
        with self.assertRaises(PublicationError): self.c.find_pr('feature', 'master', 116, 'fixture')
    def test_closed_and_unknown_owner(self):
        for value in (pr(state='closed'), pr(owner='other')):
            self.c.responses['repos/fixture/sol/pulls/116'] = value
            with self.assertRaises(PublicationError): self.c.find_pr('feature', 'master', 116, 'fixture')
    def test_duplicate_prs_rejected(self):
        self.c.pages = lambda endpoint, key=None: [pr(116), pr(118)]
        with self.assertRaises(PublicationError): self.c.find_pr('feature', 'master', None, 'fixture')
    def test_ci_old_diagnostic_and_skipped_do_not_pass(self):
        self.c.pages = lambda endpoint, key=None: [self.sample_run('workflow_dispatch')]
        self.assertFalse(self.c.ci_evidence(self.i, 116, ['.github/workflows/ci.yml'])['ci_observed'])
        r = self.sample_run(); r['head_sha'] = '9'*40; r['pull_requests'][0]['head']['sha'] = '9'*40
        self.c.pages = lambda endpoint, key=None: [r]
        self.assertFalse(self.c.ci_evidence(self.i, 116, ['.github/workflows/ci.yml'])['ci_passed'])
    def sample_run(self, event='pull_request'):
        return dict(id=123, run_attempt=1, run_number=1, event=event, head_sha='1'*40,
            head_branch='feature', status='completed', conclusion='success',
            path='.github/workflows/ci.yml', repository={'full_name':'fixture/sol'},
            head_repository={'full_name':'fixture/sol'}, pull_requests=[{'number':116,
            'head':{'sha':'1'*40}, 'base':{'sha':'3'*40}}])
    def test_current_ci_and_test_merge(self):
        run = self.sample_run()
        self.c.pages = lambda endpoint, key=None: ([{'status':'completed','conclusion':'success'}]
            if '/jobs' in endpoint else [run])
        self.assertTrue(self.c.ci_evidence(self.i, 116, ['.github/workflows/ci.yml'])['ci_passed'])
        run['head_sha'] = '8'*40
        self.c.get_commit = lambda sha: {'sha':sha,'parents':[{'sha':'3'*40},{'sha':'1'*40}]}
        self.assertTrue(self.c.ci_evidence(self.i, 116, ['.github/workflows/ci.yml'])['ci_passed'])
    def test_job_skip_and_missing_workflow(self):
        self.c.pages = lambda endpoint, key=None: ([{'status':'completed','conclusion':'skipped'}]
            if '/jobs' in endpoint else [self.sample_run()])
        result = self.c.ci_evidence(self.i, 116, ['.github/workflows/ci.yml','.github/workflows/security.yml'])
        self.assertTrue(result['ci_observed']); self.assertFalse(result['ci_passed'])

    def test_wrong_ci_branch_or_invalid_run_identity_is_not_accepted(self):
        for field, value in [('head_branch', 'unrelated'), ('run_attempt', 0), ('id', -1)]:
            run = self.sample_run(); run[field] = value
            self.c.pages = lambda endpoint, key=None: ([{'status':'completed','conclusion':'success'}]
                if '/jobs' in endpoint else [run])
            with self.subTest(field=field):
                self.assertFalse(self.c.ci_evidence(self.i, 116, ['.github/workflows/ci.yml'])['ci_passed'])

    def test_concrete_client_serializes_authenticated_api_calls(self):
        import json
        import types
        from pr_publication_packet import git_oid
        blob = bytes(range(256))*6554; blob_sha = git_oid('blob',blob)
        calls = []
        def capture(args, cwd, data=None):
            endpoint = args[args.index('--method')+2]; method = args[args.index('--method')+1]
            payload = json.loads(data) if data else None; calls.append((method,endpoint,payload))
            if endpoint == 'repos/fixture/sol': value = {'full_name':'fixture/sol','node_id':'R_fixture',
                'default_branch':'master','permissions':{'push':True}}
            elif endpoint == 'user': value = {'login':'fixture'}
            elif endpoint.endswith('git/ref/heads/master'): value = {'ref':'refs/heads/master','object':{'type':'commit','sha':'3'*40}}
            elif endpoint.endswith('git/ref/heads/feature'): value = {'ref':'refs/heads/feature','object':{'type':'commit','sha':'1'*40}}
            elif endpoint.endswith('/pulls/116'): value = pr()
            elif '/pulls?' in endpoint: value = []
            elif endpoint.endswith('/pulls'): value = {'number':116}
            elif endpoint.endswith('/git/blobs'): value = {'sha':blob_sha}
            elif '/git/blobs/' in endpoint: value = {'sha':blob_sha,'size':len(blob),'encoding':'base64','content':base64.b64encode(blob).decode()}
            elif '/git/trees' in endpoint: value = {'sha':'4'*40,'truncated':False}
            elif '/git/commits' in endpoint: value = {'sha':'1'*40,'tree':{'sha':'4'*40},'parents':[{'sha':'3'*40}]}
            elif endpoint.endswith('/git/refs'): value = {'ref':'refs/heads/feature'}
            else: raise AssertionError(endpoint)
            return 0, b'HTTP/2.0 200 OK\ncontent-type: application/json\n\n'+json.dumps(value).encode()
        client = GitHubClient('fixture/sol', Path('.'), runner=types.SimpleNamespace(capture=capture))
        self.assertEqual('R_fixture',client.preflight('feature')['node_id'])
        self.assertEqual('fixture',client.viewer())
        self.assertEqual('https://github.com/fixture/sol.git',client.git_remote())
        client.pr_number=116; client.pr_owner='fixture'
        self.assertEqual('1'*40,client.observe(self.i).head_sha)
        self.assertEqual(blob_sha,client.put_blob(blob)); self.assertEqual(blob,client.get_blob(blob_sha))
        self.assertEqual('4'*40,client.put_tree('3'*40,[])); self.assertIsNotNone(client.get_tree('4'*40))
        self.assertEqual('1'*40,client.put_commit({'message':'frozen'})); self.assertIsNotNone(client.get_commit('1'*40))
        self.assertIsNone(client.find_pr('feature','master',None,'fixture'))
        client.pr_number=None; client.title='Reviewed feature'; self.assertEqual(116,client.create_pr(self.i))
        client.create_ref(dataclasses.replace(self.i,expected_head_sha=None))
        sent = next(payload for method,endpoint,payload in calls if method=='POST' and endpoint.endswith('/git/blobs'))
        self.assertEqual(blob,base64.b64decode(sent['content']))
    def test_missing_resources_and_invalid_base64(self):
        self.assertIsNone(self.c.get_ref('refs/heads/feature'))
        self.assertIsNone(self.c.get_blob('1'*40)); self.assertIsNone(self.c.get_tree('4'*40))
        self.assertIsNone(self.c.get_commit('1'*40))
        self.c.responses['repos/fixture/sol/git/blobs/'+'1'*40] = {'sha':'1'*40,'encoding':'base64','content':'!'}
        with self.assertRaises(PublicationError): self.c.get_blob('1'*40)
    def test_pagination_limit_and_bad_merge_are_not_success(self):
        self.c.request = lambda *a,**k: list(range(100))
        with self.assertRaises(PublicationError): self.c.pages('too-many')
        run=self.sample_run(); run['head_sha']='8'*40
        self.c.pages=lambda *a,**k:[run]; self.c.get_commit=lambda sha:None
        self.assertFalse(self.c.ci_evidence(self.i,116,['.github/workflows/ci.yml'])['ci_observed'])
    def test_pending_ci_is_not_passed(self):
        run=self.sample_run(); run['status']='in_progress'; run['conclusion']=None
        self.c.pages=lambda *a,**k:[run]
        result=self.c.ci_evidence(self.i,116,['.github/workflows/ci.yml'])
        self.assertTrue(result['ci_observed']); self.assertFalse(result['ci_passed'])

if __name__ == '__main__': unittest.main()
