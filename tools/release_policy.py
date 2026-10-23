"""Pure release decisions. Trusted inputs must come from protected verifier metadata."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import argparse
import os
import math
import subprocess
from dataclasses import asdict
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

REQUIRED_JOBS = ("candidate", "governance", "test", "lint", "web", "artifact", "wasm", "coverage", "docs", "determinism", "determinism-compare")
# Expanded API identities for this reviewed workflow, including reusable children
# and every matrix member. Pages publication uses this inventory directly.
MANDATORY_JOB_NAMES = {
    "candidate": ["Candidate identity"], "governance": ["Governance and specification contracts"],
    "test": ["Rust tests (workspace)"], "lint": ["Rust lint (fmt + clippy)"],
    "web": ["Web, provider, and browser validation"], "artifact": ["Build immutable web artifact"],
    "wasm": ["WASM build (wasm32-unknown-unknown)"],
    "coverage": ["Coverage / Rust coverage (>= 90%)", "Coverage / Python coverage (>= 90%)",
                 "Coverage / JavaScript coverage (Node + Chromium, >= 90%)"],
    "docs": ["Docs / Markdown links, badges + style"],
    "determinism": ["Engine determinism (ubuntu-latest)", "Engine determinism (macos-latest)",
                    "Engine determinism (windows-latest)"],
    "determinism-compare": ["Engine determinism (cross-OS byte compare + schema)"],
    "release-gate": ["Release gate"],
}


@dataclass(frozen=True)
class Decision:
    candidate_verified: bool
    promotion_eligible: bool
    served_verified: bool
    rollback_eligible: bool
    reasons: tuple[str, ...]


def record_digest(record: Mapping[str, Any]) -> str:
    return hashlib.sha256(json.dumps(record, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def case_applies(record: Mapping[str, Any], candidate: Mapping[str, Any], scope: Mapping[str, Any], case: str, kind: str,
                 *, adverse: bool = False) -> bool:
    """Passing evidence must contain the case; adverse evidence need only overlap it."""
    components, platforms = scope.get("components"), scope.get("platforms")
    if not isinstance(components, list) or not components or not isinstance(platforms, list) or not platforms:
        return False
    if any(key not in candidate.get("components", {}) or record.get("components", {}).get(key) != candidate["components"][key] for key in components):
        return False
    if not set(platforms).issubset(candidate.get("platforms", [])):
        return False
    recorded_platforms = set(record.get("platforms", []))
    if not (bool(set(platforms) & recorded_platforms) if adverse else set(platforms).issubset(recorded_platforms)):
        return False
    if kind == "scientific" and "quantities" in scope:
        actual = record.get("case_scope", {}).get(case, {})
        required_quantities, recorded_quantities = set(scope["quantities"]), set(actual.get("quantities", []))
        if not required_quantities or not (bool(required_quantities & recorded_quantities) if adverse else required_quantities.issubset(recorded_quantities)):
            return False
        bounds = [scope.get("epoch_start_jd"), scope.get("epoch_end_jd"), actual.get("epoch_start_jd"), actual.get("epoch_end_jd")]
        if any(type(value) not in (float, int) or not math.isfinite(value) for value in bounds):
            return False
        start, end, actual_start, actual_end = bounds
        if start > end or actual_start > actual_end:
            return False
        if not (max(start, actual_start) <= min(end, actual_end) if adverse else actual_start <= start <= end <= actual_end):
            return False
    return True


def validate_protected_evidence(protected: dict, records: list[dict], root: Path) -> None:
    """Validate pinned policy and the actual evidence bytes below its checkout."""
    import jsonschema_min
    from validate_release_manifest import digest, relative_path
    schemas = Path(__file__).resolve().parents[1] / "docs"
    for value, filename in [(protected, "release-profiles.schema.json"),
            *((record, "qualification-evidence-v1.schema.json") for record in records)]:
        errors = jsonschema_min.validate(value, json.loads((schemas / filename).read_text(encoding="utf-8")))
        if errors:
            raise ValueError("protected evidence schema: " + "; ".join(errors))
    root = root.resolve()
    for record in records:
        for evidence in record["evidence"]:
            path = root / relative_path(evidence["path"])
            if any(part.is_symlink() for part in (path, *path.parents)) or not path.resolve().is_relative_to(root):
                raise ValueError("unsafe protected evidence path")
            if digest(path) != evidence["sha256"]:
                raise ValueError("protected evidence digest mismatch")


def require_authoritative_jobs(run: Mapping[str, Any], jobs: Sequence[Mapping[str, Any]], candidate_jobs: Any) -> None:
    """Require every mandatory CI job from this run, attempt, and source."""
    expected = {name for group in MANDATORY_JOB_NAMES.values() for name in group}
    seen_names, seen_ids = set(), set()
    for job in jobs:
        name, identity = job.get("name"), job.get("id")
        if name not in expected or name in seen_names or type(identity) is not int or identity <= 0 or identity in seen_ids:
            raise ValueError("unexpected or ambiguous authoritative job identity")
        if any(job.get(key) != run.get(run_key) for key, run_key in
               (("run_id", "id"), ("run_attempt", "run_attempt"), ("head_sha", "head_sha"))):
            raise ValueError("authoritative job belongs to a different run, attempt or source")
        if job.get("status") != "completed" or job.get("conclusion") != "success":
            raise ValueError(f"authoritative job did not succeed: {name}")
        seen_names.add(name)
        seen_ids.add(identity)
    if seen_names != expected:
        raise ValueError("authoritative mandatory job or matrix/reusable child is missing")
    if candidate_jobs != {key: "success" for key in REQUIRED_JOBS}:
        raise ValueError("candidate job summary differs from authoritative results")


def require_web_artifact(run: Mapping[str, Any], artifact: Mapping[str, Any]) -> None:
    if artifact.get("expired") is not False or artifact.get("workflow_run", {}).get("id") != run.get("id"):
        raise ValueError("artifact is expired or belongs to another run")
    if artifact.get("name") != f"web-candidate-{run.get('id')}-{run.get('run_attempt')}":
        raise ValueError("artifact name/run attempt mismatch")


def trusted_run_context(candidate: Mapping[str, Any], run: Mapping[str, Any],
                        artifact: Mapping[str, Any], jobs: Sequence[Mapping[str, Any]],
                        master_sha: str, protected: Mapping[str, Any]) -> dict:
    """Bind protected policy to API-resolved metadata, never candidate approvals."""
    if protected.get("schema_version") != "release-profiles.v1" or protected.get("policy_accepted") is not True:
        raise ValueError("protected accepted release policy is required")
    selected = protected.get("approved_candidates", {}).get(run.get("head_sha"))
    if not isinstance(selected, dict):
        raise ValueError("candidate has no protected profile selection; await review")
    if run.get("conclusion") != "success" or run.get("path") != ".github/workflows/ci.yml":
        raise ValueError("trusted CI workflow must have succeeded")
    if protected.get("required_job_names") != MANDATORY_JOB_NAMES:
        raise ValueError("protected mandatory job inventory differs from the reviewed verifier")
    require_authoritative_jobs(run, jobs, candidate.get("jobs"))
    require_web_artifact(run, artifact)
    authoritative = {key: "success" for key in REQUIRED_JOBS}
    return {**selected, "repository": run.get("repository", {}).get("full_name"),
        "source_sha": run.get("head_sha"), "run_id": run.get("id"), "run_attempt": run.get("run_attempt"),
        "workflow": run.get("path"), "event": run.get("event"), "ref": "refs/heads/" + str(run.get("head_branch")),
        "artifact_id": artifact.get("id"), "manifest_sha256": selected.get("manifest_sha256"),
        "authoritative_jobs": authoritative,
        "current_master_sha": master_sha, "policy_accepted": True,
        "policy_digest": record_digest(protected), "settings_verified": protected.get("settings_verified") is True,
        "accepted_evidence": protected.get("accepted_evidence", {}),
        "accepted_served_evidence": protected.get("accepted_served_evidence", []),
        "supported_schemas": protected.get("supported_schemas", []),
        "served_manifest_sha256": protected.get("served_manifest_sha256")}


def publish_master(candidate: Mapping[str, Any], run: Mapping[str, Any],
                   artifact: Mapping[str, Any], jobs: Sequence[Mapping[str, Any]],
                   master_sha: str, manifest_sha256: str) -> Decision:
    """Publish a successful master push. Qualification profiles are not consulted."""
    if run.get("conclusion") != "success" or run.get("path") != ".github/workflows/ci.yml":
        raise ValueError("trusted CI workflow must have succeeded")
    require_authoritative_jobs(run, jobs, candidate.get("jobs"))
    require_web_artifact(run, artifact)
    repository = run.get("repository", {}).get("full_name")
    if (candidate.get("repository") != repository or candidate.get("source_sha") != run.get("head_sha")
            or candidate.get("run_id") != run.get("id") or candidate.get("run_attempt") != run.get("run_attempt")
            or candidate.get("workflow") != run.get("path") or candidate.get("artifact_id") != artifact.get("id")
            or candidate.get("event") != "push" or run.get("event") != "push"
            or candidate.get("ref") != "refs/heads/master" or run.get("head_branch") != "master"):
        raise ValueError("candidate does not match the successful master push")
    if not re.fullmatch(r"[0-9a-f]{40}", str(master_sha)) or candidate.get("source_sha") != master_sha:
        raise ValueError("superseded-candidate")
    claimed = candidate.get("manifest_sha256")
    if (not re.fullmatch(r"[0-9a-f]{64}", str(claimed)) or not re.fullmatch(r"[0-9a-f]{64}", str(manifest_sha256))
            or claimed != manifest_sha256):
        raise ValueError("artifact-digest-invalid")
    return Decision(True, True, False, False, ())


def evaluate(candidate: Mapping[str, Any], trusted: Mapping[str, Any],
             records: Sequence[Mapping[str, Any]], today: dt.date, *, rollback: bool = False) -> Decision:
    """Evaluate detached records without I/O or changing inputs.

    `trusted` is not candidate input: the privileged caller resolves it from
    GitHub run/artifact metadata and a protected, accepted evidence index.
    Digest matching proves consistency only; caller provenance supplies trust.
    """
    reasons: list[str] = []
    if candidate.get("schema_version") != "release-evidence.v1":
        reasons.append("candidate-version")
    for key in ("repository", "source_sha", "run_id", "run_attempt", "workflow", "event", "ref",
                "artifact_id", "manifest_sha256", "components", "platforms", "schemas"):
        if candidate.get(key) is None or candidate.get(key) != trusted.get(key):
            reasons.append(f"identity-mismatch:{key}")
    if not re.fullmatch(r"[0-9a-f]{40}", str(candidate.get("source_sha", ""))):
        reasons.append("source-sha-invalid")
    if not re.fullmatch(r"[0-9a-f]{64}", str(candidate.get("manifest_sha256", ""))):
        reasons.append("artifact-digest-invalid")
    for key in ("run_id", "run_attempt", "artifact_id"):
        if type(candidate.get(key)) is not int or candidate[key] <= 0:
            reasons.append(f"identity-invalid:{key}")
    if candidate.get("event") not in ("push", "pull_request"):
        reasons.append("event-not-associated")
    if candidate.get("event") == "pull_request":
        for key in ("pr_head_sha", "pr_base_sha", "pr_number"):
            if not candidate.get(key) or candidate.get(key) != trusted.get(key):
                reasons.append(f"pr-identity-mismatch:{key}")
    jobs = candidate.get("jobs")
    for job in REQUIRED_JOBS:
        if not isinstance(jobs, Mapping) or jobs.get(job) != "success":
            reasons.append(f"gate-not-success:{job}")
    verified = not reasons
    if candidate.get("event") != "push" or candidate.get("ref") != "refs/heads/master":
        reasons.append("not-master-candidate")
    if not rollback:
        master_sha = trusted.get("current_master_sha")
        if not re.fullmatch(r"[0-9a-f]{40}", str(master_sha or "")):
            reasons.append("master-identity-missing")
        elif candidate.get("source_sha") != master_sha:
            reasons.append("superseded-candidate")
    if trusted.get("settings_verified") is not True:
        reasons.append("settings-evidence-missing")
    if trusted.get("policy_accepted") is not True or not re.fullmatch(r"[0-9a-f]{64}", str(trusted.get("policy_digest", ""))):
        reasons.append("protected-policy-missing")
    profile = trusted.get("profile")
    required = trusted.get("required_cases", [])
    if profile == "experience-milestone":
        required = [*(f"AC-{i:02}" for i in range(1, 36)), *(f"F{i:02}" for i in range(1, 23))]
    if profile not in ("corrective", "experience-milestone") or not required:
        reasons.append("profile-scope-missing")
    kinds = trusted.get("required_kinds", [])
    if not isinstance(kinds, list) or not kinds or any(kind not in ("manual", "scientific") for kind in kinds):
        reasons.append("qualification-policy-missing")
        kinds = ["manual", "scientific"]
    if profile == "experience-milestone":
        kinds = ["manual", "scientific"]
    accepted = trusted.get("accepted_evidence", {})
    scopes = trusted.get("qualification_scope")
    if scopes is not None and (not isinstance(scopes, Mapping) or set(scopes) != set(kinds) or
            any(not isinstance(entries, Mapping) for entries in scopes.values()) or
            set(required) != {case for entries in scopes.values() for case in entries} or
            any(not entries or not set(entries).issubset(required) for entries in scopes.values())):
        reasons.append("qualification-scope-invalid")
        scopes = {}
    for kind in kinds:
        kind_required = list(scopes.get(kind, {})) if scopes is not None else required
        covered: set[str] = set()
        for record in records:
            try:
                if record.get("schema_version") != "qualification-evidence.v1" or record.get("profile") != profile or record.get("kind") != kind:
                    continue
                acceptance = accepted.get(record_digest(record), {})
                if not record.get("reviewed_by") or not record.get("acceptance_id") or acceptance != {
                    "reviewed_by": record["reviewed_by"], "acceptance_id": record["acceptance_id"]}:
                    continue
                applicable = [case for case in kind_required if case_applies(record, candidate,
                    scopes[kind][case] if scopes is not None else {"components": list(candidate.get("components", {})),
                        "platforms": candidate.get("platforms", [])}, case, kind,
                    adverse=record.get("cases", {}).get(case) in ("fail", "pending"))]
                if not applicable:
                    continue
                same_artifact = record.get("source_sha") == candidate["source_sha"] and record.get("manifest_sha256") == candidate["manifest_sha256"]
                if not same_artifact and record.get("allow_reuse") is not True:
                    continue
                qualified_on = dt.date.fromisoformat(record["qualified_on"])
                if qualified_on > today:
                    continue
                cases = record["cases"]
                # Accepted adverse results stay adverse: aging an old reference
                # must not turn a failed retest into evidence of a passing one.
                conflicts = [case for case in applicable if cases.get(case) in ("fail", "pending")]
                if conflicts:
                    reasons.extend(f"qualification-conflict:{kind}:{case}" for case in conflicts)
                    continue
                evidence = record.get("evidence")
                if not isinstance(evidence, list) or not evidence or any(
                    not isinstance(item, Mapping) or not item.get("path") or not re.fullmatch(r"[0-9a-f]{64}", str(item.get("sha256", "")))
                    for item in evidence):
                    continue
                if kind == "scientific":
                    reference = record["reference"]
                    age = (today - dt.date.fromisoformat(reference["acquired_on"])).days
                    if not 0 <= age <= 30 or not reference.get("source") or not reference.get("query_id"):
                        continue
                    if type(reference.get("eop_margin_days")) is not int or reference["eop_margin_days"] - age < 90:
                        continue
                covered.update(case for case in applicable if cases.get(case) == "pass")
            except (KeyError, TypeError, ValueError, AttributeError):
                continue
        if not set(kind_required).issubset(covered):
            reasons.append(f"qualification-missing:{kind}")
    proof = trusted.get("served_evidence", {})
    served = (proof.get("schema_version") == "served-release-evidence.v1" and
        record_digest(proof) in trusted.get("accepted_served_evidence", []) and bool(proof.get("critical_assets")) and
        proof.get("critical_assets") == candidate.get("critical_assets") and
        all(proof.get(key) == candidate.get(key) for key in ("manifest_sha256", "source_sha", "repository")))
    try:
        served = served and dt.datetime.fromisoformat(proof["verified_at"]).date() <= today
    except (ValueError, KeyError, TypeError):
        served = False
    compatible = (bool(candidate.get("schemas")) and set(candidate["schemas"]).issubset(trusted.get("supported_schemas", []))
        and candidate.get("abi_versions") == {"solar": 1, "ephemeris": 1})
    if rollback:
        authorization = trusted.get("rollback_authorization", {})
        try:
            authorized = (authorization.get("corrected") is True and bool(authorization.get("reviewed_by")) and
                bool(authorization.get("acceptance_id")) and dt.date.fromisoformat(authorization["expires_on"]) >= today and
                authorization.get("origin") == proof.get("origin") and all(authorization.get(key) == candidate.get(key)
                    for key in ("manifest_sha256", "source_sha", "artifact_id")))
        except (KeyError, TypeError, ValueError):
            authorized = False
        if not authorized or not served or not compatible:
            reasons.append("rollback-authority-or-served-qualification-missing")
    eligible = not reasons
    served = eligible and served
    return Decision(verified, eligible, served, served and compatible, tuple(sorted(set(reasons))))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--trusted", type=Path)
    parser.add_argument("--qualification", type=Path)
    parser.add_argument("--promotion", action="store_true")
    parser.add_argument("--publish-master", action="store_true",
                        help="Publish a successful master CI artifact without qualification profiles")
    parser.add_argument("--rollback", action="store_true", help="Evaluate separately authorized retained artifact; never deploys")
    parser.add_argument("--served-evidence", type=Path, help="Accepted point-in-time served verification record")
    parser.add_argument("--ci-evidence", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--coverage-root", type=Path)
    parser.add_argument("--build-provenance", type=Path)
    parser.add_argument("--require-rich-evidence", action="store_true")
    parser.add_argument("--today", type=dt.date.fromisoformat, default=dt.datetime.now(dt.timezone.utc).date())
    parser.add_argument("--run-metadata", type=Path)
    parser.add_argument("--artifact-metadata", type=Path)
    parser.add_argument("--jobs-metadata", type=Path)
    parser.add_argument("--master-sha")
    parser.add_argument("--source-root", type=Path, help="Git object database for independent protected base/head diff; no candidate code executes")
    args = parser.parse_args()
    try:
        if args.rollback and (not args.run_metadata or not args.require_rich_evidence or not args.served_evidence):
            raise ValueError("rollback requires authoritative API metadata, rich staged evidence and accepted served proof")
        if args.publish_master:
            if args.promotion or args.rollback or args.trusted or args.qualification or args.served_evidence:
                raise ValueError("master publication does not use qualification profiles")
            if not args.candidate or not args.run_metadata or not args.artifact_metadata or not args.jobs_metadata or not args.master_sha or not args.manifest or not args.require_rich_evidence:
                raise ValueError("master publication requires the CI candidate, API metadata, and rich staged evidence")
            candidate = json.loads(args.candidate.read_text(encoding="utf-8"))
            pages = json.loads(args.jobs_metadata.read_text(encoding="utf-8"))
            jobs = [job for page in pages for job in page["jobs"]]
            from release_evidence import validate_outer
            from validate_release_manifest import digest as manifest_digest
            validate_outer(candidate, args.manifest)
            decision = publish_master(candidate, json.loads(args.run_metadata.read_text(encoding="utf-8")),
                json.loads(args.artifact_metadata.read_text(encoding="utf-8")), jobs, args.master_sha,
                manifest_digest(args.manifest))
            records, trusted = [], {}
        elif args.ci_evidence:
            from validate_release_manifest import digest, validate_manifest
            if not args.manifest:
                raise ValueError("--ci-evidence requires --manifest")
            manifest = validate_manifest(args.manifest)
            needs = json.loads(os.environ["NEEDS_JSON"])
            candidate = {"schema_version": "release-evidence.v1",
                **{key: manifest[key] for key in ("repository", "source_sha", "run_id", "run_attempt", "components", "schemas")},
                "platforms": ["chromium-linux-ci"], "workflow": ".github/workflows/ci.yml",
                "event": os.environ["GITHUB_EVENT_NAME"], "ref": os.environ["GITHUB_REF"],
                "artifact_id": int(os.environ["ARTIFACT_ID"]), "manifest_sha256": digest(args.manifest),
                "jobs": {name: entry.get("result") for name, entry in needs.items()},
                "qualification_record_ids": [], "limitations": ["protected qualification and settings not supplied by CI"]}
            if args.coverage_root or args.build_provenance:
                if not args.coverage_root or not args.build_provenance:
                    raise ValueError("coverage reports and build provenance are required together")
                from release_evidence import collect
                candidate.update(collect(args.manifest, args.coverage_root,
                    json.loads(args.build_provenance.read_text(encoding="utf-8"))))
            trusted = dict(candidate, repository=os.environ["GITHUB_REPOSITORY"], source_sha=os.environ["GITHUB_SHA"],
                run_id=int(os.environ["GITHUB_RUN_ID"]), run_attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]),
                manifest_sha256=os.environ["MANIFEST_SHA256"])
            if candidate["event"] == "pull_request":
                event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
                for key, value in {"pr_head_sha": event["pull_request"]["head"]["sha"],
                    "pr_base_sha": event["pull_request"]["base"]["sha"], "pr_number": event["number"]}.items():
                    candidate[key] = trusted[key] = value
            args.ci_evidence.parent.mkdir(parents=True, exist_ok=True)
            args.ci_evidence.write_text(json.dumps(candidate, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            records = []
            if args.served_evidence:
                trusted["served_evidence"] = json.loads(args.served_evidence.read_text(encoding="utf-8"))
            if args.require_rich_evidence:
                if not args.manifest:
                    raise ValueError("rich outer evidence verification requires the exact staged manifest")
                from release_evidence import validate_outer
                validate_outer(candidate, args.manifest)
            decision = evaluate(candidate, trusted, records, args.today, rollback=args.rollback)
        else:
            if not args.candidate or not args.trusted:
                raise ValueError("--candidate and --trusted are required")
            candidate = json.loads(args.candidate.read_text(encoding="utf-8"))
            trusted = json.loads(args.trusted.read_text(encoding="utf-8"))
            records = json.loads(args.qualification.read_text(encoding="utf-8")) if args.qualification else []
            if args.run_metadata:
                if not args.artifact_metadata or not args.jobs_metadata or not args.master_sha:
                    raise ValueError("API-resolved run, artifact, jobs and master identities are all required")
                pages = json.loads(args.jobs_metadata.read_text(encoding="utf-8"))
                jobs = [job for page in pages for job in page["jobs"]]
                validate_protected_evidence(trusted, records, args.trusted.resolve().parent.parent)
                from release_changes import inspect_git, validate_review
                run = json.loads(args.run_metadata.read_text())
                selected = trusted.get("approved_candidates", {}).get(run.get("head_sha"), {})
                change_review = selected.get("change_review", {})
                report = inspect_git(args.source_root or args.trusted.resolve().parent.parent,
                    change_review.get("base_sha", ""), run.get("head_sha", ""))
                validate_review(report, change_review)
                trusted = trusted_run_context(candidate, json.loads(args.run_metadata.read_text()),
                    json.loads(args.artifact_metadata.read_text()), jobs, args.master_sha, trusted)
            if args.served_evidence:
                trusted["served_evidence"] = json.loads(args.served_evidence.read_text(encoding="utf-8"))
            if args.require_rich_evidence:
                if not args.manifest:
                    raise ValueError("rich outer evidence verification requires the exact staged manifest")
                from release_evidence import validate_outer
                validate_outer(candidate, args.manifest)
            decision = evaluate(candidate, trusted, records, args.today, rollback=args.rollback)
    except (ValueError, KeyError, OSError, TypeError, subprocess.SubprocessError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    references = []
    for record in records:
        if record.get("kind") != "scientific":
            continue
        reference = record.get("reference", {})
        try:
            age = (args.today - dt.date.fromisoformat(reference["acquired_on"])).days
            margin = reference["eop_margin_days"] - age
        except (KeyError, ValueError, TypeError):
            age, margin = None, None
        references.append({"record_id": record.get("record_id"), "record_sha256": record_digest(record),
            "source": reference.get("source"), "query_id": reference.get("query_id"), "age_days": age,
            "remaining_eop_days": margin, "fresh": age is not None and 0 <= age <= 30 and margin >= 90})
    output = {**asdict(decision), "approved_profile": trusted.get("profile"), "policy_digest": trusted.get("policy_digest"),
        "evaluated_on_utc": args.today.isoformat(), "mode": "rollback" if args.rollback else "normal",
        "reference_freshness": references, "qualification_scope": trusted.get("qualification_scope"),
        "qualification_inputs": [{"record_id": record.get("record_id"), "sha256": record_digest(record),
            "accepted": record_digest(record) in trusted.get("accepted_evidence", {}), "kind": record.get("kind"),
            "cases": record.get("cases"), "components": record.get("components"), "platforms": record.get("platforms"),
            "case_scope": record.get("case_scope")} for record in records]}
    print(json.dumps(output, sort_keys=True))
    publish = args.promotion or args.publish_master
    return 0 if (decision.rollback_eligible if args.rollback else decision.promotion_eligible if publish else decision.candidate_verified) else 1


if __name__ == "__main__":
    raise SystemExit(main())
