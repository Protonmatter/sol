"""Numerical terrain conversion tests: synthetic inputs are fixtures, not assets."""
from pathlib import Path
import struct
import tempfile
import unittest

from tools import prepare_terrain_reference as terrain


class TerrainReferenceTests(unittest.TestCase):
    def test_quantization_roundtrip_has_bounded_error_and_retains_signed_height(self):
        values = [-22.931, -1.25, 0, 10.504, 21.241]
        packed = terrain.encode_heights(values)
        decoded = terrain.decode_heights(packed)
        self.assertLessEqual(max(abs(a-b) for a,b in zip(values,decoded)), 0.000501)
        self.assertEqual(len(packed), len(values) * 2)
        self.assertLess(decoded[0], 0)
        self.assertGreater(decoded[-1], 0)

    def test_mola_reads_signed_big_endian_metres_without_areoid_confusion(self):
        packed = struct.pack(">hhh", -22931, 0, 21241)
        self.assertEqual(terrain.read_mola_radius(packed, 3, 1), [-22.931, 0, 21.241])
        self.assertEqual(terrain.MOLA_REFERENCE_RADIUS_KM, 3396)
        with self.assertRaisesRegex(ValueError, "size"):
            terrain.read_mola_radius(packed[:-1], 3, 1)

    def test_missing_nonfinite_out_of_range_fail_closed(self):
        for value in [float('nan'), float('inf'), -33, 33]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "finite|range"):
                terrain.encode_heights([value])

    def test_hash_verification_rejects_source_byte_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.img"
            source.write_bytes(b"original")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                terrain.verified_source(source, "0"*64)


if __name__ == '__main__':
    unittest.main()
