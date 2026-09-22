"""Independent float64 optical reference; no engine mutation, I/O or dependencies.

Lengths are km; extinction is km^-1. Midpoint quadrature is intentionally independent
of the renderer's Gauss quadrature. Returned scattering uses the renderer's unit-
Lambertian (pi times radiance / incident irradiance) display convention. Refraction
integrates the ray equation with RK4; it is a reference, not an enabled GPU effect.
"""
from __future__ import annotations

import math
from typing import Sequence

Vec = tuple[float, float, float]


def _positive(value: float, name: str, zero: bool = False) -> float:
    if not math.isfinite(value) or (value < 0 if zero else value <= 0):
        raise ValueError(f"{name} must be finite and {'nonnegative' if zero else 'positive'}")
    return value


def _vec(values: Sequence[float]) -> Vec:
    if len(values) != 3 or not all(math.isfinite(v) for v in values):
        raise ValueError("finite 3-vector required")
    return tuple(values)  # type: ignore[return-value]


def _unit(values: Sequence[float]) -> Vec:
    v = _vec(values)
    length = _positive(math.sqrt(sum(x * x for x in v)), "direction length")
    return tuple(x / length for x in v)  # type: ignore[return-value]


def _point(origin: Vec, direction: Vec, distance: float) -> Vec:
    return tuple(o + d * distance for o, d in zip(origin, direction))  # type: ignore[return-value]


def ray_sphere_interval(origin: Sequence[float], direction: Sequence[float], radius: float,
                        polar_ratio: float = 1) -> tuple[float, float] | None:
    """Ellipsoid intersections in physical-distance ray parameters; direction need not be unit."""
    _positive(radius, "radius")
    q = _positive(polar_ratio, "polar ratio")
    o0, d0 = _vec(origin), _vec(direction)
    o, d = (o0[0], o0[1], o0[2] / q), (d0[0], d0[1], d0[2] / q)
    a = _positive(sum(v * v for v in d), "direction norm")
    center = -sum(x * y for x, y in zip(o, d)) / a
    closest = _point(o, d, center)
    delta = (radius * radius - sum(x * x for x in closest)) / a
    if delta < 0:
        return None
    half = math.sqrt(delta)
    return center - half, center + half


def density_column(origin: Sequence[float], direction: Sequence[float], length_km: float,
                   radius_km: float, scale_height_km: float, *, steps: int = 1024,
                   polar_ratio: float = 1) -> float:
    """Integral of dimensionless exponential density over physical path length."""
    _positive(length_km, "length", True)
    _positive(radius_km, "radius")
    _positive(scale_height_km, "scale height")
    _positive(polar_ratio, "polar ratio")
    if not isinstance(steps, int) or not 1 <= steps <= 65536:
        raise ValueError("steps must be an integer in [1,65536]")
    o, d = _vec(origin), _unit(direction)
    step = length_km / steps
    samples = []
    for i in range(steps):
        p = _point(o, d, (i + .5) * step)
        height = max(0., math.sqrt(p[0] ** 2 + p[1] ** 2 + (p[2] / polar_ratio) ** 2) - radius_km)
        samples.append(math.exp(-height / scale_height_km))
    return math.fsum(samples) * step


def ozone_density(height_km: float, peak_km: float, width_km: float) -> float:
    """Two-sided exponential ozone layer. Width 0 disables the absorber."""
    if not math.isfinite(height_km) or not math.isfinite(peak_km):
        raise ValueError("ozone height and peak must be finite")
    if not math.isfinite(width_km) or width_km < 0:
        raise ValueError("ozone width must be finite and nonnegative")
    return 0.0 if width_km == 0 else math.exp(-abs(height_km - peak_km) / width_km)


def ozone_column(origin: Sequence[float], direction: Sequence[float], length_km: float,
                 radius_km: float, peak_km: float, width_km: float, *, steps: int = 1024,
                 polar_ratio: float = 1) -> float:
    """Integral of dimensionless Chappuis ozone density over physical path length."""
    _positive(length_km, "length", True)
    _positive(radius_km, "radius")
    _positive(polar_ratio, "polar ratio")
    if not isinstance(steps, int) or not 1 <= steps <= 65536:
        raise ValueError("steps must be an integer in [1,65536]")
    if width_km == 0:
        ozone_density(0.0, peak_km, width_km)
        return 0.0
    o, d = _vec(origin), _unit(direction)
    step = length_km / steps
    samples = []
    for i in range(steps):
        p = _point(o, d, (i + .5) * step)
        height = max(0., math.sqrt(p[0] ** 2 + p[1] ** 2 + (p[2] / polar_ratio) ** 2) - radius_km)
        samples.append(ozone_density(height, peak_km, width_km))
    return math.fsum(samples) * step


