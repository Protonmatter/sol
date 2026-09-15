"""Float64 disk photometry with explicit missing coverage and a Lambert-sphere oracle.

Synthetic rho is diffuse hemispheric reflectance, not geometric albedo or map RGB.
The comparison is an equally sized unit-reflectance Lambertian flat disk at the
same incident irradiance and distance. No real satellite model is calibrated here.
"""
from __future__ import annotations
import argparse
from dataclasses import asdict, dataclass
import json
import math
from typing import Callable, Sequence

Surface = Callable[[Sequence[float]], float | None]


@dataclass(frozen=True)
class PhotometryResult:
    observed_ratio: float
    unresolved_projected_fraction: float
    disk_ratio: float | None
    band: str
    sample_count: int


def lambert_phase(alpha: float) -> float:
    if not math.isfinite(alpha) or not 0 <= alpha <= math.pi:
        raise ValueError('phase must lie in [0,pi]')
    if alpha == math.pi: return 0.0
    return (math.sin(alpha) + (math.pi - alpha) * math.cos(alpha)) / math.pi


def _parameters(phase: float, orientation: float, band: str, first: int, second: int) -> tuple[float, float, float, float]:
    if not all(math.isfinite(x) for x in (phase, orientation)) or not 0 <= phase <= 180:
        raise ValueError('finite phase in [0,180] and orientation required')
    if not isinstance(band, str) or not band.strip():
        raise ValueError('photometric band must be explicit')
    if any(type(x) is not int or not 8 <= x <= 2048 for x in (first, second)) or first * second > 2_097_152:
        raise ValueError('quadrature exceeds sample budget')
    return math.sin(math.radians(phase)), math.cos(math.radians(phase)), math.sin(math.radians(orientation)), math.cos(math.radians(orientation))


def _sample(surface: Surface, x: float, y: float, z: float, si: float, ci: float, so: float, co: float) -> tuple[float, bool]:
    mu = max(0.0, x * si + z * ci)
    if mu == 0:
        return 0.0, False
    rho = surface((x * co - z * so, y, x * so + z * co))
    if rho is None:
        return 0.0, True
    if not math.isfinite(rho) or not 0 <= rho <= 1:
        raise ValueError('Lambert diffuse reflectance must be finite in [0,1]')
    return rho * mu, False


def integrate_disk(surface: Surface, phase_degrees: float, *, orientation_degrees: float = 0, band: str = 'synthetic-grey', radial_samples: int = 128, azimuth_samples: int = 512) -> PhotometryResult:
    """Equal projected-area disk quadrature, radial variable q=r^2; no mask renormalization."""
    si, ci, so, co = _parameters(phase_degrees, orientation_degrees, band, radial_samples, azimuth_samples)
    angles = [2 * math.pi * (j + .5) / azimuth_samples for j in range(azimuth_samples)]
    trig = [(math.cos(phi), math.sin(phi)) for phi in angles]
    observed, unresolved = [], 0
    for i in range(radial_samples):
        r = math.sqrt((i + .5) / radial_samples)
        z = math.sqrt(1 - r * r)
        ring = []
        for c, s in trig:
            value, missing = _sample(surface, r * c, r * s, z, si, ci, so, co)
            ring.append(value)
            unresolved += missing
        observed.append(math.fsum(ring))
    count = radial_samples * azimuth_samples
    observed_ratio = math.fsum(observed) / count
    return PhotometryResult(observed_ratio, unresolved / count, None if unresolved else observed_ratio, band, count)


def integrate_surface(surface: Surface, phase_degrees: float, *, orientation_degrees: float = 0, band: str = 'synthetic-grey', cosine_samples: int = 256, azimuth_samples: int = 1024) -> PhotometryResult:
    """Independent visible-hemisphere dA quadrature with explicit projected n.view weight."""
    si, ci, so, co = _parameters(phase_degrees, orientation_degrees, band, cosine_samples, azimuth_samples)
    trig = [(math.cos(2 * math.pi * (j + .5) / azimuth_samples), math.sin(2 * math.pi * (j + .5) / azimuth_samples)) for j in range(azimuth_samples)]
    observed, unresolved = [], []
    for i in range(cosine_samples):
        z = (i + .5) / cosine_samples
        r = math.sqrt(1 - z * z)
        terms, missing_terms = [], []
        for c, s in trig:
            value, missing = _sample(surface, r * c, r * s, z, si, ci, so, co)
            terms.append(value * z)
            missing_terms.append(z if missing else 0)
        observed.append(math.fsum(terms))
        unresolved.append(math.fsum(missing_terms))
    count = cosine_samples * azimuth_samples
    observed_ratio = 2 * math.fsum(observed) / count
    missing_fraction = 2 * math.fsum(unresolved) / count
    return PhotometryResult(observed_ratio, missing_fraction, None if missing_fraction else observed_ratio, band, count)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', action='store_true', required=True)
    parser.parse_args()
    fixtures = [{'rho': rho, 'phase_degrees': phase, 'analytic': 2*rho/3*lambert_phase(math.radians(phase)),
                 'integrated': asdict(integrate_disk(lambda n, rho=rho: rho, phase))}
                for rho in (.1, .5, 1) for phase in (0, 30, 60, 90, 120, 150, 180)]
    print(json.dumps(fixtures, allow_nan=False))
