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

/// Advance to `state.time_seconds + dt_seconds` on a fixed absolute integration
/// clock. The last partial interval is replayed from the most recent checkpoint,
/// so the result at a target time is independent of how a caller partitions the
/// same requested interval. Active regions are injected exactly once at their
/// event times within that deterministic schedule.
///
/// External corrections to `state.br` or `state.confidence` must be followed by
/// `SolarState::synchronize_transport_anchor()` before transport resumes.
pub fn advance_flux_transport(state: &mut SolarState, dt_seconds: f64, cfg: &FluxTransportConfig) {
    assert!(dt_seconds.is_finite() && dt_seconds >= 0.0);
    assert!(cfg.max_step_seconds.is_finite() && cfg.max_step_seconds > 0.0);
    assert!(cfg.diffusion.is_finite() && cfg.diffusion >= 0.0);
    assert!(cfg.decay_per_day.is_finite() && cfg.decay_per_day >= 0.0);
    assert!(cfg.source_sigma_deg.is_finite() && cfg.source_sigma_deg > 0.0);
    assert!(state.time_seconds.is_finite() && state.time_seconds >= 0.0);
    assert!(state.transport_anchor_seconds.is_finite());
    assert!(
        state.transport_anchor_seconds <= state.time_seconds + time_tolerance(state.time_seconds)
    );

    let target = state.time_seconds + dt_seconds;
    assert!(target.is_finite());

    // Discard the previously evaluated partial interval and replay it from the
    // last fixed-step checkpoint. This is the partition-invariance rule.
    state.time_seconds = state.transport_anchor_seconds;
    state.br = state.transport_anchor_br.clone();
    state.confidence = state.transport_anchor_confidence.clone();

    let event_cutoff = state.transport_anchor_event_cutoff_seconds;
    let mut events: Vec<ActiveRegion> = state
        .active_regions
        .iter()
        .filter(|region| {
            region.birth_seconds > event_cutoff + time_tolerance(event_cutoff)
                && region.birth_seconds < target
        })
        .cloned()
        .collect();
    events.sort_by(|left, right| {
        left.birth_seconds
            .total_cmp(&right.birth_seconds)
            .then_with(|| left.id.cmp(&right.id))
    });

    let mut event_index = 0usize;
    while state.time_seconds < target {
        let current = state.time_seconds;
        let next_boundary = next_fixed_boundary(current, cfg.max_step_seconds);
        let next_event = events
            .get(event_index)
            .map(|event| event.birth_seconds)
            .unwrap_or(f64::INFINITY);
        let segment_end = target.min(next_boundary).min(next_event);

        if segment_end > current + time_tolerance(current) {
            advance_operator_split(state, segment_end - current, cfg);
        } else {
            state.time_seconds = segment_end.max(current);
        }

        while let Some(event) = events.get(event_index) {
            if (event.birth_seconds - state.time_seconds).abs() > time_tolerance(state.time_seconds)
            {
                break;
            }
            inject_bipole(state, event, cfg.source_sigma_deg);
            event_index += 1;
        }

        if is_fixed_boundary(state.time_seconds, cfg.max_step_seconds)
            && state.time_seconds
                > state.transport_anchor_seconds + time_tolerance(state.transport_anchor_seconds)
        {
            save_transport_anchor(state);
        }

        // The only intended zero-length segment is an event exactly at the
        // current time. If no event remains there, force progress.
        let event_remains_at_current = events
            .get(event_index)
            .is_some_and(|event| (event.birth_seconds - current).abs() <= time_tolerance(current));
        if (state.time_seconds - current).abs() <= time_tolerance(current)
            && !event_remains_at_current
        {
            let forced_end = target.min(next_boundary);
            assert!(forced_end > current);
            advance_operator_split(state, forced_end - current, cfg);
            if is_fixed_boundary(state.time_seconds, cfg.max_step_seconds) {
                save_transport_anchor(state);
            }
        }
    }

    state.time_seconds = target;
    retire_regions(state);
    state.recompute_continuum_from_br();
}

