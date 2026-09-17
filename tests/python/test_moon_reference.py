"""Offline pinned moon maps: crop registration, pixels, and atomic publication."""
from dataclasses import replace
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from tools import prepare_moon_reference as moon


def fixture_spec(**changes):
    return replace(moon.SourceSpec("Fixture", "source.png", "0" * 64, 1,
        (12, 8), "RGB", (2, 2, 10, 6), (8, 4), "fixture.png", "0" * 64), **changes)


class MoonReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.Image = moon.image_module()
        except ValueError as exc:
            raise unittest.SkipTest(str(exc)) from exc

    def fixture(self):
        image = self.Image.new("RGB", (12, 8), (255, 0, 255))
        for y in range(2, 6):
            for x in range(2, 10):
                image.putpixel((x, y), ((x - 2) * 20, (y - 2) * 30, 11))
        image.putpixel((2, 2), (0, 0, 0))
        return image

    def test_exact_map_crop_preserves_axes_dark_pixels_and_excludes_sheet_labels(self):
        source = self.fixture()
        result = moon.derive(source, fixture_spec())
        self.assertEqual(result.tobytes(), source.crop((2, 2, 10, 6)).tobytes())
        self.assertEqual(result.getpixel((0, 0)), (0, 0, 0))
        self.assertEqual(result.getpixel((7, 3)), (140, 90, 11))
        self.assertNotIn((255, 0, 255), result.get_flattened_data())

    def test_box_reduction_preserves_full_map_extent_and_does_not_add_alpha(self):
        source = self.Image.new("L", (8, 4), 0)
        source.paste(200, (4, 0, 8, 4))
        spec = fixture_spec(dimensions=(8, 4), mode="L", crop=(0, 0, 8, 4), output_dimensions=(4, 2))
        result = moon.derive(source, spec)
        self.assertEqual(result.mode, "L")
        self.assertEqual(list(result.get_flattened_data()), [0, 0, 200, 200] * 2)

    def test_unreviewed_crop_dimensions_channel_or_upscale_rejected(self):
        for changes in ({"crop": (-1, 0, 12, 8)}, {"crop": (2, 2, 12, 6)},
                        {"crop": (0, 0, 100, 50)}, {"output_dimensions": (16, 8)},
                        {"output_dimensions": (8, 5)}, {"dimensions": (13, 8)}, {"mode": "L"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                moon.derive(self.fixture(), fixture_spec(**changes))

    def test_source_substitution_and_size_mismatch_rejected_before_decode(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.png"
            path.write_bytes(b"source")
            spec = fixture_spec(sha256=hashlib.sha256(b"source").hexdigest(), source_bytes=6)
            moon.verify_source(path, spec)
            for data in (b"sourcE", b"source+", b""):
                path.write_bytes(data)
                with self.assertRaises(ValueError):
                    moon.verify_source(path, spec)

    def test_documented_nodata_is_masked_before_reduction_without_filling_gaps(self):
        source = self.Image.new("L", (16, 8), 120)
        source.putpixel((0, 0), 0)
        spec = fixture_spec(dimensions=(16, 8), mode="L", crop=(0, 0, 16, 8),
                            output_dimensions=(8, 4), nodata_zero_channel=True)
        result = moon.derive(source, spec)
        self.assertEqual(result.mode, "RGBA")
        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertEqual(result.getpixel((1, 1))[3], 0)
        self.assertEqual(result.getpixel((7, 3)), (120, 120, 120, 255))
        partial = replace(spec, nodata_zero_channel=False, valid_latitude_bounds=(-45, 90))
        self.assertEqual(moon.derive(source, partial).getpixel((7, 3))[3], 0)
        with self.assertRaises(ValueError):
            moon.derive(source, replace(spec, crop=(2, 2, 10, 6)))

    def test_io_default_recipe_preserves_mission_rgb_and_excludes_interpolated_poles(self):
        spec = next(spec for spec in moon.SOURCE_SPECS if spec.body == "Io")
        self.assertEqual(spec.filename, "Io_Galileo_SSI_Global_Mosaic_ClrMerge_1km.tif")
        self.assertEqual(spec.mode, "RGB")
        self.assertEqual(spec.source_bytes, 196637696)
        self.assertEqual(spec.sha256, "524dcabd247c889a4e7c2a1bfd9e5fcc545c6a039b2c765da9b741befdfd00bd")
        self.assertEqual(spec.dimensions, (11445, 5723))
        self.assertEqual(spec.crop, (0, 0, 11445, 5723))
        self.assertEqual(spec.valid_latitude_bounds, (-85, 85))
        self.assertTrue(spec.nodata_zero_channel)
        historical = moon.IO_MONOCHROME_SOURCE_SPEC
        self.assertEqual(historical.mode, "L")
        self.assertEqual(historical.latitude_bounds, spec.latitude_bounds)
        self.assertNotIn(historical, moon.SOURCE_SPECS)

    def test_rgb_polar_mask_does_not_crop_rotate_recolor_or_fill_source_channels(self):
        source = self.Image.new("RGB", (360, 180), (207, 179, 93))
        source.paste((168, 83, 52), (180, 0, 360, 90))
        source.paste((82, 104, 63), (0, 90, 180, 180))
        source.paste((242, 229, 182), (180, 90, 360, 180))
        source.paste((0, 0, 0), (98, 78, 103, 83))
        spec = fixture_spec(dimensions=(360, 180), crop=(0, 0, 360, 180),
                            output_dimensions=(180, 90), nodata_zero_channel=True,
                            valid_latitude_bounds=(-85, 85))
        result = moon.derive(source, spec)
        expected_rgb = source.resize((180, 90), self.Image.Resampling.BOX)
        self.assertEqual(result.mode, "RGBA")
        self.assertEqual(result.convert("RGB").tobytes(), expected_rgb.tobytes())
        self.assertEqual(result.getpixel((30, 30)), (207, 179, 93, 255))
        self.assertEqual(result.getpixel((150, 30)), (168, 83, 52, 255))
        self.assertEqual(result.getpixel((30, 60)), (82, 104, 63, 255))
        self.assertEqual(result.getpixel((150, 60)), (242, 229, 182, 255))
        self.assertEqual(result.getpixel((50, 40))[3], 0)
        self.assertEqual(result.getpixel((179, 0))[3], 0)
        self.assertEqual(result.getpixel((179, 89))[3], 0)
        self.assertEqual(result.getpixel((179, 5))[3], 255)
        self.assertEqual(result.getpixel((179, 84))[3], 255)

    def test_preparation_atomic_replay_and_failure_never_overwrite_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); build = root / "build"; sources = root / "sources"
            build.mkdir(); sources.mkdir()
            source = sources / "source.png"; self.fixture().save(source)
            expected = root / "expected.png"
            moon.derive(self.fixture(), fixture_spec()).save(expected, format="PNG", optimize=False, compress_level=9)
            spec = fixture_spec(sha256=moon.digest(source), source_bytes=source.stat().st_size,
                                output_sha256=moon.digest(expected))
            before = source.read_bytes()
            with patch.object(moon, "SOURCE_SPECS", (spec,)):
                records = moon.prepare(sources, build / "ready", ("Fixture",), build_root=build)
                self.assertEqual(records[0]["derived_sha256"], spec.output_sha256)
                self.assertEqual((build / "ready" / spec.output).read_bytes(), expected.read_bytes())
                for output, bodies in ((build / "ready", ("Fixture",)), (root / "outside", ("Fixture",)),
                                       (build / "duplicate", ("Fixture", "Fixture")), (build / "unknown", ("Unknown",))):
                    with self.subTest(output=output, bodies=bodies), self.assertRaises(ValueError):
                        moon.prepare(sources, output, bodies, build_root=build)
            with patch.object(moon, "SOURCE_SPECS", (replace(spec, output_sha256="0" * 64),)):
                with self.assertRaises(ValueError):
                    moon.prepare(sources, build / "bad-hash", ("Fixture",), build_root=build)
            self.assertFalse((build / "bad-hash").exists())
            self.assertEqual(source.read_bytes(), before)
            self.assertEqual([p.name for p in build.iterdir()], ["ready"])

    def test_admitted_registry_matches_every_recipe_without_releasing_legacy_holds(self):
        root = Path(__file__).resolve().parents[2]
        registry = json.loads((root / "apps/web/visual-assets.v1.json").read_text(encoding="utf-8"))
        mapped = {record["body"]: record for record in registry["mapped_references"] if record["role"] == "surface"}
        for spec in moon.SOURCE_SPECS:
            with self.subTest(body=spec.body):
                record = mapped[spec.body]
                self.assertEqual(record["source_sha256"], spec.sha256)
                self.assertEqual(record["source_bytes"], spec.source_bytes)
                self.assertEqual(record["sha256"], spec.output_sha256)
                self.assertEqual(record["dimensions"], list(spec.output_dimensions))
                self.assertEqual(moon.digest(root / "apps/web" / record["path"]), spec.output_sha256)
                self.assertEqual(record["nodata"], "alpha" if spec.nodata_zero_channel or spec.valid_latitude_bounds != (-90, 90) else "none")
                self.assertIn(record["mapping"]["primeMeridianU"], (0, .5))
                self.assertEqual(record["mapping"]["longitudeDirection"], "east")
                # Every mapped moon here is tidally locked and drawMoons now orients it, so the
                # limitation must state the frame it is drawn in and name what that frame omits
                # rather than the fixed-orientation disclaimer that preceded the rotation model.
                self.assertIn("prime meridian faces its planet", record["limitations"])
                self.assertIn("libration", record["limitations"])
                prior = [r for r in registry["assets"] if r["body"] == spec.body]
                self.assertTrue(all(r["mapping_status"] == "hold" for r in prior))

    def test_galilean_registration_matches_original_projected_coordinate_anchors(self):
        root = Path(__file__).resolve().parents[2]
        registry = json.loads((root / "apps/web/visual-assets.v1.json").read_text(encoding="utf-8"))
        mapped = {r["body"]: r for r in registry["mapped_references"] if r["role"] == "surface"}
        # Independently transcribed original ISIS/GeoTIFF X/Y origins, metre
        # spacing, sphere radii and centre longitudes; not derived from registry UV.
        originals = {
            "Io": (1821460, -5723000, 2862000, 1000, 11445, 5723, 0),
            "Europa": (1562089.9658, -4907750.3455436, 2453875.1727718, 499.97456657942, 19631, 9816, -180),
            "Ganymede": (2632344.9707, -8270555.6754185, 4135277.8377093, 1000.0671917072, 16539, 8270, -180),
            "Callisto": (2409300.0488, -7569039.3336036, 3784519.6668018, 1000.0051966711, 15138, 7569, -180),
        }
        for body, (radius, left, top, spacing, width, height, centre) in originals.items():
            mapping = mapped[body]["mapping"]
            recipe = next(s for s in moon.SOURCE_SPECS if s.body == body)
            # Both edges, equator and northern/southern interior positions catch
            # mirrored axes, prime-meridian half shifts and mistaken polar crop.
            for delta, latitude in ((0, 0), (90, 45), (-90, -45), (179.9, 0), (0, 89), (0, -82)):
                longitude = centre + delta
                expected = ((radius * math.radians(delta)-left)/(spacing*width),
                            (top-radius*math.radians(latitude))/(spacing*height))
                nominal = ((mapping["primeMeridianU"] + longitude/360) % 1, (90-latitude)/180)
                actual = [nominal[i]*mapping["uvScale"][i]+mapping["uvOffset"][i] for i in (0, 1)]
                with self.subTest(body=body, longitude=longitude, latitude=latitude):
                    # Ganymede's ISIS label rounds 1000.0671917072 m TIFF scale
                    # to 1000.067192 m. Allow <0.000003 display pixels for that
                    # documented precision difference, far below one texel.
                    self.assertAlmostEqual(actual[0], expected[0], delta=1e-9)
                    self.assertAlmostEqual(actual[1], expected[1], delta=1e-9)
            self.assertAlmostEqual(recipe.latitude_bounds[1], math.degrees(top/radius), places=10)
            self.assertAlmostEqual(recipe.latitude_bounds[0], math.degrees((top-height*spacing)/radius), places=10)
            self.assertTrue(recipe.nodata_zero_channel)
        self.assertEqual(mapped["Europa"]["validLatitudeBounds"], [-83, 90])
        self.assertEqual(mapped["Io"]["validLatitudeBounds"], [-85, 85])

    def test_original_decoder_failure_is_atomic_and_restores_pixel_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / "source.png"; source.write_bytes(b"not-an-image")
            spec = fixture_spec(sha256=moon.digest(source), source_bytes=source.stat().st_size)
            limit = self.Image.MAX_IMAGE_PIXELS
            with patch.object(moon, "SOURCE_SPECS", (spec,)):
                with self.assertRaises(OSError):
                    moon.prepare(root, root / "build" / "failed", ("Fixture",), build_root=root / "build")
            self.assertEqual(self.Image.MAX_IMAGE_PIXELS, limit)
            self.assertFalse((root / "build" / "failed").exists())
            self.assertEqual(list((root / "build").iterdir()), [])

    def test_cli_reports_rejected_inputs_without_publishing(self):
        with tempfile.TemporaryDirectory() as directory:
            args = ["prepare_moon_reference.py", "--source-root", directory,
                    "--out", str(Path(directory) / "rejected"), "--body", "Io"]
            with patch.object(sys, "argv", args), self.assertLogs(level="ERROR") as messages:
                self.assertEqual(moon.main(), 1)
            self.assertIn("Output must be a new directory below build", messages.output[0])
            self.assertFalse((Path(directory) / "rejected").exists())


if __name__ == "__main__":
    unittest.main()
