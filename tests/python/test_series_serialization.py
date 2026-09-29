"""Raw-byte contract for portable synthetic-series serialization."""
from __future__ import annotations

import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import generate_series


class SeriesSerializationTests(unittest.TestCase):
    def test_generated_manifest_uses_canonical_lf_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            arguments = ["generate_series.py", "--base", str(ROOT / "apps/web/data/latest-state.json"),
                         "--out-dir", str(output), "--frames", "1", "--lon-count", "4", "--lat-count", "3"]
            with mock.patch.object(sys, "argv", arguments), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(generate_series.main(), 0)
            raw = (output / "manifest.json").read_bytes()
            self.assertNotIn(b"\r", raw, "generated manifest must not depend on platform newline translation")
            self.assertTrue(raw.endswith(b"\n"))
            expected = {
                "schema_version": "series-manifest.v1", "months_span": 132.0,
                "note": "Deterministic synthetic solar-cycle series; latitudes follow an idealized butterfly diagram.",
                "frames": [{"index": 0, "file": "frame-00.json", "phase": 0.0, "stage": "solar minimum",
                            "activity_index": 0.2, "months": 0.0, "region_count": 10}],
            }
            self.assertEqual(raw, (json.dumps(expected, indent=2, sort_keys=True) + "\n").encode("utf-8"))
            self.assertFalse(list(output.glob("*.tmp")))


if __name__ == "__main__":
    unittest.main()
