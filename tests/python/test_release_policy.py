from __future__ import annotations

import copy
import datetime as dt
import sys
import unittest
import contextlib
import io
import json
import os
import runpy
import tempfile
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import release_policy as policy


class ReleasePolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.candidate = {
            "schema_version": "release-evidence.v1", "repository": "owner/repo",
            "source_sha": "a" * 40, "run_id": 123, "run_attempt": 1,
            "workflow": ".github/workflows/ci.yml", "event": "push", "ref": "refs/heads/master",
            "jobs": {job: "success" for job in policy.REQUIRED_JOBS},
            "artifact_id": 456, "manifest_sha256": "b" * 64,
            "components": {"ui": "c" * 64, "science": "d" * 64},
            "platforms": ["chromium-desktop"], "schemas": ["solar-state-snapshot.v2"],
            "critical_assets": {"index.html": "c" * 64}, "abi_versions": {"solar": 1, "ephemeris": 1},
        }
        self.trusted = {key: self.candidate[key] for key in (
            "repository", "source_sha", "run_id", "run_attempt", "workflow", "event", "ref",
            "artifact_id", "manifest_sha256", "components", "platforms", "schemas")}
        self.trusted.update({"current_master_sha": "a" * 40, "settings_verified": True,
            "profile": "corrective", "policy_accepted": True, "policy_digest": "e" * 64,
            "required_cases": ["AC-01", "F01"], "required_kinds": ["manual", "scientific"],
            "accepted_evidence": {}, "supported_schemas": ["solar-state-snapshot.v2"]})
        self.today = dt.date(2026, 9, 11)

    def qualify(self) -> list[dict]:
        records = []
        for kind in ("manual", "scientific"):
            record = {"schema_version": "qualification-evidence.v1", "record_id": kind,
                "profile": "corrective", "kind": kind, "qualified_on": "2026-09-10",
                "cases": {"AC-01": "pass", "F01": "pass"},
                "components": self.candidate["components"], "platforms": self.candidate["platforms"],
                "source_sha": self.candidate["source_sha"], "manifest_sha256": "b" * 64,
                "evidence": [{"path": "evidence/result.json", "sha256": "f" * 64}],
                "reviewed_by": "maintainer", "acceptance_id": "review-1",
                "reference": {"source": "reference-fixture", "query_id": "query-1",
                    "acquired_on": "2026-09-10", "eop_margin_days": 100}, "allow_reuse": False}
            self.trusted["accepted_evidence"][policy.record_digest(record)] = {
                "reviewed_by": "maintainer", "acceptance_id": "review-1"}
            records.append(record)
        return records

    def test_protected_evidence_files_are_verified_not_only_digest_strings(self):
        records = self.qualify()
        protected = {"schema_version": "release-profiles.v1", "policy_accepted": True,
            "settings_verified": True, "approved_candidates": {}, "accepted_evidence": {},
            "supported_schemas": ["solar-state-snapshot.v2"], "required_job_names": self.authoritative_jobs()[0]}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            evidence = root / "evidence/result.json"
            evidence.parent.mkdir()
            evidence.write_text("measured result", encoding="utf-8")
            import hashlib
            sha = hashlib.sha256(evidence.read_bytes()).hexdigest()
            for record in records:
                record["evidence"][0]["sha256"] = sha
            policy.validate_protected_evidence(protected, records, root)
            evidence.write_text("tampered", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "evidence digest"):
                policy.validate_protected_evidence(protected, records, root)
            records[0]["evidence"][0]["path"] = "../outside.json"
            with self.assertRaises(ValueError):
                policy.validate_protected_evidence(protected, records, root)
            with self.assertRaisesRegex(ValueError, "schema"):
                policy.validate_protected_evidence(dict(protected, schema_version="future"), [], root)

    def test_automated_success_waits_for_protected_qualification(self) -> None:
        result = policy.evaluate(self.candidate, self.trusted, [], self.today)
        self.assertTrue(result.candidate_verified)
        self.assertFalse(result.promotion_eligible)
        self.assertIn("qualification-missing:manual", result.reasons)

    def test_every_non_success_gate_is_rejected(self) -> None:
        for job in policy.REQUIRED_JOBS:
            for outcome in (None, "failure", "skipped", "cancelled", "absent"):
                candidate = copy.deepcopy(self.candidate)
                if outcome is None:
                    candidate["jobs"].pop(job)
                else:
                    candidate["jobs"][job] = outcome
                with self.subTest(job=job, outcome=outcome):
                    self.assertFalse(policy.evaluate(candidate, self.trusted, [], self.today).candidate_verified)

    def test_required_wasm_verification_cannot_be_absent_or_unsuccessful(self) -> None:
        for outcome in (None, "failure", "skipped", "cancelled"):
            candidate = copy.deepcopy(self.candidate)
            if outcome is None:
                candidate["jobs"].pop("wasm", None)
            else:
                candidate["jobs"]["wasm"] = outcome
            with self.subTest(outcome=outcome):
                self.assertFalse(policy.evaluate(candidate, self.trusted, [], self.today).candidate_verified)

    def test_wrong_candidate_identity_cannot_borrow_a_green_run(self) -> None:
        for key, value in {"repository": "foreign/repo", "source_sha": "c" * 40,
            "run_id": 999, "run_attempt": 2, "artifact_id": 999,
            "manifest_sha256": "c" * 64, "workflow": "other.yml"}.items():
            candidate = dict(self.candidate, **{key: value})
            self.assertFalse(policy.evaluate(candidate, self.trusted, [], self.today).candidate_verified, key)

    def test_dispatch_cannot_replace_pull_request_checks_or_promote(self) -> None:
        candidate = dict(self.candidate, event="workflow_dispatch", ref="refs/heads/branch")
        trusted = dict(self.trusted, event="workflow_dispatch", ref="refs/heads/branch")
        self.assertFalse(policy.evaluate(candidate, trusted, self.qualify(), self.today).candidate_verified)

    def test_protected_corrective_packet_can_qualify_exact_master(self) -> None:
        result = policy.evaluate(self.candidate, self.trusted, self.qualify(), self.today)
        self.assertTrue(result.promotion_eligible, result.reasons)
        self.assertFalse(result.served_verified)
        self.assertFalse(result.rollback_eligible)

    def test_rollback_requires_accepted_served_proof_and_explicit_unexpired_authority(self):
        records = self.qualify()
        self.trusted["current_master_sha"] = "f" * 40
        self.assertIn("rollback", __import__("inspect").signature(policy.evaluate).parameters,
            "explicit rollback policy path missing")
        proof = {"schema_version": "served-release-evidence.v1", "manifest_sha256": "b" * 64,
            "source_sha": "a" * 40, "repository": "owner/repo", "origin": "https://example.invalid/sol/",
            "verified_at": "2026-09-10T12:00:00+00:00", "critical_assets": {"index.html": "c" * 64}}
        self.trusted["served_evidence"] = proof
        self.trusted["accepted_served_evidence"] = [policy.record_digest(proof)]
        self.trusted["rollback_authorization"] = {"source_sha": "a" * 40, "artifact_id": 456,
            "manifest_sha256": "b" * 64, "origin": proof["origin"], "corrected": True,
            "expires_on": "2026-09-12", "reviewed_by": "maintainer", "acceptance_id": "rollback-1"}
        self.assertFalse(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible)
        self.assertTrue(policy.evaluate(self.candidate, self.trusted, records, self.today, rollback=True).rollback_eligible)
        partial = copy.deepcopy(self.trusted)
        partial["served_evidence"]["critical_assets"] = {"wrong.html": "c" * 64}
        partial["accepted_served_evidence"] = [policy.record_digest(partial["served_evidence"])]
        self.assertFalse(policy.evaluate(self.candidate, partial, records, self.today, rollback=True).rollback_eligible)
        for field, value in (("corrected", False), ("expires_on", "2026-09-10"), ("artifact_id", 999), ("origin", "https://other.invalid/")):
            bad = copy.deepcopy(self.trusted)
            bad["rollback_authorization"][field] = value
            self.assertFalse(policy.evaluate(self.candidate, bad, records, self.today, rollback=True).promotion_eligible)
        self.trusted["accepted_served_evidence"] = []
        self.assertFalse(policy.evaluate(self.candidate, self.trusted, records, self.today, rollback=True).promotion_eligible)

    def test_per_case_scope_reuses_science_after_ui_change_without_unrelated_manual_cases(self):
        records = self.qualify()
        self.trusted["qualification_scope"] = {
            "manual": {"AC-01": {"components": ["ui"], "platforms": ["chromium-desktop"]}},
            "scientific": {"F01": {"components": ["science"], "platforms": ["chromium-desktop"],
                "quantities": ["range_km"], "epoch_start_jd": 2451545.0, "epoch_end_jd": 2460000.0}}}
        records[0]["cases"] = {"AC-01": "pass"}
        records[1]["cases"] = {"F01": "pass"}
        records[1]["components"] = {"ui": "0" * 64, "science": "d" * 64}
        records[1]["source_sha"] = "1" * 40
        records[1]["allow_reuse"] = True
        records[1]["case_scope"] = {"F01": {"quantities": ["range_km"],
            "epoch_start_jd": 2451545.0, "epoch_end_jd": 2460000.0}}
        self.trusted["accepted_evidence"] = {policy.record_digest(r): {
            "reviewed_by": r["reviewed_by"], "acceptance_id": r["acceptance_id"]} for r in records}
        self.assertTrue(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible)
        for field, value in (("quantities", ["altitude_deg"]), ("epoch_end_jd", 2459999.0)):
            changed = copy.deepcopy(records)
            changed[1]["case_scope"]["F01"][field] = value
            self.trusted["accepted_evidence"][policy.record_digest(changed[1])] = {
                "reviewed_by": "maintainer", "acceptance_id": "review-1"}
            self.assertFalse(policy.evaluate(self.candidate, self.trusted, changed, self.today).promotion_eligible)
        self.trusted["qualification_scope"]["scientific"] = {}
        self.assertFalse(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible)

    def test_narrow_adverse_overlap_vetoes_full_pass_without_counting_narrow_pass_as_full_coverage(self):
        platforms = ["chromium-desktop", "mobile-safari"]
        self.candidate["platforms"] = self.trusted["platforms"] = platforms
        self.trusted["qualification_scope"] = {
            "manual": {"AC-01": {"components": ["ui"], "platforms": platforms}},
            "scientific": {"F01": {"components": ["science"], "platforms": platforms,
                "quantities": ["range_km", "altitude_deg"], "epoch_start_jd": 2451545.0, "epoch_end_jd": 2460000.0}}}
        records = self.qualify()
        records[1]["case_scope"] = {"F01": {"quantities": ["range_km", "altitude_deg"],
            "epoch_start_jd": 2451545.0, "epoch_end_jd": 2460000.0}}
        def accept(record):
            self.trusted["accepted_evidence"][policy.record_digest(record)] = {
                "reviewed_by": record["reviewed_by"], "acceptance_id": record["acceptance_id"]}
        accept(records[1])
        self.assertTrue(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible)
        for dimension in ("quantity", "epoch", "epoch_endpoint", "platform"):
            narrow = copy.deepcopy(records[1])
            if dimension == "quantity": narrow["case_scope"]["F01"]["quantities"] = ["range_km"]
            if dimension == "epoch": narrow["case_scope"]["F01"].update(epoch_start_jd=2455000.0, epoch_end_jd=2455001.0)
            if dimension == "epoch_endpoint": narrow["case_scope"]["F01"].update(epoch_start_jd=2460000.0, epoch_end_jd=2460001.0)
            if dimension == "platform": narrow["platforms"] = ["mobile-safari"]
            accept(narrow)
            self.assertFalse(policy.evaluate(self.candidate, self.trusted, [records[0], narrow], self.today).promotion_eligible)
            for verdict in ("fail", "pending"):
                adverse = dict(narrow, cases={"F01": verdict})
                accept(adverse)
                for packet in ([*records, adverse], [adverse, *records]):
                    with self.subTest(dimension=dimension, verdict=verdict, first=packet[0] is adverse):
                        decision = policy.evaluate(self.candidate, self.trusted, packet, self.today)
                        self.assertFalse(decision.promotion_eligible)
                        self.assertIn("qualification-conflict:scientific:F01", decision.reasons)
        for dimension in ("quantity", "epoch", "invalid_epoch", "platform", "component", "unaccepted"):
            disjoint = copy.deepcopy(records[1])
            disjoint["cases"] = {"F01": "fail"}
            if dimension == "quantity": disjoint["case_scope"]["F01"]["quantities"] = ["azimuth_deg"]
            if dimension == "epoch": disjoint["case_scope"]["F01"].update(epoch_start_jd=2460001.0, epoch_end_jd=2460002.0)
            if dimension == "invalid_epoch": disjoint["case_scope"]["F01"].update(epoch_start_jd=2456000.0, epoch_end_jd=2455000.0)
            if dimension == "platform": disjoint["platforms"] = ["unsupported-platform"]
            if dimension == "component": disjoint["components"]["science"] = "0" * 64
            if dimension == "unaccepted": disjoint["record_id"] = "unaccepted-new-record"
            else: accept(disjoint)
            for packet in ([*records, disjoint], [disjoint, *records]):
                self.assertTrue(policy.evaluate(self.candidate, self.trusted, packet, self.today).promotion_eligible, dimension)

    def test_missing_settings_or_policy_acceptance_holds(self) -> None:
        records = self.qualify()
        for key in ("settings_verified", "policy_accepted"):
            trusted = dict(self.trusted, **{key: False})
            result = policy.evaluate(self.candidate, trusted, records, self.today)
            self.assertTrue(result.candidate_verified)
            self.assertFalse(result.promotion_eligible)

    def test_failed_pending_expired_or_wrong_fingerprint_records_do_not_qualify(self) -> None:
        for mutation in ("fail", "pending", "expired", "components", "unrelated", "artifact"):
            records = self.qualify()
            bad = records[1]
            if mutation in ("fail", "pending"):
                bad["cases"]["AC-01"] = mutation
            elif mutation == "expired":
                bad["reference"]["acquired_on"] = "2026-07-01"
            elif mutation == "components":
                bad["components"] = {"science": "0" * 64}
            elif mutation == "unrelated":
                bad["cases"] = {"AC-35": "pass"}
            else:
                bad["manifest_sha256"] = "0" * 64
            self.trusted["accepted_evidence"][policy.record_digest(bad)] = {
                "reviewed_by": "maintainer", "acceptance_id": "review-1"}
            self.assertFalse(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible, mutation)

    def test_conflicting_accepted_retest_holds_in_either_order_but_unrelated_does_not(self):
        for verdict in ("fail", "pending"):
            records = self.qualify()
            bad = copy.deepcopy(records[1])
            bad.update(record_id="scientific-retest", qualified_on="2026-09-11")
            bad["cases"]["AC-01"] = verdict
            acceptance = {"reviewed_by": bad["reviewed_by"], "acceptance_id": bad["acceptance_id"]}
            for order in ([*records,bad], [bad,*records]):
                # Unaccepted input must not veto protected passing evidence.
                self.assertTrue(policy.evaluate(self.candidate,self.trusted,order,self.today).promotion_eligible)
            self.trusted["accepted_evidence"][policy.record_digest(bad)] = acceptance
            for order in ([*records,bad], [bad,*records]):
                with self.subTest(verdict=verdict, first=order[0]["record_id"]):
                    self.assertFalse(policy.evaluate(self.candidate,self.trusted,order,self.today).promotion_eligible)
            historical = dict(bad, source_sha="0"*40, manifest_sha256="0"*64)
            self.trusted["accepted_evidence"][policy.record_digest(historical)] = acceptance
            self.assertTrue(policy.evaluate(self.candidate,self.trusted,[*records,historical],self.today).promotion_eligible)

    def test_milestone_requires_all_cases_not_candidate_profile(self) -> None:
        records = self.qualify()
        trusted = dict(self.trusted, profile="experience-milestone")
        self.candidate["profile"] = "corrective"
        result = policy.evaluate(self.candidate, trusted, records, self.today)
        self.assertFalse(result.promotion_eligible)

    def test_unaffected_accepted_evidence_can_be_reused_for_data_refresh(self) -> None:
        records = self.qualify()
        for record in records:
            record["source_sha"] = "0" * 40
            record["manifest_sha256"] = "0" * 64
            record["allow_reuse"] = True
            self.trusted["accepted_evidence"][policy.record_digest(record)] = {
                "reviewed_by": "maintainer", "acceptance_id": "review-1"}
        self.assertTrue(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible)

    def test_unknown_versions_and_self_asserted_acceptance_fail_closed(self) -> None:
        records = self.qualify()
        self.trusted["accepted_evidence"] = {}
        self.assertFalse(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible)
        self.candidate["schema_version"] = "release-evidence.v99"
        self.assertFalse(policy.evaluate(self.candidate, self.trusted, records, self.today).candidate_verified)

    def test_served_verified_compatible_qualified_release_is_rollback_eligible(self) -> None:
        records = self.qualify()
        proof = dict(schema_version="served-release-evidence.v1", manifest_sha256="b" * 64,
            source_sha="a" * 40, repository="owner/repo", verified_at="2026-09-10T12:00:00+00:00",
            critical_assets={"index.html": "c" * 64})
        trusted = dict(self.trusted, served_evidence=proof, accepted_served_evidence=[policy.record_digest(proof)])
        result = policy.evaluate(self.candidate, trusted, records, self.today)
        self.assertTrue(result.served_verified)
        self.assertTrue(result.rollback_eligible)
        trusted["supported_schemas"] = []
        self.assertFalse(policy.evaluate(self.candidate, trusted, records, self.today).rollback_eligible)

    def test_trusted_run_metadata_rejects_wrong_workflow_artifact_attempt_and_missing_gate(self):
        run = {"id": 123, "run_attempt": 1, "head_sha": "a" * 40, "head_branch": "master",
            "repository": {"full_name": "owner/repo"}, "path": ".github/workflows/ci.yml",
            "event": "push", "conclusion": "success"}
        artifact = {"id": 456, "name": "web-candidate-123-1", "expired": False, "workflow_run": {"id": 123}}
        names, jobs = self.authoritative_jobs()
        protected = {"schema_version": "release-profiles.v1", "policy_accepted": True,
            "settings_verified": True, "approved_candidates": {"a" * 40: self.trusted},
            "accepted_evidence": {}, "supported_schemas": self.candidate["schemas"], "required_job_names": names}
        result = policy.trusted_run_context(self.candidate, run, artifact, jobs, "a" * 40, protected)
        self.assertEqual(result["artifact_id"], 456)
        for bad in (dict(run, conclusion="failure"), dict(run, path="foreign.yml"), dict(run, head_sha="f" * 40)):
            with self.assertRaises(ValueError):
                policy.trusted_run_context(self.candidate, bad, artifact, jobs, "a" * 40, protected)
        for bad in (dict(artifact, expired=True), dict(artifact, name="web-candidate-123-2"), dict(artifact, workflow_run={"id": 9})):
            with self.assertRaises(ValueError):
                policy.trusted_run_context(self.candidate, run, bad, jobs, "a" * 40, protected)
        for badjobs in ([], [{"name": "Release gate", "conclusion": "skipped"}]):
            with self.assertRaises(ValueError):
                policy.trusted_run_context(self.candidate, run, artifact, badjobs, "a" * 40, protected)
        with self.assertRaises(ValueError):
            policy.trusted_run_context(self.candidate, run, artifact, jobs, "a" * 40, {})

    def authoritative_jobs(self):
        names = {
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
        jobs = [{"id": index + 1, "name": name, "run_id": 123, "run_attempt": 1,
                 "head_sha": "a" * 40, "status": "completed", "conclusion": "success"}
                for index, name in enumerate(name for group in names.values() for name in group)]
        return names, jobs

    def test_every_authoritative_job_and_matrix_child_must_succeed_in_exact_attempt(self):
        records = self.qualify()
        names, jobs = self.authoritative_jobs()
        run = dict(id=123, run_attempt=1, head_sha="a"*40, head_branch="master",
            repository={"full_name":"owner/repo"}, path=".github/workflows/ci.yml", event="push", conclusion="success")
        artifact = dict(id=456, name="web-candidate-123-1", expired=False, workflow_run={"id":123})
        protected = dict(schema_version="release-profiles.v1", policy_accepted=True, settings_verified=True,
            approved_candidates={"a"*40:self.trusted}, accepted_evidence=self.trusted["accepted_evidence"],
            supported_schemas=self.candidate["schemas"], required_job_names=names)
        valid = policy.trusted_run_context(self.candidate,run,artifact,jobs,"a"*40,protected)
        self.assertTrue(policy.evaluate(self.candidate,valid,records,self.today).promotion_eligible)
        for index in range(len(jobs)):
            for mutation in ("missing", "skipped", "cancelled", "failure", "attempt", "run", "sha", "duplicate", "in_progress"):
                bad = copy.deepcopy(jobs)
                if mutation == "missing": bad.pop(index)
                elif mutation == "duplicate": bad.append(dict(bad[index], id=999))
                elif mutation == "attempt": bad[index]["run_attempt"] = 2
                elif mutation == "run": bad[index]["run_id"] = 999
                elif mutation == "sha": bad[index]["head_sha"] = "b" * 40
                elif mutation == "in_progress": bad[index]["status"] = "in_progress"
                else: bad[index]["conclusion"] = mutation
                with self.subTest(job=jobs[index]["name"], mutation=mutation), self.assertRaises(ValueError):
                    policy.trusted_run_context(self.candidate,run,artifact,bad,"a"*40,protected)
        with self.assertRaises(ValueError):
            policy.trusted_run_context(self.candidate,run,artifact,[jobs[-1]],"a"*40,protected)
        weaker = copy.deepcopy(protected)
        weaker["required_job_names"]["coverage"].pop()
        with self.assertRaises(ValueError):
            policy.trusted_run_context(self.candidate,run,artifact,jobs,"a"*40,weaker)
        with self.assertRaises(ValueError):
            policy.trusted_run_context(dict(self.candidate,jobs={}),run,artifact,jobs,"a"*40,protected)

    def test_rejected_qualification_shapes_never_count_as_acceptance(self):
        changes = [
            {"schema_version": "qualification-evidence.v99"}, {"reviewed_by": ""},
            {"components": {}}, {"platforms": []}, {"qualified_on": "2027-01-01"},
            {"evidence": []}, {"evidence": [{"path": "x", "sha256": "bad"}]},
            {"reference": {"acquired_on": "2026-09-10", "source": "x", "query_id": "x", "eop_margin_days": 89}},
            {"reference": {"acquired_on": "bad"}}, {"cases": None},
        ]
        for change in changes:
            records = self.qualify()
            records[1].update(change)
            self.trusted["accepted_evidence"][policy.record_digest(records[1])] = {
                "reviewed_by": records[1]["reviewed_by"], "acceptance_id": records[1]["acceptance_id"]}
            self.assertFalse(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible, change)

    def test_pr_merge_preview_verifies_but_cannot_promote(self):
        candidate = dict(self.candidate, event="pull_request", ref="refs/pull/7/merge",
            pr_head_sha="b" * 40, pr_base_sha="c" * 40, pr_number=7)
        trusted = dict(self.trusted, event=candidate["event"], ref=candidate["ref"],
            pr_head_sha=candidate["pr_head_sha"], pr_base_sha=candidate["pr_base_sha"], pr_number=7)
        result = policy.evaluate(candidate, trusted, [], self.today)
        self.assertTrue(result.candidate_verified)
        self.assertFalse(result.promotion_eligible)
        candidate.pop("pr_base_sha")
        self.assertFalse(policy.evaluate(candidate, trusted, [], self.today).candidate_verified)
        for changes in ({"source_sha": "bad"}, {"manifest_sha256": "bad"}, {"artifact_id": 0}):
            self.assertFalse(policy.evaluate(dict(self.candidate, **changes), self.trusted, [], self.today).candidate_verified)

    def test_cli_writes_decision_and_distinguishes_qualification_hold_exit_code(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            paths = {}
            for name, data in (("candidate", self.candidate), ("trusted", self.trusted), ("qualification", self.qualify())):
                paths[name] = root / (name + ".json")
                paths[name].write_text(json.dumps(data), encoding="utf-8")
            # qualify updates the protected index; retain its final version.
            paths["trusted"].write_text(json.dumps(self.trusted), encoding="utf-8")
            argv = ["release_policy.py", "--candidate", str(paths["candidate"]), "--trusted", str(paths["trusted"]),
                "--qualification", str(paths["qualification"]), "--today", "2026-09-11", "--promotion"]
            with patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(policy.main(), 0)
            self.assertTrue(json.loads(output.getvalue())["promotion_eligible"])
            self.assertEqual(json.loads(output.getvalue()).get("approved_profile"), "corrective")
            self.assertEqual(json.loads(output.getvalue()).get("policy_digest"), "e" * 64)
            self.assertEqual(json.loads(output.getvalue()).get("reference_freshness", [])[0]["age_days"], 1)
            with patch.object(sys, "argv", ["release_policy.py"]), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    policy.main()
        self.assertEqual(error.exception.code, 1)

    def test_eop_margin_is_evaluated_at_promotion_time_not_acquisition_time(self):
        records = self.qualify()
        records[1]["reference"]["eop_margin_days"] = 90
        self.trusted["accepted_evidence"][policy.record_digest(records[1])] = {
            "reviewed_by": "maintainer", "acceptance_id": "review-1"}
        self.assertFalse(policy.evaluate(self.candidate, self.trusted, records, self.today).promotion_eligible)

    def test_promotion_cli_rechecks_aged_packet_without_changing_artifact_after_approval(self):
        import hashlib
        records = self.qualify()
        records[1]["reference"].update(acquired_on="2026-08-12", eop_margin_days=120)
        names, jobs = self.authoritative_jobs()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs").mkdir()
            (root / "evidence").mkdir()
            evidence = root / "evidence/result.json"
            evidence.write_text("immutable measured qualification", encoding="utf-8")
            measured = hashlib.sha256(evidence.read_bytes()).hexdigest()
            for record in records: record["evidence"][0]["sha256"] = measured
            selected = {key:self.trusted[key] for key in ("profile","required_cases","required_kinds",
                "manifest_sha256","components","platforms","schemas")}
            import release_changes
            report = release_changes.classify("a" * 40, "a" * 40, [])
            selected["change_review"] = {"base_sha": "a" * 40, "diff_sha256": release_changes.report_digest(report)}
            protected = dict(schema_version="release-profiles.v1",policy_accepted=True,settings_verified=True,
                approved_candidates={"a"*40:selected},required_job_names=names,supported_schemas=self.candidate["schemas"],
                accepted_evidence={policy.record_digest(record):{"reviewed_by":record["reviewed_by"],
                    "acceptance_id":record["acceptance_id"]} for record in records})
            inputs = {
                "candidate.json":self.candidate, "docs/release-profiles.json":protected,
                "docs/accepted-qualification.json":records,
                "run.json":dict(id=123,run_attempt=1,head_sha="a"*40,head_branch="master",
                    repository={"full_name":"owner/repo"},path=".github/workflows/ci.yml",event="push",conclusion="success"),
                "artifact.json":dict(id=456,name="web-candidate-123-1",expired=False,workflow_run={"id":123}),
                "jobs.json":[{"jobs":jobs}],
            }
            for name,value in inputs.items(): (root/name).write_text(json.dumps(value),encoding="utf-8")
            original = {name:(root/name).read_bytes() for name in inputs}
            argv = ["release_policy.py","--candidate",str(root/"candidate.json"),"--trusted",str(root/"docs/release-profiles.json"),
                "--qualification",str(root/"docs/accepted-qualification.json"),"--run-metadata",str(root/"run.json"),
                "--artifact-metadata",str(root/"artifact.json"),"--jobs-metadata",str(root/"jobs.json"),"--promotion"]
            for day, master, expected in (("2026-09-10","a"*40,0),("2026-09-11","a"*40,0),
                                          ("2026-09-12","a"*40,1),("2026-09-11","b"*40,1)):
                with self.subTest(day=day,master=master), patch.object(sys,"argv",[*argv,"--today",day,"--master-sha",master]), patch("release_changes.inspect_git", return_value=report), contextlib.redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(policy.main(),expected)
                    self.assertEqual(json.loads(output.getvalue())["promotion_eligible"],expected == 0)
                self.assertEqual({name:(root/name).read_bytes() for name in inputs},original)


if __name__ == "__main__":
    unittest.main()
