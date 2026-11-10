//! Coordinate transforms: ecliptic→equatorial, geocentric→topocentric, alt/az, refraction.

use core::f64::consts::PI;
const D2R: f64 = PI / 180.0;
const R2D: f64 = 180.0 / PI;
pub const AU_KM: f64 = 149_597_870.7;
const EARTH_R_KM: f64 = 6378.14;

// Unit-vector rotations can round a sine just outside [-1, 1] at a pole.
// Bound those inverse-sine inputs; nonfinite trigonometric inputs remain NaN.

/// Wrap degrees to [0,360), including binary64's rounded upper endpoint.
/// rem_euclid can return exactly 360 for a sufficiently small negative input.
/// Preserve every ordinary result, including the adjacent value below 360.
pub(crate) fn wrap_degrees(angle: f64) -> f64 {
    let wrapped = angle.rem_euclid(360.0);
    if wrapped == 360.0 {
        0.0
    } else {
        wrapped
    }
}

/// Precess ecliptic coordinates (degrees) from J2000 to the date `t` centuries from J2000.
/// Meeus, "Astronomical Algorithms", Ch. 21 (initial epoch J2000). Unlike a longitude-only
/// shift this also moves the latitude as the ecliptic plane tilts (planetary precession),
/// which matters at the ~12″/26 yr level.
pub fn precess_ecliptic_from_j2000(lon_deg: f64, lat_deg: f64, t: f64) -> (f64, f64) {
    let t2 = t * t;
    let t3 = t2 * t;
    let eta = (47.0029 * t - 0.03302 * t2 + 0.000060 * t3) / 3600.0 * D2R;
    // Meeus (21.5), initial epoch J2000: Π = 174°.876384 − 869″.8089·t + 0″.03536·t²
    // (the t² term is POSITIVE — a sign slip here costs ~1″ at ±5000 yr, nothing near J2000).
    let pi_deg = 174.876384 - (869.8089 * t - 0.03536 * t2) / 3600.0;
    let pi_rad = pi_deg * D2R;
    let p_deg = (5029.0966 * t + 1.11113 * t2 - 0.000006 * t3) / 3600.0;
    let (lon, lat) = (lon_deg * D2R, lat_deg * D2R);
    let sin_pml = (pi_rad - lon).sin();
    let cos_pml = (pi_rad - lon).cos();
    let a = eta.cos() * lat.cos() * sin_pml - eta.sin() * lat.sin();
    let b = lat.cos() * cos_pml;
    let c = eta.cos() * lat.sin() + eta.sin() * lat.cos() * sin_pml;
    let lon_new = p_deg + pi_deg - a.atan2(b) * R2D;
    (wrap_degrees(lon_new), c.clamp(-1.0, 1.0).asin() * R2D)
}

/// Ecliptic (λ, β) → equatorial (RA, Dec), degrees. `eps` is true obliquity (Meeus 13.3–13.4).
pub fn ecl_to_equ(lon_deg: f64, lat_deg: f64, eps_deg: f64) -> (f64, f64) {
    let (l, b, e) = (lon_deg * D2R, lat_deg * D2R, eps_deg * D2R);
    let ra = (l.sin() * e.cos() - b.tan() * e.sin()).atan2(l.cos());
    let dec = (b.sin() * e.cos() + b.cos() * e.sin() * l.sin())
        .clamp(-1.0, 1.0)
        .asin();
    (wrap_degrees(ra.rem_euclid(2.0 * PI) * R2D), dec * R2D)
}

/// Equatorial (RA, Dec) → ecliptic (λ, β), degrees. Inverse of `ecl_to_equ` (Meeus 13.1–13.2).
pub fn equ_to_ecl(ra_deg: f64, dec_deg: f64, eps_deg: f64) -> (f64, f64) {
    let (a, d, e) = (ra_deg * D2R, dec_deg * D2R, eps_deg * D2R);
    let lon = (a.sin() * e.cos() + d.tan() * e.sin()).atan2(a.cos());
    let lat = (d.sin() * e.cos() - d.cos() * e.sin() * a.sin())
        .clamp(-1.0, 1.0)
        .asin();
    (wrap_degrees(lon.rem_euclid(2.0 * PI) * R2D), lat * R2D)
}

