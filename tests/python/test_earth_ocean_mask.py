"""The committed display mask must reproduce from pinned geography without network."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import prepare_earth_ocean_mask as mask


class EarthOceanMaskTests(unittest.TestCase):
    def test_committed_mask_reproduces(self):
        self.assertEqual(mask.generate(), mask.OUTPUT.read_text())

    def test_changed_source_is_rejected_before_rasterization(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            (source / 'ne_110m_land.geojson').write_text('{"features": []}')
            with patch.object(mask, 'SOURCE', source):
                with self.assertRaisesRegex(ValueError, 'Source hash mismatch'):
                    mask.mask_pixels()


if __name__ == '__main__':
    unittest.main()
