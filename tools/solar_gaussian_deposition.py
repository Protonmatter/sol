"""Pure bounded Gaussian deposition for illustrative solar fallback volumes.

Each arc-length midpoint carries mass j*ds*2*pi*width**2*exp(-alt/.3)*gain.
The physical width is sigma. Separable normal CDF differences integrate that
mass over voxel cells, yielding a cell-average density (mass / h**3). Do not add
h**2/12: voxel integration already supplies the box filter.

The kernel is truncated at exactly +/-5 sigma per axis before grid/shell
clipping. Its omitted mass fraction is <2e-6, independent of grid alignment.
The existing center-selected shell mask is preserved; this is not exact
integration over a curved sphere/voxel intersection. Surviving cells are never
renormalized. No background, palette, pulse selection, array encoding or I/O is
owned here. The caller retains those independent responsibilities.
"""
from __future__ import annotations

from collections.abc import Iterator, MutableMapping, Sequence
from dataclasses import dataclass
import math

GRID_MIN = -2.5
GRID_MAX = 2.5
SUPPORT_SIGMA = 5.0
SUPPORT_MASS_FRACTION = math.erf(SUPPORT_SIGMA / math.sqrt(2.0)) ** 3
MAX_GRID_SIZE = 128
MAX_SAMPLES = 1024
MAX_SAMPLE_CELLS = 32768


@dataclass(frozen=True)
class DepositionMass:
    """Mass accounting in volume-integrated relative-emission units.

    target_mass = retained_mass + tail_mass + clipped_mass, to floating-point
    summation tolerance. Loss in the fixed grid box is included in clipped_mass.
    These are float64 deposition counters, prior to caller-owned float32 storage.
    """
    target_mass: float
    retained_mass: float
    tail_mass: float
    clipped_mass: float
    samples: int


