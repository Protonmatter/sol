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

/// Measured ΔT (TT − UT1, seconds) at whole-year epochs, IERS Bulletin A history.
/// The Espenak & Meeus 2005–2050 polynomial assumed Earth's rotation would keep slowing;
/// instead it sped up after ~2016 and ΔT plateaued near 69 s (no leap second since 2017),
/// so by 2026 the polynomial is ~6 s high — a ~3″ systematic on the Moon (0.55″/s), the
/// single largest near-present error this engine had. Linear interpolation between knots.
const DELTA_T_MEASURED: [(f64, f64); 12] = [
    (2005.0, 64.69),
    (2010.0, 66.07),
    (2015.0, 67.64),
    (2016.0, 68.10),
    (2017.0, 68.59),
    (2018.0, 68.97),
    (2019.0, 69.22),
    (2020.0, 69.36),
    (2021.0, 69.36),
    (2022.0, 69.29),
    (2023.0, 69.20),
    (2026.0, 69.10),
];

/// ΔT = TT − UT in seconds. Espenak & Meeus 2006 polynomials outside the measured era;
/// 2005–2026 uses the measured IERS values above; 2026–2035 holds the current ~69 s
/// plateau (leap seconds paused, Earth rotating fast); 2035–2050 bridges linearly back
/// to the long-term parabola. Near-present accuracy is what the Horizons gate validates;
/// the deep-time envelope is unchanged (and documented as ΔT-limited regardless).
pub fn delta_t_seconds(year: f64) -> f64 {
    if (2005.0..2026.0).contains(&year) {
        let i = DELTA_T_MEASURED
            .windows(2)
            .position(|w| year < w[1].0)
            .unwrap_or(DELTA_T_MEASURED.len() - 2);
        let (y0, d0) = DELTA_T_MEASURED[i];
        let (y1, d1) = DELTA_T_MEASURED[i + 1];
        d0 + (d1 - d0) * (year - y0) / (y1 - y0)
    } else if (2026.0..2035.0).contains(&year) {
        69.10
    } else if (2035.0..2050.0).contains(&year) {
        // Bridge from the plateau to the 2050 value of the next era's formula (≈93.0 s).
        let end = -20.0 + 32.0 * ((2050.0 - 1820.0) / 100.0_f64).powi(2) - 0.5628 * 100.0;
        69.10 + (end - 69.10) * (year - 2035.0) / 15.0
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
    fn delta_t_matches_measured_near_present() {
        // Post-2016 Earth-rotation speed-up: ΔT plateaued near 69 s. The old polynomial
        // gave ~75 s in 2026 (a ~3″ Moon systematic).
        assert!((delta_t_seconds(2020.0) - 69.36).abs() < 0.05);
        assert!((delta_t_seconds(2026.5) - 69.10).abs() < 0.2);
        // Era boundaries stay continuous.
        for y in [2005.0, 2026.0, 2035.0, 2050.0] {
            let below = delta_t_seconds(y - 1e-6);
            let above = delta_t_seconds(y + 1e-6);
            assert!(
                (below - above).abs() < 0.2,
                "jump at {y}: {below} vs {above}"
            );
        }
    }

    #[test]
    fn gmst_matches_meeus_example_12a() {
        // 1987-04-10 0h UT → JD 2446895.5, GMST = 13h10m46.3668s = 197.693195°.
        let gmst = gmst_deg(2446895.5);
        assert!((gmst - 197.693195).abs() < 1e-3, "gmst={}", gmst);
    }
}
