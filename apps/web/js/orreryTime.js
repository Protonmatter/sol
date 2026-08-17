// Pure time-speed mapping for the 3-D solar-system view. Kept outside orrery.js so the
// default and logarithmic slider contract can be regression-tested without a DOM/WebGL host.

export const DAYS_PER_YEAR = 365.25;
export const SOLAR_SPEED_MIN_DPS = 1 / 24;     // one simulated hour per real second
export const SOLAR_SPEED_MAX_DPS = 5 * DAYS_PER_YEAR;
export const SOLAR_SPEED_DEFAULT_YPS = SOLAR_SPEED_MIN_DPS / DAYS_PER_YEAR;
// Faster physical spin cannot be sampled faithfully at ordinary display refresh rates.
// Keep it moving in the correct direction, but cap the presentation at one visible turn
// every five real seconds. A one-turn-per-second cap aliases to an unchanged image when a
// busy or backgrounded browser renders at roughly 1 FPS.
export const MAX_DISPLAY_ROTATION_TPS = 0.2;

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

export function rotationDisplayIsLimited(simulatedSecondsPerRealSecond, rotationHours) {
  if (!Number.isFinite(simulatedSecondsPerRealSecond)
      || !Number.isFinite(rotationHours) || rotationHours === 0) return false;
  const periodSeconds = Math.abs(rotationHours) * 3600;
  return Math.abs(simulatedSecondsPerRealSecond)
    > periodSeconds * MAX_DISPLAY_ROTATION_TPS;
}

export function rotationDisplayStepSeconds(realSeconds, simulatedSeconds, rotationHours) {
  if (!Number.isFinite(realSeconds) || realSeconds <= 0
      || !Number.isFinite(simulatedSeconds)
      || !Number.isFinite(rotationHours) || rotationHours === 0) return 0;
  const periodSeconds = Math.abs(rotationHours) * 3600;
  const visibleLimit = periodSeconds * MAX_DISPLAY_ROTATION_TPS * realSeconds;
  return Math.sign(simulatedSeconds) * Math.min(Math.abs(simulatedSeconds), visibleLimit);
}

/**
 * Is one animation frame too coarse to sample EARTH'S MOON's orbit?
 *
 * The 21 catalogued moons get this guard from moonorbits.js's aliasedByClock and are hidden
 * with a notice when the clock outruns them. Earth's Moon comes from the ELP-MPP02 engine on
 * a different path and received neither — at one simulated year per second a 60 fps frame
 * covers ~6 days, a quarter of the lunar orbit, and the drawn motion is below the Nyquist
 * rate: apparent direction of travel is unrecoverable and can read as retrograde, which is a
 * claim about the orbit that happens to be false. Same three-samples-per-revolution rule as
 * aliasedByClock; every individual position remains exact.
 */
export const MOON_SIDEREAL_DAYS = 27.321661; // sidereal month, NASA Moon fact sheet
export function elpMoonAliased(simStepSeconds) {
  if (!(simStepSeconds > 0)) return false; // paused - every position is exact
  return simStepSeconds > (MOON_SIDEREAL_DAYS * 86400) / 3;
}
