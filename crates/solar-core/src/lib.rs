//! CPU-reference core for the Solar Maximum Engine.
//!
//! This crate intentionally has no external dependencies so that the
//! mathematical reference model remains easy to audit and deterministic.

use std::collections::{BTreeMap, BTreeSet};

pub mod active_region;
pub mod appearance;
pub mod assimilation;
pub mod constants;
pub mod contracts;
pub mod coordinates;
pub mod differential_rotation;
pub mod field;
pub mod flux_transport;
pub mod grid;
pub mod json_read;
pub mod provenance;
pub mod synthetic;

pub use active_region::{ActiveRegion, Polarity};
pub use assimilation::{
    assimilate_activity, assimilate_scalar_field, ActivityObservation, ActivityUncertainty,
    AssimilationInput,
};
pub use contracts::{solar_state_snapshot_json, SnapshotRequest};
pub use coordinates::{
    LongitudeDirection, SolarCoordinateFrame, SolarCoordinates, SolarLatitudeType,
};
pub use field::Field2D;
pub use flux_transport::{advance_flux_transport, FluxTransportConfig};
pub use grid::SolarGrid;
pub use json_read::{parse as parse_json, JsonValue};
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
    pub activity_uncertainty: ActivityUncertainty,
    pub continuum: Field2D,
    pub confidence: Field2D,
    pub active_regions: Vec<ActiveRegion>,

    // The transport solver replays the final partial integration interval from
    // the last fixed-step checkpoint. This makes the result at a target time
    // independent of how callers partition the same interval.
    pub(crate) transport_anchor_seconds: f64,
    pub(crate) transport_anchor_br: Field2D,
    pub(crate) transport_anchor_confidence: Field2D,
    // Retain immutable source payloads even after display regions retire: a
    // partial interval may still need replay, and reused IDs must be checked.
    source_events: BTreeMap<u64, ActiveRegion>,
    consumed_source_ids: BTreeSet<u64>,
    transport_anchor_consumed_source_ids: BTreeSet<u64>,
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
            activity_uncertainty: ActivityUncertainty::default(),
            continuum: Field2D::filled(n, 1.0),
            confidence: confidence.clone(),
            active_regions: Vec::new(),
            transport_anchor_seconds: 0.0,
            transport_anchor_br: br,
            transport_anchor_confidence: confidence,
            source_events: BTreeMap::new(),
            consumed_source_ids: BTreeSet::new(),
            transport_anchor_consumed_source_ids: BTreeSet::new(),
        }
    }

    /// Rebase the deterministic transport checkpoint after an external state
    /// correction such as data assimilation. This declares that all currently
    /// registered source events at or before `time_seconds` are already
    /// represented in the corrected fields. Add newly scheduled events after
    /// calling this method; a new event exactly at the anchor is still pending.
    /// Previously unknown events before the old anchor require a rewind/rebuild.
    pub fn synchronize_transport_anchor(&mut self) {
        assert!(
            self.time_seconds.is_finite() && self.time_seconds >= self.transport_anchor_seconds
        );
        let events = self.reconciled_source_events();
        self.consumed_source_ids.extend(
            events
                .values()
                .filter(|event| event.birth_seconds <= self.time_seconds)
                .map(|event| event.id),
        );
        self.source_events = events;
        self.transport_anchor_seconds = self.time_seconds;
        self.transport_anchor_br = self.br.clone();
        self.transport_anchor_confidence = self.confidence.clone();
        self.transport_anchor_consumed_source_ids = self.consumed_source_ids.clone();
    }

    // Validate the entire batch before changing either fields or event ownership.
    fn reconciled_source_events(&self) -> BTreeMap<u64, ActiveRegion> {
        let mut events = self.source_events.clone();
        for event in &self.active_regions {
            assert!(
                event.birth_seconds.is_finite() && event.birth_seconds >= 0.0,
                "source event {} must have a finite nonnegative birth time",
                event.id
            );
            if let Some(previous) = events.get(&event.id) {
                assert!(previous == event, "source event {} has a conflicting payload; rewind/rebuild with unique immutable IDs", event.id);
            } else {
                assert!(event.birth_seconds >= self.transport_anchor_seconds,
                    "source event {} at {} precedes committed anchor {}; rewind/rebuild to include this event",
                    event.id, event.birth_seconds, self.transport_anchor_seconds);
                events.insert(event.id, event.clone());
            }
        }
        events
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
        assert!(state.source_events.is_empty());
        assert!(state.transport_anchor_consumed_source_ids.is_empty());
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
        assert!(state.transport_anchor_consumed_source_ids.is_empty());
    }
}
