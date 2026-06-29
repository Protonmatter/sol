//! Derived physical quantities for the planets: phase, illuminated fraction, apparent
//! magnitude, and equilibrium temperature. Heliocentric orbital speed (vis-viva) is taken
//! from the VSOP2013 state in `lib.rs` by finite difference.

/// Phase angle Sun–body–Earth (degrees) from the heliocentric (r), geocentric (Δ),
/// and Sun–Earth (R) distances in AU.
pub fn phase_angle_deg(r: f64, delta: f64, sun_earth: f64) -> f64 {
    let cos_a = (r * r + delta * delta - sun_earth * sun_earth) / (2.0 * r * delta);
    cos_a.clamp(-1.0, 1.0).acos().to_degrees()
}

/// Illuminated fraction of the disk for a phase angle (degrees).
pub fn illuminated_fraction(alpha_deg: f64) -> f64 {
    (1.0 + alpha_deg.to_radians().cos()) / 2.0
}

/// Apparent visual magnitude (Meeus, "Astronomical Algorithms", Ch. 41 / Astronomical
/// Almanac expressions). `r`, `delta` in AU; phase angle `a` in degrees. Saturn ignores rings.
pub fn magnitude(name: &str, r: f64, delta: f64, a: f64) -> Option<f64> {
    let base = 5.0 * (r * delta).log10();
    let m = match name {
        "Mercury" => -0.42 + base + 0.0380 * a - 0.000273 * a * a + 2.0e-6 * a * a * a,
        "Venus" => -4.40 + base + 0.0009 * a + 0.000239 * a * a - 0.65e-6 * a * a * a,
        "Mars" => -1.52 + base + 0.016 * a,
        "Jupiter" => -9.40 + base + 0.005 * a,
        "Saturn" => -8.88 + base,
        "Uranus" => -7.19 + base,
        "Neptune" => -6.87 + base,
        _ => return None,
    };
    Some(m)
}

/// Bond albedo used for the equilibrium-temperature estimate.
fn bond_albedo(name: &str) -> Option<f64> {
    Some(match name {
        "Mercury" => 0.07,
        "Venus" => 0.77,
        "Earth" => 0.31,
        "Mars" => 0.25,
        "Jupiter" => 0.34,
        "Saturn" => 0.34,
        "Uranus" => 0.30,
        "Neptune" => 0.29,
        _ => return None,
    })
}

/// Black-body equilibrium temperature (K) for a fast rotator at heliocentric distance `r_au`:
/// T = 278.5·(1−A)^¼ / √r.
pub fn equilibrium_temp_k(name: &str, r_au: f64) -> Option<f64> {
    bond_albedo(name).map(|a| 278.5 * (1.0 - a).powf(0.25) / r_au.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn earth_equilibrium_temp_is_reasonable() {
        // Earth's black-body equilibrium temperature is ~254 K.
        let t = equilibrium_temp_k("Earth", 1.0).unwrap();
        assert!((t - 254.0).abs() < 5.0, "t={}", t);
    }

    #[test]
    fn full_phase_is_fully_lit() {
        assert!((illuminated_fraction(0.0) - 1.0).abs() < 1e-9);
        assert!((illuminated_fraction(90.0) - 0.5).abs() < 1e-9);
    }
}
