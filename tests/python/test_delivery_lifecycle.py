from __future__ import annotations
import sys
import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"tools"))
import delivery_lifecycle as lifecycle


class LifecycleTests(unittest.TestCase):
    def test_discovery_and_lease_errors_are_blocked_without_false_success(self):
        adapter=mock.Mock();adapter.observe.side_effect=RuntimeError("state unavailable")
        self.assertEqual(lifecycle.deliver(self.policy(),self.candidate(),adapter)["state"],"blocked")
        adapter.compare_and_push.assert_not_called()
        adapter=mock.Mock();adapter.observe.return_value=self.state();adapter.compare_and_push.side_effect=RuntimeError("lease refused")
        self.assertEqual(lifecycle.deliver(self.policy(),self.candidate(),adapter)["state"],"blocked")
        adapter.open_pr.assert_not_called()

    def test_daily_workflow_is_read_only_and_no_remote_mutation_enabled(self):
        import validate_sdlc
        path=ROOT/".github/workflows/daily-ingest.yml";text=path.read_text()
        self.assertEqual(validate_sdlc.validate_action_pins(path,text,ROOT),[])
        for scope in ("contents","issues","pull-requests","actions"):
            changed=text.replace("contents: read",scope+": write")
            self.assertTrue(any("write permission" in e for e in validate_sdlc.validate_action_pins(path,changed,ROOT)))
        self.assertNotIn("git push",text);self.assertNotIn("--execute",text);self.assertNotIn("--auto",text)

    def state(self, **changes):
        state=dict(repository="owner/repo", branch=lifecycle.BRANCH, branch_owner="approved-bot", pr_owner="approved-bot",
            pr_number=7, pr_state="OPEN", head_sha="a"*40, base_sha="b"*40, changed_paths=["apps/web/data/current.json","apps/web/data/bundles/research-a/manifest.json"])
        state.update(changes);return state

    def candidate(self, **changes):
        value=dict(bundle_id="research-a",source_bundle_id="source-a",manifest_sha256="d"*64,
            commit_sha="c"*40,generation_base_sha="b"*40, expected_head_sha="a"*40,changed_paths=self.state()["changed_paths"], validated=True)
        value.update(changes);return value

    def policy(self):
        return lifecycle.Policy(repository="owner/repo",owner="approved-bot")

    def test_exact_owned_branch_allowlist_base_and_expected_head(self):
        self.assertEqual(lifecycle.plan(self.policy(),self.state(),self.candidate())["action"],"update-owned-pr")
        for changes in ({"repository":"other/repo"},{"branch":"master"},{"branch_owner":"other"},{"pr_owner":"other"},{"pr_state":"MERGED"},{"head_sha":"e"*40},{"base_sha":"f"*40}):
            with self.subTest(changes=changes):
                self.assertEqual(lifecycle.plan(self.policy(),self.state(**changes),self.candidate())["action"],"hold")
        for paths in (["tools/run_daily_ingest.py"],["apps/web/data/bundles/other/manifest.json"],["apps/web/data/../app.js"],["apps/web/data/bundles/research-a/%2e.json"]):
            self.assertEqual(lifecycle.plan(self.policy(),self.state(),self.candidate(changed_paths=paths))["action"],"hold")

    def test_observe_act_refetch_and_race_never_claims_merge(self):
        adapter=mock.Mock()
        adapter.observe.side_effect=[self.state(),self.state(head_sha="c"*40)]
        result=lifecycle.deliver(self.policy(),self.candidate(),adapter)
        adapter.compare_and_push.assert_called_once_with(self.candidate(),expected_head="a"*40)
        self.assertEqual(result["state"],"awaiting-approval")
        self.assertEqual(result["head_sha"],"c"*40)
        adapter=mock.Mock();adapter.observe.side_effect=[self.state(),self.state(head_sha="e"*40)]
        self.assertEqual(lifecycle.deliver(self.policy(),self.candidate(),adapter)["state"],"blocked")

    def test_stale_base_requires_regeneration_and_noop_does_not_push(self):
        adapter=mock.Mock();adapter.observe.return_value=self.state(base_sha="f"*40)
        self.assertEqual(lifecycle.deliver(self.policy(),self.candidate(),adapter)["state"],"blocked")
        adapter.compare_and_push.assert_not_called()
        candidate=self.candidate(changed_paths=[])
        adapter=mock.Mock();adapter.observe.return_value=self.state()
        self.assertEqual(lifecycle.deliver(self.policy(),candidate,adapter)["state"],"no-op")
        adapter.compare_and_push.assert_not_called()

    def test_lifecycle_requires_bound_evidence_for_each_delivery_stage(self):
        value=lifecycle.record("validated",bundle_id="research-a",head_sha="c"*40)
        with self.assertRaises(ValueError):lifecycle.advance(value,"deployed",{})
        value=lifecycle.advance(value,"pr-open",{"pr_number":7,"head_sha":"c"*40})
        value=lifecycle.advance(value,"awaiting-approval",{})
        with self.assertRaises(ValueError):lifecycle.advance(value,"merged",{"merge_sha":"e"*40})
        value=lifecycle.advance(value,"checks-running",{"head_sha":"c"*40,"run_id":3})
        value=lifecycle.advance(value,"merged",{"approved_by":"human-reviewer","merge_sha":"e"*40,"checks_passed":True})
        value=lifecycle.advance(value,"master-validated",{"sha":"e"*40,"run_id":4})
        value=lifecycle.advance(value,"deployed",{"sha":"e"*40,"deployment_id":5})
        with self.assertRaises(ValueError):lifecycle.advance(value,"served-verified",{"sha":"d"*40,"bundle_id":"research-a","url":"https://example.invalid/"})
        self.assertEqual(lifecycle.advance(value,"served-verified",{"sha":"e"*40,"bundle_id":"research-a","url":"https://example.invalid/"})["state"],"served-verified")

    def test_remote_adapter_uses_exact_lease_and_never_auto_merges(self):
        run=mock.Mock(return_value="")
        adapter=lifecycle.GitHubTransport(self.policy(),ROOT,run=run)
        adapter.compare_and_push(self.candidate(),expected_head="a"*40)
        command=run.call_args.args[0]
        self.assertIn("--force-with-lease=refs/heads/automation/daily-research-feed:"+"a"*40,command)
        self.assertEqual(command[-1],"c"*40+":refs/heads/automation/daily-research-feed")
        self.assertFalse(any("merge" in str(call) for call in run.call_args_list))

    def test_adapter_discovery_new_owned_collision_and_remote_manifest_identity(self):
        pointer=json.loads((ROOT/"apps/web/data/current.json").read_bytes())
        manifest_raw=(ROOT/"apps/web/data"/pointer["manifest_path"]).read_bytes();manifest=json.loads(manifest_raw)
        pr={"number":7,"state":"OPEN","author":{"login":"approved-bot"},"headRefOid":"a"*40}
        content=lambda raw:json.dumps({"type":"file","encoding":"base64","content":base64.b64encode(raw).decode()})
        answers=[json.dumps([pr]),json.dumps([{"ref":"refs/heads/"+lifecycle.BRANCH,"object":{"sha":"a"*40}}]),json.dumps({"object":{"sha":"b"*40}}),json.dumps({"author":{"login":"approved-bot"}}),json.dumps([[{"filename":"apps/web/data/current.json"}]]),content(json.dumps(pointer).encode()),content(manifest_raw)]
        runner=mock.Mock(side_effect=answers)
        result=lifecycle.GitHubTransport(self.policy(),ROOT,run=runner).observe()
        self.assertEqual(result["bundle_id"],pointer["bundle_id"]);self.assertEqual(result["branch_owner"],"approved-bot")
        fresh=mock.Mock(side_effect=["[]","[]",json.dumps({"object":{"sha":"b"*40}})])
        observed=lifecycle.GitHubTransport(self.policy(),ROOT,run=fresh).observe();self.assertIsNone(observed["head_sha"])
        self.assertEqual(lifecycle.plan(self.policy(),observed,self.candidate(expected_head_sha=None))["action"],"create-owned-pr")
        collision=mock.Mock(return_value=json.dumps([pr,pr]))
        with self.assertRaises(ValueError):lifecycle.GitHubTransport(self.policy(),ROOT,run=collision).observe()
        bad=answers.copy();bad[-1]=content(b"{}")
        with self.assertRaises(ValueError):lifecycle.GitHubTransport(self.policy(),ROOT,run=mock.Mock(side_effect=bad)).observe()
        adapter=lifecycle.GitHubTransport(self.policy(),ROOT,run=mock.Mock(return_value=""));adapter.open_pr(self.candidate())
        self.assertNotIn("--auto",adapter.run.call_args.args[0])
        for head in ("bad",):
            with self.assertRaises(ValueError):adapter.compare_and_push(self.candidate(),expected_head=head)
        with self.assertRaises(ValueError):adapter.compare_and_push(self.candidate(commit_sha="bad"),expected_head=None)

    def test_candidate_preflight_validates_real_bundle_and_git_evidence(self):
        import data_bundles
        selected=data_bundles.resolve_derived_bundle(ROOT/"apps/web/data/current.json")
        candidate=self.candidate(bundle_id=selected.bundle_id,source_bundle_id=selected.source_bundle_id,manifest_sha256=selected.manifest_sha256,changed_paths=["apps/web/data/current.json"])
        def runner(args,**kwargs):
            if args[1:]==["rev-parse","HEAD"]:return "c"*40
            if args[1]=="status":return ""
            if args[1]=="rev-list":return "c"*40+" "+"b"*40
            if args[1]=="diff":return "apps/web/data/current.json"
            if args[1]=="ls-tree":return "100644 blob "+"d"*40+"\t"+args[-1]
            return "d"*40
        valid=mock.Mock(side_effect=runner)
        lifecycle.verify_candidate(ROOT,candidate,run=valid)
        committed_paths={call.args[0][-1].split(":",1)[1] for call in valid.call_args_list if call.args[0][1]=="rev-parse" and ":" in call.args[0][-1]}
        self.assertEqual(committed_paths,{"apps/web/data/current.json",selected.manifest_path.relative_to(ROOT).as_posix(),*(c.path.relative_to(ROOT).as_posix() for c in selected.components)})
        checked=[]
        def absent(args,**kwargs):
            if args[1]=="rev-parse" and ":" in args[-1]:
                checked.append(args[-1])
                if not args[-1].endswith(":apps/web/data/current.json"):raise RuntimeError("blob absent from candidate")
            return runner(args,**kwargs)
        with self.assertRaises(RuntimeError):lifecycle.verify_candidate(ROOT,candidate,run=absent)
        for mode in ("120000 blob","160000 commit","040000 tree"):
            def wrong_mode(args,**kwargs):
                if args[1]=="ls-tree":return mode+" "+"d"*40+"\t"+args[-1]
                return runner(args,**kwargs)
            with self.subTest(mode=mode),self.assertRaises(ValueError):lifecycle.verify_candidate(ROOT,candidate,run=wrong_mode)
        def divergent(args,**kwargs):
            if args[1]=="hash-object":return "e"*40
            return runner(args,**kwargs)
        with self.assertRaises(ValueError):lifecycle.verify_candidate(ROOT,candidate,run=divergent)
        def missing_tree(args,**kwargs):
            if args[1]=="ls-tree":return ""
            return runner(args,**kwargs)
        with self.assertRaises(ValueError):lifecycle.verify_candidate(ROOT,candidate,run=missing_tree)
        for changed in (self.candidate(commit_sha="bad"),{**candidate,"manifest_sha256":"0"*64},{**candidate,"changed_paths":["tools/code.py"]}):
            with self.subTest(changed=changed),self.assertRaises(ValueError):lifecycle.verify_candidate(ROOT,changed,run=runner)
        with self.assertRaises(ValueError):lifecycle.verify_candidate(ROOT,candidate,run=mock.Mock(return_value="dirty"))

    def test_entrypoint_hold_execute_mock_and_output_collision(self):
        with tempfile.TemporaryDirectory(prefix="sol-life-") as temp:
            out=Path(temp)/"hold.json"
            self.assertEqual(lifecycle.main(["--pointer",str(ROOT/"apps/web/data/current.json"),"--out",str(out)]),0)
            self.assertEqual(json.loads(out.read_bytes())["state"],"validated")
            self.assertEqual(lifecycle.main(["--pointer",str(ROOT/"apps/web/data/current.json"),"--out",str(out)]),2)
            self.assertEqual(lifecycle.main(["--out",str(Path(temp)/"none.json"),"--execute"]),2)
            candidate=Path(temp)/"candidate.json";candidate.write_text(json.dumps(self.candidate()))
            with mock.patch.object(lifecycle,"verify_candidate"),mock.patch.object(lifecycle,"GitHubTransport"),mock.patch.object(lifecycle,"deliver",return_value={"state":"blocked"}):
                self.assertEqual(lifecycle.main(["--out",str(Path(temp)/"blocked.json"),"--execute","--repository","owner/repo","--owner","approved-bot","--candidate",str(candidate)]),1)
            with mock.patch.object(lifecycle,"verify_candidate"),mock.patch.object(lifecycle,"GitHubTransport"),mock.patch.object(lifecycle,"deliver",return_value={"state":"blocked"}) as deliver:
                self.assertEqual(lifecycle.main(["--out",str(out),"--execute","--repository","owner/repo","--owner","approved-bot","--candidate",str(candidate)]),2)
                deliver.assert_not_called()

    def test_create_pr_refetch_and_command_wrapper(self):
        adapter=mock.Mock();adapter.observe.side_effect=[self.state(pr_number=None,pr_owner=None,head_sha=None),self.state(head_sha="c"*40)]
        self.assertEqual(lifecycle.deliver(self.policy(),self.candidate(expected_head_sha=None),adapter)["state"],"awaiting-approval")
        adapter.open_pr.assert_called_once()
        with mock.patch.object(lifecycle.subprocess,"run",return_value=mock.Mock(stdout=" result \n")) as run:
            self.assertEqual(lifecycle.command(["example"],cwd=ROOT),"result");self.assertEqual(run.call_args.kwargs["timeout"],120)
        with self.assertRaises(ValueError):lifecycle.Policy("not a repository","owner")
        self.assertFalse(lifecycle.allowed_paths(["same","same"],"bundle"))
        with self.assertRaises(ValueError):lifecycle.record("deployed",bundle_id="bundle",head_sha="a"*40)

if __name__=="__main__": unittest.main()
