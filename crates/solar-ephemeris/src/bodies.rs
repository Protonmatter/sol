//! Geocentric apparent positions of the Sun (Meeus Ch. 25) and Moon (Meeus Ch. 47).

use core::f64::consts::PI;
const D2R: f64 = PI / 180.0;

/// Apparent geocentric ecliptic position of the Sun.
/// Returns (apparent longitude °, latitude ° (~0), distance AU). Nutation + aberration baked in.
pub fn sun_apparent(t: f64) -> (f64, f64, f64) {
    let l0 = (280.46646 + 36000.76983 * t + 0.0003032 * t * t).rem_euclid(360.0);
    let m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
    let mr = m * D2R;
    let e = 0.016708634 - 0.000042037 * t - 0.0000001267 * t * t;
    let c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * mr.sin()
        + (0.019993 - 0.000101 * t) * (2.0 * mr).sin()
        + 0.000289 * (3.0 * mr).sin();
    let true_long = l0 + c;
    let v = m + c;
    let r = 1.000001018 * (1.0 - e * e) / (1.0 + e * (v * D2R).cos());
    let omega = (125.04 - 1934.136 * t) * D2R;
    let lambda = true_long - 0.00569 - 0.00478 * omega.sin(); // nutation + aberration
    (lambda.rem_euclid(360.0), 0.0, r)
}

// Meeus Table 47.A (principal terms): D, M, M', F, Σl (1e-6°, sin), Σr (1e-3 km, cos).
const LR: [(i32, i32, i32, i32, f64, f64); 33] = [
    (0, 0, 1, 0, 6288774.0, -20905355.0),
    (2, 0, -1, 0, 1274027.0, -3699111.0),
    (2, 0, 0, 0, 658314.0, -2955968.0),
    (0, 0, 2, 0, 213618.0, -569925.0),
    (0, 1, 0, 0, -185116.0, 48888.0),
    (0, 0, 0, 2, -114332.0, -3149.0),
    (2, 0, -2, 0, 58793.0, 246158.0),
    (2, -1, -1, 0, 57066.0, -152138.0),
    (2, 0, 1, 0, 53322.0, -170733.0),
    (2, -1, 0, 0, 45758.0, -204586.0),
    (0, 1, -1, 0, -40923.0, -129620.0),
    (1, 0, 0, 0, -34720.0, 108743.0),
    (0, 1, 1, 0, -30383.0, 104755.0),
    (2, 0, 0, -2, 15327.0, 10321.0),
    (0, 0, 1, 2, -12528.0, 0.0),
    (0, 0, 1, -2, 10980.0, 79661.0),
    (4, 0, -1, 0, 10675.0, -34782.0),
    (0, 0, 3, 0, 10034.0, -23210.0),
    (4, 0, -2, 0, 8548.0, -21636.0),
    (2, 1, -1, 0, -7888.0, 24208.0),
    (2, 1, 0, 0, -6766.0, 30824.0),
    (1, 0, -1, 0, -5163.0, -8379.0),
    (1, 1, 0, 0, 4987.0, -16675.0),
    (2, -1, 1, 0, 4036.0, -12831.0),
    (2, 0, 2, 0, 3994.0, -10445.0),
    (4, 0, 0, 0, 3861.0, -11650.0),
    (2, 0, -3, 0, 3665.0, 14403.0),
    (0, 1, -2, 0, -2689.0, -7003.0),
    (2, 0, -1, 2, -2602.0, 0.0),
    (2, -1, -2, 0, 2390.0, 10056.0),
    (1, 0, 1, 0, -2348.0, 6322.0),
    (2, -2, 0, 0, 2236.0, -9884.0),
    (0, 1, 2, 0, -2120.0, 5751.0),
];

// Meeus Table 47.B (principal terms): D, M, M', F, Σb (1e-6°, sin).
const B: [(i32, i32, i32, i32, f64); 27] = [
    (0, 0, 0, 1, 5128122.0),
    (0, 0, 1, 1, 280602.0),
    (0, 0, 1, -1, 277693.0),
    (2, 0, 0, -1, 173237.0),
    (2, 0, -1, 1, 55413.0),
    (2, 0, -1, -1, 46271.0),
    (2, 0, 0, 1, 32573.0),
    (0, 0, 2, 1, 17198.0),
    (2, 0, 1, -1, 9266.0),
    (0, 0, 2, -1, 8822.0),
    (2, -1, 0, -1, 8216.0),
    (2, 0, -2, -1, 4324.0),
    (2, 0, 1, 1, 4200.0),
    (2, 1, 0, -1, -3359.0),
    (2, -1, -1, 1, 2463.0),
    (2, -1, 0, 1, 2211.0),
    (2, -1, -1, -1, 2065.0),
    (0, 1, -1, -1, -1870.0),
    (4, 0, -1, -1, 1828.0),
    (0, 1, 0, 1, -1794.0),
    (0, 0, 0, 3, -1749.0),
    (0, 1, -1, 1, -1565.0),
    (1, 0, 0, 1, -1491.0),
    (0, 1, 1, 1, -1475.0),
    (0, 1, 1, -1, -1410.0),
    (0, 1, 0, -1, -1344.0),
    (1, 0, 0, -1, -1335.0),
];

