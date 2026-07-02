pub const SECONDS_PER_DAY: f64 = 86_400.0;
pub const SOLAR_RADIUS_M: f64 = 6.957e8;

/// Tuned for a visually stable reduced model. These are normalized field units,
/// not physical Gauss/Mx units in v0.1.
pub const DEFAULT_DIFFUSION: f32 = 0.012;
pub const DEFAULT_DECAY_PER_DAY: f32 = 0.015;

/// How long an active region stays in the tracked list after birth. Its injected flux
/// keeps evolving in the field afterwards; this only bounds the metadata list (display,
/// hazard, insight text) and the per-step injection scan, so long runs don't grow O(t).
pub const ACTIVE_REGION_LIFETIME_DAYS: f64 = 14.0;
