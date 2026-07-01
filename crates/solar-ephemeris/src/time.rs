//! Time systems: Julian Date, ΔT, obliquity, nutation, sidereal time (Meeus).

use core::f64::consts::PI;
const D2R: f64 = PI / 180.0;
pub const J2000: f64 = 2451545.0;
pub const UNIX_EPOCH_JD: f64 = 2440587.5;

/// JD(UTC) from a Unix timestamp (seconds). UT1 ≈ UTC at our precision.
pub fn jd_from_unix(unix_seconds: f64) -> f64 {
    UNIX_EPOCH_JD + unix_seconds / 86400.0
}

/// Approximate decimal year from a Julian Date (used only to pick a ΔT polynomial).
pub fn year_from_jd(jd: f64) -> f64 {
    2000.0 + (jd - J2000) / 365.25
}

/// ΔT = TT − UT in seconds (Espenak & Meeus 2006 polynomial set, modern era).
pub fn delta_t_seconds(year: f64) -> f64 {
    if (2005.0..2050.0).contains(&year) {
        let t = year - 2000.0;
        62.92 + 0.32217 * t + 0.005589 * t * t
    } else if (1986.0..2005.0).contains(&year) {
        let t = year - 2000.0;
        63.86 + 0.3345 * t - 0.060374 * t * t
            + 0.0017275 * t.powi(3)
            + 0.000651814 * t.powi(4)
            + 0.00002373599 * t.powi(5)
    } else if (2050.0..2150.0).contains(&year) {
        -20.0 + 32.0 * ((year - 1820.0) / 100.0).powi(2) - 0.5628 * (2150.0 - year)
    } else {
        let u = (year - 1820.0) / 100.0;
        -20.0 + 32.0 * u * u
    }
}

pub fn centuries(jd: f64) -> f64 {
    (jd - J2000) / 36525.0
}

/// Mean obliquity of the ecliptic in degrees (Meeus 22.2), `t` in Julian centuries TT.
pub fn mean_obliquity_deg(t: f64) -> f64 {
    let sec = 21.448 - t * (46.8150 + t * (0.00059 - t * 0.001813));
    23.0 + (26.0 + sec / 60.0) / 60.0
}

/// Abridged nutation in longitude and obliquity (Δψ, Δε) in degrees (Meeus 22, ≈0.5″).
pub fn nutation_deg(t: f64) -> (f64, f64) {
    let omega = (125.04452 - 1934.136261 * t) * D2R;
    let l = (280.4665 + 36000.7698 * t) * D2R; // mean longitude of the Sun
    let lp = (218.3165 + 481267.8813 * t) * D2R; // mean longitude of the Moon
    let dpsi = (-17.20 * omega.sin() - 1.32 * (2.0 * l).sin() - 0.23 * (2.0 * lp).sin()
        + 0.21 * (2.0 * omega).sin())
        / 3600.0;
    let deps = (9.20 * omega.cos() + 0.57 * (2.0 * l).cos() + 0.10 * (2.0 * lp).cos()
        - 0.09 * (2.0 * omega).cos())
        / 3600.0;
    (dpsi, deps)
}

/// Greenwich mean sidereal time in degrees from JD(UT) (Meeus 12.4).
pub fn gmst_deg(jd_ut: f64) -> f64 {
    let t = centuries(jd_ut);
    (280.46061837 + 360.98564736629 * (jd_ut - J2000) + 0.000387933 * t * t
        - t * t * t / 38710000.0)
        .rem_euclid(360.0)
}

/// Greenwich apparent sidereal time in degrees (mean + equation of the equinoxes).
pub fn gast_deg(jd_ut: f64, dpsi_deg: f64, eps_deg: f64) -> f64 {
    (gmst_deg(jd_ut) + dpsi_deg * (eps_deg * D2R).cos()).rem_euclid(360.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jd_of_j2000() {
        // 2000-01-01 12:00 UTC == Unix 946728000.
        assert!((jd_from_unix(946728000.0) - J2000).abs() < 1e-6);
    }

    #[test]
    fn nutation_matches_meeus_example_22a() {
        // 1987-04-10 0h TD → JDE 2446895.5, T as below.
        let t = centuries(2446895.5);
        let (dpsi, deps) = nutation_deg(t);
        // Meeus 22.a: Δψ = -3.788″, Δε = +9.443″.
        assert!(
            (dpsi * 3600.0 - (-3.788)).abs() < 0.5,
            "dpsi={}",
            dpsi * 3600.0
        );
        assert!(
            (deps * 3600.0 - 9.443).abs() < 0.5,
            "deps={}",
            deps * 3600.0
        );
        let eps0 = mean_obliquity_deg(t);
        // Meeus: ε0 = 23°26′27.407″ = 23.44037°.
        assert!((eps0 - 23.440946).abs() < 1e-3, "eps0={}", eps0);
    }

    #[test]
    fn gmst_matches_meeus_example_12a() {
        // 1987-04-10 0h UT → JD 2446895.5, GMST = 13h10m46.3668s = 197.693195°.
        let gmst = gmst_deg(2446895.5);
        assert!((gmst - 197.693195).abs() < 1e-3, "gmst={}", gmst);
    }
}
