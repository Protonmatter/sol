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
/// x_a = x_f + freshness * K_i * (y - x_f)
/// P_a = (1 - K_i) * P_f
pub fn assimilate_scalar_field(forecast: &Field2D, input: &AssimilationInput) -> (Field2D, Field2D) {
    assert_eq!(forecast.values.len(), input.observation.values.len());
    let mut analysis = forecast.clone();
    let mut variance = input.forecast_variance.clone();

    for i in 0..forecast.values.len() {
        let pf = input.forecast_variance.values[i].max(1e-6);
        let r = input.observation_variance.values[i].max(1e-6);
        let k = pf / (pf + r);
        let residual = input.observation.values[i] - forecast.values[i];
        analysis.values[i] = forecast.values[i] + input.freshness_gain.clamp(0.0, 1.0) * k * residual;
        variance.values[i] = (1.0 - k) * pf;
    }

    (analysis, variance)
}

#[cfg(test)]
mod tests {
    use super::*;

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
