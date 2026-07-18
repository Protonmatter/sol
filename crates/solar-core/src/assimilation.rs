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
pub fn assimilate_scalar_field(
    forecast: &Field2D,
    input: &AssimilationInput,
) -> (Field2D, Field2D) {
    assert_eq!(forecast.values.len(), input.observation.values.len());
    let mut analysis = forecast.clone();
    let mut variance = input.forecast_variance.clone();
    let freshness = input.freshness_gain.clamp(0.0, 1.0);

    for i in 0..forecast.values.len() {
        let pf = input.forecast_variance.values[i].max(1e-6);
        let r = input.observation_variance.values[i].max(1e-6);
        let gain = freshness * pf / (pf + r);
        let residual = input.observation.values[i] - forecast.values[i];
        analysis.values[i] = forecast.values[i] + gain * residual;
        variance.values[i] = (1.0 - gain) * pf;
    }

    (analysis, variance)
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
        observation_variance: Field2D::filled(1, obs.variance.max(1e-6)),
        forecast_variance: Field2D::filled(1, forecast_variance.max(1e-6)),
        freshness_gain: obs.freshness_gain,
    };
    let (analysis, variance) = assimilate_scalar_field(&forecast, &input);
    (analysis.values[0].clamp(0.0, 1.0), variance.values[0])
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let (analysis, variance) = assimilate_scalar_field(&forecast, &input);
        assert!(analysis.values[0] > 0.98);
        assert!(variance.values[0] < 0.02);
    }
}
