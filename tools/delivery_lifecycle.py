"""Guarded rolling-feed delivery policy; remote execution is an explicit opt-in.

The default command only records a candidate hold. No auto-merge exists. Remote
transport is injectable for tests and must be enabled only in an approved protected
environment. A candidate must be regenerated on the currently observed base SHA.
"""
from __future__ import annotations
import argparse
import base64
import json
import logging
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol
from data_bundles import IDENTITY, digest, json_bytes, read_bytes, resolve_derived_bundle, safe_path, _write_new
from validate_snapshot import loads_strict

BRANCH="automation/daily-research-feed"
SHA=re.compile(r"[a-f0-9]{40}\Z")
LOG=logging.getLogger(__name__)


@dataclass(frozen=True)
class Policy:
    repository: str
    owner: str

    def __post_init__(self):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+",self.repository) or not re.fullmatch(r"[A-Za-z0-9_\[\]-]+",self.owner):
            raise ValueError("explicit repository and bot owner required")


def allowed_paths(paths: list[str], bundle_id: str) -> bool:
    if not IDENTITY.fullmatch(bundle_id) or len(paths)!=len(set(paths)):
        return False
    prefix=f"apps/web/data/bundles/{bundle_id}/"
    for path in paths:
        if not isinstance(path,str) or not re.fullmatch(r"[A-Za-z0-9._/-]+",path) or any(p in ("",".","..") for p in path.split("/")):
            return False
        if path!="apps/web/data/current.json" and not path.startswith(prefix):
            return False
    return True


def plan(policy: Policy, observed: dict, candidate: dict) -> dict:
    """Pure decision; no remote state or local candidate is implicitly trusted."""
    reason=None
    if observed.get("repository")!=policy.repository or observed.get("branch")!=BRANCH:
        reason="repository/branch identity mismatch"
    elif observed.get("branch_owner")!=policy.owner or observed.get("pr_owner") not in (None,policy.owner):
        reason="owned branch/PR proof unavailable or mismatched"
    elif observed.get("pr_state") not in (None,"OPEN"):
        reason="rolling PR closed or merged; explicit branch reconciliation required"
    elif not candidate.get("validated") or any(not SHA.fullmatch(candidate.get(k,"")) for k in ("commit_sha","generation_base_sha")):
        reason="candidate validation or SHA evidence missing"
    elif candidate.get("expected_head_sha")!=observed.get("head_sha"):
        reason="expected head changed; regenerate/review candidate"
    elif candidate["generation_base_sha"]!=observed.get("base_sha"):
        reason="current base changed; regenerate on current base"
    elif not allowed_paths(candidate.get("changed_paths",[]),candidate.get("bundle_id","")) or not allowed_paths(observed.get("changed_paths",[]),observed.get("bundle_id",candidate["bundle_id"])):
        reason="changed paths outside exact generated-data allowlist"
    if reason:return {"action":"hold","state":"blocked","reason":reason}
    if not candidate["changed_paths"]:return {"action":"none","state":"no-op","reason":"no generated data changes"}
    return {"action":"update-owned-pr" if observed.get("pr_number") else "create-owned-pr","state":"validated","reason":"human approval and required checks still required"}


class Transport(Protocol):
    def observe(self) -> dict: ...
    def compare_and_push(self,candidate: dict,*,expected_head: str|None) -> None: ...
    def open_pr(self,candidate: dict) -> None: ...


def deliver(policy: Policy,candidate: dict,transport: Transport) -> dict:
    try:
        observed=transport.observe()
    except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as exc:
        return {"state":"blocked","reason":"state discovery failed; no write attempted","error_type":type(exc).__name__}
    decision=plan(policy,observed,candidate)
    if decision["action"] in ("hold","none"):return decision
    try:
        transport.compare_and_push(candidate,expected_head=observed.get("head_sha"))
        if decision["action"]=="create-owned-pr":transport.open_pr(candidate)
        after=transport.observe()
    except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as exc:
        return {"state":"blocked","reason":"delivery failed; re-observe before retry","error_type":type(exc).__name__}
    if after.get("head_sha")!=candidate["commit_sha"] or after.get("base_sha")!=candidate["generation_base_sha"] or after.get("repository")!=policy.repository or after.get("branch")!=BRANCH or after.get("branch_owner")!=policy.owner or after.get("pr_owner")!=policy.owner or after.get("pr_state")!="OPEN" or not after.get("pr_number"):
        return {"state":"blocked","reason":"post-write identity changed; no merge/publication claimed"}
    return {"state":"awaiting-approval","head_sha":after["head_sha"],"pr_number":after["pr_number"],"bundle_id":candidate["bundle_id"]}


