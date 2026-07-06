use crate::constants::CARRINGTON_SIDEREAL_DEG_PER_DAY;

/// Photospheric sidereal differential rotation in degrees/day:
/// omega(lat) = A + B sin^2(lat) + C sin^4(lat).
///
/// The coefficients are the Snodgrass/Ulrich-style magnetic-tracer fit used by
/// this reduced model. Callers operating in a rotating coordinate system must
/// subtract that frame's sidereal rate.
pub fn differential_rotation_deg_per_day(lat_deg: f64) -> f64 {
    let s = lat_deg.to_radians().sin();
    14.713 - 2.396 * s * s - 1.787 * s.powi(4)
}

/// Longitudinal advection rate in a Carrington co-rotating grid. Positive values
/// move toward increasing west-positive Carrington longitude.
pub fn carrington_advection_deg_per_day(lat_deg: f64) -> f64 {
    differential_rotation_deg_per_day(lat_deg) - CARRINGTON_SIDEREAL_DEG_PER_DAY
}

pub fn wrap360(x: f64) -> f64 {
    let mut y = x % 360.0;
    if y < 0.0 {
        y += 360.0;
    }
    y
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equator_rotates_faster_than_high_latitude() {
        let eq = differential_rotation_deg_per_day(0.0);
        let high = differential_rotation_deg_per_day(60.0);
        assert!(eq > high);
    }

    #[test]
    fn carrington_rate_is_relative_not_inertial() {
        let drift = carrington_advection_deg_per_day(0.0);
        assert!((drift - 0.5286).abs() < 1.0e-10);
        assert!(carrington_advection_deg_per_day(60.0) < 0.0);
    }

    #[test]
    fn wrap_works() {
        assert_eq!(wrap360(361.0), 1.0);
        assert_eq!(wrap360(-1.0), 359.0);
    }
}
