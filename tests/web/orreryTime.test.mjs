import test from "node:test";
import assert from "node:assert/strict";
import {
  DAYS_PER_YEAR, SOLAR_SPEED_MIN_DPS, SOLAR_SPEED_MAX_DPS, SOLAR_SPEED_DEFAULT_YPS,
  MAX_DISPLAY_ROTATION_TPS, rotationDisplayIsLimited, rotationDisplayStepSeconds,
  solarSpeedFromSlider, solarSliderFromSpeed, solarStepSeconds,
} from "../../apps/web/js/orreryTime.js";

test("close-up default advances one simulated hour per real second", () => {
  assert.equal(SOLAR_SPEED_MIN_DPS, 1 / 24);
  assert.equal(SOLAR_SPEED_DEFAULT_YPS * DAYS_PER_YEAR * 24, 1);
  // Earth should visibly rotate, but never make the old near-360° jump during one second.
  const earthDegreesPerRealSecond = 360.9856 * SOLAR_SPEED_DEFAULT_YPS * DAYS_PER_YEAR;
  assert.ok(earthDegreesPerRealSecond > 10 && earthDegreesPerRealSecond < 20);
});

test("simulation clock adds only the selected accelerated interval", () => {
  assert.equal(solarStepSeconds(1, SOLAR_SPEED_DEFAULT_YPS), 3600);
  assert.equal(solarStepSeconds(0.5, 1 / DAYS_PER_YEAR), 43200);
  // The old loop also re-read Date.now(), adding an unrequested real second to this result.
  assert.equal(1_000_000 + solarStepSeconds(1, SOLAR_SPEED_DEFAULT_YPS), 1_003_600);
});

test("solar speed slider maps its endpoints and round-trips logarithmically", () => {
  assert.ok(Math.abs(solarSpeedFromSlider(0) * DAYS_PER_YEAR - SOLAR_SPEED_MIN_DPS) < 1e-12);
  assert.ok(Math.abs(solarSpeedFromSlider(1) * DAYS_PER_YEAR - SOLAR_SPEED_MAX_DPS) < 1e-9);
  for (const t of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
    assert.ok(Math.abs(solarSliderFromSpeed(solarSpeedFromSlider(t)) - t) < 1e-12);
  }
  assert.equal(solarSliderFromSpeed(0), 0);
  assert.equal(solarSliderFromSpeed(Number.POSITIVE_INFINITY), 1);
});

test("high clock rates keep bodies rotating at a stable visible rate", () => {
  assert.equal(MAX_DISPLAY_ROTATION_TPS, 0.2);
  const earthPeriodSeconds = 24 * 3600;
  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05, 0.25, 1]) {
    const oneDayStep = solarStepSeconds(dt, 1 / DAYS_PER_YEAR);
    assert.equal(
      rotationDisplayStepSeconds(dt, oneDayStep, 24),
      earthPeriodSeconds * MAX_DISPLAY_ROTATION_TPS * dt,
    );
    const oneWeekStep = solarStepSeconds(dt, 7 / DAYS_PER_YEAR);
    const visible = rotationDisplayStepSeconds(dt, oneWeekStep, 24);
    assert.equal(visible, earthPeriodSeconds * MAX_DISPLAY_ROTATION_TPS * dt);
    assert.ok(visible > 0 && visible < oneWeekStep);
    // Even at a throttled 1 FPS the capped step is not a whole revolution, which
    // would reproduce the same image and make the body appear frozen.
    assert.notEqual(visible % earthPeriodSeconds, 0);
  }
});

test("rotation limiter status is independent of frame duration", () => {
  const oneDayPerSecond = 86400;
  const oneWeekPerSecond = 7 * 86400;
  for (const simulatedRate of [oneDayPerSecond, oneWeekPerSecond]) {
    const decisions = [0, 1 / 240, 1 / 120, 1 / 60, 0.05, 0.25, 1]
      .map(() => rotationDisplayIsLimited(simulatedRate, 24));
    assert.deepEqual(decisions, Array(decisions.length).fill(true));
  }
  assert.equal(rotationDisplayIsLimited(60, 24), false);
  assert.equal(rotationDisplayIsLimited(Number.NaN, 24), false);
  assert.equal(rotationDisplayIsLimited(86400, 0), false);
});

test("rotation display limiter preserves slow motion, direction, and invalid-input safety", () => {
  assert.equal(rotationDisplayStepSeconds(1 / 60, 60, 24), 60);
  assert.equal(rotationDisplayStepSeconds(1 / 60, -60, -24), -60);
  assert.equal(rotationDisplayStepSeconds(0, 60, 24), 0);
  assert.equal(rotationDisplayStepSeconds(1 / 60, Number.NaN, 24), 0);
  assert.equal(rotationDisplayStepSeconds(1 / 60, 60, 0), 0);
});
