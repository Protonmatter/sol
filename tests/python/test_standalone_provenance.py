from __future__ import annotations

import copy
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import validate_snapshot


class StandaloneProvenanceTests(unittest.TestCase):
    def test_extracted_runtime_predicate_remains_in_both_python_coverage_reports(self):
        workflow = (ROOT / ".github/workflows/coverage.yml").read_text(encoding="utf-8")
        populations = re.findall(r"--include='([^']+)'", workflow)
        self.assertEqual(len(populations), 2, "text gate and retained XML must both declare scope")
        for population in populations:
            self.assertIn("tools/data_bundles.py", population.split(","))
            self.assertIn("tools/observation_provenance.py", population.split(","))

    def test_v3_intake_requires_attributable_observations_without_normalizing_sources(self):
        template = json.loads((ROOT / "apps/web/data/latest-state.json").read_text(encoding="utf-8"))
        corpus = json.loads((ROOT / "tests/fixtures/standalone-provenance.json").read_text(encoding="utf-8"))
        for case in corpus:
            with self.subTest(case=case["id"]):
                snapshot = copy.deepcopy(template)
                snapshot["observations"][0]["frames"][0]["provenance"]["source"] = case["source"]
                before = copy.deepcopy(snapshot)
                errors = validate_snapshot.validate(snapshot)
                if case["attributable"]:
                    self.assertEqual(errors, [])
                else:
                    self.assertTrue(any("provenance.source" in error for error in errors), errors)
                self.assertEqual(snapshot, before)


if __name__ == "__main__":
    unittest.main()
