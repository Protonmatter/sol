//! WebAssembly wrapper that runs the real `solar-core` engine in the browser.
//!
//! It reuses solar-core's deterministic synthetic model, fixed-clock flux
//! transport, and the same `solar_state_snapshot_json` serializer used by the
//! CLI, so every producer emits `solar-state-snapshot.v2`.
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
/// `solar-state-snapshot.v2` JSON string.
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
    // Sanitize raw ABI numeric inputs before they reach event scheduling,
    // integration, or strict snapshot serialization.
    let dt_hours = if dt_hours.is_finite() {
        dt_hours.clamp(0.001, 8760.0)
    } else {
        1.0
    };
    let activity_index = if activity_index.is_finite() {
        activity_index.clamp(0.0, 1.0)
    } else {
        0.9
    };
    let grid = SolarGrid::new((lon_count.max(8)) as usize, (lat_count.max(4)) as usize);
    let mut state = SolarState::new(grid.clone(), SolarMode::Synthetic);
    let mut model = SyntheticSolarModel::new(SyntheticConfig {
        seed: seed as u64,
        activity_index,
        ..SyntheticConfig::default()
    });
    let cfg = FluxTransportConfig::default();

    for _ in 0..steps {
        let births = model.generate_births(state.time_seconds, dt_hours * 3600.0, &grid);
        state.active_regions.extend(births);
        advance_flux_transport(&mut state, dt_hours * 3600.0, &cfg);
    }

    solar_state_snapshot_json(
        &state,
        &SnapshotRequest::synthetic(seed as u64, steps as usize, dt_hours, activity_index),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_versioned_snapshot() {
        let json = run_simulation(42, 12, 1.0, 0.9, 72, 36);
        assert!(json.contains("\"schema_version\": \"solar-state-snapshot.v2\""));
        assert!(json.contains("\"frame\": \"heliographic_carrington\""));
        assert!(json.contains("\"space_weather_operational\": false"));
    }

    #[test]
    fn activity_index_changes_cycle_stage() {
        assert!(run_simulation(42, 12, 1.0, 0.2, 72, 36).contains("solar minimum"));
        assert!(run_simulation(42, 12, 1.0, 0.9, 72, 36).contains("solar maximum"));
    }

    #[test]
    fn nonfinite_abi_inputs_are_sanitized() {
        let json = run_simulation(42, 1, f64::NAN, f32::INFINITY, 72, 36);
        assert!(json.contains("\"dt_hours\": 1.000000"));
        assert!(json.contains("\"activity_index\": 0.900000"));
    }
}
