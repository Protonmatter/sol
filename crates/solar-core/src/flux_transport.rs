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
/// A zero duration is a no-op. A positive advance consumes a pending event at
/// the initial time and all events through the inclusive target, in time/ID
/// order. New events before the committed anchor or conflicting reused IDs
/// panic with a rewind/rebuild diagnostic before any solver state is changed.
pub fn advance_flux_transport(state: &mut SolarState, dt_seconds: f64, cfg: &FluxTransportConfig) {
    assert!(dt_seconds.is_finite() && dt_seconds >= 0.0);
    assert!(cfg.max_step_seconds.is_finite() && cfg.max_step_seconds > 0.0);
    assert!(cfg.diffusion.is_finite() && cfg.diffusion >= 0.0);
    assert!(cfg.decay_per_day.is_finite() && cfg.decay_per_day >= 0.0);
    assert!(cfg.source_sigma_deg.is_finite() && cfg.source_sigma_deg > 0.0);
    assert!(state.time_seconds.is_finite() && state.time_seconds >= 0.0);
    assert!(state.transport_anchor_seconds.is_finite());
    assert!(state.transport_anchor_seconds <= state.time_seconds);

    let target = state.time_seconds + dt_seconds;
    assert!(target.is_finite());
    if dt_seconds == 0.0 {
        return;
    }
    assert!(
        target > state.time_seconds,
        "positive transport duration must advance representable time"
    );

    let sources = state.reconciled_source_events();
    let mut uncertainty = state.activity_uncertainty.clone();
    uncertainty
        .forecast_to(target)
        .expect("valid elapsed-time scalar uncertainty forecast");

    // Discard the previously evaluated partial interval and replay it from the
    // last fixed-step checkpoint. This is the partition-invariance rule.
    state.time_seconds = state.transport_anchor_seconds;
    state.br = state.transport_anchor_br.clone();
    state.confidence = state.transport_anchor_confidence.clone();
    state.consumed_source_ids = state.transport_anchor_consumed_source_ids.clone();
    state.source_events = sources;

    let mut events: Vec<ActiveRegion> = state
        .source_events
        .values()
        .filter(|region| {
            !state.consumed_source_ids.contains(&region.id) && region.birth_seconds <= target
        })
        .cloned()
        .collect();
    events.sort_by(|left, right| {
        left.birth_seconds
            .total_cmp(&right.birth_seconds)
            .then_with(|| left.id.cmp(&right.id))
    });

    let mut event_index = 0usize;
    let mut reached_fixed_boundary = false;
    loop {
        while let Some(event) = events.get(event_index) {
            if event.birth_seconds != state.time_seconds {
                break;
            }
            inject_bipole(state, event, cfg.source_sigma_deg);
            state.consumed_source_ids.insert(event.id);
            event_index += 1;
        }

        // A boundary checkpoint owns its endpoint sources as well as its fields.
        if reached_fixed_boundary {
            save_transport_anchor(state);
        }
        if state.time_seconds == target {
            break;
        }
        let current = state.time_seconds;
        let next_boundary = next_fixed_boundary(current, cfg.max_step_seconds);
        let next_event = events
            .get(event_index)
            .map(|event| event.birth_seconds)
            .unwrap_or(f64::INFINITY);
        let segment_end = target.min(next_boundary).min(next_event);
        assert!(
            segment_end > current,
            "transport schedule must advance to its next event or boundary"
        );
        advance_operator_split(state, segment_end - current, cfg);
        // Preserve the selected event/clock value exactly; do not recompute it
        // by floating-point addition, or merge nearby events with a tolerance.
        state.time_seconds = segment_end;
        reached_fixed_boundary = segment_end == next_boundary;
    }

    state.time_seconds = target;
    state.activity_uncertainty = uncertainty;
    retire_regions(state);
    state.recompute_continuum_from_br();
}

fn save_transport_anchor(state: &mut SolarState) {
    state.transport_anchor_seconds = state.time_seconds;
    state.transport_anchor_br = state.br.clone();
    state.transport_anchor_confidence = state.confidence.clone();
    state.transport_anchor_consumed_source_ids = state.consumed_source_ids.clone();
}