def record(state: str,*,bundle_id: str,head_sha: str) -> dict:
    if state not in ("generated","validated") or not IDENTITY.fullmatch(bundle_id) or not SHA.fullmatch(head_sha):raise ValueError("invalid initial lifecycle evidence")
    return {"schema_version":"feed-delivery-lifecycle.v1","state":state,"bundle_id":bundle_id,"head_sha":head_sha,"history":[]}


def advance(current: dict,state: str,evidence: dict) -> dict:
    transitions={"generated":{"validated","blocked","no-op"},"validated":{"pr-open","blocked","no-op"},"pr-open":{"awaiting-approval","blocked"},"awaiting-approval":{"checks-running","blocked"},"checks-running":{"merged","blocked"},"merged":{"master-validated","blocked"},"master-validated":{"deployed","blocked"},"deployed":{"served-verified","blocked"}}
    if state not in transitions.get(current["state"],set()):raise ValueError("invalid lifecycle transition")
    if state in ("pr-open","checks-running") and (evidence.get("head_sha")!=current["head_sha"] or not isinstance(evidence.get("pr_number" if state=="pr-open" else "run_id"),int)):raise ValueError("head-bound PR/check evidence required")
    if state=="merged" and (not evidence.get("approved_by") or evidence.get("checks_passed") is not True or not SHA.fullmatch(evidence.get("merge_sha",""))):raise ValueError("human approval, checks and merge SHA required")
    merged=current.get("merge_sha")
    if state in ("master-validated","deployed","served-verified") and evidence.get("sha")!=merged:raise ValueError("delivery evidence SHA mismatch")
    if state=="master-validated" and not isinstance(evidence.get("run_id"),int):raise ValueError("master validation run required")
    if state=="deployed" and not isinstance(evidence.get("deployment_id"),int):raise ValueError("deployment evidence required")
    if state=="served-verified" and (evidence.get("bundle_id")!=current["bundle_id"] or not str(evidence.get("url","")).startswith("https://")):raise ValueError("served URL and bundle evidence required")
    return {**current,"state":state,**({"merge_sha":evidence["merge_sha"]} if state=="merged" else {}),"history":[*current["history"],{"state":state,"evidence":dict(evidence)}]}


def command(args: list[str],*,cwd: Path) -> str:
    result=subprocess.run(args,cwd=cwd,check=True,capture_output=True,text=True,timeout=120)
    return result.stdout.strip()


