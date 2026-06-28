//! Assimilation crate placeholder.
//! Move observation schemas and source-specific correction code here in v0.3.

pub enum ObservationKind {
    SolarCycleIndex,
    ActiveRegionSummary,
    HmiContinuum,
    HmiMagnetogram,
    AiaEuv171,
    AiaEuv193,
    AiaEuv304,
    GoesXrs,
    SolarWind,
}
