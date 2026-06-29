//! Coordinate transforms: ecliptic→equatorial, geocentric→topocentric, alt/az, refraction.

use core::f64::consts::PI;
const D2R: f64 = PI / 180.0;
const R2D: f64 = 180.0 / PI;
pub const AU_KM: f64 = 149_597_870.7;
const EARTH_R_KM: f64 = 6378.14;

/// Precess ecliptic coordinates (degrees) from J2000 to the date `t` centuries from J2000.
/// Meeus, "Astronomical Algorithms", Ch. 21 (initial epoch J2000). Unlike a longitude-only
/// shift this also moves the latitude as the ecliptic plane tilts (planetary precession),
/// which matters at the ~12″/26 yr level.
pub fn precess_ecliptic_from_j2000(lon_deg: f64, lat_deg: f64, t: f64) -> (f64, f64) {
    let t2 = t * t;
    let t3 = t2 * t;
    let eta = (47.0029 * t - 0.03302 * t2 + 0.000060 * t3) / 3600.0 * D2R;
    let pi_deg = 174.876384 - (869.8089 * t + 0.03536 * t2) / 3600.0;
    let pi_rad = pi_deg * D2R;
    let p_deg = (5029.0966 * t + 1.11113 * t2 - 0.000006 * t3) / 3600.0;
    let (lon, lat) = (lon_deg * D2R, lat_deg * D2R);
    let sin_pml = (pi_rad - lon).sin();
    let cos_pml = (pi_rad - lon).cos();
    let a = eta.cos() * lat.cos() * sin_pml - eta.sin() * lat.sin();
    let b = lat.cos() * cos_pml;
    let c = eta.cos() * lat.sin() + eta.sin() * lat.cos() * sin_pml;
    let lon_new = p_deg + pi_deg - a.atan2(b) * R2D;
    (lon_new.rem_euclid(360.0), c.asin() * R2D)
}

/// Ecliptic (λ, β) → equatorial (RA, Dec), degrees. `eps` is true obliquity (Meeus 13.3–13.4).
pub fn ecl_to_equ(lon_deg: f64, lat_deg: f64, eps_deg: f64) -> (f64, f64) {
    let (l, b, e) = (lon_deg * D2R, lat_deg * D2R, eps_deg * D2R);
    let ra = (l.sin() * e.cos() - b.tan() * e.sin()).atan2(l.cos());
    let dec = (b.sin() * e.cos() + b.cos() * e.sin() * l.sin()).asin();
    (ra.rem_euclid(2.0 * PI) * R2D, dec * R2D)
}

/// Equatorial (RA, Dec) → ecliptic (λ, β), degrees. Inverse of `ecl_to_equ` (Meeus 13.1–13.2).
pub fn equ_to_ecl(ra_deg: f64, dec_deg: f64, eps_deg: f64) -> (f64, f64) {
    let (a, d, e) = (ra_deg * D2R, dec_deg * D2R, eps_deg * D2R);
    let lon = (a.sin() * e.cos() + d.tan() * e.sin()).atan2(a.cos());
    let lat = (d.sin() * e.cos() - d.cos() * e.sin() * a.sin()).asin();
    (lon.rem_euclid(2.0 * PI) * R2D, lat * R2D)
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
pub fn topocentric(ra_deg: f64, dec_deg: f64, dist_km: f64, lst_deg: f64, rho_sin: f64, rho_cos: f64) -> (f64, f64) {
    let sin_pi = EARTH_R_KM / dist_km;
    let h = (lst_deg - ra_deg) * D2R;
    let dec = dec_deg * D2R;
    let dra = (-rho_cos * sin_pi * h.sin()).atan2(dec.cos() - rho_cos * sin_pi * h.cos());
    let ra_topo = ra_deg + dra * R2D;
    let dec_topo = ((dec.sin() - rho_sin * sin_pi) * dra.cos())
        .atan2(dec.cos() - rho_cos * sin_pi * h.cos());
    (ra_topo.rem_euclid(360.0), dec_topo * R2D)
}

/// Equatorial → horizontal. Azimuth from **true north, clockwise** (0=N, 90=E, 180=S, 270=W).
pub fn alt_az(ra_deg: f64, dec_deg: f64, lst_deg: f64, lat_deg: f64) -> (f64, f64) {
    let h = (lst_deg - ra_deg) * D2R;
    let dec = dec_deg * D2R;
    let phi = lat_deg * D2R;
    let alt = (phi.sin() * dec.sin() + phi.cos() * dec.cos() * h.cos()).asin();
    let az = (-dec.cos() * h.sin()).atan2(dec.sin() * phi.cos() - phi.sin() * dec.cos() * h.cos());
    (alt * R2D, (az * R2D).rem_euclid(360.0))
}

/// Atmospheric refraction lift (degrees) at a true altitude, Bennett's formula.
pub fn refraction_deg(true_alt_deg: f64) -> f64 {
    if true_alt_deg < -1.0 {
        return 0.0;
    }
    let r_arcmin = 1.0 / ((true_alt_deg + 7.31 / (true_alt_deg + 4.4)) * D2R).tan();
    r_arcmin / 60.0
}

/// Horizontal parallax (degrees) for a body at `dist_km`.
pub fn horizontal_parallax_deg(dist_km: f64) -> f64 {
    (EARTH_R_KM / dist_km).asin() * R2D
}