class GitHubTransport:
    """Future opt-in adapter, tested through a mock runner only in local qualification.

    Ownership is bound to the exact open PR author plus the branch's latest commit
    author. An absent/merged PR never authorizes adopting an existing branch.
    Every push uses an explicit lease (empty expected value means create-only).
    """
    def __init__(self,policy: Policy,checkout: Path,*,run: Callable=command):
        self.policy=policy;self.checkout=checkout;self.run=run

    def _run(self,args: list[str]) -> str:return self.run(args,cwd=self.checkout)

    def observe(self) -> dict:
        repo=self.policy.repository
        prs=loads_strict(self._run(["gh","pr","list","--repo",repo,"--head",BRANCH,"--base","master","--state","all","--json","number,state,author,headRefOid"]))
        if len(prs)>1:raise ValueError("multiple rolling PRs require manual reconciliation")
        refs=loads_strict(self._run(["gh","api",f"repos/{repo}/git/matching-refs/heads/{BRANCH}"]))
        refs=[r for r in refs if r.get("ref")==f"refs/heads/{BRANCH}"]
        if len(refs)>1:raise ValueError("ambiguous branch ref")
        base=loads_strict(self._run(["gh","api",f"repos/{repo}/git/ref/heads/master"]))["object"]["sha"]
        head=refs[0]["object"]["sha"] if refs else None
        pr=prs[0] if prs else None
        branch_owner=self.policy.owner if head is None else None
        if head and pr and pr["state"]=="OPEN" and pr["headRefOid"]==head:
            commit=loads_strict(self._run(["gh","api",f"repos/{repo}/commits/{head}"]))
            branch_owner=(commit.get("author") or {}).get("login")
        paths=[]; bundle_id=None
        if pr:
            files=loads_strict(self._run(["gh","api","--paginate","--slurp",f"repos/{repo}/pulls/{pr['number']}/files?per_page=100"]))
            paths=[item["filename"] for page in files for item in page]
        if head:
            from data_bundles import schema
            def remote_bytes(path: str) -> bytes:
                value=loads_strict(self._run(["gh","api",f"repos/{repo}/contents/{path}?ref={head}"]))
                if value.get("encoding")!="base64" or value.get("type")!="file":raise ValueError("remote bundle file type unavailable")
                return base64.b64decode(value["content"],validate=False)
            pointer=loads_strict(remote_bytes("apps/web/data/current.json").decode())
            schema(pointer,"bundle-pointer.v1");bundle_id=pointer["bundle_id"]
            if not IDENTITY.fullmatch(bundle_id) or pointer["manifest_path"]!=f"bundles/{bundle_id}/manifest.json":raise ValueError("remote pointer path invalid")
            manifest_raw=remote_bytes("apps/web/data/"+pointer["manifest_path"])
            if digest(manifest_raw)!=pointer["manifest_sha256"]:raise ValueError("remote manifest hash mismatch")
            manifest=loads_strict(manifest_raw.decode());schema(manifest,"research-data-bundle.v1")
            if manifest["bundle_id"]!=bundle_id:raise ValueError("remote bundle identity mismatch")
            exact={"apps/web/data/current.json",f"apps/web/data/bundles/{bundle_id}/manifest.json",*(f"apps/web/data/bundles/{bundle_id}/"+c["path"] for c in manifest["components"])}
            if not allowed_paths(list(exact),bundle_id) or any(p not in exact for p in paths):raise ValueError("remote PR contains undeclared generated files")
        return {"repository":repo,"branch":BRANCH,"branch_owner":branch_owner,"pr_owner":pr["author"]["login"] if pr else None,"pr_number":pr["number"] if pr else None,"pr_state":pr["state"] if pr else None,"head_sha":head,"base_sha":base,"changed_paths":paths,**({"bundle_id":bundle_id} if bundle_id else {})}

    def compare_and_push(self,candidate: dict,*,expected_head: str|None) -> None:
        if expected_head is not None and not SHA.fullmatch(expected_head):raise ValueError("invalid expected branch SHA")
        if not SHA.fullmatch(candidate["commit_sha"]):raise ValueError("invalid candidate commit SHA")
        # URL is constructed only from validated public GitHub owner/repository.
        self._run(["git","push",f"--force-with-lease=refs/heads/{BRANCH}:{expected_head or ''}",f"https://github.com/{self.policy.repository}.git",f"{candidate['commit_sha']}:refs/heads/{BRANCH}"])

    def open_pr(self,candidate: dict) -> None:
        self._run(["gh","pr","create","--repo",self.policy.repository,"--base","master","--head",BRANCH,"--title","data: rolling research feed","--body",f"Validated local bundle {candidate['bundle_id']}. Requires human approval and required checks. No auto-merge or deployment is requested."])


