use crate::Field2D;

#[derive(Clone, Debug)]
pub struct AssimilationInput {
    pub observation: Field2D,
    pub observation_variance: Field2D,
    pub forecast_variance: Field2D,
    pub freshness_gain: f32,
}

/// Diagonal Kalman-style correction for scalar fields.
///
/// K_i = P_f / (P_f + R)
/// g_i = freshness * K_i          (the gain actually applied)
/// x_a = x_f + g_i * (y - x_f)
/// P_a = (1 - g_i) * P_f
///
/// The analysis variance uses the *effective* gain: when freshness damps the increment,
/// claiming the full (1 − K)·P_f reduction would make the analysis overconfident about an
/// update it only partially applied.
///
/// Returns an actionable error when observation or either variance vector has a
/// different length from the forecast, any value is nonfinite, a variance is
/// negative, or freshness is nonfinite. No partial analysis is returned on error.
pub fn assimilate_scalar_field(
    forecast: &Field2D,
    input: &AssimilationInput,
) -> Result<(Field2D, Field2D), String> {
    for (name, field, is_variance) in [
        ("forecast", forecast, false),
        ("observation", &input.observation, false),
        ("observation_variance", &input.observation_variance, true),
        ("forecast_variance", &input.forecast_variance, true),
    ] {
        if field.values.len() != forecast.values.len() {
            return Err(format!(
                "{name} length {} must equal forecast length {}",
                field.values.len(),
                forecast.values.len()
            ));
        }
        if field
            .values
            .iter()
            .any(|v| !v.is_finite() || (is_variance && *v < 0.0))
        {
            return Err(format!(
                "{name} values must be finite{}",
                if is_variance { " and nonnegative" } else { "" }
            ));
        }
    }
    if !input.freshness_gain.is_finite() || !(0.0..=1.0).contains(&input.freshness_gain) {
        return Err("freshness_gain must be finite and in [0,1]".into());
    }
    let mut analysis = forecast.clone();
    let mut variance = input.forecast_variance.clone();
    let freshness = input.freshness_gain.clamp(0.0, 1.0);

    for i in 0..forecast.values.len() {
        let pf = input.forecast_variance.values[i];
        let r = input.observation_variance.values[i];
        // f64 intermediates prevent finite f32 endpoints overflowing a residual/sum.
        let denominator = f64::from(pf) + f64::from(r);
        let gain = if denominator == 0.0 {
            0.0
        } else {
            f64::from(freshness) * f64::from(pf) / denominator
        };
        analysis.values[i] = ((1.0 - gain) * f64::from(forecast.values[i])
            + gain * f64::from(input.observation.values[i])) as f32;
        variance.values[i] = ((1.0 - gain) * f64::from(pf)) as f32;
    }

    Ok((analysis, variance))
}

/// One observed scalar for the activity-index assimilation path (ADR 0005 v1 scope:
/// the observation operator corrects the model's scalar activity, never the Br grid —
/// painting spatial structure from a scalar would fabricate what was not observed).
#[derive(Clone, Copy, Debug)]
pub struct ActivityObservation {
    /// Observed activity proxy in [0, 1] (the pipeline's `observed_context.activity_index`).
    pub value: f32,
    /// Observation-error variance R.
    pub variance: f32,
    /// Freshness damping in [0, 1]; 0 makes the update the identity.
    pub freshness_gain: f32,
}

/// Scalar activity assimilation through the SAME tested primitive as the field path —
/// a 1-cell field — so the equations in the README are literally the code that runs.
/// Returns (analysis_activity, analysis_variance).
pub fn assimilate_activity(
    forecast_activity: f32,
    forecast_variance: f32,
    obs: &ActivityObservation,
) -> (f32, f32) {
    let forecast = Field2D::filled(1, forecast_activity);
    let input = AssimilationInput {
        observation: Field2D::filled(1, obs.value.clamp(0.0, 1.0)),
        observation_variance: Field2D::filled(1, obs.variance),
        forecast_variance: Field2D::filled(1, forecast_variance),
        freshness_gain: obs.freshness_gain,
    };
    // Preserve this legacy scalar convenience API. Invalid input cannot yield an
    // observation update; return the unchanged prior. Call the fallible field API
    // when validating external input and diagnostics are required.
    let Ok((analysis, variance)) = assimilate_scalar_field(&forecast, &input) else {
        return (forecast_activity, forecast_variance);
    };
    (analysis.values[0].clamp(0.0, 1.0), variance.values[0])
}

/// Scalar illustrative uncertainty, independent of the magnetic grid and its
/// heuristic score. Forecasts are evaluated from one analysis anchor, so caller
/// partitioning and transport partial-interval replays do not compound noise.
#[derive(Clone, Debug, PartialEq)]
pub struct ActivityUncertainty {
    anchor_variance: f64,
    anchor_time_seconds: f64,
    variance: f64,
    at_time_seconds: f64,
    last_analysis_time_seconds: Option<f64>,
    process_noise_per_day: f64,
}

impl Default for ActivityUncertainty {
    fn default() -> Self {
        Self::new(0.04, 0.0).expect("finite illustrative prior")
    }
}

impl ActivityUncertainty {
    pub fn new(variance: f64, process_noise_per_day: f64) -> Result<Self, String> {
        if [variance, process_noise_per_day]
            .iter()
            .any(|v| !v.is_finite() || *v < 0.0)
        {
            return Err(
                "activity variance and process noise must be finite and nonnegative".into(),
            );
        }
        Ok(Self {
            anchor_variance: variance,
            anchor_time_seconds: 0.0,
            variance,
            at_time_seconds: 0.0,
            last_analysis_time_seconds: None,
            process_noise_per_day,
        })
    }

