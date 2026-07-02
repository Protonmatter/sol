use crate::active_region::{ActiveRegion, Polarity};
use crate::constants::{
    ACTIVE_REGION_LIFETIME_DAYS, DEFAULT_DECAY_PER_DAY, DEFAULT_DIFFUSION, SECONDS_PER_DAY,
};
use crate::differential_rotation::differential_rotation_deg_per_day;
use crate::{Field2D, SolarState};

#[derive(Clone, Debug)]
pub struct FluxTransportConfig {
    pub diffusion: f32,
    pub decay_per_day: f32,
    pub source_sigma_deg: f32,
}

impl Default for FluxTransportConfig {
    fn default() -> Self {
        Self {
            diffusion: DEFAULT_DIFFUSION,
            decay_per_day: DEFAULT_DECAY_PER_DAY,
            source_sigma_deg: 2.2,
        }
    }
}

pub fn advance_flux_transport(state: &mut SolarState, dt_seconds: f64, cfg: &FluxTransportConfig) {
    rotate_field(state, dt_seconds);
    diffuse_field(state, dt_seconds, cfg.diffusion);
    inject_sources(state, cfg);
    decay_field(state, dt_seconds, cfg.decay_per_day);
    state.time_seconds += dt_seconds;
    retire_regions(state);
    state.recompute_continuum_from_br();
}

/// Drop regions past their tracking lifetime. Their injected flux keeps living (and decaying)
/// in the field; only the metadata entry retires. Without this the region list — and with it
/// the injection scan, the snapshot JSON, and the "insight" heuristics — grew without bound.
fn retire_regions(state: &mut SolarState) {
    let now = state.time_seconds;
    state
        .active_regions
        .retain(|ar| now - ar.birth_seconds <= ACTIVE_REGION_LIFETIME_DAYS * SECONDS_PER_DAY);
}

fn rotate_field(state: &mut SolarState, dt_seconds: f64) {
    let grid = state.grid.clone();
    let mut next = Field2D::filled(grid.len(), 0.0);
    let dt_days = dt_seconds / SECONDS_PER_DAY;

    for lat_i in 0..grid.lat_count {
        let lat = grid.lat_deg(lat_i) as f64;
        let shift_deg = differential_rotation_deg_per_day(lat) * dt_days;
        let shift_cells = shift_deg as f32 / grid.dlon_deg;
        for lon_i in 0..grid.lon_count {
            let src = lon_i as f32 - shift_cells;
            let lon0 = src.floor() as isize;
            let frac = src - lon0 as f32;
            let a = modulo(lon0, grid.lon_count);
            let b = modulo(lon0 + 1, grid.lon_count);
            let va = state.br.values[grid.idx(lat_i, a)];
            let vb = state.br.values[grid.idx(lat_i, b)];
            next.values[grid.idx(lat_i, lon_i)] = va * (1.0 - frac) + vb * frac;
        }
    }

    state.br = next;
}

fn diffuse_field(state: &mut SolarState, dt_seconds: f64, diffusion: f32) {
    let grid = state.grid.clone();
    let mut next = state.br.clone();

    // Diffusion is a RATE: scale the stencil by the timestep so the smoothing over a given span of
    // simulated time is independent of how it is subdivided. Previously the increment was applied
    // once per call regardless of dt, so halving dt while doubling the step count silently doubled
    // the effective diffusivity. Normalised to a 1-hour reference step, so the tuned
    // DEFAULT_DIFFUSION and the existing 1-hour-step output (and golden snapshots) are unchanged;
    // at that step diffusion·dt_hours = diffusion stays well under the 0.25 explicit-stability limit.
    let dt_hours = (dt_seconds / 3600.0) as f32;

    for lat_i in 0..grid.lat_count {
        for lon_i in 0..grid.lon_count {
            let c = state.br.values[grid.idx(lat_i, lon_i)];
            let west = state.br.values[grid.idx(lat_i, modulo(lon_i as isize - 1, grid.lon_count))];
            let east = state.br.values[grid.idx(lat_i, lon_i + 1)];
            let south = if lat_i > 0 {
                state.br.values[grid.idx(lat_i - 1, lon_i)]
            } else {
                c
            };
            let north = if lat_i + 1 < grid.lat_count {
                state.br.values[grid.idx(lat_i + 1, lon_i)]
            } else {
                c
            };
            let lap = west + east + south + north - 4.0 * c;
            next.values[grid.idx(lat_i, lon_i)] = c + diffusion * dt_hours * lap;
        }
    }

    state.br = next;
}

fn inject_sources(state: &mut SolarState, cfg: &FluxTransportConfig) {
    // Inject each bipole ONCE, at birth — not on every step. Re-injecting every region every
    // step made the equilibrium field amplitude scale as 1/dt (the identical bug class the
    // diffusion stencil's dt-scaling fix documents above: halving dt doubled the deposited
    // flux per simulated day against the 1.5%/day decay). Regions born this step carry
    // birth_seconds equal to the current model time — the callers generate births *before*
    // advancing — so `birth_seconds >= time_seconds` selects exactly the fresh ones; older
    // regions have already deposited their flux, which rotation/diffusion/decay now evolve.
    let fresh: Vec<ActiveRegion> = state
        .active_regions
        .iter()
        .filter(|ar| ar.birth_seconds >= state.time_seconds)
        .cloned()
        .collect();
    for ar in &fresh {
        inject_bipole(state, ar, cfg.source_sigma_deg);
    }
}