fn save_transport_anchor(state: &mut SolarState) {
    state.transport_anchor_seconds = state.time_seconds;
    state.transport_anchor_br = state.br.clone();
    state.transport_anchor_confidence = state.confidence.clone();
    state.transport_anchor_event_cutoff_seconds = state.time_seconds;
}

fn time_tolerance(time_seconds: f64) -> f64 {
    if time_seconds.is_finite() {
        1.0e-9_f64.max(time_seconds.abs() * 1.0e-13)
    } else {
        0.0
    }
}

fn next_fixed_boundary(time_seconds: f64, step_seconds: f64) -> f64 {
    let index = (time_seconds / step_seconds).floor() + 1.0;
    let mut boundary = index * step_seconds;
    if boundary <= time_seconds + time_tolerance(time_seconds) {
        boundary += step_seconds;
    }
    boundary
}

fn is_fixed_boundary(time_seconds: f64, step_seconds: f64) -> bool {
    let nearest = (time_seconds / step_seconds).round() * step_seconds;
    (time_seconds - nearest).abs() <= time_tolerance(time_seconds)
}

fn advance_operator_split(state: &mut SolarState, dt_seconds: f64, cfg: &FluxTransportConfig) {
    if dt_seconds <= 0.0 {
        return;
    }
    rotate_field(state, dt_seconds);
    diffuse_field(state, dt_seconds, cfg.diffusion);
    decay_field(state, dt_seconds, cfg.decay_per_day);
    state.time_seconds += dt_seconds;
}

fn retire_regions(state: &mut SolarState) {
    let now = state.time_seconds;
    state.active_regions.retain(|region| {
        now - region.birth_seconds <= ACTIVE_REGION_LIFETIME_DAYS * SECONDS_PER_DAY
    });
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
                let center = state.br.values[grid.idx(lat_i, lon_i)];
                let west =
                    state.br.values[grid.idx(lat_i, modulo(lon_i as isize - 1, grid.lon_count))];
                let east = state.br.values[grid.idx(lat_i, lon_i + 1)];
                let south = if lat_i > 0 {
                    state.br.values[grid.idx(lat_i - 1, lon_i)]
                } else {
                    center
                };
                let north = if lat_i + 1 < grid.lat_count {
                    state.br.values[grid.idx(lat_i + 1, lon_i)]
                } else {
                    center
                };
                let laplacian = west + east + south + north - 4.0 * center;
                next.values[grid.idx(lat_i, lon_i)] = center + diffusion * dt_hours * laplacian;
            }
        }
        state.br = next;
    }
}

fn inject_bipole(state: &mut SolarState, region: &ActiveRegion, sigma_deg: f32) {
    let separation = 3.0 + 5.0 * region.complexity;
    let tilt = region.tilt_deg.to_radians();
    let dlat = 0.5 * separation * tilt.sin();
    let dlon = 0.5 * separation * tilt.cos();

    let sign = match region.polarity {
        Polarity::LeadingPositive => 1.0,
        Polarity::LeadingNegative => -1.0,
    };

    add_gaussian(
        state,
        region.lat_deg + dlat,
        region.lon_deg + dlon,
        sign * region.flux_norm,
        sigma_deg,
    );
    add_gaussian(
        state,
        region.lat_deg - dlat,
        region.lon_deg - dlon,
        -sign * region.flux_norm,
        sigma_deg,
    );
}

fn add_gaussian(state: &mut SolarState, lat_deg: f32, lon_deg: f32, amp: f32, sigma_deg: f32) {
    let grid = state.grid.clone();
    let denominator = 2.0 * sigma_deg * sigma_deg;
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
            let weight = (-(dlat * dlat + dlon * dlon) / denominator).exp();
            let index = grid.idx(lat_i, lon_i);
            state.br.values[index] += amp * weight;
            state.confidence.values[index] = state.confidence.values[index].max(0.55);
        }
    }
}

fn decay_field(state: &mut SolarState, dt_seconds: f64, decay_per_day: f32) {
    let dt_days = (dt_seconds / SECONDS_PER_DAY) as f32;
    let decay = (-decay_per_day * dt_days).exp();
    state.br.scale(decay);
    let confidence_decay = 0.999_f32.powf(dt_days);
    for confidence in &mut state.confidence.values {
        *confidence *= confidence_decay;
    }
}

