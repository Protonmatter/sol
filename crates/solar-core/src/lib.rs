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
}

impl SolarState {
    pub fn new(grid: SolarGrid, mode: SolarMode) -> Self {
        let n = grid.len();
        Self {
            time_seconds: 0.0,
            mode,
            grid,
            br: Field2D::filled(n, 0.0),
            br_variance: Field2D::filled(n, 1.0),
            continuum: Field2D::filled(n, 1.0),
            confidence: Field2D::filled(n, 0.25),
            active_regions: Vec::new(),
        }
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
    }
}
