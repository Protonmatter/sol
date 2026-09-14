"""Independent float64 GGX reference, Walter et al. (2007), synthetic materials only.

No source-image inference, measured ocean roughness, or diffuse energy mixture.
"""
from __future__ import annotations
import argparse
import json
import math
from typing import Sequence


def direction(zenith_degrees: float, azimuth_degrees: float) -> tuple[float, float, float]:
    theta, phi = map(math.radians, (zenith_degrees, azimuth_degrees))
    return math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta)


def fresnel(cosine: float, incident_index: float, material_index: float) -> float:
    if not all(math.isfinite(x) for x in (cosine, incident_index, material_index)) or not 0 <= cosine <= 1 or min(incident_index, material_index) <= 0:
        raise ValueError('finite positive indices and incidence cosine in [0,1] required')
    if incident_index == material_index:
        return 0.0
    transmitted_sine_squared = (incident_index / material_index) ** 2 * (1 - cosine ** 2)
    if transmitted_sine_squared >= 1:
        return 1.0
    transmitted_cosine = math.sqrt(1 - transmitted_sine_squared)
    s = (incident_index * cosine - material_index * transmitted_cosine) / (incident_index * cosine + material_index * transmitted_cosine)
    p = (material_index * cosine - incident_index * transmitted_cosine) / (material_index * cosine + incident_index * transmitted_cosine)
    return (s * s + p * p) / 2


def ggx(incident: Sequence[float], view: Sequence[float], alpha: float, n_incident: float = 1, n_material: float = 1.5) -> float:
    if not math.isfinite(alpha) or not .05 <= alpha <= 1:
        raise ValueError('alpha outside reference domain [.05,1]')
    for vector in (incident, view):
        if len(vector) != 3 or not all(math.isfinite(x) for x in vector) or abs(math.hypot(*vector) - 1) > 1e-10:
            raise ValueError('finite unit direction required')
    fresnel(1, n_incident, n_material)  # Validate even on the unilluminated branch.
    ni, nv = incident[2], view[2]
    if min(ni, nv) <= 0:
        return 0.0
    summed = [a + b for a, b in zip(incident, view)]
    length = math.hypot(*summed)
    if length <= 1e-15:
        return 0.0
    half = [x / length for x in summed]
    distribution = alpha ** 2 / (math.pi * (1 + (alpha ** 2 - 1) * half[2] ** 2) ** 2)
    def masking(c: float) -> float:
        return 2 * c / (c + math.sqrt(alpha ** 2 + (1 - alpha ** 2) * c ** 2))
    interface = fresnel(min(1.0, max(0.0, math.fsum(a * b for a, b in zip(incident, half)))), n_incident, n_material)
    return distribution * masking(ni) * masking(nv) * interface / (4 * ni * nv)


def hemisphere_energy(incidence_degrees: float, alpha: float, samples: int) -> float:
    """Midpoint in polar angle and azimuth; normal incidence is axisymmetric."""
    if not isinstance(samples, int) or not 8 <= samples <= 2048:
        raise ValueError('quadrature sample count outside [8,2048]')
    light = direction(incidence_degrees, 0)
    azimuths = 1 if incidence_degrees == 0 else samples * 2
    step = math.pi / (2 * samples)
    terms = []
    for i in range(samples):
        theta = (i + .5) * step
        ring = math.fsum(ggx(light, direction(math.degrees(theta), (j + .5) * 360 / azimuths), alpha) for j in range(azimuths))
        terms.append(ring * math.cos(theta) * math.sin(theta) * step * 2 * math.pi / azimuths)
    return math.fsum(terms)


def fixtures() -> list[dict]:
    return [{'input': {'incident': direction(i, 0), 'view': direction(v, phi), 'alpha': alpha, 'nIncident': 1, 'nMaterial': 1.5},
             'brdf': ggx(direction(i, 0), direction(v, phi), alpha)}
            for alpha in (.05, .2, .5, 1) for i in (0, 30, 60, 80, 89)
            for v in (0, 30, 60, 80, 89) for phi in (0, 45, 90, 180)]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', action='store_true', required=True)
    parser.parse_args()
    print(json.dumps(fixtures(), allow_nan=False))