/// Observer geocentric quantities ρ·sinφ′, ρ·cosφ′ on the WGS84 ellipsoid (Meeus 11).
pub fn observer_rho(lat_deg: f64, elev_m: f64) -> (f64, f64) {
    let phi = lat_deg * D2R;
    let u = (0.99664719 * phi.tan()).atan();
    let h = elev_m / 6_378_140.0;
    let rho_sin = 0.99664719 * u.sin() + h * phi.sin();
    let rho_cos = u.cos() + h * phi.cos();
    (rho_sin, rho_cos)
}

/// Geocentric → topocentric RA/Dec (Meeus 40), correcting for diurnal parallax.
pub fn topocentric(
    ra_deg: f64,
    dec_deg: f64,
    dist_km: f64,
    lst_deg: f64,
    rho_sin: f64,
    rho_cos: f64,
) -> (f64, f64) {
    let sin_pi = EARTH_R_KM / dist_km;
    let h = (lst_deg - ra_deg) * D2R;
    let dec = dec_deg * D2R;
    let dra = (-rho_cos * sin_pi * h.sin()).atan2(dec.cos() - rho_cos * sin_pi * h.cos());
    let ra_topo = ra_deg + dra * R2D;
    let dec_topo =
        ((dec.sin() - rho_sin * sin_pi) * dra.cos()).atan2(dec.cos() - rho_cos * sin_pi * h.cos());
    (wrap_degrees(ra_topo), dec_topo * R2D)
}

/// Equatorial → horizontal. Azimuth from **true north, clockwise** (0=N, 90=E, 180=S, 270=W).
pub fn alt_az(ra_deg: f64, dec_deg: f64, lst_deg: f64, lat_deg: f64) -> (f64, f64) {
    let h = (lst_deg - ra_deg) * D2R;
    let dec = dec_deg * D2R;
    let phi = lat_deg * D2R;
    let alt = (phi.sin() * dec.sin() + phi.cos() * dec.cos() * h.cos())
        .clamp(-1.0, 1.0)
        .asin();
    let az = (-dec.cos() * h.sin()).atan2(dec.sin() * phi.cos() - phi.sin() * dec.cos() * h.cos());
    (alt * R2D, wrap_degrees(az * R2D))
}

/// Atmospheric refraction lift (degrees) at a TRUE altitude — Sæmundsson's formula
/// (Meeus 16.4), the true→apparent inverse of Bennett. Bennett's coefficients
/// (1/tan(h + 7.31/(h+4.4))) expect the APPARENT altitude as input; feeding them the
/// true altitude overestimates refraction by ~5.5′ at the horizon (34.5′ vs the
/// consistent ~29′), biasing displayed altitudes and rise/set times by ~20–30 s.
pub fn refraction_deg(true_alt_deg: f64) -> f64 {
    if true_alt_deg < -1.0 {
        return 0.0;
    }
    let r_arcmin = 1.02 / ((true_alt_deg + 10.3 / (true_alt_deg + 5.11)) * D2R).tan();
    r_arcmin / 60.0
}

