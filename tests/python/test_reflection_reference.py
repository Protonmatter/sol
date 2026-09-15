"""Independent microfacet reference invariants; synthetic indices are not ocean data."""
import math
import unittest
from tools import reflection_reference as reference


class ReflectionReferenceTests(unittest.TestCase):
    def test_exact_fresnel_normal_equal_index_and_total_internal_reflection(self):
        self.assertAlmostEqual(reference.fresnel(1, 1, 1.5), 0.04, places=14)
        self.assertEqual(reference.fresnel(0, 1, 1), 0)
        self.assertEqual(reference.fresnel(0.5, 1.5, 1), 1)

    def test_reciprocity_and_nonnegative_finite_brdf(self):
        for alpha in (0.05, 0.2, 0.5, 1):
            for incidence in (0, 30, 60, 80, 89):
                for emergence in (0, 30, 60, 80, 89):
                    for azimuth in (0, 45, 90, 180):
                        light = reference.direction(incidence, 0)
                        view = reference.direction(emergence, azimuth)
                        value = reference.ggx(light, view, alpha)
                        self.assertTrue(math.isfinite(value) and value >= 0)
                        self.assertAlmostEqual(value, reference.ggx(view, light, alpha), delta=1e-10)

    def test_invalid_domain_and_unilluminated_surface(self):
        self.assertEqual(reference.ggx((0, 0, -1), (0, 0, 1), .2), 0)
        for alpha in (0, .01, 1.01, math.nan):
            with self.assertRaises(ValueError):
                reference.ggx((0, 0, 1), (0, 0, 1), alpha)

    def test_hemisphere_energy_and_quadrature_convergence(self):
        for alpha in (.2, .5, 1):
            coarse = reference.hemisphere_energy(0, alpha, 256)
            fine = reference.hemisphere_energy(0, alpha, 512)
            self.assertLess(abs(fine - coarse), 1e-5)
            self.assertLessEqual(fine, 1 + 1e-3)


if __name__ == '__main__':
    unittest.main()
