"""Independent endpoint and density-datum qualifications for optical rendering."""
from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from atmosphere_reference import ray_sphere_interval, trace_single_scattering


class TerrainEndpointReferenceTests(unittest.TestCase):
    def options(self, **changes) -> dict:
        return dict(radius_km=1000., top_km=100., rayleigh_h_km=8.,
                    aerosol_h_km=10., beta_rayleigh=(0., 0., 0.),
                    beta_extinction=(.01, .02, .03), aerosol_ssa=(0., 0., 0.),
                    g=0., view_steps=512, solar_steps=256, **changes)

    def test_signed_endpoint_preserves_analytic_constant_below_datum_column(self) -> None:
        for q in (1., .9):
            for depth in (0., 1., 22.37):
                with self.subTest(q=q, depth=depth):
                    result = trace_single_scattering((0, 0, 1100*q), (0, 0, -1),
                        (0, 0, 1), **self.options(polar_ratio=q),
                        max_distance_km=(100+depth)*q, terrain_endpoint=True)
                    column = q*(10*(1-math.exp(-10))+depth)
                    for actual, beta in zip(result["transmittance"], (.01, .02, .03)):
                        self.assertAlmostEqual(actual, math.exp(-beta*column), delta=3e-6)
                    self.assertEqual(result["scattering"], (0., 0., 0.))

    def test_default_reference_still_clips_at_reference_ground(self) -> None:
        clipped = trace_single_scattering((0, 0, 1100), (0, 0, -1), (0, 0, 1),
                    **self.options(), max_distance_km=122.37)
        terrain = trace_single_scattering((0, 0, 1100), (0, 0, -1), (0, 0, 1),
                    **self.options(), max_distance_km=122.37, terrain_endpoint=True)
        column = 10*(1-math.exp(-10))
        for actual, beta in zip(clipped["transmittance"], (.01, .02, .03)):
            self.assertAlmostEqual(actual, math.exp(-beta*column), delta=3e-6)
        self.assertLess(terrain["transmittance"][0], clipped["transmittance"][0])
        self.assertTrue(clipped["ground_hit"])
        self.assertTrue(terrain["ground_hit"])

    def test_radial_isotropic_scattering_has_analytic_solution_across_ground(self) -> None:
        # View and solar attenuation each have optical depth tau(s) from the top.
        # Isotropic phase times pi is 1/4, giving S=(1-exp(-2*tau_total))/8.
        options = self.options()
        options.update(aerosol_ssa=(1., 1., 1.), view_steps=2048, solar_steps=512)
        result = trace_single_scattering((0, 0, 1100), (0, 0, -1), (0, 0, 1),
                    **options, max_distance_km=122.37, terrain_endpoint=True)
        column = 10*(1-math.exp(-10))+22.37
        for actual, beta in zip(result["scattering"], (.01, .02, .03)):
            tau = beta*column
            self.assertAlmostEqual(actual, (1-math.exp(-2*tau))/8, delta=3e-6)

    def test_night_endpoint_has_exactly_zero_source(self) -> None:
        options = self.options()
        options.update(aerosol_ssa=(1., 1., 1.))
        result = trace_single_scattering((0, 0, 1100), (0, 0, -1), (0, 0, -1),
                    **options, max_distance_km=122.37, terrain_endpoint=True)
        self.assertEqual(result["scattering"], (0., 0., 0.))

    def test_endpoint_must_be_explicit_finite_and_nonnegative_even_on_miss(self) -> None:
        for endpoint in (None, True, False, -1., math.nan, math.inf):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                trace_single_scattering((0, 0, 1200), (1, 0, 0), (0, 0, 1),
                    **self.options(), max_distance_km=endpoint, terrain_endpoint=True)
        for mode in (None, 1, "true"):
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                trace_single_scattering((0, 0, 1200), (1, 0, 0), (0, 0, 1),
                    **self.options(), max_distance_km=1., terrain_endpoint=mode)

    def test_empty_or_missed_path_is_exact_vacuum(self) -> None:
        for direction, maximum in (((0, 0, -1), 0.), ((1, 0, 0), 10.)):
            result = trace_single_scattering((0, 0, 1200), direction, (0, 0, 1),
                    **self.options(), max_distance_km=maximum, terrain_endpoint=True)
            self.assertEqual(result["transmittance"], (1., 1., 1.))
            self.assertEqual(result["scattering"], (0., 0., 0.))

    def test_oblate_subdatum_shadow_uses_metric_normal_on_both_sides(self) -> None:
        q = .9
        origin = (999/math.sqrt(2), 0, q*999/math.sqrt(2))
        options = self.options(polar_ratio=q)
        options.update(beta_extinction=(.001, .001, .001),
                       aerosol_ssa=(1., 1., 1.), view_steps=8, solar_steps=64)
        values = []
        for z in (.85, .95):
            sun = (-1, 0, z)
            # Ordinary Euclidean dot is negative for both, but the ellipsoid's
            # normal changes sign between them. Stay away from exact tangency.
            self.assertLess(sum(a*b for a, b in zip(origin, sun)), 0)
            result = trace_single_scattering(origin, (0, 1, 0), sun, **options,
                         max_distance_km=.001, terrain_endpoint=True)
            values.append(result["scattering"])
        self.assertEqual(values[0], (0., 0., 0.))
        self.assertTrue(all(math.isfinite(v) and v > 0 for v in values[1]))

    def test_near_ground_inward_sun_can_clear_the_curved_planet(self) -> None:
        # A negative local-normal dot is not a ground intersection above the
        # datum. This entire short ray remains below the historical 2 m guard,
        # but its solar impact parameter exceeds R by more than 0.98 m.
        radius, height, length, beta, scale = 3396.19, .001, 4., .001, 11.1
        for q in (1., .9941):
            with self.subTest(q=q):
                origin = (radius + height, -length / 2, 0.)
                sun = (-1e-4, 0., q * math.sqrt(1 - 1e-8))
                metric_impact = (radius + height) * math.sqrt(1 - 1e-8)
                self.assertGreater(metric_impact - radius, .00098)
                maximum_height = math.hypot(radius + height, length / 2) - radius
                self.assertLess(maximum_height, .002)
                for y in (-length / 2, 0., length / 2):
                    point = (radius + height, y, 0.)
                    self.assertLess(sum(a*b for a, b in zip(point, sun)), 0)
                    self.assertIsNone(ray_sphere_interval(point, sun, radius, q))
                # Density <= 1 and the physical solar distance is <= the
                # unflattened sphere exit (q <= 1). Isotropic pi*phase=1/4.
                # These inequalities give a conservative analytic lower bound;
                # it is independent of either integrator's sample locations.
                maximum_solar_length = (radius + height) * 1e-4 + math.sqrt(
                    (radius + 100.)**2 - metric_impact**2)
                lower_bound = beta * length / 4 * math.exp(-maximum_height / scale
                    - beta * (length + maximum_solar_length))
                self.assertGreater(lower_bound, 1e-4)
                options = dict(radius_km=radius, top_km=100., rayleigh_h_km=scale,
                    aerosol_h_km=scale, beta_rayleigh=(0., 0., 0.),
                    beta_extinction=(beta, beta, beta), aerosol_ssa=(1., 1., 1.),
                    g=0., polar_ratio=q, view_steps=64, solar_steps=128,
                    max_distance_km=length, terrain_endpoint=True)
                lit = trace_single_scattering(origin, (0., 1., 0.), sun, **options)
                self.assertFalse(lit["ground_hit"])
                for value in lit["scattering"]:
                    self.assertGreater(value, lower_bound)
                # A more inward Sun actually intersects the planet; preserve
                # zero illumination for that case with the same near-ground ray.
                blocked_sun = (-.01, 0., q * math.sqrt(1 - .01**2))
                self.assertIsNotNone(ray_sphere_interval(origin, blocked_sun, radius, q))
                blocked = trace_single_scattering(origin, (0., 1., 0.), blocked_sun, **options)
                self.assertEqual(blocked["scattering"], (0., 0., 0.))


if __name__ == "__main__":
    unittest.main()
