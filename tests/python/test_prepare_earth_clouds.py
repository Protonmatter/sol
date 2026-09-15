"""The Earth cloud layer is white opacity fitted from NASA's own composite, nothing else."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from tools import prepare_earth_clouds as clouds
from tools.fetch_earth_reference import decode_rgba

ROOT = Path(__file__).resolve().parents[2]

try:
    from PIL import Image
except ImportError:  # pragma: no cover - the pure checks below still run
    Image = None


def synthetic_fit_data(curve, width=96, height=160, base=(20, 30, 60), greys=(32, 64, 96, 128, 160, 192, 224, 255)):
    """Dark-ocean blocks: half cloud-free, half composited white over the base at curve(grey)."""
    grey = bytearray(width * height)
    composite = bytearray(3 * width * height)
    linear_base = [clouds._decode(value / 255) for value in base]
    cloudy = 0
    for row in range(height):
        for column in range(width):
            index = row * width + column
            if (row + column) % 2 == 0:
                value = 0
            else:
                value = greys[cloudy % len(greys)]
                cloudy += 1
            grey[index] = value
            alpha = curve(value)
            for channel, lb in enumerate(linear_base):
                composite[3 * index + channel] = int(round(255 * clouds._encode(lb * (1 - alpha) + alpha)))
    return bytes(grey), bytes(composite), width, height


class EarthCloudLayerTests(unittest.TestCase):
    @unittest.skipIf(Image is None, "Pillow is required for image fixtures")
    def test_alpha_follows_the_opacity_curve_under_white(self):
        grey = bytes([0, 1, 64, 128, 200, 254, 255, 17])
        lut = tuple(min(255, 2 * value) for value in range(256))
        pixels = clouds.cloud_rgba(Image.frombytes("L", (4, 2), grey).convert("RGB"), lut)
        self.assertEqual(pixels[0::4] + pixels[1::4] + pixels[2::4], b"\xff" * 24)
        self.assertEqual(pixels[3::4], bytes(lut[value] for value in grey))

    @unittest.skipIf(Image is None, "Pillow is required for image fixtures")
    def test_coloured_non_rgb_sources_and_partial_curves_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "neutral grey"):
            clouds.cloud_rgba(Image.new("RGB", (2, 2), (120, 120, 121)))
        with self.assertRaisesRegex(ValueError, "RGB"):
            clouds.cloud_rgba(Image.new("L", (2, 2), 80))
        with self.assertRaisesRegex(ValueError, "256"):
            clouds.cloud_rgba(Image.new("RGB", (2, 2), (80, 80, 80)), (0, 255))

    def test_fit_recovers_a_known_curve_and_scores_it_better_than_alpha_equals_grey(self):
        curve = lambda value: (value / 255) ** 1.6
        blocks = clouds.opacity_blocks(*synthetic_fit_data(curve))
        self.assertEqual(len(blocks), 8)
        lut = clouds.fit_opacity(blocks)
        self.assertEqual((len(lut), lut[0], lut[255]), (256, 0, 255))
        self.assertTrue(all(b >= a for a, b in zip(lut, lut[1:])), "the fitted curve is monotone")
        for value in (32, 64, 96, 128, 160, 192, 224):
            self.assertLessEqual(abs(lut[value] - 255 * curve(value)), 3, value)
        fitted = clouds.opacity_error(blocks, lut)
        identity = clouds.opacity_error(blocks, tuple(range(256)))
        for key in fitted:
            self.assertLess(fitted[key], identity[key], key)

    def test_substituted_originals_are_rejected_before_decoding(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / "fake.jpg"
            fake.write_bytes(b"not a NASA original")
            with self.assertRaisesRegex(ValueError, "cloud source bytes"):
                clouds.prepare(fake, Path(directory) / "out.png")
            self.assertFalse((Path(directory) / "out.png").exists())
            with self.assertRaisesRegex(ValueError, "cloud source bytes"):
                clouds.fit(fake, fake)

    def test_committed_layer_matches_the_pinned_curve_tool_and_inventory(self):
        lut = clouds.OPACITY_LUT
        self.assertEqual((len(lut), lut[0], lut[255]), (256, 0, 255))
        self.assertTrue(all(b >= a for a, b in zip(lut, lut[1:])))
        record = next(item for item in json.loads((ROOT / "apps/web/visual-assets.v1.json").read_text(encoding="utf-8"))["mapped_references"]
                      if item["body"] == "Earth" and item["role"] == "cloud-composite")
        data = (ROOT / "apps/web" / record["path"]).read_bytes()
        self.assertEqual((hashlib.sha256(data).hexdigest(), len(data)), (clouds.OUTPUT_SHA256, clouds.OUTPUT_BYTES))
        self.assertEqual((record["sha256"], record["bytes"]), (clouds.OUTPUT_SHA256, clouds.OUTPUT_BYTES))
        self.assertEqual((record["source_url"], record["source_sha256"], record["source_bytes"]),
                         (clouds.SOURCE_URL, clouds.SOURCE_SHA256, clouds.SOURCE_BYTES))
        self.assertEqual(record["nodata"], "alpha")
        width, height, pixels = decode_rgba(data)
        self.assertEqual((width, height), clouds.DIMENSIONS)
        self.assertEqual(pixels[0::4] + pixels[1::4] + pixels[2::4], b"\xff" * (3 * width * height),
                         "cloud colour is white; only opacity varies")
        self.assertLessEqual(set(pixels[3::4]), set(lut), "every alpha value comes from the pinned curve")


if __name__ == "__main__":
    unittest.main()
