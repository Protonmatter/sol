//! CPU-reference core for the Solar Maximum Engine.
//!
//! This crate intentionally has no external dependencies so that the
//! mathematical reference model remains easy to audit and deterministic.

pub mod active_region;
pub mod assimilation;
pub mod constants;
pub mod contracts;
pub mod coordinates;
pub mod differential_rotation;
pub mod field;
pub mod flux_transport;
pub mod grid;
pub mod synthetic;

pub use active_region::{ActiveRegion, Polarity};
pub use assimilation::{assimilate_scalar_field, AssimilationInput};
pub use contracts::{solar_state_snapshot_json, SnapshotRequest};
pub use coordinates::{
    LongitudeDirection, SolarCoordinateFrame, SolarCoordinates, SolarLatitudeType,
};
pub use field::Field2D;
pub use flux_transport::{advance_flux_transport, FluxTransportConfig};
pub use grid::SolarGrid;
pub use synthetic::{SyntheticConfig, SyntheticSolarModel};

#[derive(Clone, Debug)]
pub enum SolarMode {
    Synthetic,
    Assimilation,
    DegradedSyntheticFallback,
}

#[derive(Clone, Debug)]
pub struct SolarState {
    pub time_seconds: f64,
    pub mode: SolarMode,
    pub grid: SolarGrid,
    pub br: Field2D,
    pub br_variance: Field2D,
    pub continuum: Field2D,
    pub confidence: Field2D,
    pub active_regions: Vec<ActiveRegion>,

    // The transport solver replays the final partial integration interval from
    // the last fixed-step checkpoint. This makes the result at a target time
    // independent of how callers partition the same interval.
    pub(crate) transport_anchor_seconds: f64,
    pub(crate) transport_anchor_br: Field2D,
    pub(crate) transport_anchor_confidence: Field2D,
    // Every source event at or before this cutoff is already represented by the
    // checkpoint fields. The initial value is negative infinity because a new
    // state has not yet injected events scheduled at t=0.
    pub(crate) transport_anchor_event_cutoff_seconds: f64,
}

impl SolarState {
    pub fn new(grid: SolarGrid, mode: SolarMode) -> Self {
        let n = grid.len();
        let br = Field2D::filled(n, 0.0);
        let confidence = Field2D::filled(n, 0.25);
        Self {
            time_seconds: 0.0,
            mode,
            grid,
            br: br.clone(),
            br_variance: Field2D::filled(n, 1.0),
            continuum: Field2D::filled(n, 1.0),
            confidence: confidence.clone(),
            active_regions: Vec::new(),
            transport_anchor_seconds: 0.0,
            transport_anchor_br: br,
            transport_anchor_confidence: confidence,
            transport_anchor_event_cutoff_seconds: f64::NEG_INFINITY,
        }
    }

    /// Rebase the deterministic transport checkpoint after an external state
    /// correction such as data assimilation. This declares that all source
    /// events at or before `time_seconds` are already represented in the
    /// corrected fields. Add newly scheduled events after calling this method.
    pub fn synchronize_transport_anchor(&mut self) {
        self.transport_anchor_seconds = self.time_seconds;
        self.transport_anchor_br = self.br.clone();
        self.transport_anchor_confidence = self.confidence.clone();
        self.transport_anchor_event_cutoff_seconds = self.time_seconds;
    }

    pub fn recompute_continuum_from_br(&mut self) {
        for i in 0..self.br.values.len() {
            let b = self.br.values[i].abs();
            let spot = smoothstep(0.30, 1.00, b);
            let facula = smoothstep(0.08, 0.35, b) * 0.08;
            self.continuum.values[i] = (1.0 - 0.72 * spot + facula).clamp(0.05, 1.25);
        }
    }
}

pub fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_initializes_with_expected_lengths() {
        let grid = SolarGrid::new(72, 36);
        let state = SolarState::new(grid.clone(), SolarMode::Synthetic);
        assert_eq!(state.br.values.len(), grid.len());
        assert_eq!(state.continuum.values.len(), grid.len());
        assert_eq!(state.transport_anchor_br.values.len(), grid.len());
        assert!(state.transport_anchor_event_cutoff_seconds.is_infinite());
        assert!(state
            .transport_anchor_event_cutoff_seconds
            .is_sign_negative());
    }

    #[test]
    fn external_correction_can_rebase_transport_checkpoint() {
        let grid = SolarGrid::new(8, 4);
        let mut state = SolarState::new(grid, SolarMode::Assimilation);
        state.time_seconds = 123.0;
        state.br.values.fill(0.75);
        state.confidence.values.fill(0.9);
        state.synchronize_transport_anchor();
        assert_eq!(state.transport_anchor_seconds, 123.0);
        assert_eq!(state.transport_anchor_br.values[0], 0.75);
        assert_eq!(state.transport_anchor_confidence.values[0], 0.9);
        assert_eq!(state.transport_anchor_event_cutoff_seconds, 123.0);
    }
}