fn next_fixed_boundary(time_seconds: f64, step_seconds: f64) -> f64 {
    let index = (time_seconds / step_seconds).floor();
    // Division can round a time just below a boundary up to the integer index,
    // or a boundary down to the previous index. Compare the neighboring clock
    // products directly, always computing k * step rather than adding a step
    // to an already rounded boundary.
    [index, index + 1.0, index + 2.0]
        .into_iter()
        .map(|candidate| candidate * step_seconds)
        .find(|boundary| *boundary > time_seconds)
        .expect("fixed transport clock cannot advance at this time resolution")
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
    state.active_regions = state
        .source_events
        .values()
        .filter(|region| {
            now - region.birth_seconds <= ACTIVE_REGION_LIFETIME_DAYS * SECONDS_PER_DAY
        })
        .cloned()
        .collect();
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
        for (a, b) in left.continuum.values.iter().zip(&right.continuum.values) {
            assert!((a - b).abs() <= tolerance, "continuum mismatch: {a} vs {b}");
        }
        assert_eq!(left.active_regions, right.active_regions);
        assert_eq!(left.source_events, right.source_events);
        assert_eq!(left.consumed_source_ids, right.consumed_source_ids);
        assert_eq!(
            left.transport_anchor_consumed_source_ids,
            right.transport_anchor_consumed_source_ids
        );
    }

    fn event_state(births: &[(u64, f64)]) -> SolarState {
        let mut state = SolarState::new(SolarGrid::new(72, 36), SolarMode::Synthetic);
        state.active_regions = births
            .iter()
            .map(|&(id, time)| test_region(id, time))
            .collect();
        state
    }

    #[test]
    fn boundary_birth_at_3600_survives_one_and_two_calls_to_7200() {
        let mut one = event_state(&[(1, 3600.0)]);
        let mut two = one.clone();
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut one, 7200.0, &cfg);
        advance_flux_transport(&mut two, 3600.0, &cfg);
        advance_flux_transport(&mut two, 3600.0, &cfg);
        assert!(one.br.max_abs() > 0.1);
        assert!(two.br.max_abs() > 0.1, "the boundary source was lost");
        assert_fields_close(&one, &two, 0.0);
    }

    #[test]
    fn time_zero_birth_does_not_skip_birth_at_1800() {
        let mut both = event_state(&[(1, 0.0), (2, 1800.0)]);
        let mut initial_only = event_state(&[(1, 0.0)]);
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut both, 7200.0, &cfg);
        advance_flux_transport(&mut initial_only, 7200.0, &cfg);
        let difference = both
            .br
            .values
            .iter()
            .zip(&initial_only.br.values)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0_f32, f32::max);
        assert!(
            difference > 0.1,
            "second source had no material field effect: {difference}"
        );
    }

    #[test]
    fn target_birth_is_present_before_snapshot_publication() {
        for target in [1800.0, 3600.0, 7200.0] {
            let mut state = event_state(&[(1, target)]);
            advance_flux_transport(&mut state, target, &FluxTransportConfig::default());
            assert!(
                state.br.max_abs() > 0.1,
                "missing source at target {target}"
            );
            assert!(state.continuum.values.iter().any(|value| *value != 1.0));
            assert!(state.confidence.values.iter().any(|value| *value >= 0.55));
        }
    }

    #[test]
    fn tiny_positive_intervals_cannot_skip_an_event() {
        let cfg = FluxTransportConfig::default();
        let mut one = event_state(&[(1, 0.0), (2, 1.0e-12)]);
        let mut parts = one.clone();
        let mut initial_only = event_state(&[(1, 0.0)]);
        advance_flux_transport(&mut one, 2.0e-12, &cfg);
        advance_flux_transport(&mut parts, 1.0e-12, &cfg);
        advance_flux_transport(&mut parts, 1.0e-12, &cfg);
        advance_flux_transport(&mut initial_only, 2.0e-12, &cfg);
        assert!(one.br.max_abs() > initial_only.br.max_abs() * 1.5);
        assert_fields_close(&one, &parts, 0.0);
    }

    #[test]
    fn zero_duration_changes_neither_fields_nor_event_state() {
        let mut state = event_state(&[(1, 0.0)]);
        // A no-op must also preserve an externally corrected, unre-based field.
        state.br.values[0] = 0.9;
        let before = format!("{state:?}");
        advance_flux_transport(&mut state, 0.0, &FluxTransportConfig::default());
        assert!(
            format!("{state:?}") == before,
            "zero duration mutated state"
        );
    }

    #[test]
    fn simultaneous_events_have_stable_id_order_in_fields_and_snapshot() {
        let mut sorted = event_state(&[(1, 0.0), (2, 0.0), (3, 1800.0)]);
        sorted.active_regions[0].flux_norm = 1.0e8;
        sorted.active_regions[1].flux_norm = 1.0e8;
        sorted.active_regions[1].polarity = Polarity::LeadingNegative;
        let mut reversed = sorted.clone();
        reversed.active_regions.reverse();
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut sorted, 7200.0, &cfg);
        advance_flux_transport(&mut reversed, 7200.0, &cfg);
        assert_fields_close(&sorted, &reversed, 0.0);
        let request = crate::SnapshotRequest::synthetic(42, 2, 1.0, 0.9);
        assert!(
            crate::solar_state_snapshot_json(&sorted, &request)
                == crate::solar_state_snapshot_json(&reversed, &request),
            "snapshot bytes depend on ID insertion order"
        );
    }

    #[test]
    fn repeated_identical_id_is_idempotent() {
        let mut once = event_state(&[(1, 0.0)]);
        let mut twice = event_state(&[(1, 0.0), (1, 0.0)]);
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut once, 7200.0, &cfg);
        advance_flux_transport(&mut twice, 7200.0, &cfg);
        assert_fields_close(&once, &twice, 0.0);
        assert_eq!(twice.active_regions.len(), 1);
    }

    #[test]
    #[should_panic(expected = "conflicting payload")]
    fn duplicate_id_with_conflicting_payload_is_rejected() {
        let mut state = event_state(&[(1, 0.0), (1, 1800.0)]);
        advance_flux_transport(&mut state, 7200.0, &FluxTransportConfig::default());
    }

    #[test]
    fn event_before_committed_anchor_is_rejected_without_mutation() {
        let mut state = event_state(&[(1, 0.0)]);
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut state, 7200.0, &cfg);
        state.active_regions.push(test_region(2, 1800.0));
        let before = format!("{state:?}");
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            advance_flux_transport(&mut state, 3600.0, &cfg);
        }))
        .expect_err("past event must require rewind/rebuild");
        let message = error
            .downcast_ref::<String>()
            .map(String::as_str)
            .or_else(|| error.downcast_ref::<&str>().copied())
            .unwrap_or("");
        assert!(message.contains("rewind/rebuild"), "{message}");
        assert!(format!("{state:?}") == before, "rejection mutated state");
    }

    #[test]
    fn new_event_inside_partial_interval_replays_from_anchor() {
        let mut expected = event_state(&[(1, 0.0), (2, 1000.0)]);
        let mut late = event_state(&[(1, 0.0)]);
        let cfg = FluxTransportConfig::default();
        advance_flux_transport(&mut expected, 4000.0, &cfg);
        advance_flux_transport(&mut late, 2000.0, &cfg);
        late.active_regions.push(test_region(2, 1000.0));
        advance_flux_transport(&mut late, 2000.0, &cfg);
        assert!(expected.br.max_abs() > 0.1);
        assert_fields_close(&expected, &late, 0.0);
    }

    #[test]
    fn rebase_retains_consumed_events_and_accepts_new_event_at_anchor() {
        let cfg = FluxTransportConfig::default();
        let mut state = event_state(&[(1, 0.0)]);
        advance_flux_transport(&mut state, 1800.0, &cfg);
        state.br.values.fill(0.0);
        state.confidence.values.fill(0.8);
        state.synchronize_transport_anchor();
        let mut no_new_event = state.clone();
        state.active_regions.push(test_region(2, 1800.0));
        advance_flux_transport(&mut state, 1800.0, &cfg);
        advance_flux_transport(&mut no_new_event, 1800.0, &cfg);
        assert!(state.br.max_abs() > 0.1);
        assert_eq!(
            no_new_event.br.max_abs(),
            0.0,
            "rebased source was reinjected"
        );
        assert!(state.confidence.values.iter().all(|value| *value > 0.79));
    }

    #[test]
    fn retiring_display_region_does_not_delete_partial_replay_source() {
        let cfg = FluxTransportConfig {
            max_step_seconds: 40.0 * SECONDS_PER_DAY,
            diffusion: 0.0,
            ..FluxTransportConfig::default()
        };
        let mut one = event_state(&[(1, 0.0)]);
        let mut parts = one.clone();
        advance_flux_transport(&mut one, 17.0 * SECONDS_PER_DAY, &cfg);
        advance_flux_transport(&mut parts, 16.0 * SECONDS_PER_DAY, &cfg);
        assert!(parts.active_regions.is_empty());
        advance_flux_transport(&mut parts, SECONDS_PER_DAY, &cfg);
        assert!(one.br.max_abs() > 0.01);
        assert_fields_close(&one, &parts, 0.0);
    }

    #[test]
    fn multiple_irregular_partitions_preserve_fields_ledger_and_canonical_bytes() {
        let cfg = FluxTransportConfig::default();
        let initial = event_state(&[
            (5, 7200.0),
            (2, 1800.0),
            (1, 0.0),
            (4, 3600.0),
            (3, 3600.0),
            (6, 9001.0),
            (7, 12345.0),
        ]);
        let mut one = initial.clone();
        advance_flux_transport(&mut one, 12345.0, &cfg);
        let request = crate::SnapshotRequest::synthetic(42, 1, 12345.0 / 3600.0, 0.9);
        let canonical = crate::solar_state_snapshot_json(&one, &request);
        for endpoints in [
            vec![137.0, 948.0, 3600.0, 3617.0, 7217.0, 8224.0, 12345.0],
            vec![1800.0, 3600.0, 7200.0, 9001.0, 12345.0],
            vec![
                1.0e-12,
                1799.9999999999,
                1800.0,
                3599.9999999999,
                3600.0,
                3600.0000000001,
                9000.9999999999,
                9001.0,
                12345.0,
            ],
        ] {
            let mut parts = initial.clone();
            for endpoint in endpoints {
                let dt = endpoint - parts.time_seconds;
                advance_flux_transport(&mut parts, dt, &cfg);
            }
            assert_fields_close(&one, &parts, 0.0);
            assert!(
                canonical == crate::solar_state_snapshot_json(&parts, &request),
                "canonical serialized bytes must be equal with identical request metadata"
            );
        }
        assert_eq!(
            one.consumed_source_ids.iter().copied().collect::<Vec<_>>(),
            vec![1, 2, 3, 4, 5, 6, 7]
        );
    }

    #[test]
    #[should_panic(expected = "conflicting payload")]
    fn already_consumed_id_cannot_be_reused_with_changed_payload() {
        let cfg = FluxTransportConfig::default();
        let mut state = event_state(&[(1, 0.0)]);
        advance_flux_transport(&mut state, 7200.0, &cfg);
        state.active_regions[0].flux_norm = 2.0;
        advance_flux_transport(&mut state, 3600.0, &cfg);
    }

    #[test]
    #[should_panic(expected = "rewind/rebuild")]
    fn rebase_cannot_silently_acknowledge_unknown_event_before_old_anchor() {
        let cfg = FluxTransportConfig::default();
        let mut state = event_state(&[(1, 0.0)]);
        advance_flux_transport(&mut state, 7200.0, &cfg);
        state.active_regions.push(test_region(2, 1800.0));
        state.synchronize_transport_anchor();
    }

    #[test]
    fn rebase_of_partial_interval_replays_correction_without_reinjecting_sources() {
        let cfg = FluxTransportConfig::default();
        let mut one = event_state(&[(1, 0.0), (2, 1800.0), (3, 4100.0)]);
        advance_flux_transport(&mut one, 2000.0, &cfg);
        one.br.values.fill(0.0);
        one.confidence.values.fill(0.8);
        one.synchronize_transport_anchor();
        let mut parts = one.clone();
        advance_flux_transport(&mut one, 5200.0, &cfg);
        for endpoint in [2017.0, 3600.0, 4100.0, 4500.0, 7200.0] {
            let dt = endpoint - parts.time_seconds;
            advance_flux_transport(&mut parts, dt, &cfg);
        }
        assert_fields_close(&one, &parts, 0.0);
        assert!(one.br.max_abs() > 0.1);
        let mut source_only = event_state(&[(3, 4100.0)]);
        source_only.time_seconds = 2000.0;
        source_only.confidence.values.fill(0.8);
        source_only.synchronize_transport_anchor();
        advance_flux_transport(&mut source_only, 5200.0, &cfg);
        assert_eq!(one.br.values, source_only.br.values);
    }

    #[test]
    fn fractional_clock_does_not_skip_boundary_after_nearby_event() {
        let cfg = FluxTransportConfig {
            max_step_seconds: 0.1,
            ..FluxTransportConfig::default()
        };
        let mut state = event_state(&[(1, 1.7)]);
        // 17 * 0.1 is the next fixed-clock value above the event's f64 time.
        let target = 1.7000000000000002;
        advance_flux_transport(&mut state, target, &cfg);
        assert_eq!(
            state.transport_anchor_seconds, target,
            "an event one ULP before the fixed boundary must not skip checkpoint commit"
        );
        assert_eq!(
            state
                .transport_anchor_consumed_source_ids
                .iter()
                .copied()
                .collect::<Vec<_>>(),
            vec![1]
        );
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
