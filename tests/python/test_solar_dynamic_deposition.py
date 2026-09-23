"""Generator integration, float32 mass accounting and transitive provenance."""

import array
import hashlib
import math
from pathlib import Path
import unittest
from unittest.mock import patch

from tools import prepare_solar_dynamic as generator


class DynamicDepositionTests(unittest.TestCase):
    def test_volume_uses_physical_gain_and_reports_losses(self):
        n = 64
        packet = {
            "strands": [
                {
                    "classification": "closed",
                    "points": [[1.4, 0, 0, 0.005], [1.5, 0, 0, 0.005]],
                    "emissivity_gain": [0.2, 0.8],
                    "emission_relative": 2.0,
                    "pulse": {"onset_s": 10.0, "duration_s": 600.0},
                }
            ]
        }
        background = array.array("f", [0.003]) * (n**3)
        total, pulse, mass = generator.volume(packet, n, generator.floats(background))
        values = array.array("f")
        values.frombytes(total)
        integrated = (
            sum(float(v) - float(background[i]) for i, v in enumerate(values))
            * (5 / n) ** 3
        )
        self.assertAlmostEqual(integrated / mass["retained_mass"], 1.0, delta=2e-5)
        self.assertAlmostEqual(
            mass["target_mass"],
            sum(mass[k] for k in ("retained_mass", "tail_mass", "clipped_mass")),
            delta=1e-16,
        )
        self.assertGreater(mass["tail_mass"], 0)
        self.assertEqual(len(pulse), n**3 * 16)
        packet["strands"][0]["emissivity_gain"] = [0.0, 0.0]
        dark, _, zero = generator.volume(packet, n, generator.floats(background))
        self.assertEqual(dark, generator.floats(background))
        self.assertEqual(zero["target_mass"], 0.0)

    def test_deposition_module_is_a_producer_input_and_drift_changes_identity(self):
        before, records = generator.producer_inputs()
        path = generator.ROOT / "tools" / "solar_gaussian_deposition.py"
        self.assertIn(
            {
                "path": "tools/solar_gaussian_deposition.py",
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            },
            records,
        )
        original = Path.read_bytes

        def altered(p):
            return original(p) + (b"\n# synthetic drift" if p == path else b"")

        with patch.object(Path, "read_bytes", altered):
            self.assertNotEqual(before, generator.producer_inputs()[0])

    def test_invalid_background_or_gain_correspondence_is_rejected(self):
        with self.assertRaises(ValueError):
            generator.volume({"strands": []}, 64, b"")
        bad = array.array("f", [math.nan]) * (32**3)
        with self.assertRaises(ValueError):
            generator.volume({"strands": []}, 32, generator.floats(bad))


if __name__ == "__main__":
    unittest.main()
