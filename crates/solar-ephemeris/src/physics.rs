//! Derived physical quantities for the planets: phase, illuminated fraction, apparent
//! magnitude, and equilibrium temperature. Heliocentric orbital speed is taken from the
//! VSOP2013/ELP-MPP02 state in `lib.rs` by central difference (≈ the vis-viva value to ~0.1%,
//! but computed numerically, not from √(GM(2/r − 1/a))).

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

/// Saturn's ring brightening term (Meeus Ch. 41): −2.60·|sin B| + 1.25·sin²B, where B is the
/// Saturnicentric latitude of Earth, from Saturn's geocentric equatorial position (degrees).
/// Ranges ~0 (rings edge-on) to ≈−0.9 mag (rings wide open).
pub fn saturn_ring_mag(ra_deg: f64, dec_deg: f64) -> f64 {
    const A0: f64 = 40.589; // IAU Saturn north-pole RA (J2000)
    const D0: f64 = 83.537; // IAU Saturn north-pole Dec (J2000)
    let (ra, dec) = (ra_deg.to_radians(), dec_deg.to_radians());
    let (a0, d0) = (A0.to_radians(), D0.to_radians());
    let sin_b = -d0.sin() * dec.sin() - d0.cos() * dec.cos() * (a0 - ra).cos();
    -2.60 * sin_b.abs() + 1.25 * sin_b * sin_b
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
/// T = 278.5·(1−A)^¼ / √r. This is the *airless* radiative-balance temperature — it ignores
/// atmospheres/greenhouse and internal heat, so it can differ wildly from the real temperature
/// (Venus: ~227 K here vs 737 K actual). Pair it with `mean_temp_k` for an honest display.
pub fn equilibrium_temp_k(name: &str, r_au: f64) -> Option<f64> {
    bond_albedo(name).map(|a| 278.5 * (1.0 - a).powf(0.25) / r_au.sqrt())
}

/// Observed mean temperature (K) — surface for the terrestrial planets, ~1-bar level for the
/// giants (NASA planetary fact sheets). Shown next to the black-body value so the greenhouse /
/// internal-heat gap is explicit rather than misleading.
pub fn mean_temp_k(name: &str) -> Option<f64> {
    Some(match name {
        "Mercury" => 440.0,
        "Venus" => 737.0,
        "Earth" => 288.0,
        "Mars" => 210.0,
        "Jupiter" => 165.0,
        "Saturn" => 134.0,
        "Uranus" => 76.0,
        "Neptune" => 72.0,
        _ => return None,
    })
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
