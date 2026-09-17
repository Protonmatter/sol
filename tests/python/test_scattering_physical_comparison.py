"""Adversarial identity joins and fixed physical thresholds for GPU receipts."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from compare_scattering_physical_reference import compare_run, digest


class PhysicalComparisonTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cpu, self.gpu = self.root / "cpu", self.root / "gpu"
        self.cpu.mkdir(); self.gpu.mkdir()
        shader = self.gpu / "snapshot/js/atmosphereShaders.js"
        shader.parent.mkdir(parents=True); shader.write_text("qualified-source")
        self.inputs = {"profile": {"radiusKm": 1000}, "options": {"cameraBodyKm": [0, 0, 2000]},
                       "queries": [{"name": "body/surface/0", "kind": "surface", "surface": [0, 0, 1000]},
                                   {"name": "body/limb/1", "kind": "limb", "direction": [1, 0, 0], "maximum": 500}]}
        self.samples = [{**query, "reference": {"scattering": [0, .01, .02, 1], "transmission": [1, .5, .2, 1]}}
                        for query in self.inputs["queries"]]
        self.write(self.cpu / "body.json", {"inputs": self.inputs})
        self.write(self.gpu / "body.json", {"inputs": self.inputs, "samples": self.samples})
        self.evidence = {"schema_version": "scattering-qualification.v1", "complete_matrix": True, "errors": [],
                         "hashes": {"js/atmosphereShaders.js": digest(shader)}, "passed": False}
        self.write(self.gpu / "evidence.json", self.evidence)
        self.reference = {"schema_version": "atmosphere-optical-coordinate-cpu-reference.v1",
                          "candidate_solver_sha256": digest(shader), "input_sha256": {"body.json": digest(self.cpu / "body.json")},
                          "cases": [{"group": "supplemental", "name": sample["name"],
                                     "referenceS": [0, .01, .02], "referenceT": [1, .5, .2]} for sample in self.samples]}
        self.write(self.root / "reference.json", self.reference)

    @staticmethod
    def write(path: Path, value: object) -> None:
        path.write_text(json.dumps(value), encoding="utf-8")

    def run_comparison(self) -> dict:
        return compare_run(self.root / "reference.json", self.cpu, self.gpu, expected_count=2)

    def update_gpu(self, *, inputs: dict | None = None, samples: list | None = None) -> None:
        self.write(self.gpu / "body.json", {"inputs": inputs or self.inputs, "samples": self.samples if samples is None else samples})

    def test_exact_identity_join_passes_independently_of_atlas_status(self) -> None:
        result = self.run_comparison()
        self.assertTrue(result["passed"]); self.assertEqual(result["count"], 2)
        self.assertFalse(result["gpu_atlas_gate_passed"])

    def test_changed_source_snapshot_is_rejected(self) -> None:
        (self.gpu / "snapshot/js/atmosphereShaders.js").write_text("other-source")
        with self.assertRaisesRegex(ValueError, "shader differs"):
            self.run_comparison()

    def test_modified_retained_cpu_input_receipt_is_rejected(self) -> None:
        self.write(self.cpu / "body.json", {"inputs": {}})
        with self.assertRaisesRegex(ValueError, "CPU input receipt changed"):
            self.run_comparison()

    def test_camera_or_profile_mutation_cannot_join_by_name(self) -> None:
        for key in ("profile", "options"):
            changed = copy.deepcopy(self.inputs); changed[key] = {}
            self.update_gpu(inputs=changed)
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "Physical fixture inputs changed"):
                self.run_comparison()

    def test_changed_actual_sample_endpoint_is_rejected(self) -> None:
        for value in (10, False):
            changed = copy.deepcopy(self.samples); changed[0]["surface"][0] = value
            self.update_gpu(samples=changed)
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "sample geometry changed"):
                self.run_comparison()

    def test_omitted_or_duplicate_samples_are_rejected(self) -> None:
        for samples in (self.samples[:1], [self.samples[0], self.samples[0]]):
            self.update_gpu(samples=samples)
            with self.subTest(samples=len(samples)), self.assertRaises(ValueError):
                self.run_comparison()

    def test_nonfinite_or_invalid_validity_channel_is_rejected(self) -> None:
        for channel, value in ((0, float("nan")), (3, 0), (0, True)):
            changed = copy.deepcopy(self.samples); changed[0]["reference"]["scattering"][channel] = value
            self.update_gpu(samples=changed)
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.run_comparison()

    def test_exact_zero_uses_strict_bound_and_reports_physical_failure(self) -> None:
        changed = copy.deepcopy(self.samples); changed[0]["reference"]["scattering"][0] = 1.1e-7
        self.update_gpu(samples=changed)
        result = self.run_comparison()
        self.assertFalse(result["passed"]); self.assertEqual(result["failed"], ["body/surface/0"])
        self.assertAlmostEqual(result["maximum_error_over_tolerance"]["scattering"], 1.1)


if __name__ == "__main__":
    unittest.main()