    pub fn forecast_to(&mut self, time_seconds: f64) -> Result<(), String> {
        if !time_seconds.is_finite() || time_seconds < self.at_time_seconds {
            return Err(
                "activity uncertainty forecast requires finite nondecreasing model time".into(),
            );
        }
        let variance = self.anchor_variance
            + self.process_noise_per_day * ((time_seconds - self.anchor_time_seconds) / 86400.0);
        if !variance.is_finite() {
            return Err("activity uncertainty forecast overflow".into());
        }
        self.variance = variance;
        self.at_time_seconds = time_seconds;
        Ok(())
    }

    /// Record an accepted scalar analysis at the current model time. No spatial
    /// state is touched. Callers must establish attributable, fresh evidence.
    pub fn record_analysis(&mut self, variance: f64) -> Result<(), String> {
        if !variance.is_finite() || variance < 0.0 {
            return Err("analysis variance must be finite and nonnegative".into());
        }
        self.variance = variance;
        self.anchor_variance = variance;
        self.anchor_time_seconds = self.at_time_seconds;
        self.last_analysis_time_seconds = Some(self.at_time_seconds);
        Ok(())
    }

    pub fn variance(&self) -> f64 {
        self.variance
    }
    pub fn at_time_seconds(&self) -> f64 {
        self.at_time_seconds
    }
    pub fn last_analysis_time_seconds(&self) -> Option<f64> {
        self.last_analysis_time_seconds
    }
    pub fn process_noise_per_day(&self) -> f64 {
        self.process_noise_per_day
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_variance_lengths_do_not_panic() {
        let forecast = Field2D::filled(2, 0.5);
        let input = AssimilationInput {
            observation: Field2D::filled(2, 0.8),
            observation_variance: Field2D::filled(1, 0.01),
            forecast_variance: Field2D::filled(2, 0.04),
            freshness_gain: 1.0,
        };
        let result = std::panic::catch_unwind(|| assimilate_scalar_field(&forecast, &input));
        assert!(result.is_ok());
        assert!(result
            .unwrap()
            .unwrap_err()
            .contains("observation_variance length"));
    }

    #[test]
    fn invalid_variances_and_nonfinite_inputs_are_rejected() {
        let forecast = Field2D::filled(2, 0.5);
        let valid = AssimilationInput {
            observation: Field2D::filled(2, 0.8),
            observation_variance: Field2D::filled(2, 0.01),
            forecast_variance: Field2D::filled(2, 0.04),
            freshness_gain: 1.0,
        };
        for bad in [f32::NAN, f32::INFINITY, -1.0] {
            let mut input = valid.clone();
            input.observation_variance.values[0] = bad;
            assert!(assimilate_scalar_field(&forecast, &input).is_err());
            input = valid.clone();
            input.forecast_variance.values[0] = bad;
            assert!(assimilate_scalar_field(&forecast, &input).is_err());
        }
        for which in 0..3 {
            let mut input = valid.clone();
            match which {
                0 => input.observation.values.clear(),
                1 => input.forecast_variance.values.clear(),
                _ => input.observation.values[0] = f32::NAN,
            }
            assert!(assimilate_scalar_field(&forecast, &input).is_err());
        }
    }

    #[test]
    fn activity_analysis_lands_between_forecast_and_observation() {
        let obs = ActivityObservation {
            value: 0.972,
            variance: 0.01,
            freshness_gain: 1.0,
        };
        let (analysis, variance) = assimilate_activity(0.9, 0.04, &obs);
        assert!(analysis > 0.9 && analysis < 0.972, "analysis={analysis}");
        // K = 0.04/(0.04+0.01) = 0.8 → x_a = 0.9 + 0.8·0.072 = 0.9576, P_a = 0.2·0.04.
        assert!((analysis - 0.9576).abs() < 1e-4);
        assert!((variance - 0.008).abs() < 1e-4);
    }

    #[test]
    fn zero_freshness_makes_the_update_the_identity() {
        let obs = ActivityObservation {
            value: 0.1,
            variance: 0.01,
            freshness_gain: 0.0,
        };
        let (analysis, variance) = assimilate_activity(0.9, 0.04, &obs);
        assert_eq!(analysis, 0.9);
        assert!(
            (variance - 0.04).abs() < 1e-6,
            "no confidence gained either"
        );
    }

    #[test]
    fn hostile_observation_values_stay_bounded() {
        let obs = ActivityObservation {
            value: 42.0, // clamped to 1.0
            variance: -3.0,
            freshness_gain: 7.0, // clamped to 1.0
        };
        let (analysis, variance) = assimilate_activity(0.5, 0.04, &obs);
        assert!((0.0..=1.0).contains(&analysis));
        assert!((0.0..=0.04).contains(&variance));
    }

    #[test]
    fn fresh_low_noise_observation_moves_forecast() {
        let forecast = Field2D::filled(1, 0.0);
        let input = AssimilationInput {
            observation: Field2D::filled(1, 1.0),
            observation_variance: Field2D::filled(1, 0.01),
            forecast_variance: Field2D::filled(1, 1.0),
            freshness_gain: 1.0,
        };
        let (analysis, variance) = assimilate_scalar_field(&forecast, &input).unwrap();
        assert!(analysis.values[0] > 0.98);
        assert!(variance.values[0] < 0.02);
    }
}
