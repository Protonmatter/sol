//! WebAssembly wrapper that runs the real `solar-core` engine in the browser.
//!
//! It reuses solar-core's deterministic synthetic model, fixed-clock flux
//! transport, and the same `solar_state_snapshot_json` serializer used by the
//! CLI, so every producer emits `solar-state-snapshot.v3`.
//!
//! ABI: no wasm-bindgen. `simulate` returns a pointer into WASM linear memory and
//! `result_len` returns the byte length; JS reads `memory.buffer[ptr..ptr+len]`
//! and decodes UTF-8. The buffer stays valid until the next `simulate` call.

use solar_core::{
    advance_flux_transport, solar_state_snapshot_json, FluxTransportConfig, SnapshotRequest,
    SolarGrid, SolarMode, SolarState, SyntheticConfig, SyntheticSolarModel,
};
use std::cell::RefCell;

thread_local! {
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Run a deterministic synthetic simulation and stash a
/// `solar-state-snapshot.v3` JSON string, or a typed engine-error.v1 on rejected input.
#[no_mangle]
pub extern "C" fn simulate(
    seed: u32,
    steps: u32,
    dt_hours: f64,
    activity_index: f32,
    lon_count: u32,
    lat_count: u32,
) -> *const u8 {
    let json = run_simulation(seed, steps, dt_hours, activity_index, lon_count, lat_count);
    RESULT.with(|cell| {
        *cell.borrow_mut() = json.into_bytes();
        cell.borrow().as_ptr()
    })
}

/// Byte length of the most recent `simulate` result.
#[no_mangle]
pub extern "C" fn result_len() -> usize {
    RESULT.with(|cell| cell.borrow().len())
}

fn run_simulation(
    seed: u32,
    steps: u32,
    dt_hours: f64,
    activity_index: f32,
    lon_count: u32,
    lat_count: u32,
) -> String {
    if let Err(code) = validate_request(steps, dt_hours, activity_index, lon_count, lat_count) {
        return error_json(code);
    }
    let lon_count = lon_count as usize;
    let lat_count = lat_count as usize;
    let grid = SolarGrid::new(lon_count, lat_count);
    let mut state = SolarState::new(grid.clone(), SolarMode::Synthetic);
    let mut model = SyntheticSolarModel::new(SyntheticConfig {
        seed: seed as u64,
        activity_index,
        ..SyntheticConfig::default()
    });
    let cfg = FluxTransportConfig::default();

    let mut work = 0_u64;
    for _ in 0..steps {
        let births = model.generate_births(state.time_seconds, dt_hours * 3600.0, &grid);
        // Upper-bound fixed steps, partial-anchor replay, and source injections.
        // No partly evaluated scientific snapshot is returned if runtime work exceeds
        // the admission estimate. The browser additionally enforces a wall deadline.
        work += (lon_count * lat_count) as u64
            * ((dt_hours.ceil() as u64 + 1)
                + 2 * (state.active_regions.len() + births.len()) as u64);
        if work > MAX_CELL_STEPS {
            return error_json("capacity");
        }
        state.active_regions.extend(births);
        advance_flux_transport(&mut state, dt_hours * 3600.0, &cfg);
    }

    solar_state_snapshot_json(
        &state,
        &SnapshotRequest::synthetic(seed as u64, steps as usize, dt_hours, activity_index),
    )
}

const MAX_CELL_STEPS: u64 = 10_000_000;

fn validate_request(
    steps: u32,
    dt_hours: f64,
    activity: f32,
    lon: u32,
    lat: u32,
) -> Result<(), &'static str> {
    if !dt_hours.is_finite()
        || !(0.001..=336.0).contains(&dt_hours)
        || !activity.is_finite()
        || !(0.0..=1.0).contains(&activity)
        || !(8..=128).contains(&lon)
        || !(4..=64).contains(&lat)
    {
        return Err("invalid_request");
    }
    let cost = u64::from(lon) * u64::from(lat) * u64::from(steps) * (dt_hours.ceil() as u64 + 1);
    if f64::from(steps) * dt_hours > 336.0 || cost > MAX_CELL_STEPS {
        return Err("capacity");
    }
    Ok(())
}