# Cheap 8-node comparison helper. Production ozone is the baked outward table.
_OZONE_X8 = (-.9602898565, -.7966664774, -.5255324099, -.1834346425,
             .1834346425, .5255324099, .7966664774, .9602898565)
_OZONE_W8 = (.1012285363, .2223810345, .3137066459, .3626837834,
             .3626837834, .3137066459, .2223810345, .1012285363)


def ozone_column_gpu(origin: Sequence[float], direction: Sequence[float], length_km: float,
                     radius_km: float, peak_km: float, width_km: float, *,
                     polar_ratio: float = 1) -> float:
    """Eight-node segment integral used only to compare with ozone_column.

    Production ozone is the baked outward-table difference, not this helper.
    """
    _positive(length_km, "length", True)
    _positive(radius_km, "radius")
    _positive(polar_ratio, "polar ratio")
    if width_km == 0:
        ozone_density(0.0, peak_km, width_km)
        return 0.0
    o, d = _vec(origin), _unit(direction)
    p = (o[0], o[1], o[2] / polar_ratio)
    dv = (d[0], d[1], d[2] / polar_ratio)
    scale = math.sqrt(sum(v * v for v in dv))
    if scale == 0:
        raise ValueError("ozone column direction vanished")
    axis = tuple(v / scale for v in dv)
    begin = sum(a * b for a, b in zip(p, axis))
    end = begin + length_km * scale
    span = end - begin
    if span <= 0:
        return 0.0
    impact = math.sqrt(sum((p[i] - begin * axis[i]) ** 2 for i in range(3)))
    half, middle, column = span * .5, (begin + end) * .5, 0.0
    for node, weight in zip(_OZONE_X8, _OZONE_W8):
        x = middle + half * node
        height = max(0.0, math.hypot(impact, x) - radius_km)
        column += weight * ozone_density(height, peak_km, width_km)
    return column * half / scale


