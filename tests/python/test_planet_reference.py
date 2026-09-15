"""Offline source admission, real mask operations and affine-grid preservation."""
from dataclasses import replace
import hashlib
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools import prepare_planet_reference as planet


def fixture_spec(**changes):
    base = planet.SourceSpec("Fixture", "original.bin", hashlib.sha256(b"source").hexdigest(),
        (8,8), "reference.png", hashlib.sha256(b"source").hexdigest(), (8,8))
    return replace(base, **changes)


class PlanetReferencePureTests(unittest.TestCase):
    def test_source_substitution_and_empty_original_rejected_before_image_decode(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/"original.bin"
            source.write_bytes(b"source")
            planet.verify_source(source, hashlib.sha256(b"source").hexdigest())
            for bad in (b"sourcE", b""):
                source.write_bytes(bad)
                with self.assertRaises(ValueError):
                    planet.verify_source(source, hashlib.sha256(b"source").hexdigest())

    def test_pixel_area_latitudes_preserve_north_and_asymmetric_coverage(self):
        self.assertEqual(planet.valid_rows(4, (-90,90), ((-45,0),)), [False,False,True,False])
        self.assertEqual(planet.valid_rows(5, (-90,90), ((45,45),), True), [False,True,False,False,False])
        saturn_rows = planet.valid_rows(900, (-90,90), ((-80,0),(7,75)))
        self.assertFalse(saturn_rows[430])  # +3.9 degrees: source occlusion band.
        self.assertTrue(saturn_rows[400])   # +9.9 degrees: admitted cloud latitude.
        self.assertTrue(saturn_rows[460])   # -2.1 degrees: admitted southern latitude.
        self.assertFalse(saturn_rows[0])

    def test_invalid_grid_and_nonfinite_latitudes_fail_closed(self):
        for bounds in ((90,-90),(-100,90),(-90,math.inf),(math.nan,90)):
            with self.subTest(bounds=bounds), self.assertRaises(ValueError):
                planet.valid_rows(4,bounds,((-20,20),))
        for bands in ((), ((20,-20),), ((-90,math.nan),)):
            with self.subTest(bands=bands), self.assertRaises(ValueError):
                planet.valid_rows(4,(-90,90),bands)
        for args in ((0,0,-90,90),(-180,180,90,-90),(math.nan,180,-90,90)):
            with self.subTest(args=args), self.assertRaises(ValueError):
                planet.affine_window(*args)

    def test_mars_window_matches_original_meter_affine_without_latitude_clamping(self):
        radius, width, height, spacing = 3396190, 21339, 10670, 1000
        left, top = -10670000, 5335000
        west, east = (math.degrees(x/radius) for x in (left,left+width*spacing))
        south, north = (math.degrees(x/radius) for x in (top-height*spacing,top))
        window = planet.affine_window(west,east,south,north)
        self.assertLess(window["uvScale"][1],1)
        self.assertGreater(window["uvOffset"][1],0)
        for longitude,latitude in ((-179,-45),(0,0),(179,45)):
            expected_u = (math.radians(longitude)*radius-left)/(width*spacing)
            expected_v = (top-math.radians(latitude)*radius)/(height*spacing)
            actual_u = ((window["phasePrimeU"]+longitude/360)%1)*window["uvScale"][0]
            actual_v = ((90-latitude)/180)*window["uvScale"][1]+window["uvOffset"][1]
            self.assertAlmostEqual(actual_u,expected_u,places=13)
            self.assertAlmostEqual(actual_v,expected_v,places=13)
        self.assertAlmostEqual(window["phasePrimeU"]*window["uvScale"][0],10670/21339,places=13)

    def test_venus_shortfall_is_outside_source_not_edge_filled(self):
        radius, left, top = 6051000,-19009777.146872,9504888.573436
        west, east = (math.degrees(x/radius) for x in (left,left+18775*2025))
        south, north = (math.degrees(x/radius) for x in (top-9388*2025,top))
        window = planet.affine_window(west,east,south,north)
        self.assertLess(east,180)
        longitude = (east+180)/2
        actual_u = ((window["phasePrimeU"]+longitude/360)%1)*window["uvScale"][0]
        self.assertGreater(actual_u,1)

    def test_endpoint_window_targets_sample_centers_without_asserting_source_wcs(self):
        window = planet.endpoint_window(721,361)
        self.assertEqual(window["uvOffset"],[.5/721,.5/361])
        self.assertAlmostEqual(sum((window["uvScale"][0],window["uvOffset"][0])),720.5/721)
        self.assertAlmostEqual(sum((window["uvScale"][1],window["uvOffset"][1])),360.5/361)
        with self.assertRaises(ValueError):
            planet.endpoint_window(1,361)

    def test_atomic_output_does_not_overwrite_original_or_prior_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); build=root/"build"; source=root/"sources"
            source.mkdir(); build.mkdir(); (source/"original.bin").write_bytes(b"source")
            spec=fixture_spec(original_copy=True)
            with patch.object(planet,"SOURCE_SPECS",(spec,)):
                result=planet.prepare(source,build/"review",("Fixture",),build_root=build)
                self.assertEqual(result[0]["derived_sha256"],spec.sha256)
                with self.assertRaises(ValueError):
                    planet.prepare(source,build/"review",("Fixture",),build_root=build)
                with self.assertRaises(ValueError):
                    planet.prepare(source,root/"outside",("Fixture",),build_root=build)
            self.assertEqual((source/"original.bin").read_bytes(),b"source")

    def test_failed_derivative_hash_publishes_no_partial_set(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); build=root/"build"; source=root/"sources"
            source.mkdir(); build.mkdir(); (source/"original.bin").write_bytes(b"source")
            spec=fixture_spec(original_copy=True,output_sha256="0"*64)
            with patch.object(planet,"SOURCE_SPECS",(spec,)), self.assertRaises(ValueError):
                planet.prepare(source,build/"review",("Fixture",),build_root=build)
            self.assertFalse((build/"review").exists())
            self.assertEqual(list(build.iterdir()),[])


class PlanetReferenceImageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            cls.Image,_,_=planet._pillow()
        except ValueError as exc:
            raise unittest.SkipTest(str(exc)) from exc

    def test_mask_withholds_zero_channel_and_neighbors_without_changing_rgb(self):
        image=self.Image.new("RGB",(8,8),(17,31,73))
        image.putpixel((3,3),(17,0,73))
        rgba,mask=planet.derive_image(image,fixture_spec(nodata_zero_channel=True))
        self.assertEqual(rgba.convert("RGB").tobytes(),image.tobytes())
        self.assertEqual(mask.getpixel((3,3)),0)
        self.assertEqual(mask.getpixel((1,1)),0)
        self.assertEqual(mask.getpixel((0,0)),255)
        self.assertEqual(set(mask.tobytes()),{0,255})
        self.assertEqual(rgba.getchannel("A").tobytes(),mask.tobytes())

    def test_black_is_preserved_when_recipe_has_no_nodata_claim(self):
        image=self.Image.new("RGB",(8,8),(0,0,0))
        rgba,mask=planet.derive_image(image,fixture_spec())
        self.assertEqual(set(mask.tobytes()),{255})
        self.assertEqual(rgba.getpixel((4,4)),(0,0,0,255))

    def test_reduction_does_not_admit_partly_withheld_support(self):
        image=self.Image.new("RGB",(8,8),(17,31,73))
        image.putpixel((0,0),(0,0,0))
        rgba,mask=planet.derive_image(image,fixture_spec(nodata_zero_channel=True,
            output_dimensions=(4,4),resampling="BOX"))
        self.assertEqual(mask.getpixel((1,1)),0)  # Only part of this footprint is withheld.
        self.assertEqual(mask.getpixel((3,3)),255)
        self.assertEqual(rgba.getpixel((3,3)),(17,31,73,255))

    def test_no_silent_upscale_wrong_dimensions_or_unreviewed_sampling_ratio(self):
        image=self.Image.new("RGB",(8,8),(17,31,73))
        for spec in (fixture_spec(output_dimensions=(16,16)), fixture_spec(dimensions=(8,4)),
                     fixture_spec(resampling="NEAREST")):
            with self.subTest(spec=spec), self.assertRaises(ValueError):
                planet.derive_image(image,spec)


if __name__ == "__main__":
    unittest.main()