def _number(value: float, name: str, lower: float, upper: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lower <= value <= upper:
        raise ValueError(f"{name} must be finite in [{lower}, {upper}]")
    return float(value)


def _grid(n: int) -> float:
    if type(n) is not int or not 1 <= n <= MAX_GRID_SIZE:
        raise ValueError(f"grid edge must be an integer from 1 to {MAX_GRID_SIZE}")
    return (GRID_MAX - GRID_MIN) / n


def _position(position: Sequence[float]) -> tuple[float, float, float]:
    if len(position) != 3:
        raise ValueError("position requires three coordinates")
    return tuple(_number(v, "position", -5.0, 5.0) for v in position)


def _axis_weights(center: float, sigma: float, n: int, step: float) -> list[tuple[int, float]]:
    support_low = center - SUPPORT_SIGMA * sigma
    support_high = center + SUPPORT_SIGMA * sigma
    start = max(0, math.floor((support_low - GRID_MIN) / step))
    stop = min(n, math.ceil((support_high - GRID_MIN) / step))
    denominator = math.sqrt(2.0) * sigma
    weights = []
    for index in range(start, stop):
        low = max(GRID_MIN + index * step, support_low)
        high = min(GRID_MIN + (index + 1) * step, support_high)
        probability = .5 * (math.erf((high - center) / denominator) - math.erf((low - center) / denominator))
        if probability > 0.0:
            weights.append((index, probability))
    return weights


def gaussian_cell_contributions(
    position: Sequence[float], sigma: float, n: int, mass: float, *, clip_shell: bool = True,
) -> Iterator[tuple[int, float]]:
    """Yield deterministic x-fastest flat-index / cell-average density pairs.

    Mass is integrated over each voxel's intersection with the +/-5-sigma
    support box, then cells with center radius outside [1,2.5] are discarded when
    clip_shell is True. No grid-center sampling or normalization is performed.
    Grid edge <=128, sigma in [1e-6,.1] R, at most 32768 visited cells per sample.
    """
    step = _grid(n)
    center = _position(position)
    sigma = _number(sigma, "sigma", 1e-6, .1)
    mass = _number(mass, "mass", 0.0, 1e12)
    if type(clip_shell) is not bool:
        raise ValueError("clip_shell must be boolean")
    if mass == 0.0:
        return
    axes = [_axis_weights(v, sigma, n, step) for v in center]
    if math.prod(len(axis) for axis in axes) > MAX_SAMPLE_CELLS:
        raise ValueError("Gaussian sample cell budget exceeded")
    density_scale = mass / step**3
    for z, wz in axes[2]:
        pz = GRID_MIN + (z + .5) * step
        for y, wy in axes[1]:
            py = GRID_MIN + (y + .5) * step
            yz_density = density_scale * wy * wz
            for x, wx in axes[0]:
                px = GRID_MIN + (x + .5) * step
                if clip_shell and not 1.0 <= px * px + py * py + pz * pz <= 6.25:
                    continue
                yield (z * n + y) * n + x, yz_density * wx


def deposit_line_segment(
    local: MutableMapping[int, tuple[float, float]],
    a: Sequence[float], b: Sequence[float], n: int, emission_relative: float,
    arc_start: float, *, gain_a: float = 1.0, gain_b: float = 1.0,
    clip_shell: bool = True,
) -> DepositionMass:
    """Accumulate one segment into caller-owned (density, density*arc) entries.

    Endpoints are [x,y,z,width] in solar-radius units. The segment width is the
    mean of its endpoint widths, preserving the previous fallback convention.
    Arc sampling uses midpoint quadrature at spacing <=h/2. Altitude attenuation
    and linearly interpolated endpoint gain are evaluated at the same midpoint.
    A zero-length segment adds no mass. This routine adds no diffuse background.
    """
    step = _grid(n)
    if len(a) != 4 or len(b) != 4:
        raise ValueError("line endpoints require x,y,z,width")
    start = _position(a[:3])
    end = _position(b[:3])
    width = (_number(a[3], "width", 1e-6, .1) + _number(b[3], "width", 1e-6, .1)) * .5
    emission = _number(emission_relative, "emission_relative", 0.0, 1e6)
    arc_start = _number(arc_start, "arc_start", 0.0, 1e12)
    gain_a = _number(gain_a, "gain_a", 0.0, 1e6)
    gain_b = _number(gain_b, "gain_b", 0.0, 1e6)
    if type(clip_shell) is not bool:
        raise ValueError("clip_shell must be boolean")
    delta = tuple(end[i] - start[i] for i in range(3))
    length = math.sqrt(math.fsum(v * v for v in delta))
    if length == 0.0 or emission == 0.0 or gain_a == gain_b == 0.0:
        return DepositionMass(0.0, 0.0, 0.0, 0.0, 0)
    pieces = max(1, math.ceil(length / (step * .5)))
    if pieces > MAX_SAMPLES:
        raise ValueError("line midpoint sample budget exceeded")
    ds = length / pieces
    target_masses = []
    retained_masses = []
    for k in range(pieces):
        fraction = (k + .5) / pieces
        position = tuple(start[i] + delta[i] * fraction for i in range(3))
        altitude = max(0.0, math.sqrt(math.fsum(v * v for v in position)) - 1.0)
        gain = gain_a * (1.0 - fraction) + gain_b * fraction
        mass = emission * ds * 2.0 * math.pi * width**2 * math.exp(-altitude / .3) * gain
        target_masses.append(mass)
        sample_arc = arc_start + length * fraction
        terms = []
        for index, density in gaussian_cell_contributions(position, width, n, mass, clip_shell=clip_shell):
            previous_density, previous_arc = local.get(index, (0.0, 0.0))
            local[index] = (previous_density + density, previous_arc + density * sample_arc)
            terms.append(density)
        retained_masses.append(math.fsum(terms) * step**3)
    target = math.fsum(target_masses)
    retained = math.fsum(retained_masses)
    tail = target * (1.0 - SUPPORT_MASS_FRACTION)
    # Roundoff may put an unclipped sum a few ulps above the exact support mass.
    clipped = max(0.0, target * SUPPORT_MASS_FRACTION - retained)
    return DepositionMass(target, retained, tail, clipped, pieces)
