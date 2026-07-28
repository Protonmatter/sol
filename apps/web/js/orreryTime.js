// Pure time-speed mapping for the 3-D solar-system view. Kept outside orrery.js so the
// default and logarithmic slider contract can be regression-tested without a DOM/WebGL host.

export const DAYS_PER_YEAR = 365.25;
export const SOLAR_SPEED_MIN_DPS = 1 / 24;     // one simulated hour per real second
export const SOLAR_SPEED_MAX_DPS = 5 * DAYS_PER_YEAR;
export const SOLAR_SPEED_DEFAULT_YPS = SOLAR_SPEED_MIN_DPS / DAYS_PER_YEAR;

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
