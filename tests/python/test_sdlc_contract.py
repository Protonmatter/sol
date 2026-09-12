from __future__ import annotations

import copy
import contextlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import validate_sdlc


class SdlcContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.requirements = json.loads(
            (ROOT / "docs" / "requirements.json").read_text(encoding="utf-8")
        )

    def test_repository_contract_passes(self) -> None:
        self.assertEqual(validate_sdlc.validate(ROOT), [])

    def wasm_job(self) -> str:
        source = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        match = re.search(r"^  wasm:\n(.*?)(?=^  [a-zA-Z0-9_-]+:|\Z)", source, re.MULTILINE | re.DOTALL)
        self.assertIsNotNone(match, "CI must publish the required WASM build check")
        return match.group(0)

    def test_required_wasm_status_is_published(self) -> None:
        inventory, errors = validate_sdlc.workflow_inventory(ROOT)
        self.assertEqual(errors, [])
        self.assertIn("WASM build (wasm32-unknown-unknown)", inventory["CI"])

    def test_node_only_coverage_step_cannot_be_removed_or_made_advisory(self) -> None:
        check = getattr(validate_sdlc, "validate_node_coverage_job", None)
        self.assertTrue(callable(check), "Node-only coverage remains a mandatory executable step")
        source = (ROOT / ".github/workflows/coverage.yml").read_text(encoding="utf-8")
        self.assertEqual(check(source), [])
        step = "      - name: Node-tested production-module line, branch, and function gates\n        run: node tools/check_node_coverage.mjs"
        self.assertIn(step, source)
        for replacement in ("", step.replace("        run:", "        if: false\n        run:"),
                step.replace("        run:", "        continue-on-error: true\n        run:"),
                step + "\n        if: false", step + "\n        continue-on-error: true",
                step + " || true", step.replace("node tools/check_node_coverage.mjs", "npm test")):
            with self.subTest(replacement=replacement):
                self.assertTrue(check(source.replace(step, replacement)))
        self.assertTrue(check(source.replace("  javascript:\n", "  javascript:\n    if: false\n")))

    def test_missing_required_wasm_status_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(ROOT / ".github", root / ".github")
            path = root / ".github/workflows/ci.yml"
            source = re.sub(r"^  wasm:\n.*?(?=^  [a-zA-Z0-9_-]+:|\Z)", "",
                            path.read_text(encoding="utf-8"), flags=re.MULTILINE | re.DOTALL)
            source = source.replace("artifact, wasm, coverage", "artifact, coverage")
            path.write_text(source, encoding="utf-8")
            errors = validate_sdlc.validate_workflows(root)
            self.assertTrue(any("required WASM" in error for error in errors), errors)

    def test_weakened_wasm_verification_is_rejected(self) -> None:
        job = self.wasm_job()
        mutations = (
            ("WASM build (wasm32-unknown-unknown)", "Optional WASM check"),
            ("    needs: artifact", "    needs: candidate"),
            ("    if: always()", "    if: success()"),
            ("    runs-on: ubuntu-latest", "    continue-on-error: true\n    runs-on: ubuntu-latest"),
            ('os.environ["ARTIFACT_RESULT"] != "success"', 'os.environ["ARTIFACT_RESULT"] == "success"'),
            ("ARTIFACT_RESULT: ${{ needs.artifact.result }}", "ARTIFACT_RESULT: success"),
            ("--expected-sha256 \"$MANIFEST_SHA256\"", ""),
            ("--source-sha \"$GITHUB_SHA\"", ""),
            ("--run-attempt \"$GITHUB_RUN_ATTEMPT\"", ""),
            ("name: web-candidate-${{ github.run_id }}-${{ github.run_attempt }}", "name: web-candidate-1-1"),
            ("          path: build/site", "          path: build/site\n          run-id: 1"),
            ("        shell: python", "        if: false\n        shell: python"),
        )
        for before, after in mutations:
            with self.subTest(mutation=before), tempfile.TemporaryDirectory() as directory:
                self.assertIn(before, job)
                root = Path(directory)
                shutil.copytree(ROOT / ".github", root / ".github")
                path = root / ".github/workflows/ci.yml"
                source = path.read_text(encoding="utf-8")
                path.write_text(source.replace(job, job.replace(before, after)), encoding="utf-8")
                errors = validate_sdlc.validate_workflows(root)
                self.assertTrue(any("required WASM" in error for error in errors), errors)

    def test_wasm_prerequisite_step_executes_fail_closed(self) -> None:
        match = re.search(r"        shell: python\n        run: \|\n((?:          .*\n)+)", self.wasm_job())
        self.assertIsNotNone(match, "WASM prerequisite guard must execute before downloading the artifact")
        script = textwrap.dedent(match.group(1))
        for result, artifact_id, digest, success in (
            ("success", "123", "a" * 64, True),
            ("failure", "123", "a" * 64, False),
            ("skipped", "123", "a" * 64, False),
            ("cancelled", "123", "a" * 64, False),
            ("", "123", "a" * 64, False),
            ("success", "", "a" * 64, False),
            ("success", "123", "", False),
        ):
            with self.subTest(result=result, artifact_id=artifact_id, digest=digest):
                completed = subprocess.run([sys.executable, "-c", script], env={**os.environ,
                    "ARTIFACT_RESULT": result, "ARTIFACT_ID": artifact_id, "MANIFEST_SHA256": digest},
                    capture_output=True, text=True, timeout=10, check=False)
                self.assertEqual(completed.returncode == 0, success, completed.stderr)

    def test_duplicate_requirement_is_rejected(self) -> None:
        data = copy.deepcopy(self.requirements)
        data["requirements"].append(copy.deepcopy(data["requirements"][0]))
        errors, _ = validate_sdlc.validate_requirements_data(data, ROOT)
        self.assertTrue(any("duplicate requirement id" in error for error in errors))

    def test_dangling_evidence_is_rejected(self) -> None:
        data = copy.deepcopy(self.requirements)
        data["requirements"][0]["verification"] = ["tests/not-present.test"]
        errors, _ = validate_sdlc.validate_requirements_data(data, ROOT)
        self.assertTrue(any("evidence does not exist" in error for error in errors))

    def test_mutable_action_tag_is_rejected(self) -> None:
        text = "permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@v4\n"
        errors = validate_sdlc.validate_action_pins(
            ROOT / ".github" / "workflows" / "synthetic.yml", text, ROOT
        )
        self.assertTrue(any("not pinned to a full commit SHA" in error for error in errors))

    def test_mutable_action_tag_in_named_step_is_rejected(self) -> None:
        text = (
            "permissions:\n  contents: read\nsteps:\n"
            "  - name: Checkout\n"
            "    uses: actions/checkout@v4\n"
        )
        errors = validate_sdlc.validate_action_pins(
            ROOT / ".github" / "workflows" / "synthetic.yml", text, ROOT
        )
        self.assertTrue(any("not pinned to a full commit SHA" in error for error in errors))

    def test_missing_source_anchor_is_rejected(self) -> None:
        errors = validate_sdlc.validate_source_reference(
            "docs/SPEC.md#not-a-real-section", ROOT, "SOL-TEST-999"
        )
        self.assertTrue(any("source anchor does not exist" in error for error in errors))

    def test_missing_source_file_is_rejected(self) -> None:
        errors = validate_sdlc.validate_source_reference(
            "docs/not-present.md#section", ROOT, "SOL-TEST-999"
        )
        self.assertTrue(any("source does not exist" in error for error in errors))

    def test_malformed_requirement_shapes_are_rejected(self) -> None:
        errors, ids = validate_sdlc.validate_requirements_data(None, ROOT)
        self.assertEqual(ids, set())
        self.assertTrue(any("schema_version" in error for error in errors))

        errors, ids = validate_sdlc.validate_requirements_data(
            {"schema_version": "sol-requirements.v1", "requirements": []}, ROOT
        )
        self.assertEqual(ids, set())
        self.assertTrue(any("non-empty array" in error for error in errors))

        data = {
            "schema_version": "sol-requirements.v1",
            "requirements": [
                "not an object",
                {"id": "bad"},
                {
                    "id": "SOL-BAD-001",
                    "status": "unknown",
                    "statement": "",
                    "source": "README.md",
                    "implementation": [],
                    "verification": None,
                    "ci_gates": [""],
                },
                {
                    "id": "SOL-BAD-002",
                    "status": "planned",
                    "statement": "This has no normative keyword.",
                    "source": "docs/not-present.md#section",
                    "implementation": ["not/present"],
                    "verification": ["tools/validate_sdlc.py"],
                    "ci_gates": ["CI"],
                },
            ],
        }
        errors, ids = validate_sdlc.validate_requirements_data(data, ROOT)
        joined = "\n".join(errors)
        self.assertEqual(ids, {"SOL-BAD-001", "SOL-BAD-002"})
        for expected in (
            "must be an object",
            "invalid requirement id",
            "status must be",
            "statement is required",
            "BCP 14 keyword",
            "source must be",
            "source does not exist",
            "must be a non-empty string array",
            "evidence does not exist",
        ):
            self.assertIn(expected, joined)

    def test_workflow_inventory_and_gate_errors(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workflows = root / ".github" / "workflows"
            workflows.mkdir(parents=True)
            (workflows / "unnamed.yml").write_text("permissions:\n  contents: read\n", encoding="utf-8")
            inventory, errors = validate_sdlc.workflow_inventory(root)
            self.assertEqual(inventory, {})
            self.assertTrue(any("missing workflow name" in error for error in errors))

        data = {
            "requirements": [
                "not an object",
                {"id": "SOL-X-001", "ci_gates": ["Not a workflow"]},
                {"id": "SOL-X-002", "ci_gates": ["CI / Not a job"]},
            ]
        }
        errors = validate_sdlc.validate_ci_gate_references(data, ROOT)
        self.assertTrue(any("unknown CI workflow" in error for error in errors))
        self.assertTrue(any("unknown job" in error for error in errors))

    def test_malformed_rfc_reports_all_contract_gaps(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            rfc = root / "0002-bad.md"
            rfc.write_text(
                "# RFC\n\n- Status: Unknown\n- Created: yesterday\n"
                "- Requirements: `SOL-NOPE-999`\n",
                encoding="utf-8",
            )
            errors = validate_sdlc.validate_rfc(rfc, {"SOL-OK-001"}, root)
            joined = "\n".join(errors)
            self.assertIn("missing Authors metadata", joined)
            self.assertIn("missing Target metadata", joined)
            self.assertIn("invalid RFC status", joined)
            self.assertIn("Created must use", joined)
            self.assertIn("missing section", joined)
            self.assertIn("unknown requirement SOL-NOPE-999", joined)

            rfc.write_text(
                "# RFC\n\n- Status: Draft\n- Authors: A\n- Created: 2026-01-01\n"
                "- Target: none\n- Requirements: none\n",
                encoding="utf-8",
            )
            errors = validate_sdlc.validate_rfc(rfc, set(), root)
            self.assertTrue(any("at least one SOL-* id" in error for error in errors))

    def test_permissions_and_required_tokens_are_enforced(self) -> None:
        synthetic = ROOT / ".github" / "workflows" / "synthetic.yml"
        errors = validate_sdlc.validate_action_pins(
            synthetic,
            "permissions: write-all\nsteps:\n"
            "  - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0\n",
            ROOT,
        )
        self.assertTrue(any("write-all" in error for error in errors))
        errors = validate_sdlc.validate_action_pins(
            synthetic,
            "steps:\n  - run: true\n",
            ROOT,
        )
        self.assertTrue(any("must declare permissions" in error for error in errors))
        errors = validate_sdlc.validate_action_pins(
            synthetic,
            "permissions:\n  contents: write\n  issues: write\nsteps:\n",
            ROOT,
        )
        self.assertEqual(
            sum("unnecessary write permission" in error for error in errors),
            2,
        )
        allowed = validate_sdlc.validate_action_pins(
            ROOT / ".github" / "workflows" / "deploy-pages.yml",
            "permissions:\n  contents: read\n  pages: write\n  id-token: write\nsteps:\n",
            ROOT,
        )
        self.assertFalse(any("unnecessary write permission" in error for error in allowed))
        self.assertEqual(
            validate_sdlc.require_tokens("x", "alpha", ("alpha", "beta")),
            ["x: missing release contract token 'beta'"],
        )

    def test_invalid_json_and_missing_repository_are_reported(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "docs").mkdir()
            (root / "docs" / "requirements.json").write_text("{", encoding="utf-8")
            errors = validate_sdlc.validate(root)
            self.assertTrue(any("requirements.json:" in error for error in errors))
        with tempfile.TemporaryDirectory() as temp:
            errors = validate_sdlc.validate(Path(temp))
            self.assertTrue(any("missing required SDLC artifact" in error for error in errors))

    def test_main_success_and_error_exit_codes(self) -> None:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(validate_sdlc.main(["--root", str(ROOT)]), 0)
            with tempfile.TemporaryDirectory() as temp:
                self.assertEqual(validate_sdlc.main(["--root", temp]), 1)


if __name__ == "__main__":
    unittest.main()
