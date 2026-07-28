import test from "node:test";
import assert from "node:assert/strict";
import {
  DAYS_PER_YEAR, SOLAR_SPEED_MIN_DPS, SOLAR_SPEED_MAX_DPS, SOLAR_SPEED_DEFAULT_YPS,
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
