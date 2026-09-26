import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
from extract_sun_look import APPROVED_SHA256, extract

ROOT=Path(__file__).resolve().parents[2]
class ApprovedSunSourceTests(unittest.TestCase):
    def test_recipe_is_reproducible_from_approved_source(self):
        source=ROOT/'tools/lookdev/sun-surface-lab-v2.html'
        self.assertEqual(extract(source),(ROOT/'apps/web/js/sunLookRecipe.js').read_text(encoding='utf-8'))
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),APPROVED_SHA256)

    def test_modified_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/'changed.html'
            source.write_text('<html>another candidate</html>',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'does not match'):
                extract(source)

    def test_readme_capture_is_the_recorded_actual_4k_png(self):
        record=json.loads((ROOT/'docs/validation/sun-look-v2/source.json').read_text())
        data=(ROOT/record['image']['path']).read_bytes()
        self.assertEqual(data[:8],b'\x89PNG\r\n\x1a\n')
        self.assertEqual(struct.unpack('>II',data[16:24]),(4096,4096))
        self.assertEqual(hashlib.sha256(data).hexdigest(),record['image']['sha256'])
        self.assertIn(record['image']['path'],(ROOT/'README.md').read_text(encoding='utf-8'))
        self.assertEqual(record['source']['sha256'],APPROVED_SHA256)

if __name__=='__main__':unittest.main()