def trace_single_scattering(origin: Sequence[float], direction: Sequence[float], sun_direction: Sequence[float], *,
                            radius_km: float, top_km: float, rayleigh_h_km: float, aerosol_h_km: float,
                            beta_rayleigh: Sequence[float], beta_extinction: Sequence[float],
                            aerosol_ssa: Sequence[float], g: float, polar_ratio: float = 1,
                            view_steps: int = 256, solar_steps: int = 256,
                            solar_distance_au: float = 1, exposure: float = 1,
                            max_distance_km: float | None = None,
                            terrain_endpoint: bool = False,
                            beta_ozone: Sequence[float] = (0., 0., 0.),
                            ozone_peak_km: float = 0., ozone_width_km: float = 0.) -> dict:
    """Reference single scattering with explicit ground/terrain semantics.

    Default behavior still clips the view at the reference ellipsoid. The opt-in
    terrain endpoint preserves a supplied finite physical distance, including
    signed relief below that datum. Density there follows the renderer's existing
    constant-below-datum convention; it is not measured underground atmosphere.
    Midpoint quadrature remains independent of the GPU Gaussian integration.
    """
    if not isinstance(terrain_endpoint, bool):
        raise ValueError("terrain_endpoint must be a boolean")
    if terrain_endpoint:
        if max_distance_km is None or isinstance(max_distance_km, bool):
            raise ValueError("terrain_endpoint requires an explicit surface distance")
        _positive(max_distance_km, "surface endpoint distance", True)
    o, d, sun = _vec(origin), _unit(direction), _unit(sun_direction)
    br, be, ssa = _vec(beta_rayleigh), _vec(beta_extinction), _vec(aerosol_ssa)
    bo = _vec(beta_ozone)
    for v in (*br, *be, *bo):
        _positive(v, "extinction", True)
    ozone_density(0.0, ozone_peak_km, ozone_width_km)
    if not all(0 <= a <= 1 for a in ssa) or not math.isfinite(g) or abs(g) >= 1:
        raise ValueError("invalid scattering albedo or asymmetry")
    for value, label in [(top_km, "top"), (rayleigh_h_km, "molecular scale"), (aerosol_h_km, "aerosol scale"),
                         (solar_distance_au, "solar distance"), (polar_ratio, "polar ratio")]:
        _positive(value, label)
    _positive(exposure, "exposure", True)
    if not isinstance(view_steps, int) or not 1 <= view_steps <= 4096:
        raise ValueError("view steps must be in [1,4096]")
    result = {"transmittance": (1., 1., 1.), "scattering": (0., 0., 0.), "ground_hit": False}
    outer = ray_sphere_interval(o, d, radius_km + top_km, polar_ratio)
    if outer is None or outer[1] <= 0:
        return result
    start, end = max(0., outer[0]), outer[1]
    if max_distance_km is not None:
        _positive(max_distance_km, "surface endpoint distance", True)
        end = min(end, max_distance_km)
    ground = ray_sphere_interval(o, d, radius_km, polar_ratio)
    if terrain_endpoint:
        result["ground_hit"] = ground is not None and ground[1] >= start and ground[0] <= end
    elif ground is not None and start - 1e-6 <= ground[0] <= end:
        end, result["ground_hit"] = min(end, max(start, ground[0])), True
    if end <= start:
        return result
    o = _point(o, d, start)
    length = end - start
    tau_total = [0., 0., 0.]
    for h, beta in [(rayleigh_h_km, br), (aerosol_h_km, be)]:
        column = density_column(o, d, length, radius_km, h, steps=max(1024, view_steps), polar_ratio=polar_ratio)
        for j in range(3):
            tau_total[j] += column * beta[j]
    if any(bo) and ozone_width_km > 0:
        ozone = ozone_column(o, d, length, radius_km, ozone_peak_km, ozone_width_km,
                             steps=max(1024, view_steps), polar_ratio=polar_ratio)
        for j in range(3):
            tau_total[j] += ozone * bo[j]
    result["transmittance"] = tuple(math.exp(-t) for t in tau_total)
    mu = max(-1., min(1., sum(x * y for x, y in zip(d, sun))))
    phase_r = 3 * (1 + mu * mu) / (16 * math.pi)
    phase_a = (1 - g * g) / (4 * math.pi * (1 + g * g - 2 * g * mu) ** 1.5)
    accum = [0., 0., 0.]
    step = length / view_steps
    for i in range(view_steps):
        distance = (i + .5) * step
        p = _point(o, d, distance)
        blocked = ray_sphere_interval(p, sun, radius_km, polar_ratio)
        if terrain_endpoint:
            # Retain the defined renderer boundary convention in physical km.
            # A terrain endpoint may be inside the reference ellipsoid, so an
            # outward sunward ray must not be clipped at its negative entry root.
            if blocked is not None and blocked[1] > .001 and blocked[0] > .001:
                continue
            metric_height = math.sqrt(p[0]**2 + p[1]**2 + (p[2]/polar_ratio)**2) - radius_km
            light_dot = p[0]*sun[0] + p[1]*sun[1] + p[2]*sun[2]/polar_ratio**2
            # Above the datum, a slightly inward solar ray can still miss the
            # curved planet. The near-ground convention only applies to hits.
            if (blocked is not None and blocked[1] > .001
                    and metric_height < .002 and light_dot < 0):
                continue
        elif blocked is not None and blocked[0] > 1e-6:
            continue
        sunlight = ray_sphere_interval(p, sun, radius_km + top_km, polar_ratio)
        if sunlight is None:
            continue
        height = max(0., math.sqrt(p[0] ** 2 + p[1] ** 2 + (p[2] / polar_ratio) ** 2) - radius_km)
        densities = math.exp(-height / rayleigh_h_km), math.exp(-height / aerosol_h_km)
        cols = []
        for h in (rayleigh_h_km, aerosol_h_km):
            cols.append(density_column(o, d, distance, radius_km, h, steps=solar_steps, polar_ratio=polar_ratio)
                        + density_column(p, sun, sunlight[1], radius_km, h, steps=solar_steps, polar_ratio=polar_ratio))
        ozone = 0.0
        if any(bo) and ozone_width_km > 0:
            ozone = (ozone_column(o, d, distance, radius_km, ozone_peak_km, ozone_width_km,
                                  steps=solar_steps, polar_ratio=polar_ratio)
                     + ozone_column(p, sun, sunlight[1], radius_km, ozone_peak_km, ozone_width_km,
                                    steps=solar_steps, polar_ratio=polar_ratio))
        for j in range(3):
            attenuation = math.exp(-br[j] * cols[0] - be[j] * cols[1] - bo[j] * ozone)
            source = br[j] * densities[0] * phase_r + be[j] * ssa[j] * densities[1] * phase_a
            accum[j] += attenuation * source * step
    result["scattering"] = tuple(v * math.pi * exposure / solar_distance_au ** 2 for v in accum)
    return result


