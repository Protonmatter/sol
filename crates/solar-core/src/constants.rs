pub const SECONDS_PER_HOUR: f64 = 3_600.0;
pub const SECONDS_PER_DAY: f64 = 86_400.0;
pub const SOLAR_RADIUS_M: f64 = 6.957e8;

/// IAU/WGCCRE Carrington sidereal rotation rate used by the renderer and by the
/// Carrington-coordinate transport frame. A Carrington grid is co-rotating at
/// this rate, so the transport advection is the photospheric differential rate
/// minus this reference rate rather than the full inertial angular velocity.
pub const CARRINGTON_SIDEREAL_DEG_PER_DAY: f64 = 14.1844;

/// Maximum continuous-physics integration interval. Public callers may request
/// arbitrarily long spans, but the engine always subdivides them so the result
/// is independent of the caller's partitioning and source emergence is applied
/// at its actual event time.
pub const DEFAULT_MAX_TRANSPORT_STEP_SECONDS: f64 = SECONDS_PER_HOUR;

/// Tuned for a visually stable reduced model. These are normalized field units,
/// not physical Gauss/Mx units in v0.2.
pub const DEFAULT_DIFFUSION: f32 = 0.012;
pub const DEFAULT_DECAY_PER_DAY: f32 = 0.015;

/// How long an active region stays in the tracked list after birth. Its injected flux
/// keeps evolving in the field afterwards; this only bounds the metadata list (display,
/// hazard, insight text) and the per-step injection scan, so long runs don't grow O(t).
pub const ACTIVE_REGION_LIFETIME_DAYS: f64 = 14.0;
