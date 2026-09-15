"""The finer terrain derivative is numeric decimation, never image brightness."""
import struct
import unittest
from tools import prepare_terrain_detail as detail


class TerrainDetailTests(unittest.TestCase):
    def test_half_metre_lola_offset_and_signed_mola_use_exact_cell_means(self):
        # Each 2x2 block maps to its centered output footprint, preserving orientation.
        source = [20000, 20002, 18000, 18002, 20004, 20006, 18004, 18006]
        result = detail.block_mean(source, 4, 2, numerator=1, denominator=2, offset=-10000)
        self.assertEqual(list(struct.unpack('<HH', result)), [32770, 31770])
        result = detail.block_mean([-4, -2, 2, 4, -2, 0, 4, 6], 4, 2, numerator=1, denominator=1, offset=0)
        self.assertEqual(list(struct.unpack('<HH', result)), [32766, 32772])

    def test_unavailable_and_out_of_range_codes_are_not_averaged_as_black(self):
        for source in ([0, 1, 2, 65535], [0, 1, 2, None]):
            with self.assertRaises(ValueError):
                detail.block_mean(source, 2, 2, numerator=1, denominator=2, offset=-10000, nodata=65535)
        with self.assertRaises(ValueError):
            detail.block_mean([40000]*4, 2, 2, numerator=1, denominator=1, offset=0)

    def test_dimensions_and_registration_cannot_be_silently_truncated(self):
        for width, height, samples in ((3, 2, [0]*6), (4, 2, [0]*7), (0, 2, [])):
            with self.assertRaises(ValueError):
                detail.block_mean(samples, width, height, numerator=1, denominator=1, offset=0)


if __name__ == '__main__':
    unittest.main()
