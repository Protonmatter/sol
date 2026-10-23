from __future__ import annotations

import sys
import unittest
import tempfile
import shutil
import json
import hashlib
import os
import subprocess
import textwrap
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import validate_sdlc
import release_policy


class ReleaseWorkflowTests(unittest.TestCase):
    def test_scientific_failure_evidence_preserves_logs_and_never_claims_acceptance(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / ".github/workflows/ephemeris-accuracy.yml").read_text()
        block = workflow.split("- name: Retain source, run, binary and result identities", 1)[1]
        script = textwrap.dedent(block.split("        run: |\n", 1)[1].split("\n      - uses:", 1)[0])
        for built in (False, True):
            with self.subTest(built=built), tempfile.TemporaryDirectory() as directory:
                temporary = Path(directory)
                evidence = temporary / "build/qualification"
                evidence.mkdir(parents=True)
                failure = b"reference query failed; no result available\n"
                (evidence / "ephemeris-reference.log").write_bytes(failure)
                if built:
                    binary = temporary / "target/release/sky"
                    binary.parent.mkdir(parents=True)
                    binary.write_bytes(b"test-only binary fixture")
                env = dict(os.environ, BUILD_RESULT="success" if built else "failure",
                    REFERENCE_RESULT="failure", SYZYGY_RESULT="success" if built else "skipped",
                    GITHUB_REPOSITORY="owner/repo", GITHUB_SHA="a" * 40,
                    GITHUB_RUN_ID="123", GITHUB_RUN_ATTEMPT="2")
                subprocess.run([sys.executable, "-c", script], cwd=temporary, env=env,
                               check=True, capture_output=True, text=True, timeout=20)
                result = json.loads((evidence / "run.json").read_text())
                self.assertFalse(result["qualification_accepted"])
                self.assertEqual(result["outcomes"]["REFERENCE_RESULT"], "failure")
                self.assertEqual(result["run_attempt"], 2)
                self.assertEqual(result["source_sha"], "a" * 40)
                self.assertEqual(result["files"]["ephemeris-reference.log"], hashlib.sha256(failure).hexdigest())
                self.assertEqual(result["binary_sha256"],
                    hashlib.sha256(b"test-only binary fixture").hexdigest() if built else None)

    def test_checked_in_release_setup_is_schema_valid_but_not_self_approved(self):
        root = Path(__file__).resolve().parents[2]
        protected = json.loads((root / "docs/release-profiles.json").read_text())
        records = json.loads((root / "docs/accepted-qualification.json").read_text())
        release_policy.validate_protected_evidence(protected, records, root)
        self.assertEqual(protected["required_job_names"], release_policy.MANDATORY_JOB_NAMES)
        if not protected["policy_accepted"]:
            with self.assertRaisesRegex(ValueError, "accepted release policy"):
                release_policy.trusted_run_context({}, {}, {}, [], "a" * 40, protected)

    def test_scientific_workflow_cannot_drop_retained_results(self):
        root = Path(__file__).resolve().parents[2]
        for token in ("--report build/qualification/ephemeris-reference.json",
                      "path: build/qualification", "set -euo pipefail"):
            with self.subTest(token=token), tempfile.TemporaryDirectory() as directory:
                fixture = Path(directory)
                shutil.copytree(root / ".github", fixture / ".github")
                workflow = fixture / ".github/workflows/ephemeris-accuracy.yml"
                text = workflow.read_text(encoding="utf-8")
                workflow.write_text(text.replace(token, ""), encoding="utf-8")
                self.assertTrue(any("scientific evidence" in error for error in
                                    validate_sdlc.validate_workflows(fixture)))

    def test_workflow_validator_rejects_rich_evidence_omission_and_real_crate_publish(self):
        root = Path(__file__).resolve().parents[2]
        for filename, before, after in (("ci.yml", "--coverage-root build/coverage-evidence", ""),
                ("deploy-pages.yml", "--require-rich-evidence", ""),
                ("publish-crate.yml", "cargo publish --dry-run", "cargo publish")):
            with self.subTest(workflow=filename), tempfile.TemporaryDirectory() as directory:
                fixture = Path(directory)
                shutil.copytree(root / ".github", fixture / ".github")
                workflow = fixture / ".github/workflows" / filename
                workflow.write_text(workflow.read_text(encoding="utf-8").replace(before, after), encoding="utf-8")
                self.assertTrue(validate_sdlc.validate_workflows(fixture), "weakened delivery boundary accepted")
    def test_workflow_validator_rejects_promotion_without_post_approval_policy(self):
        root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory)
            shutil.copytree(root / ".github", fixture / ".github")
            workflow = fixture / ".github/workflows/deploy-pages.yml"
            source = workflow.read_text(encoding="utf-8")
            prefix, deploy = source.split("\n  deploy:\n", 1)
            workflow.write_text(prefix + "\n  deploy:\n" + deploy.replace("--publish-master", "--candidate-only"), encoding="utf-8")
            errors = validate_sdlc.validate_workflows(fixture)
            self.assertTrue(any("post-approval" in error for error in errors), errors)

    def test_aggregate_requires_every_substantive_job_including_reusable_checks(self):
        text = "jobs:\n  test:\n    runs-on: ubuntu-latest\n  coverage:\n    uses: ./.github/workflows/coverage.yml\n  docs:\n    uses: ./.github/workflows/docs.yml\n  release-gate:\n    if: always()\n    needs: [test, coverage, docs]\n"
        self.assertEqual(validate_sdlc.validate_release_graph(text), [])
        self.assertTrue(validate_sdlc.validate_release_graph(text.replace("test, coverage, docs", "test, docs")))
        self.assertTrue(validate_sdlc.validate_release_graph(text.replace("if: always()", "if: success()")))
        self.assertTrue(validate_sdlc.validate_release_graph(text.replace("    uses: ./.github/workflows/coverage.yml", "    run: true")))
        self.assertTrue(validate_sdlc.validate_release_graph(text + "  extra:\n    runs-on: ubuntu-latest\n"))


if __name__ == "__main__":
    unittest.main()
