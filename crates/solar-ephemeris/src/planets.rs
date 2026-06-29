//! Major-planet positions from Standish/JPL "Keplerian Elements for Approximate
//! Positions of the Major Planets" (valid 1800–2050; ~arcminute class).

use core::f64::consts::PI;
const D2R: f64 = PI / 180.0;
const R2D: f64 = 180.0 / PI;
/// Light-time for 1 AU, in days (Δ_au × this = light-travel days).
const LIGHT_DAYS_PER_AU: f64 = 0.005775518;

/// a, a'; e, e'; I, I'; L, L'; ϖ, ϖ'; Ω, Ω'  (J2000 value, per Julian century).
#[derive(Clone, Copy)]
pub struct Elements {
    pub a: [f64; 2],
    pub e: [f64; 2],
    pub inc: [f64; 2],
    pub l: [f64; 2],
    pub peri: [f64; 2],
    pub node: [f64; 2],
}

pub const MERCURY: Elements = Elements { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], inc: [7.00497902, -0.00594749], l: [252.25032350, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081] };
pub const VENUS: Elements = Elements { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], inc: [3.39467605, -0.00078890], l: [181.97909950, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] };
pub const EARTH: Elements = Elements { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], inc: [-0.00001531, -0.01294668], l: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0] };
pub const MARS: Elements = Elements { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], inc: [1.84969142, -0.00813131], l: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] };
pub const JUPITER: Elements = Elements { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], inc: [1.30439695, -0.00183714], l: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106] };
pub const SATURN: Elements = Elements { a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], inc: [2.48599187, 0.00193609], l: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794] };
pub const URANUS: Elements = Elements { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], inc: [0.77263783, -0.00242939], l: [313.23810451, 428.48202785], peri: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589] };
pub const NEPTUNE: Elements = Elements { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], inc: [1.77004347, 0.00035372], l: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664] };

/// Heliocentric J2000 ecliptic rectangular coordinates (AU) for a planet at century T.
fn helio_xyz(el: &Elements, t: f64) -> [f64; 3] {
    let a = el.a[0] + el.a[1] * t;
    let e = el.e[0] + el.e[1] * t;
    let inc = (el.inc[0] + el.inc[1] * t) * D2R;
    let l = el.l[0] + el.l[1] * t;
    let peri = el.peri[0] + el.peri[1] * t;
    let node = el.node[0] + el.node[1] * t;
    let omega = (peri - node) * D2R; // argument of perihelion
    let node = node * D2R;

    // Mean anomaly, reduced to [-180,180]°, then eccentric anomaly (Newton).
    let mut m = (l - peri).rem_euclid(360.0);
    if m > 180.0 {
        m -= 360.0;
    }
    let m = m * D2R;
    let mut ecc = m;
    for _ in 0..8 {
        ecc -= (ecc - e * ecc.sin() - m) / (1.0 - e * ecc.cos());
    }

    let xp = a * (ecc.cos() - e);
    let yp = a * (1.0 - e * e).sqrt() * ecc.sin();

    let (co, so) = (omega.cos(), omega.sin());
    let (cn, sn) = (node.cos(), node.sin());
    let (ci, si) = (inc.cos(), inc.sin());
    [
        (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
        (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
        (so * si) * xp + (co * si) * yp,
    ]
}

/// Apparent geocentric ecliptic-of-date (longitude °, latitude °, distance AU) for a planet.
/// Includes light-time, precession of the longitude to date, and nutation in longitude.
pub fn planet_apparent_ecliptic(el: &Elements, t: f64, dpsi_deg: f64) -> (f64, f64, f64) {
    let earth = helio_xyz(&EARTH, t);
    // Geocentric vector with one light-time iteration on the planet's position.
    let mut planet = helio_xyz(el, t);
    let mut dist = geo_distance(&planet, &earth);
    let t_back = t - (dist * LIGHT_DAYS_PER_AU) / 36525.0;
    planet = helio_xyz(el, t_back);
    dist = geo_distance(&planet, &earth);

    let gx = planet[0] - earth[0];
    let gy = planet[1] - earth[1];
    let gz = planet[2] - earth[2];
    let lon_j2000 = gy.atan2(gx) * R2D;
    let lat = gz.atan2((gx * gx + gy * gy).sqrt()) * R2D;
    // General precession of the ecliptic longitude from J2000 to date, plus nutation.
    let lon = lon_j2000 + 1.396971 * t + dpsi_deg;
    (lon.rem_euclid(360.0), lat, dist)
}

fn geo_distance(planet: &[f64; 3], earth: &[f64; 3]) -> f64 {
    let (dx, dy, dz) = (planet[0] - earth[0], planet[1] - earth[1], planet[2] - earth[2]);
    (dx * dx + dy * dy + dz * dz).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::time::centuries;

    #[test]
    fn jupiter_distance_is_plausible() {
        // Geocentric Jupiter distance is always within roughly 4–7 AU.
        let t = centuries(2460676.5); // 2025-01-01
        let (_, _, dist) = planet_apparent_ecliptic(&JUPITER, t, 0.0);
        assert!(dist > 3.9 && dist < 6.6, "dist={}", dist);
    }
}
