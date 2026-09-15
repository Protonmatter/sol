"""Independent float64 fixed-footprint transmission, empty=0 depth, opaque=infinity.

These are synthetic slab/coverage references, not admitted Saturn occultation data.
"""
from __future__ import annotations
import math
from typing import Sequence


def transmission(regions: Sequence[tuple[float, float]], cosine: float, coverage: float = 1) -> float:
    if not math.isfinite(cosine) or not .02 <= abs(cosine) <= 1 or not math.isfinite(coverage) or not 0 <= coverage <= 1:
        raise ValueError('invalid angular domain or coverage')
    if not 1 <= len(regions) <= 256:
        raise ValueError('invalid region budget')
    for weight, depth in regions:
        if not math.isfinite(weight) or weight < 0 or math.isnan(depth) or depth < 0:
            raise ValueError('invalid region weight or depth')
    if abs(math.fsum(weight for weight, _ in regions) - 1) > 1e-12:
        raise ValueError('area weights must sum to one')
    transmitted = math.fsum(weight * math.exp(-depth / abs(cosine)) for weight, depth in regions)
    return (1 - coverage) + coverage * transmitted
