from __future__ import annotations

import sys
import unittest
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import validate_sdlc


class ReleaseWorkflowTests(unittest.TestCase):
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
            workflow.write_text(prefix + "\n  deploy:\n" + deploy.replace("--promotion", "--candidate-only"), encoding="utf-8")
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