/// Apparent geocentric ecliptic position of the Moon (Meeus Ch. 47).
/// Returns (apparent longitude °, latitude °, distance km). `dpsi_deg` = nutation in longitude.
pub fn moon_apparent(t: f64, dpsi_deg: f64) -> (f64, f64, f64) {
    let lp = (218.3164477 + 481267.88123421 * t - 0.0015786 * t * t
        + t * t * t / 538841.0 - t.powi(4) / 65194000.0).rem_euclid(360.0);
    let d = (297.8501921 + 445267.1114034 * t - 0.0018819 * t * t
        + t * t * t / 545868.0 - t.powi(4) / 113065000.0).rem_euclid(360.0);
    let m = (357.5291092 + 35999.0502909 * t - 0.0001536 * t * t + t * t * t / 24490000.0)
        .rem_euclid(360.0);
    let mp = (134.9633964 + 477198.8675055 * t + 0.0087414 * t * t
        + t * t * t / 69699.0 - t.powi(4) / 14712000.0).rem_euclid(360.0);
    let f = (93.2720950 + 483202.0175233 * t - 0.0036539 * t * t
        - t * t * t / 3526000.0 + t.powi(4) / 863310000.0).rem_euclid(360.0);
    let a1 = (119.75 + 131.849 * t).rem_euclid(360.0);
    let a2 = (53.09 + 479264.290 * t).rem_euclid(360.0);
    let a3 = (313.45 + 481266.484 * t).rem_euclid(360.0);
    let ecc = 1.0 - 0.002516 * t - 0.0000074 * t * t;

    let mut sum_l = 0.0;
    let mut sum_r = 0.0;
    for &(cd, cm, cmp, cf, cl, cr) in LR.iter() {
        let arg = (cd as f64 * d + cm as f64 * m + cmp as f64 * mp + cf as f64 * f) * D2R;
        let e_pow = ecc.powi(cm.abs());
        sum_l += cl * e_pow * arg.sin();
        sum_r += cr * e_pow * arg.cos();
    }
    let mut sum_b = 0.0;
    for &(cd, cm, cmp, cf, cb) in B.iter() {
        let arg = (cd as f64 * d + cm as f64 * m + cmp as f64 * mp + cf as f64 * f) * D2R;
        sum_b += cb * ecc.powi(cm.abs()) * arg.sin();
    }

    // Additive terms (planetary / figure of the Earth).
    sum_l += 3958.0 * (a1 * D2R).sin() + 1962.0 * ((lp - f) * D2R).sin() + 318.0 * (a2 * D2R).sin();
    sum_b += -2235.0 * (lp * D2R).sin() + 382.0 * (a3 * D2R).sin()
        + 175.0 * ((a1 - f) * D2R).sin() + 175.0 * ((a1 + f) * D2R).sin()
        + 127.0 * ((lp - mp) * D2R).sin() - 115.0 * ((lp + mp) * D2R).sin();

    let lambda = lp + sum_l / 1_000_000.0 + dpsi_deg; // apparent longitude (+ nutation)
    let beta = sum_b / 1_000_000.0;
    let dist_km = 385000.56 + sum_r / 1000.0;
    (lambda.rem_euclid(360.0), beta, dist_km)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::time::centuries;

    #[test]
    fn moon_matches_meeus_example_47a() {
        // 1992-04-12 0h TD → JDE 2448724.5. Meeus 47.a (geometric, no nutation):
        // λ = 133.162655°, β = -3.229126°, Δ = 368409.7 km.
        let t = centuries(2448724.5);
        let (lambda, beta, dist) = moon_apparent(t, 0.0);
        assert!((lambda - 133.162655).abs() < 0.01, "lambda={}", lambda);
        assert!((beta - (-3.229126)).abs() < 0.01, "beta={}", beta);
        // Distance series is truncated; ~17 km error is 0.005% — negligible for parallax/size.
        assert!((dist - 368409.7).abs() < 25.0, "dist={}", dist);
    }

    #[test]
    fn sun_longitude_reasonable_example_25b() {
        // 1992-10-13 0h TD → JDE 2448908.5. Meeus 25.b apparent λ ≈ 199.9090°.
        let t = centuries(2448908.5);
        let (lambda, _, r) = sun_apparent(t);
        assert!((lambda - 199.9090).abs() < 0.01, "lambda={}", lambda);
        assert!((r - 0.99766).abs() < 0.001, "r={}", r);
    }
}
