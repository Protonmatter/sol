import math
import unittest
from tools import moon_photometry_reference as reference


class MoonPhotometryReferenceTests(unittest.TestCase):
    def test_disk_integral_converges_to_lambert_sphere_not_map_mean(self):
        for rho in (.1, .5, 1):
            for phase in (0, 30, 60, 90, 120, 150, 180):
                surface = lambda normal, rho=rho: rho
                expected = 2 * rho / 3 * reference.lambert_phase(math.radians(phase))
                coarse = reference.integrate_disk(surface, phase, radial_samples=128, azimuth_samples=512)
                fine = reference.integrate_surface(surface, phase, cosine_samples=256, azimuth_samples=1024)
                with self.subTest(rho=rho, phase=phase):
                    self.assertAlmostEqual(coarse.disk_ratio, expected, delta=1e-4)
                    self.assertAlmostEqual(fine.disk_ratio, expected, delta=1e-4)
                    self.assertAlmostEqual(coarse.disk_ratio, fine.disk_ratio, delta=1e-4)
        self.assertNotAlmostEqual(reference.integrate_disk(lambda n: 1, 0).disk_ratio, 1, delta=.1)

    def test_valid_black_is_observed_and_missing_illuminated_area_holds_result(self):
        black = reference.integrate_disk(lambda n: 0, 0)
        self.assertEqual(black.disk_ratio, 0)
        self.assertEqual(black.unresolved_projected_fraction, 0)
        partial = reference.integrate_disk(lambda n: None if n[0] > 0 else 1, 0)
        self.assertIsNone(partial.disk_ratio)
        self.assertAlmostEqual(partial.unresolved_projected_fraction, .5, places=12)
        self.assertAlmostEqual(partial.observed_ratio, 1/3, delta=1e-4)

    def test_asymmetric_hemisphere_orientation_and_band_are_explicit(self):
        pattern = lambda n: .8 if n[0] > 0 else .2
        lit = reference.integrate_disk(pattern, 60, orientation_degrees=0, band='synthetic-red')
        dark = reference.integrate_disk(pattern, 60, orientation_degrees=180, band='synthetic-red')
        self.assertGreater(lit.disk_ratio, dark.disk_ratio)
        self.assertEqual(lit.band, 'synthetic-red')
        with self.assertRaises(ValueError): reference.integrate_disk(lambda n: 1.5, 0)
        with self.assertRaises(ValueError): reference.integrate_disk(lambda n: 1, 181)
        with self.assertRaises(ValueError): reference.integrate_disk(lambda n: 1, 0, band='')


if __name__ == '__main__': unittest.main()