def verify_candidate(checkout: Path,candidate: dict,*,run: Callable=command) -> None:
    """Bind policy claims to actual committed bytes, not an editable candidate JSON.

    Candidate must be the checked-out clean commit, with exactly one parent equal
    to the regenerated base. Data edits outside its selected immutable bundle fail.
    """
    call=lambda args:run(args,cwd=checkout)
    commit=candidate.get("commit_sha","");base=candidate.get("generation_base_sha","")
    if not SHA.fullmatch(commit) or not SHA.fullmatch(base):raise ValueError("candidate SHA malformed")
    if call(["git","rev-parse","HEAD"])!=commit or call(["git","status","--porcelain","--untracked-files=all"]):raise ValueError("candidate must be a clean checked-out commit")
    if call(["git","rev-list","--parents","-n","1",commit]).split()!=[commit,base]:raise ValueError("regenerate as one commit directly on the observed base")
    paths=call(["git","diff","--name-only","--no-renames",base,commit]).splitlines()
    if sorted(paths)!=sorted(candidate.get("changed_paths",[])) or not allowed_paths(paths,candidate.get("bundle_id","")):raise ValueError("committed diff violates generated-data allowlist")
    selected=resolve_derived_bundle(checkout/"apps/web/data/current.json")
    if selected.bundle_id!=candidate["bundle_id"] or selected.source_bundle_id!=candidate["source_bundle_id"] or selected.manifest_sha256!=candidate["manifest_sha256"]:raise ValueError("candidate bundle evidence mismatch")
    exact={"apps/web/data/current.json",str(selected.manifest_path.relative_to(checkout)).replace("\\","/"),*(str(c.path.relative_to(checkout)).replace("\\","/") for c in selected.components)}
    if any(p not in exact for p in paths):raise ValueError("extra generated-looking file not in selected manifest")
    for path in sorted(exact):
        local=safe_path(checkout,path)
        tree=call(["git","ls-tree","--full-tree",commit,"--",path]).splitlines()
        if len(tree)!=1:raise ValueError("selected file absent from committed candidate")
        metadata,separator,name=tree[0].partition("\t")
        fields=metadata.split()
        if separator!="\t" or name!=path or len(fields)!=3 or fields[0] not in ("100644","100755") or fields[1]!="blob" or not SHA.fullmatch(fields[2]):
            raise ValueError("selected candidate entry must be a regular committed blob")
        # git hashes the working bytes without filters; compare with the immutable
        # commit blob OID, through the same injectable transport as other git reads.
        committed=call(["git","rev-parse",f"{commit}:{path}"])
        if fields[2]!=committed or call(["git","hash-object","--no-filters",str(local)])!=committed:raise ValueError("working file differs from committed candidate")


def main(argv: list[str]|None=None) -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pointer",type=Path,default=Path("apps/web/data/current.json"))
    parser.add_argument("--out",type=Path,required=True)
    parser.add_argument("--execute",action="store_true",help="separately authorized protected-environment action")
    parser.add_argument("--repository");parser.add_argument("--owner");parser.add_argument("--candidate",type=Path)
    parser.add_argument("--checkout",type=Path,default=Path.cwd())
    args=parser.parse_args(argv)
    try:
        if args.execute:
            if not args.repository or not args.owner or not args.candidate:raise ValueError("execute requires exact repository, owner and verified candidate file")
            policy=Policy(args.repository,args.owner);candidate=loads_strict(read_bytes(args.candidate).decode())
            verify_candidate(args.checkout.resolve(),candidate)
            # Reserve durable, exclusive attempt evidence BEFORE any remote discovery
            # or write. A crash/final-output failure leaves a visible uncertain attempt.
            if args.out.exists() or args.out.is_symlink():raise FileExistsError("evidence output already exists")
            _write_new(args.out.with_name(args.out.name+".started.json"),json_bytes({
                "state":"attempt-started","repository":policy.repository,"branch":BRANCH,
                "bundle_id":candidate["bundle_id"],"commit_sha":candidate["commit_sha"],
                "expected_head_sha":candidate.get("expected_head_sha")}))
            result=deliver(policy,candidate,GitHubTransport(policy,args.checkout))
        else:
            bundle=resolve_derived_bundle(args.pointer)
            result={"schema_version":"feed-delivery-lifecycle.v1","state":"validated","bundle_id":bundle.bundle_id,"source_bundle_id":bundle.source_bundle_id,"manifest_sha256":bundle.manifest_sha256,"hold":"candidate only; owned rolling PR proof, permissions and human approval not granted"}
        args.out.parent.mkdir(parents=True,exist_ok=True)
        with args.out.open("xb") as stream:stream.write(json_bytes(result))
        LOG.info("feed lifecycle state=%s",result["state"])
        return 1 if result["state"]=="blocked" else 0
    except (ValueError,OSError,KeyError,subprocess.SubprocessError) as exc:
        LOG.error("lifecycle failed: %s",type(exc).__name__);return 2


if __name__=="__main__":
    logging.basicConfig(level=logging.INFO,format="%(levelname)s %(message)s")
    raise SystemExit(main())
