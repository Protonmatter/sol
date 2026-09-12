use solar_core::{
    advance_flux_transport, ActiveRegion, ActivityUncertainty, FluxTransportConfig, Polarity,
};
use solar_core::{
    assimilate_activity, parse_json, solar_state_snapshot_json, ActivityObservation,
    SnapshotRequest, SolarCoordinates, SolarGrid, SolarMode, SolarState,
};

#[test]
fn zero_variance_zero_noise_has_zero_gain_not_a_fabricated_floor() {
    assert_eq!(
        assimilate_activity(
            0.4,
            0.0,
            &ActivityObservation {
                value: 0.9,
                variance: 0.0,
                freshness_gain: 1.0
            }
        ),
        (0.4, 0.0)
    );
}

#[test]
fn illustrative_noise_uses_elapsed_days_independent_of_partial_replay() {
    let mut once = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
    once.activity_uncertainty = ActivityUncertainty::new(0.1, 0.02).unwrap();
    let mut split = once.clone();
    advance_flux_transport(&mut once, 172800.0, &FluxTransportConfig::default());
    for dt in [123.0, 7200.0, 85477.0, 80000.0] {
        advance_flux_transport(&mut split, dt, &FluxTransportConfig::default());
    }
    assert!((once.activity_uncertainty.variance() - 0.14).abs() < 1e-14);
    assert_eq!(once.activity_uncertainty, split.activity_uncertainty);
    assert_eq!(once.br.values, split.br.values);
    assert_eq!(once.confidence.values, split.confidence.values);
    assert_eq!(once.activity_uncertainty.last_analysis_time_seconds(), None);
}

#[test]
fn scalar_analysis_anchor_and_overflow_are_explicit_without_spatial_changes() {
    let mut state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
    let br = state.br.values.clone();
    let score = state.confidence.values.clone();
    state.activity_uncertainty.record_analysis(0.005).unwrap();
    assert_eq!(state.br.values, br);
    assert_eq!(state.confidence.values, score);
    let mut uncertainty = ActivityUncertainty::new(0.1, 0.02).unwrap();
    uncertainty.forecast_to(86400.0).unwrap();
    uncertainty.record_analysis(0.03).unwrap();
    uncertainty.forecast_to(172800.0).unwrap();
    assert!((uncertainty.variance() - 0.05).abs() < 1e-14);
    assert_eq!(uncertainty.last_analysis_time_seconds(), Some(86400.0));
    let before = uncertainty.clone();
    assert!(uncertainty.forecast_to(0.0).is_err());
    assert_eq!(before, uncertainty);
    assert!(ActivityUncertainty::new(-1.0, 0.0).is_err());
    assert!(ActivityUncertainty::new(0.1, f64::INFINITY).is_err());
    let mut overflowing = ActivityUncertainty::new(0.1, f64::MAX).unwrap();
    let before = overflowing.clone();
    assert!(overflowing.forecast_to(f64::MAX).is_err());
    assert_eq!(before, overflowing);
}

#[test]
fn isolated_diffusion_disabled_bipole_centroid_stays_within_one_longitude_cell() {
    for (latitude, expected_longitude) in [(0.0, 0.0572), (-30.0, 358.635825), (60.0, 354.452825)] {
        let mut state = SolarState::new(SolarGrid::new(360, 90), SolarMode::Synthetic);
        state.active_regions.push(ActiveRegion {
            id: 1,
            birth_seconds: 0.0,
            lat_deg: latitude,
            lon_deg: 359.0,
            flux_norm: 1.0,
            area_msh: 100.0,
            tilt_deg: 0.0,
            complexity: 0.5,
            polarity: Polarity::LeadingPositive,
            confidence: 0.65,
        });
        advance_flux_transport(
            &mut state,
            172800.0,
            &FluxTransportConfig {
                diffusion: 0.0,
                decay_per_day: 0.0,
                ..FluxTransportConfig::default()
            },
        );
        let (mut x, mut y) = (0.0, 0.0);
        for lat in 0..state.grid.lat_count {
            for lon in 0..state.grid.lon_count {
                let weight = f64::from(state.br.values[state.grid.idx(lat, lon)].abs());
                let angle = f64::from(state.grid.lon_deg(lon)).to_radians();
                x += weight * angle.cos();
                y += weight * angle.sin();
            }
        }
        let measured = y.atan2(x).to_degrees().rem_euclid(360.0);
        let difference = (measured - expected_longitude + 180.0).rem_euclid(360.0) - 180.0;
        assert!(
            difference.abs() <= f64::from(state.grid.dlon_deg),
            "lat={latitude}, centroid={measured}, anchor={expected_longitude}"
        );
    }
}

