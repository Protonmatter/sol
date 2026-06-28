/// Solar differential rotation in degrees/day using a common reduced form:
/// omega(lat) = A + B sin^2(lat) + C sin^4(lat).
pub fn differential_rotation_deg_per_day(lat_deg: f64) -> f64 {
    let s = lat_deg.to_radians().sin();
    14.713 - 2.396 * s * s - 1.787 * s.powi(4)
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
    fn wrap_works() {
        assert_eq!(wrap360(361.0), 1.0);
        assert_eq!(wrap360(-1.0), 359.0);
    }
}
