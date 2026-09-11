from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest
import subprocess
import io
import contextlib
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))


class ChangesTests(unittest.TestCase):
    def test_scientific_inventory_matches_real_contract_files_and_unknown_contract_requires_review(self):
        import release_changes as changes
        from build_web import SCIENCE_MODULES
        web = Path(__file__).resolve().parents[2] / "apps/web"
        for name in SCIENCE_MODULES:
            self.assertTrue((web / name).is_file() or (web / "js" / name).is_file(), name)
        for path in (web / "js").glob("*Contract*.js"):
            self.assertEqual(changes.category("apps/web/js/" + path.name), "scientific", path.name)
        for name in ("newContract.js", "newGuard.js", "newSchema.js"):
            path = "apps/web/js/" + name
            self.assertEqual(changes.category(path), "unknown")
            report = changes.classify("a" * 40, "b" * 40, [("A", path)])
            with self.assertRaisesRegex(ValueError, "unknown"):
                changes.validate_review(report, {"base_sha": "a" * 40, "diff_sha256": changes.report_digest(report)})

    def test_real_local_git_classification_and_cli_do_not_change_checkout(self):
        import release_changes as changes
        root = Path(__file__).resolve().parents[2]
        sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
        report = changes.inspect_git(root, sha, sha)
        self.assertEqual(report["files"], [])
        with patch.object(sys, "argv", ["release_changes.py", "--source-root", str(root), "--base-sha", sha, "--source-sha", sha]), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(changes.main(), 0)
        self.assertIn('"categories": []', output.getvalue())
        with patch.object(sys, "argv", ["release_changes.py", "--base-sha", "invalid", "--source-sha", sha]), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                changes.main()
            self.assertEqual(error.exception.code, 1)
    def test_classifier_rejects_unreviewed_unknown_or_digest_mismatch(self):
        self.assertIsNotNone(importlib.util.find_spec("release_changes"), "actual diff classifier is missing")
        import release_changes as changes
        report = changes.classify("a" * 40, "b" * 40, [
            ("M", "apps/web/style.css"), ("M", "crates/solar-core/src/lib.rs"),
            ("M", ".github/workflows/ci.yml"), ("M", "apps/web/data/latest-state.json"),
            ("D", "mystery.bin"), ("A", "README.md")])
        self.assertEqual(report["categories"], ["data", "delivery", "documentation", "scientific", "ui", "unknown"])
        selection = {"base_sha": "a" * 40, "diff_sha256": changes.report_digest(report)}
        with self.assertRaisesRegex(ValueError, "unknown"):
            changes.validate_review(report, selection)
        selection["unknown_review"] = {"paths": ["mystery.bin"], "reviewed_by": "maintainer", "acceptance_id": "R-1"}
        changes.validate_review(report, selection)
        selection["diff_sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "digest"):
            changes.validate_review(report, selection)

    def test_classifier_does_not_hide_renamed_science_under_docs(self):
        self.assertIsNotNone(importlib.util.find_spec("release_changes"), "actual diff classifier is missing")
        import release_changes as changes
        result = changes.parse_diff(b"D\0crates/solar-core/src/lib.rs\0A\0docs/lib.rs\0")
        self.assertEqual(result, [("D", "crates/solar-core/src/lib.rs"), ("A", "docs/lib.rs")])
        self.assertIn("scientific", changes.classify("a" * 40, "b" * 40, result)["categories"])
        self.assertEqual(changes.category("apps/web/js/skyWorker.js"), "scientific")
        for bad in (b"M\0../escape\0", b"R100\0old\0new\0", b"M\0partial", b"M\0a\0M\0a\0"):
            with self.assertRaises(ValueError):
                changes.parse_diff(bad)