#[test]
fn producer_advects_current_anchor_and_preserves_immutable_birth() {
    let mut state = SolarState::new(SolarGrid::new(72, 36), SolarMode::Synthetic);
    let region = ActiveRegion {
        id: 1,
        birth_seconds: 0.0,
        lat_deg: 0.0,
        lon_deg: 359.0,
        flux_norm: 1.0,
        area_msh: 100.0,
        tilt_deg: 0.0,
        complexity: 0.5,
        polarity: Polarity::LeadingPositive,
        confidence: 0.65,
    };
    state.active_regions.push(region.clone());
    advance_flux_transport(&mut state, 172800.0, &FluxTransportConfig::default());
    assert_eq!(state.active_regions[0], region);
    let value = parse_json(&solar_state_snapshot_json(
        &state,
        &SnapshotRequest::synthetic(42, 2, 24.0, 0.9),
    ))
    .unwrap();
    let region = &value.get("active_regions").unwrap().as_array().unwrap()[0];
    assert_eq!(
        region
            .get("birth")
            .unwrap()
            .get("lon_deg")
            .unwrap()
            .as_f64(),
        Some(359.0)
    );
    let position = region.get("model_position").unwrap();
    // At latitude 0: (14.713 - 14.1844) * 2 days + 359 = 360.0572.
    assert!((position.get("lon_deg").unwrap().as_f64().unwrap() - 0.0572).abs() < 1e-10);
    assert_eq!(
        position.get("at_time_seconds").unwrap().as_f64(),
        Some(172800.0)
    );
}

#[test]
fn unsupported_positive_carrington_rate_is_rejected() {
    let coordinates = SolarCoordinates {
        rotation_reference_deg_per_day: 15.0,
        ..SolarCoordinates::default()
    };
    assert!(std::panic::catch_unwind(|| SolarGrid::with_coordinates(8, 4, coordinates)).is_err());
    let mut state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
    state.grid.coordinates.rotation_reference_deg_per_day = 15.0;
    assert!(std::panic::catch_unwind(|| solar_state_snapshot_json(
        &state,
        &SnapshotRequest::synthetic(42, 0, 0.0, 0.9)
    ))
    .is_err());
}

#[test]
fn sub_microsecond_epoch_roundtrips_without_uncertainty_time_disagreement() {
    let mut state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
    let dt_hours = 0.123456789;
    advance_flux_transport(
        &mut state,
        dt_hours * 3600.0,
        &FluxTransportConfig::default(),
    );
    let snapshot = parse_json(&solar_state_snapshot_json(
        &state,
        &SnapshotRequest::synthetic(42, 1, dt_hours, 0.9),
    ))
    .unwrap();
    assert_eq!(
        snapshot
            .get("run")
            .unwrap()
            .get("dt_hours")
            .unwrap()
            .as_f64(),
        Some(dt_hours)
    );
    assert_eq!(
        snapshot
            .get("run")
            .unwrap()
            .get("time_seconds")
            .unwrap()
            .as_f64(),
        Some(state.time_seconds)
    );
}

#[test]
fn snapshot_exposes_scalar_illustrative_uncertainty_not_br_covariance() {
    let state = SolarState::new(SolarGrid::new(8, 4), SolarMode::Synthetic);
    let raw = solar_state_snapshot_json(&state, &SnapshotRequest::synthetic(42, 0, 0.0, 0.9));
    let snapshot = parse_json(&raw).unwrap();
    assert_eq!(
        snapshot.get("schema_version").unwrap().as_str(),
        Some("solar-state-snapshot.v3")
    );
    assert!(snapshot
        .get("fields")
        .unwrap()
        .get("br_variance_normalized")
        .is_none());
    let activity = snapshot
        .get("uncertainty")
        .unwrap()
        .get("activity")
        .unwrap();
    assert_eq!(
        activity.get("status").unwrap().as_str(),
        Some("illustrative")
    );
    assert_eq!(
        activity.get("process_noise_status").unwrap().as_str(),
        Some("disabled")
    );
}