fn error_json(code: &str) -> String {
    // Codes are private static strings, never interpolated caller content.
    format!("{{\"schema_version\":\"engine-error.v1\",\"error\":{{\"code\":\"{code}\",\"message\":\"Solar request is outside the finite grid, duration, activity or work limits\"}}}}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_request_returns_typed_error_instead_of_clamping() {
        let json = run_simulation(42, 1, f64::NAN, 0.9, 72, 36);
        assert!(json.contains("\"code\":\"invalid_request\""));
        let oversized = run_simulation(42, 1, 1.0, 0.9, 129, 64);
        assert!(oversized.contains("\"code\":\"invalid_request\""));
        let capacity = run_simulation(42, 626, 0.001, 0.9, 125, 64);
        assert!(capacity.contains("\"code\":\"capacity\""));
    }

    #[test]
    fn produces_versioned_snapshot() {
        let json = run_simulation(42, 12, 1.0, 0.9, 72, 36);
        assert!(json.contains("\"schema_version\": \"solar-state-snapshot.v3\""));
        assert!(json.contains("\"frame\": \"heliographic_carrington\""));
        assert!(json.contains("\"space_weather_operational\": false"));
    }

    #[test]
    fn exported_abi_stores_a_stable_result_buffer_and_length() {
        let pointer = simulate(7, 0, 1.0, 0.5, 8, 4);
        assert!(!pointer.is_null());
        let len = result_len();
        assert!(len > 100);
        RESULT.with(|cell| {
            let bytes = cell.borrow();
            assert_eq!(pointer, bytes.as_ptr());
            assert_eq!(len, bytes.len());
            assert!(std::str::from_utf8(&bytes)
                .unwrap()
                .contains("\"schema_version\": \"solar-state-snapshot.v3\""));
        });
    }

    #[test]
    fn activity_index_changes_cycle_stage() {
        assert!(run_simulation(42, 12, 1.0, 0.2, 72, 36).contains("solar minimum"));
        assert!(run_simulation(42, 12, 1.0, 0.9, 72, 36).contains("solar maximum"));
    }

    #[test]
    fn nonfinite_abi_inputs_are_rejected() {
        let json = run_simulation(42, 1, f64::NAN, f32::INFINITY, 72, 36);
        assert!(json.contains("\"code\":\"invalid_request\""));
    }

    #[test]
    fn invalid_abi_sizes_are_rejected_before_allocation() {
        let json = run_simulation(42, 1, 1.0, 0.9, u32::MAX, u32::MAX);
        assert!(json.contains("\"code\":\"invalid_request\""));
    }

    #[test]
    fn invalid_step_count_terminates_promptly() {
        let json = run_simulation(42, u32::MAX, 1.0, 0.2, 8, 4);
        assert!(json.contains("\"code\":\"capacity\""));
    }

    #[test]
    fn admission_neighbors_cover_dimension_duration_and_exact_work_boundary() {
        for lon in [127, 128] {
            assert_eq!(validate_request(1, 1.0, 0.5, lon, 64), Ok(()));
        }
        assert_eq!(
            validate_request(1, 1.0, 0.5, 129, 64),
            Err("invalid_request")
        );
        for steps in [624, 625] {
            assert_eq!(validate_request(steps, 0.001, 0.0, 125, 64), Ok(()));
        }
        assert_eq!(validate_request(626, 0.001, 0.0, 125, 64), Err("capacity"));
        assert_eq!(validate_request(1, 336.0, 0.0, 8, 4), Ok(()));
        assert_eq!(validate_request(2, 168.001, 0.0, 8, 4), Err("capacity"));
        assert_eq!(validate_request(0, 0.001, 0.0, 8, 4), Ok(()));
    }
}

thread_local! { static APPEARANCE_RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) }; }
/// Additive ABI. Recipe 0 quiet-v1, 1 active-v1; LOD 0..2; time 0..21600 SI seconds.
#[no_mangle]
pub extern "C" fn appearance_abi_version() -> u32 {
    1
}
/// Pointer remains valid until next appearance call; independent of simulate buffer.
#[no_mangle]
pub extern "C" fn appearance_eval_v1(
    seed: u32,
    time_s: f64,
    recipe_id: u32,
    lod: u32,
) -> *const u8 {
    let json = solar_core::appearance::sample_packet(seed, time_s, recipe_id, lod, false)
        .unwrap_or_else(|code| {
            format!(r#"{{"schema_version":"appearance-error.v1","error":{{"code":"{code}"}}}}"#)
        });
    APPEARANCE_RESULT.with(|cell| {
        *cell.borrow_mut() = json.into_bytes();
        cell.borrow().as_ptr()
    })
}
#[no_mangle]
pub extern "C" fn appearance_result_len_v1() -> usize {
    APPEARANCE_RESULT.with(|cell| cell.borrow().len())
}
#[cfg(test)]
mod appearance_tests {
    use super::*;
    #[test]
    fn independent_abi_buffers_and_rejection() {
        let engine = simulate(42, 0, 1.0, 0.5, 8, 4);
        let length = result_len();
        let ptr = appearance_eval_v1(42, 100.0, 1, 0);
        assert!(!ptr.is_null());
        assert!(appearance_result_len_v1() < 1048576);
        assert_eq!(result_len(), length);
        RESULT.with(|c| assert_eq!(c.borrow().as_ptr(), engine));
        appearance_eval_v1(0, f64::NAN, 0, 0);
        APPEARANCE_RESULT.with(|c| {
            assert!(std::str::from_utf8(&c.borrow())
                .unwrap()
                .contains("appearance-error.v1"))
        });
    }
}
