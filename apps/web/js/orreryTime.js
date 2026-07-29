// Pure time-speed mapping for the 3-D solar-system view. Kept outside orrery.js so the
// default and logarithmic slider contract can be regression-tested without a DOM/WebGL host.

export const DAYS_PER_YEAR = 365.25;
export const SOLAR_SPEED_MIN_DPS = 1 / 24;     // one simulated hour per real second
export const SOLAR_SPEED_MAX_DPS = 5 * DAYS_PER_YEAR;
export const SOLAR_SPEED_DEFAULT_YPS = SOLAR_SPEED_MIN_DPS / DAYS_PER_YEAR;
// Faster physical spin cannot be sampled faithfully at ordinary display refresh rates.
// Keep it moving in the correct direction, but cap the presentation at one visible turn
// per real second instead of freezing or alternating between frozen/unfrozen frames.
export const MAX_DISPLAY_ROTATION_TPS = 1;

const SPEED_LOG_SPAN = Math.log(SOLAR_SPEED_MAX_DPS / SOLAR_SPEED_MIN_DPS);

export function solarSpeedFromSlider(t) {
  return (SOLAR_SPEED_MIN_DPS * Math.exp(t * SPEED_LOG_SPAN)) / DAYS_PER_YEAR;
}

export function solarSliderFromSpeed(yearsPerSecond) {
  return Math.min(1, Math.max(0,
    Math.log((yearsPerSecond * DAYS_PER_YEAR) / SOLAR_SPEED_MIN_DPS) / SPEED_LOG_SPAN));
}

export function solarStepSeconds(realSeconds, yearsPerSecond) {
  return realSeconds * yearsPerSecond * DAYS_PER_YEAR * 86400;
}

export function rotationDisplayStepSeconds(realSeconds, simulatedSeconds, rotationHours) {
  if (!Number.isFinite(realSeconds) || realSeconds <= 0
      || !Number.isFinite(simulatedSeconds)
      || !Number.isFinite(rotationHours) || rotationHours === 0) return 0;
  const periodSeconds = Math.abs(rotationHours) * 3600;
  const visibleLimit = periodSeconds * MAX_DISPLAY_ROTATION_TPS * realSeconds;
  return Math.sign(simulatedSeconds) * Math.min(Math.abs(simulatedSeconds), visibleLimit);
}
