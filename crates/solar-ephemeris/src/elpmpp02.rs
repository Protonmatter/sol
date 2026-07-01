//! ELP-MPP02 lunar theory (truncated to ephem.js's normal tier, 'jpl'/DE405 fit).
//!
//! Faithful port of the evaluation loop in ephem.js's `elpmpp.js` (itself a direct
//! conversion of `ELPMPP02.for`). The one-time argument folding is done at build time
//! (see `tools/ephemeris-data/dump_elp.js`); the ready-to-evaluate CMPB/FMPB/CPER/FPER
//! tables and the W0 mean-longitude polynomial live in the generated `elpmpp02_data`.
//!
//! Returns the geocentric Moon position in the inertial mean ecliptic & equinox of J2000.

use crate::elpmpp02_data::{MAIN, PERT, W0};

/// Light-time per AU, in Julian years (≈499.0048 s) — for the Moon's planetary aberration.
const LIGHT_YEARS_PER_AU: f64 = 0.005775518 / 365.25;

/// One series term: amplitude + a degree-4 argument polynomial [phase, t¹, t², t³, t⁴].
pub struct Term {
    pub amp: f64,
    pub f: [f64; 5],
}

const RAD: f64 = 206264.806_247_096_36; // 648000 / π — arcsec per radian
const A405: f64 = 384747.9613701725;
const AELP: f64 = 384747.980674318;
const KM2AU: f64 = 6.6846e-9;

// Precession of the ecliptic, P and Q (Laskar 1986).
const P: [f64; 5] = [0.10180391e-04, 0.47020439e-06, -0.5417367e-09, -0.2507948e-11, 0.463486e-14];
const Q: [f64; 5] = [-0.113469002e-03, 0.12372674e-06, 0.1265417e-08, -0.1371808e-11, -0.320334e-14];

/// Geocentric Moon position in ecliptic-J2000 rectangular coordinates (AU) at
/// Julian years from J2000.
pub fn moon_xyz(jy2k: f64) -> [f64; 3] {
    let t1 = jy2k / 100.0;
    let t = [1.0, t1, t1 * t1, t1 * t1 * t1, t1 * t1 * t1 * t1];

    let mut v = [0.0f64; 3]; // longitude (arcsec), latitude (arcsec), distance (km)
    for iv in 0..3 {
        let mut acc = 0.0;
        // Main problem.
        for term in MAIN[iv].iter() {
            let mut y = term.f[0];
            for k in 1..5 {
                y += term.f[k] * t[k];
            }
            acc += term.amp * y.sin();
        }
        // Perturbations, grouped by time power t⁰..t³.
        for (it, group) in PERT[iv].iter().enumerate() {
            for term in group.iter() {
                let mut y = term.f[0];
                for k in 1..5 {
                    y += term.f[k] * t[k];
                }
                acc += term.amp * t[it] * y.sin();
            }
        }
        v[iv] = acc;
    }

    let lon = v[0] / RAD + W0[0] + W0[1] * t[1] + W0[2] * t[2] + W0[3] * t[3] + W0[4] * t[4];
    let lat = v[1] / RAD;
    let dist = v[2] * (A405 / AELP);

    // Spherical → rectangular in the ELP frame.
    let (clamb, slamb) = (lon.cos(), lon.sin());
    let (cbeta, sbeta) = (lat.cos(), lat.sin());
    let cw = dist * cbeta;
    let sw = dist * sbeta;
    let x1 = cw * clamb;
    let x2 = cw * slamb;
    let x3 = sw;

    // Laskar precession rotation into the J2000 ecliptic frame.
    let pw = (P[0] + P[1] * t[1] + P[2] * t[2] + P[3] * t[3] + P[4] * t[4]) * t[1];
    let qw = (Q[0] + Q[1] * t[1] + Q[2] * t[2] + Q[3] * t[3] + Q[4] * t[4]) * t[1];
    let pw_sq = pw * pw;
    let qw_sq = qw * qw;
    let ra = 2.0 * (1.0 - pw_sq - qw_sq).sqrt();
    let pwqw = 2.0 * pw * qw;
    let pw2 = 1.0 - 2.0 * pw_sq;
    let qw2 = 1.0 - 2.0 * qw_sq;
    let pwra = pw * ra;
    let qwra = qw * ra;

    [
        (pw2 * x1 + pwqw * x2 + pwra * x3) * KM2AU,
        (pwqw * x1 + qw2 * x2 - qwra * x3) * KM2AU,
        (-pwra * x1 + qwra * x2 + (pw2 + qw2 - 1.0) * x3) * KM2AU,
    ]
}

/// Geocentric ecliptic-of-date apparent (longitude °, latitude °, distance km) of the Moon.
/// Applies planetary aberration via light-time, general precession of the ecliptic from J2000 to
/// date, and nutation in longitude.
///
/// **No annual aberration term** — and this is deliberate, not an oversight. Aberration is set by the
/// observer's velocity *relative to the frame the source position is expressed in*. ELP-MPP02 gives
/// the Moon's position in a **geocentric** frame that already co-moves with the observer, so Earth's
/// ~30 km/s heliocentric velocity cancels in the Earth→Moon vector; adding an annual-aberration term
/// would double-count it. (The VSOP2013 planets are different: their **heliocentric** positions do
/// need the observer-velocity term — see `planets::reduce`.) Empirically confirmed: adding annual
/// aberration here regresses the JPL Horizons gate from ~5″ to ~23″ at syzygy
/// (`tools/stress_moon_syzygy.py`), because Horizons' geocentric Moon place has no such term either.
pub fn moon_apparent_ecliptic(jd_tt: f64, dpsi_deg: f64) -> (f64, f64, f64) {
    let jy2k = (jd_tt - 2451545.0) / 365.25;
    let m0 = moon_xyz(jy2k);
    let dist_au = (m0[0] * m0[0] + m0[1] * m0[1] + m0[2] * m0[2]).sqrt();
    // Retarded geocentric position one light-time earlier (~1.3 s, ≈0.7″).
    let m = moon_xyz(jy2k - dist_au * LIGHT_YEARS_PER_AU);

    let lon_j2000 = m[1].atan2(m[0]).to_degrees();
    let lat_j2000 = m[2].atan2((m[0] * m[0] + m[1] * m[1]).sqrt()).to_degrees();
    // Precess J2000 ecliptic → ecliptic of date (longitude and latitude), then add nutation.
    let (lon_date, lat_date) = crate::coords::precess_ecliptic_from_j2000(lon_j2000, lat_j2000, jy2k / 100.0);
    let lon = lon_date + dpsi_deg;
    (lon.rem_euclid(360.0), lat_date, dist_au * 149_597_870.7)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moon_distance_is_plausible() {
        // Geocentric Moon distance stays within ~356,500–406,700 km.
        let (_, _, dist_km) = moon_apparent_ecliptic(2460676.5, 0.0);
        assert!(dist_km > 356_000.0 && dist_km < 407_000.0, "dist_km={}", dist_km);
    }
}