def trace_refracted_ray(origin: Sequence[float], direction: Sequence[float], *, radius_km: float,
                        top_km: float, refractivity: float, scale_height_km: float,
                        step_km: float = .1, max_steps: int = 65536, polar_ratio: float = 1,
                        aerosol_scale_height_km: float = 1.2) -> dict:
    """RK4 integration: dx/ds=u, du/ds=(grad(n)-u*(u.grad(n)))/n.

    Exponential ellipsoidal reference. Explicit termination prevents indefinite
    trapping. Returned state is mathematical reference data, not an observer correction.
    """
    for value, label in [(radius_km, "radius"), (top_km, "top"), (scale_height_km, "scale"), (step_km, "step")]:
        _positive(value, label)
    _positive(refractivity, "refractivity", True)
    _positive(polar_ratio, "polar ratio")
    _positive(aerosol_scale_height_km, "aerosol scale height")
    if not isinstance(max_steps, int) or not 1 <= max_steps <= 1000000:
        raise ValueError("invalid refraction step bound")
    position, heading = _vec(origin), _unit(direction)

    def derivative(state: tuple[float, ...]) -> tuple[float, ...]:
        p, u = state[:3], state[3:6]
        radius = math.sqrt(p[0] ** 2 + p[1] ** 2 + (p[2] / polar_ratio) ** 2)
        height = max(0., radius - radius_km)
        nr = refractivity * math.exp(-height / scale_height_km)
        normal = (p[0] / radius, p[1] / radius, p[2] / (polar_ratio ** 2 * radius))
        grad = tuple(-nr / scale_height_km * v if radius >= radius_km else 0 for v in normal)
        along = sum(a * b for a, b in zip(u, grad))
        return (*u, *((a - b * along) / (1 + nr) for a, b in zip(grad, u)),
                math.exp(-height / scale_height_km), math.exp(-height / aerosol_scale_height_km))

    initial_height = math.sqrt(position[0] ** 2 + position[1] ** 2 + (position[2] / polar_ratio) ** 2) - radius_km
    state = (*position, *heading, 0., 0.)
    for index in range(max_steps):
        radius = math.sqrt(state[0] ** 2 + state[1] ** 2 + (state[2] / polar_ratio) ** 2)
        if radius >= radius_km + top_km:
            return {"position": state[:3], "direction": _unit(state[3:6]), "columns": state[6:8], "status": "escaped", "steps": index}
        if radius < radius_km + min(0., initial_height) - 1e-7:
            return {"position": state[:3], "direction": _unit(state[3:6]), "columns": state[6:8], "status": "ground", "steps": index}
        k1 = derivative(state)
        k2 = derivative(tuple(v + step_km * d * .5 for v, d in zip(state, k1)))
        k3 = derivative(tuple(v + step_km * d * .5 for v, d in zip(state, k2)))
        k4 = derivative(tuple(v + step_km * d for v, d in zip(state, k3)))
        state = tuple(v + step_km / 6 * (a + 2 * b + 2 * c + d) for v, a, b, c, d in zip(state, k1, k2, k3, k4))
        state = (*state[:3], *_unit(state[3:6]), *state[6:8])
    return {"position": state[:3], "direction": state[3:6], "columns": state[6:8], "status": "step-limit", "steps": max_steps}


def incident_solar_refraction(surface: Sequence[float], solar_direction: Sequence[float], **options) -> dict:
    """Independent fixed-point boundary-value solve; ray exits toward physical Sun.

    Uses up to 16 fixed-step float64 RK4 integrations. Extinction columns follow
    the curved ray. Only the incident path is modeled; view rays remain separate.
    """
    p, target = _vec(surface), _unit(solar_direction)
    q = options.get("polar_ratio", 1)
    up = _unit((p[0], p[1], p[2] / q ** 2))
    cosine = sum(a * b for a, b in zip(target, up))
    if cosine < -.04:
        return {"visible": False, "direction": target, "columns": (0., 0.)}

    def above_horizon(d: Vec) -> Vec:
        elevation = sum(a * b for a, b in zip(d, up))
        return _unit(tuple(a + max(0., 1e-7 - elevation) * b for a, b in zip(d, up)))

    guess = above_horizon(target)
    next_direction = guess
    for _ in range(16):
        ray = trace_refracted_ray(p, guess, **options)
        if ray["status"] != "escaped":
            return {"visible": False, "direction": target, "columns": (0., 0.)}
        next_direction = _unit(tuple(t - outgoing + incoming for t, outgoing, incoming in zip(target, ray["direction"], guess)))
        next_guess = above_horizon(next_direction)
        error = max(abs(a - b) for a, b in zip(guess, next_guess))
        guess = next_guess
        if error < 1e-12:
            break
    if sum(a * b for a, b in zip(next_direction, up)) < 0:
        return {"visible": False, "direction": next_direction, "columns": (0., 0.)}
    ray = trace_refracted_ray(p, guess, **options)
    return {"visible": ray["status"] == "escaped", "direction": guess, "columns": ray["columns"]}
