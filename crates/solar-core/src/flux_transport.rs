use crate::active_region::{ActiveRegion, Polarity};
use crate::constants::{
    ACTIVE_REGION_LIFETIME_DAYS, DEFAULT_DECAY_PER_DAY, DEFAULT_DIFFUSION,
    DEFAULT_MAX_TRANSPORT_STEP_SECONDS, SECONDS_PER_DAY,
};
use crate::differential_rotation::carrington_advection_deg_per_day;
use crate::{Field2D, SolarState};

#[derive(Clone, Debug)]
pub struct FluxTransportConfig {
    pub diffusion: f32,
    pub decay_per_day: f32,
    pub source_sigma_deg: f32,
    pub max_step_seconds: f64,
}

impl Default for FluxTransportConfig {
    fn default() -> Self {
        Self {
            diffusion: DEFAULT_DIFFUSION,
            decay_per_day: DEFAULT_DECAY_PER_DAY,
            source_sigma_deg: 2.2,
            max_step_seconds: DEFAULT_MAX_TRANSPORT_STEP_SECONDS,
        }
    }
}

/// Advance to `state.time_seconds + dt_seconds` with deterministic internal
/// substeps. Active regions are injected exactly once at their birth time, so
/// callers obtain the same state whether they request one long interval or
/// partition that interval into smaller calls.
pub fn advance_flux_transport(state: &mut SolarState, dt_seconds: f64, cfg: &FluxTransportConfig) {
    assert!(dt_seconds.is_finite() && dt_seconds >= 0.0);
    assert!(cfg.max_step_seconds.is_finite() && cfg.max_step_seconds > 0.0);
    assert!(cfg.diffusion.is_finite() && cfg.diffusion >= 0.0);
    assert!(cfg.decay_per_day.is_finite() && cfg.decay_per_day >= 0.0);
    assert!(cfg.source_sigma_deg.is_finite() && cfg.source_sigma_deg > 0.0);

    let start = state.time_seconds;
    let target = start + dt_seconds;
    let mut events: Vec<ActiveRegion> = state
        .active_regions
        .iter()
        .filter(|ar| ar.birth_seconds >= start && ar.birth_seconds < target)
        .cloned()
        .collect();
    events.sort_by(|a, b| {
        a.birth_seconds
            .total_cmp(&b.birth_seconds)
            .then_with(|| a.id.cmp(&b.id))
    });

    for event in events {
        advance_continuous(state, event.birth_seconds - state.time_seconds, cfg);
        inject_bipole(state, &event, cfg.source_sigma_deg);
    }
    advance_continuous(state, target - state.time_seconds, cfg);

    state.time_seconds = target;
    retire_regions(state);
    state.recompute_continuum_from_br();
}

fn advance_continuous(state: &mut SolarState, dt_seconds: f64, cfg: &FluxTransportConfig) {
    let mut remaining = dt_seconds.max(0.0);
    while remaining > 0.0 {
        let step = remaining.min(cfg.max_step_seconds);
        rotate_field(state, step);
        diffuse_field(state, step, cfg.diffusion);
        decay_field(state, step, cfg.decay_per_day);
        state.time_seconds += step;
        remaining = (remaining - step).max(0.0);
    }
}

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
        let shift_deg = carrington_advection_deg_per_day(lat) * dt_days;
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
    let dt_hours_total = (dt_seconds / 3600.0) as f32;
    let substeps = ((diffusion * dt_hours_total / 0.2).ceil()).max(1.0) as usize;
    let dt_hours = dt_hours_total / substeps as f32;

    for _ in 0..substeps {
        let mut next = state.br.clone();
        for lat_i in 0..grid.lat_count {
            for lon_i in 0..grid.lon_count {
                let c = state.br.values[grid.idx(lat_i, lon_i)];
                let west =
                    state.br.values[grid.idx(lat_i, modulo(lon_i as isize - 1, grid.lon_count))];
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
    let decay = (-decay_per_day * dt_days).exp();
    state.br.scale(decay);
    let confidence_decay = 0.999_f32.powf(dt_days);
    for c in &mut state.confidence.values {
        *c *= confidence_decay;
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

    fn test_region(id: u64, birth_seconds: f64) -> ActiveRegion {
        ActiveRegion {
            id,
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

    #[test]
    fn bipole_flux_is_injected_once() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.active_regions.push(test_region(1, 0.0));
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut state, 3600.0, &cfg);
        let after_birth: f32 = state.br.values.iter().map(|v| v.abs()).sum();
        advance_flux_transport(&mut state, 3600.0, &cfg);
        let after_second: f32 = state.br.values.iter().map(|v| v.abs()).sum();
        assert!(after_birth > 0.5);
        assert!(after_second <= after_birth * 1.01);
    }

    #[test]
    fn long_call_matches_hourly_partition_with_midstep_birth() {
        let grid = SolarGrid::new(72, 36);
        let mut one_call = SolarState::new(grid.clone(), SolarMode::Synthetic);
        one_call.active_regions.push(test_region(1, 6.5 * 3600.0));
        let mut hourly = one_call.clone();
        let cfg = FluxTransportConfig::default();

        advance_flux_transport(&mut one_call, 24.0 * 3600.0, &cfg);
        for _ in 0..24 {
            advance_flux_transport(&mut hourly, 3600.0, &cfg);
        }

        assert_eq!(one_call.time_seconds, hourly.time_seconds);
        for (a, b) in one_call.br.values.iter().zip(&hourly.br.values) {
            assert!((a - b).abs() <= 2.0e-6, "partition mismatch: {a} vs {b}");
        }
    }

    #[test]
    fn exponential_decay_is_partition_invariant() {
        let grid = SolarGrid::new(72, 36);
        let mut one_call = SolarState::new(grid.clone(), SolarMode::Synthetic);
        one_call.br.values.fill(1.0);
        let mut hourly = one_call.clone();
        let mut cfg = FluxTransportConfig::default();
        cfg.diffusion = 0.0;

        advance_flux_transport(&mut one_call, 30.0 * SECONDS_PER_DAY, &cfg);
        for _ in 0..(30 * 24) {
            advance_flux_transport(&mut hourly, 3600.0, &cfg);
        }
        assert!((one_call.br.values[0] - hourly.br.values[0]).abs() < 1.0e-5);
    }

    #[test]
    fn large_timestep_stays_finite() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.active_regions.push(test_region(1, 0.0));
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut state, 48.0 * 3600.0, &cfg);
        assert!(state.br.values.iter().all(|v| v.is_finite()));
        assert!(state.br.max_abs() < 10.0);
    }

    #[test]
    fn regions_retire_after_lifetime() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.active_regions.push(test_region(1, 0.0));
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut state, 16.0 * SECONDS_PER_DAY, &cfg);
        assert!(state.active_regions.is_empty());
    }
}