fn circular_delta_deg(a: f32, b: f32) -> f32 {
    let mut delta = a - b;
    while delta > 180.0 {
        delta -= 360.0;
    }
    while delta < -180.0 {
        delta += 360.0;
    }
    delta
}

fn modulo(value: isize, length: usize) -> usize {
    let length = length as isize;
    (((value % length) + length) % length) as usize
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

    fn assert_fields_close(left: &SolarState, right: &SolarState, tolerance: f32) {
        assert_eq!(left.time_seconds, right.time_seconds);
        for (a, b) in left.br.values.iter().zip(&right.br.values) {
            assert!((a - b).abs() <= tolerance, "partition mismatch: {a} vs {b}");
        }
        for (a, b) in left.confidence.values.iter().zip(&right.confidence.values) {
            assert!(
                (a - b).abs() <= tolerance,
                "confidence mismatch: {a} vs {b}"
            );
        }
    }

    #[test]
    fn constant_field_remains_bounded() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.br.values.fill(0.5);
        state.synchronize_transport_anchor();
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
        assert!(state.br.values.iter().all(|value| value.is_finite()));
    }

    #[test]
    fn bipole_flux_is_injected_once() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.active_regions.push(test_region(1, 0.0));
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut state, 3600.0, &cfg);
        let after_birth: f32 = state.br.values.iter().map(|value| value.abs()).sum();
        advance_flux_transport(&mut state, 3600.0, &cfg);
        let after_second: f32 = state.br.values.iter().map(|value| value.abs()).sum();
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

        assert_fields_close(&one_call, &hourly, 2.0e-6);
    }

    #[test]
    fn irregular_caller_partitions_are_target_invariant() {
        let grid = SolarGrid::new(72, 36);
        let mut one_call = SolarState::new(grid.clone(), SolarMode::Synthetic);
        one_call.br.values[grid.idx(18, 12)] = 0.8;
        one_call.confidence.values[grid.idx(18, 12)] = 0.9;
        one_call.synchronize_transport_anchor();
        one_call.active_regions.push(test_region(1, 0.0));
        one_call.active_regions.push(test_region(2, 4_217.0));
        one_call.active_regions.push(test_region(3, 9_001.0));
        let mut partitioned = one_call.clone();
        let cfg = FluxTransportConfig::default();
        let total = 12_345.0;

        advance_flux_transport(&mut one_call, total, &cfg);
        for step in [137.0, 811.0, 2_652.0, 17.0, 3_600.0, 1_007.0, 4_121.0] {
            advance_flux_transport(&mut partitioned, step, &cfg);
        }

        assert_eq!(partitioned.time_seconds, total);
        assert_fields_close(&one_call, &partitioned, 2.0e-6);
    }

    #[test]
    fn exponential_decay_is_partition_invariant() {
        let grid = SolarGrid::new(72, 36);
        let mut one_call = SolarState::new(grid.clone(), SolarMode::Synthetic);
        one_call.br.values.fill(1.0);
        one_call.synchronize_transport_anchor();
        let mut hourly = one_call.clone();
        let cfg = FluxTransportConfig {
            diffusion: 0.0,
            ..FluxTransportConfig::default()
        };

        advance_flux_transport(&mut one_call, 30.0 * SECONDS_PER_DAY, &cfg);
        for _ in 0..(30 * 24) {
            advance_flux_transport(&mut hourly, 3600.0, &cfg);
        }
        assert_fields_close(&one_call, &hourly, 1.0e-5);
    }

    #[test]
    fn large_timestep_stays_finite() {
        let grid = SolarGrid::new(72, 36);
        let mut state = SolarState::new(grid, SolarMode::Synthetic);
        state.active_regions.push(test_region(1, 0.0));
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut state, 48.0 * 3600.0, &cfg);
        assert!(state.br.values.iter().all(|value| value.is_finite()));
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