/// Horizontal parallax (degrees) for a body at `dist_km`.
pub fn horizontal_parallax_deg(dist_km: f64) -> f64 {
    (EARTH_R_KM / dist_km).asin() * R2D
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zenith_and_nadir_have_finite_altitudes() {
        // At the zenith sin(phi)^2 + cos(phi)^2 can round above one.
        // Its azimuth has no unique physical value, but must remain finite.
        for latitude in [-89.985, -45.0, -0.015, 0.015, 45.0, 89.985] {
            for (declination, hour_angle, expected) in
                [(latitude, 0.0, 90.0), (-latitude, 180.0, -90.0)]
            {
                let (altitude, azimuth) = alt_az(0.0, declination, hour_angle, latitude);
                assert!(
                    altitude.is_finite(),
                    "latitude={latitude}, altitude={altitude}"
                );
                assert!((altitude - expected).abs() < 2e-6);
                assert!(azimuth.is_finite());
            }
        }
    }

    #[test]
    fn ecliptic_rotation_reaches_equatorial_poles() {
        for obliquity in [0.015, 0.021, 23.4, 23.439291111, 45.0, 89.985] {
            for sign in [-1.0, 1.0] {
                let longitude = if sign > 0.0 { 90.0 } else { 270.0 };
                let (_, declination) = ecl_to_equ(longitude, sign * (90.0 - obliquity), obliquity);
                assert!(
                    declination.is_finite(),
                    "obliquity={obliquity}, dec={declination}"
                );
                assert!((declination - sign * 90.0).abs() < 2e-6);
            }
        }
    }

    #[test]
    fn equatorial_rotation_reaches_ecliptic_poles() {
        for obliquity in [0.015, 0.021, 23.4, 23.439291111, 45.0, 89.985] {
            for sign in [-1.0, 1.0] {
                let right_ascension = if sign > 0.0 { 270.0 } else { 90.0 };
                let (_, latitude) =
                    equ_to_ecl(right_ascension, sign * (90.0 - obliquity), obliquity);
                assert!(
                    latitude.is_finite(),
                    "obliquity={obliquity}, lat={latitude}"
                );
                assert!((latitude - sign * 90.0).abs() < 2e-6);
            }
        }
    }

    #[test]
    fn precession_reaches_date_ecliptic_poles() {
        for century_step in -100..=200 {
            let t = century_step as f64 / 100.0;
            let eta_deg = (47.0029 * t - 0.03302 * t * t + 0.000060 * t * t * t) / 3600.0;
            let pi_deg = 174.876384 - (869.8089 * t - 0.03536 * t * t) / 3600.0;
            for sign in [-1.0, 1.0] {
                let longitude = pi_deg - eta_deg.signum() * sign * 90.0;
                let latitude = sign * (90.0 - eta_deg.abs());
                let (_, actual) = precess_ecliptic_from_j2000(longitude, latitude, t);
                assert!(actual.is_finite(), "t={t}, lat={actual}");
                assert!((actual - sign * 90.0).abs() < 2e-6);
            }
        }
    }

    #[test]
    fn polar_domain_guards_preserve_nonfinite_input_rejection() {
        for invalid in [f64::NAN, f64::NEG_INFINITY, f64::INFINITY] {
            assert!(alt_az(0.0, invalid, 0.0, 45.0).0.is_nan());
            assert!(ecl_to_equ(0.0, invalid, 23.4).1.is_nan());
            assert!(equ_to_ecl(0.0, invalid, 23.4).1.is_nan());
            assert!(precess_ecliptic_from_j2000(0.0, invalid, 1.0).1.is_nan());
        }
    }

    #[test]
    fn degree_wrap_preserves_neighbors_and_rejects_nonfinite_angles() {
        for turns in [-720.0, -360.0, 0.0, 360.0, 720.0] {
            assert_eq!(wrap_degrees(turns), 0.0);
        }
        for angle in [-1.0e-15, -f64::MIN_POSITIVE, -f64::from_bits(1)] {
            assert_eq!(wrap_degrees(angle), 0.0);
        }
        for angle in [
            f64::from_bits(1),
            f64::MIN_POSITIVE,
            1.0e-15,
            180.0,
            f64::from_bits(360.0f64.to_bits() - 1),
        ] {
            assert_eq!(wrap_degrees(angle).to_bits(), angle.to_bits());
        }
        for angle in [f64::NAN, f64::NEG_INFINITY, f64::INFINITY] {
            assert!(wrap_degrees(angle).is_nan());
        }
    }

    #[test]
    fn coordinate_angles_near_zero_keep_the_open_upper_bound() {
        for angle in [-1.0e-15, -f64::MIN_POSITIVE, -f64::from_bits(1), -0.0, 0.0] {
            for actual in [
                ecl_to_equ(angle, 0.0, 0.0).0,
                equ_to_ecl(angle, 0.0, 0.0).0,
                topocentric(angle, 0.0, AU_KM, angle, 0.0, 0.0).0,
                alt_az(0.0, 45.0, -angle, 0.0).1,
            ] {
                assert!((0.0..360.0).contains(&actual), "{angle}: {actual}");
                assert_eq!(actual, 0.0);
            }
        }
    }
}
