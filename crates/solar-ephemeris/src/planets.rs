//! Apparent geocentric planet positions from VSOP2013 heliocentric coordinates.

use crate::vsop2013::{self, Planet};
use crate::vsop2013_data::EMB;

const J2000: f64 = 2451545.0;
/// Light-time per AU, in Julian years (≈499.0048 s).
const LIGHT_YEARS_PER_AU: f64 = 0.005775518 / 365.25;
/// Speed of light in AU per Julian year (for annual aberration).
const C_AU_PER_YEAR: f64 = 63239.7263;
/// Moon : (Earth+Moon) mass ratio, for the EMB → Earth-centre correction.
const MOON_MASS_FRACTION: f64 = 0.012150585;

/// Heliocentric ecliptic-J2000 position (AU) of **Earth's centre** — the proper observer for
/// apparent place. VSOP2013 gives the Earth-Moon barycentre; Earth's centre is offset toward the
/// Moon by the lunar mass fraction (≈4671 km), which is ~6″ for the Sun and inner planets.
pub(crate) fn earth_center(jy2k: f64) -> [f64; 3] {
    let emb = vsop2013::helio_xyz(&EMB, jy2k);
    let moon = crate::elpmpp02::moon_xyz(jy2k); // geocentric ecliptic J2000, AU
    [
        emb[0] - MOON_MASS_FRACTION * moon[0],
        emb[1] - MOON_MASS_FRACTION * moon[1],
        emb[2] - MOON_MASS_FRACTION * moon[2],
    ]
}

/// Reduce a geocentric ecliptic-J2000 vector to apparent ecliptic-of-date (lon °, lat °):
/// annual aberration (observer velocity / c), then Meeus-21 precession and nutation in longitude.
/// `vel` is Earth's velocity in AU/yr from a CENTRAL difference — a forward difference samples
/// the velocity ~dt/2 late, rotating the ~20.5″ aberration displacement by ~0.9° (≈0.3″ error).
fn reduce(mut g: [f64; 3], dist: f64, vel: &[f64; 3], jy2k: f64, dpsi_deg: f64) -> (f64, f64) {
    for i in 0..3 {
        g[i] += dist * vel[i] / C_AU_PER_YEAR;
    }
    let lon_j2000 = g[1].atan2(g[0]).to_degrees();
    let lat_j2000 = g[2].atan2((g[0] * g[0] + g[1] * g[1]).sqrt()).to_degrees();
    let (lon_date, lat_date) =
        crate::coords::precess_ecliptic_from_j2000(lon_j2000, lat_j2000, jy2k / 100.0);
    ((lon_date + dpsi_deg).rem_euclid(360.0), lat_date)
}

/// Apparent geocentric ecliptic-of-date (longitude °, latitude °, distance AU) for a planet.
/// Observer is Earth's centre; includes planetary light-time, annual aberration, Meeus-21
/// precession (longitude + latitude), and nutation in longitude.
pub fn planet_apparent_ecliptic(planet: &Planet, jd_tt: f64, dpsi_deg: f64) -> (f64, f64, f64) {
    let jy2k = (jd_tt - J2000) / 365.25;
    let dt = 0.005;
    let earth = earth_center(jy2k);
    let vel = earth_velocity(jy2k, dt);
    // One light-time iteration on the planet's heliocentric position.
    let mut planet_xyz = vsop2013::helio_xyz(planet, jy2k);
    let mut dist = geo_distance(&planet_xyz, &earth);
    planet_xyz = vsop2013::helio_xyz(planet, jy2k - dist * LIGHT_YEARS_PER_AU);
    dist = geo_distance(&planet_xyz, &earth);
    let g = [
        planet_xyz[0] - earth[0],
        planet_xyz[1] - earth[1],
        planet_xyz[2] - earth[2],
    ];
    let (lon, lat) = reduce(g, dist, &vel, jy2k, dpsi_deg);
    (lon, lat, dist)
}

/// Earth-centre velocity (AU/yr) by central difference over ±dt years.
fn earth_velocity(jy2k: f64, dt: f64) -> [f64; 3] {
    let ahead = earth_center(jy2k + dt);
    let behind = earth_center(jy2k - dt);
    [
        (ahead[0] - behind[0]) / (2.0 * dt),
        (ahead[1] - behind[1]) / (2.0 * dt),
        (ahead[2] - behind[2]) / (2.0 * dt),
    ]
}

/// Apparent geocentric ecliptic-of-date position of the Sun. Geocentric Sun = −(Earth's centre);
/// includes annual aberration, precession, and nutation.
pub fn sun_apparent_ecliptic(jd_tt: f64, dpsi_deg: f64) -> (f64, f64, f64) {
    let jy2k = (jd_tt - J2000) / 365.25;
    let dt = 0.005;
    let earth = earth_center(jy2k);
    let vel = earth_velocity(jy2k, dt);
    let dist = (earth[0] * earth[0] + earth[1] * earth[1] + earth[2] * earth[2]).sqrt();
    let g = [-earth[0], -earth[1], -earth[2]];
    let (lon, lat) = reduce(g, dist, &vel, jy2k, dpsi_deg);
    (lon, lat, dist)
}

fn geo_distance(planet: &[f64; 3], earth: &[f64; 3]) -> f64 {
    let (dx, dy, dz) = (
        planet[0] - earth[0],
        planet[1] - earth[1],
        planet[2] - earth[2],
    );
    (dx * dx + dy * dy + dz * dz).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vsop2013_data::JUP;

    #[test]
    fn jupiter_distance_is_plausible() {
        // Geocentric Jupiter distance stays within roughly 4–7 AU.
        let (_, _, dist) = planet_apparent_ecliptic(&JUP, 2460676.5, 0.0);
        assert!(dist > 3.9 && dist < 6.6, "dist={}", dist);
    }
}