fn inject_bipole(state: &mut SolarState, ar: &ActiveRegion, sigma_deg: f32) {
    let sep = 3.0 + 5.0 * ar.complexity;
    let tilt = ar.tilt_deg.to_radians();
    let dlat = 0.5 * sep * tilt.sin();
    let dlon = 0.5 * sep * tilt.cos();

    let sign = match ar.polarity {
        Polarity::LeadingPositive => 1.0,
        Polarity::LeadingNegative => -1.0,
    };

    add_gaussian(
        state,
        ar.lat_deg + dlat,
        ar.lon_deg + dlon,
        sign * ar.flux_norm,
        sigma_deg,
    );
    add_gaussian(
        state,
        ar.lat_deg - dlat,
        ar.lon_deg - dlon,
        -sign * ar.flux_norm,
        sigma_deg,
    );
}

fn add_gaussian(state: &mut SolarState, lat_deg: f32, lon_deg: f32, amp: f32, sigma_deg: f32) {
    let grid = state.grid.clone();
    let denom = 2.0 * sigma_deg * sigma_deg;
    for lat_i in 0..grid.lat_count {
        let lat = grid.lat_deg(lat_i);
        let dlat = lat - lat_deg;
        if dlat.abs() > 5.0 * sigma_deg {
            continue;
        }
        for lon_i in 0..grid.lon_count {
            let lon = grid.lon_deg(lon_i);
            let dlon = circular_delta_deg(lon, lon_deg);
            if dlon.abs() > 5.0 * sigma_deg {
                continue;
            }
            let w = (-(dlat * dlat + dlon * dlon) / denom).exp();
            let idx = grid.idx(lat_i, lon_i);
            state.br.values[idx] += amp * w;
            state.confidence.values[idx] = state.confidence.values[idx].max(0.55);
        }
    }
}

fn decay_field(state: &mut SolarState, dt_seconds: f64, decay_per_day: f32) {
    let dt_days = (dt_seconds / SECONDS_PER_DAY) as f32;
    let decay = (1.0 - decay_per_day * dt_days).clamp(0.0, 1.0);
    state.br.scale(decay);
    for c in &mut state.confidence.values {
        *c *= 0.999_f32.powf(dt_days);
    }
}

fn circular_delta_deg(a: f32, b: f32) -> f32 {
    let mut d = a - b;
    while d > 180.0 {
        d -= 360.0;
    }
    while d < -180.0 {
        d += 360.0;
    }
    d
}

fn modulo(x: isize, n: usize) -> usize {
    let n = n as isize;
    (((x % n) + n) % n) as usize
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SolarGrid, SolarMode};

    #[test]
    fn constant_field_remains_bounded() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.br.values.fill(0.5);
        advance_flux_transport(&mut state, 3600.0, &FluxTransportConfig::default());
        assert!(state.br.max_abs() < 0.6);
    }

    #[test]
    fn no_nan_after_many_steps() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        for _ in 0..100 {
            advance_flux_transport(&mut state, 1800.0, &FluxTransportConfig::default());
        }
        assert!(state.br.values.iter().all(|v| v.is_finite()));
    }

    fn test_region(birth_seconds: f64) -> ActiveRegion {
        ActiveRegion {
            id: 1,
            birth_seconds,
            lat_deg: 15.0,
            lon_deg: 120.0,
            flux_norm: 1.0,
            area_msh: 500.0,
            tilt_deg: 8.0,
            complexity: 0.5,
            polarity: Polarity::LeadingPositive,
            confidence: 0.65,
        }
    }

    #[test]
    fn bipole_flux_is_injected_once_not_per_step() {
        // The regression this guards: re-injecting every region every step made the field
        // amplitude grow ~linearly with the step count (equilibrium ∝ 1/dt). With
        // inject-at-birth, steps after the birth step must not ADD flux — the total
        // unsigned flux can only be moved (rotation), spread (diffusion), or shrunk (decay).
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.active_regions.push(test_region(0.0));
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut state, 3600.0, &cfg); // birth step: injects
        let after_birth: f32 = state.br.values.iter().map(|v| v.abs()).sum();
        advance_flux_transport(&mut state, 3600.0, &cfg); // must NOT inject again
        let after_second: f32 = state.br.values.iter().map(|v| v.abs()).sum();
        assert!(after_birth > 0.5, "birth step injected nothing");
        assert!(
            after_second <= after_birth * 1.01,
            "flux grew after birth step: {after_birth} -> {after_second}"
        );
    }

    #[test]
    fn regions_retire_after_lifetime() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.active_regions.push(test_region(0.0));
        let cfg = FluxTransportConfig::default();
        // Step past the tracking lifetime in day-long steps.
        for _ in 0..16 {
            advance_flux_transport(&mut state, 86_400.0, &cfg);
        }
        assert!(
            state.active_regions.is_empty(),
            "region should retire after {} days",
            crate::constants::ACTIVE_REGION_LIFETIME_DAYS
        );
    }
}
