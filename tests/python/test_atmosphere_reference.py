"""Independent double precision gates for the bounded atmospheric optical renderer."""
from __future__ import annotations
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from atmosphere_reference import density_column, ray_sphere_interval, trace_single_scattering, trace_refracted_ray, incident_solar_refraction


class AtmosphereReferenceTests(unittest.TestCase):
    def test_vertical_exponential_column_has_analytic_integral(self) -> None:
        actual = density_column((0, 0, 6378.137), (0, 0, 1), 100, 6378.137, 8, steps=4096)
        expected = 8 * (1 - math.exp(-100 / 8))
        self.assertAlmostEqual(actual, expected, delta=4e-6)

    def test_sphere_intersections_cover_inside_outside_and_tangent(self) -> None:
        self.assertEqual(ray_sphere_interval((0, 0, 2), (0, 0, -1), 1), (1, 3))
        self.assertEqual(ray_sphere_interval((0, 0, 0), (1, 0, 0), 1), (-1, 1))
        self.assertIsNone(ray_sphere_interval((0, 0, 2), (1, 0, 0), 1))
        self.assertEqual(ray_sphere_interval((1, 0, 2), (0, 0, -1), 1), (2, 2))

    def test_invalid_geometry_fails_explicitly(self) -> None:
        for radius in (0, -1, math.nan, math.inf):
            with self.subTest(radius=radius), self.assertRaises(ValueError):
                ray_sphere_interval((0, 0, 2), (0, 0, -1), radius)
        with self.assertRaises(ValueError):
            ray_sphere_interval((0, 0, 2), (0, 0, 0), 1)
        with self.assertRaises(ValueError):
            density_column((0, 0, 2), (0, 0, 1), 10, 1, 0, steps=100)

    def test_ellipsoid_path_uses_physical_length_and_polar_ratio(self) -> None:
        # A north-pole path has the same equivalent isobar-height profile but its
        # physical geometric thickness is q times the equatorial reference path.
        q = .9
        actual = density_column((0, 0, 6378.137 * q), (0, 0, 1), 100 * q,
                                6378.137, 8, steps=4096, polar_ratio=q)
        expected = q * 8 * (1 - math.exp(-100 / 8))
        self.assertAlmostEqual(actual, expected, delta=4e-6)

    def test_grazing_density_converges_without_nan_or_negative_depth(self) -> None:
        length = 2 * math.sqrt(6478.137 ** 2 - 6380 ** 2)
        origin = (6380, 0, -length / 2)
        coarse = density_column(origin, (0, 0, 1), length, 6378.137, 8, steps=256)
        fine = density_column(origin, (0, 0, 1), length, 6378.137, 8, steps=4096)
        self.assertTrue(math.isfinite(coarse) and coarse > 0)
        self.assertAlmostEqual(coarse / fine, 1, delta=1e-5)

    def test_vacuum_and_blocked_sun_have_no_scattered_light(self) -> None:
        opts = dict(radius_km=6378.137, top_km=100, rayleigh_h_km=8, aerosol_h_km=1.2,
                    beta_rayleigh=(0, 0, 0), beta_extinction=(0, 0, 0), aerosol_ssa=(.9, .9, .9), g=.8)
        result = trace_single_scattering((0, 0, 8000), (0, 0, -1), (0, 0, 1), **opts)
        self.assertEqual(result["transmittance"], (1, 1, 1))
        self.assertEqual(result["scattering"], (0, 0, 0))
        opts["beta_rayleigh"] = (.0058, .0136, .0331)
        blocked = trace_single_scattering((0, 0, 8000), (0, 0, -1), (0, 0, -1), **opts)
        self.assertEqual(blocked["scattering"], (0, 0, 0))
        lit = trace_single_scattering((0, 0, 8000), (0, 0, -1), (0, 0, 1), **opts)
        self.assertTrue(all(x > 0 for x in lit["scattering"]))
        self.assertGreater(lit["scattering"][2], lit["scattering"][0])

    def test_refracted_ray_vacuum_limit_and_outward_escape(self) -> None:
        original = (0.6, 0, 0.8)
        result = trace_refracted_ray((0, 0, 6378.137), original, radius_km=6378.137,
                                     top_km=100, refractivity=0, scale_height_km=8, step_km=.1)
        for a, b in zip(result["direction"], original):
            self.assertAlmostEqual(a, b, places=12)
        bent = trace_refracted_ray((0, 0, 6378.137), original, radius_km=6378.137,
                                   top_km=100, refractivity=.000277, scale_height_km=8, step_km=.1)
        self.assertEqual(bent["status"], "escaped")
        self.assertLess(bent["direction"][2], original[2])
        self.assertAlmostEqual(sum(v * v for v in bent["direction"]), 1, places=12)

    def test_spherical_refraction_conserves_bouguer_invariant(self) -> None:
        radius, refractivity, height = 6378.137, .000277, 8
        result = trace_refracted_ray((0, 0, radius), (.6, 0, .8), radius_km=radius,
                                     top_km=100, refractivity=refractivity, scale_height_km=height,
                                     step_km=.2)
        p, d = result["position"], result["direction"]
        final_radius = math.sqrt(sum(v * v for v in p))
        final_index = 1 + refractivity * math.exp(-(final_radius - radius) / height)
        cross = (p[1] * d[2] - p[2] * d[1], p[2] * d[0] - p[0] * d[2], p[0] * d[1] - p[1] * d[0])
        final_invariant = final_index * math.sqrt(sum(v * v for v in cross))
        initial_invariant = (1 + refractivity) * radius * .6
        self.assertAlmostEqual(final_invariant / initial_invariant, 1, delta=1e-10)

    def test_incident_solar_refraction_vertical_vacuum_and_horizon(self) -> None:
        opts = dict(radius_km=6378.137, top_km=100, refractivity=.00027782,
                    scale_height_km=8, aerosol_scale_height_km=1.2, step_km=.5)
        vertical = incident_solar_refraction((0, 0, 6378.137), (0, 0, 1), **opts)
        self.assertTrue(vertical["visible"])
        self.assertEqual(vertical["direction"], (0, 0, 1))
        self.assertAlmostEqual(vertical["columns"][0], 8 * (1 - math.exp(-100 / 8)), delta=1e-5)
        angle = math.radians(80)
        original = (math.sin(angle), 0, math.cos(angle))
        vacuum = incident_solar_refraction((0, 0, 6378.137), original, **{**opts, "refractivity": 0})
        for a, b in zip(vacuum["direction"], original):
            self.assertAlmostEqual(a, b, places=12)
        bent = incident_solar_refraction((0, 0, 6378.137), original, **opts)
        self.assertGreater(bent["direction"][2], original[2])
        below = math.radians(-.2)
        twilight = incident_solar_refraction((0, 0, 6378.137), (math.cos(below), 0, math.sin(below)), **opts)
        self.assertTrue(twilight["visible"])
        self.assertGreater(twilight["direction"][2], 0)
        dark = math.radians(-2)
        self.assertFalse(incident_solar_refraction((0, 0, 6378.137), (math.cos(dark), 0, math.sin(dark)), **opts)["visible"])


if __name__ == "__main__":
    unittest.main()
