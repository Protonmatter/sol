//! Deterministic ephemeris + topocentric sky engine (Sun & Moon for P0).
//!
//! Pure math (Meeus). Produces apparent geocentric RA/Dec and topocentric alt/az for an
//! observer, plus rise/transit/set — emitted as `ephemeris-snapshot.v1` JSON. Validated
//! against JPL Horizons (see tools/validate_ephemeris.py).

pub mod bodies;
pub mod coords;
pub mod planets;
pub mod time;

use coords::AU_KM;
use std::cell::RefCell;

#[derive(Clone, Copy, PartialEq)]
pub enum Body {
    Sun,
    Moon,
    Mercury,
    Venus,
    Mars,
    Jupiter,
    Saturn,
    Uranus,
    Neptune,
}

const ALL_BODIES: [Body; 9] = [
    Body::Sun, Body::Moon, Body::Mercury, Body::Venus, Body::Mars,
    Body::Jupiter, Body::Saturn, Body::Uranus, Body::Neptune,
];

impl Body {
    fn name(self) -> &'static str {
        match self {
            Body::Sun => "Sun",
            Body::Moon => "Moon",
            Body::Mercury => "Mercury",
            Body::Venus => "Venus",
            Body::Mars => "Mars",
            Body::Jupiter => "Jupiter",
            Body::Saturn => "Saturn",
            Body::Uranus => "Uranus",
            Body::Neptune => "Neptune",
        }
    }
    fn kind(self) -> &'static str {
        match self {
            Body::Sun => "star",
            Body::Moon => "moon",
            _ => "planet",
        }
    }
    fn radius_km(self) -> f64 {
        match self {
            Body::Sun => 695700.0,
            Body::Moon => 1737.4,
            Body::Mercury => 2439.7,
            Body::Venus => 6051.8,
            Body::Mars => 3389.5,
            Body::Jupiter => 69911.0,
            Body::Saturn => 58232.0,
            Body::Uranus => 25362.0,
            Body::Neptune => 24622.0,
        }
    }
    fn elements(self) -> Option<&'static planets::Elements> {
        match self {
            Body::Mercury => Some(&planets::MERCURY),
            Body::Venus => Some(&planets::VENUS),
            Body::Mars => Some(&planets::MARS),
            Body::Jupiter => Some(&planets::JUPITER),
            Body::Saturn => Some(&planets::SATURN),
            Body::Uranus => Some(&planets::URANUS),
            Body::Neptune => Some(&planets::NEPTUNE),
            _ => None,
        }
    }
}

/// Apparent geocentric equatorial position + geocentric distance (km).
fn geocentric(body: Body, jd_utc: f64) -> (f64, f64, f64) {
    let year = time::year_from_jd(jd_utc);
    let jd_tt = jd_utc + time::delta_t_seconds(year) / 86400.0;
    let t = time::centuries(jd_tt);
    let (dpsi, deps) = time::nutation_deg(t);
    let eps_true = time::mean_obliquity_deg(t) + deps;
    let (lambda, beta, dist_km) = match body {
        Body::Sun => {
            let (l, b, r_au) = bodies::sun_apparent(t);
            (l, b, r_au * AU_KM)
        }
        Body::Moon => bodies::moon_apparent(t, dpsi),
        _ => {
            let el = body.elements().expect("planet elements");
            let (l, b, dist_au) = planets::planet_apparent_ecliptic(el, t, dpsi);
            (l, b, dist_au * AU_KM)
        }
    };
    let (ra, dec) = coords::ecl_to_equ(lambda, beta, eps_true);
    (ra, dec, dist_km)
}

struct Topo {
    ra: f64,
    dec: f64,
    dist_km: f64,
    alt: f64,
    az: f64,
    alt_refracted: f64,
}

fn topocentric_sky(body: Body, jd_utc: f64, lat: f64, lon_east: f64, elev: f64) -> Topo {
    let year = time::year_from_jd(jd_utc);
    let jd_tt = jd_utc + time::delta_t_seconds(year) / 86400.0;
    let t = time::centuries(jd_tt);
    let (dpsi, deps) = time::nutation_deg(t);
    let eps_true = time::mean_obliquity_deg(t) + deps;
    let (ra, dec, dist_km) = geocentric(body, jd_utc);
    let lst = (time::gast_deg(jd_utc, dpsi, eps_true) + lon_east).rem_euclid(360.0);
    let (rho_sin, rho_cos) = coords::observer_rho(lat, elev);
    let (ra_t, dec_t) = coords::topocentric(ra, dec, dist_km, lst, rho_sin, rho_cos);
    let (alt, az) = coords::alt_az(ra_t, dec_t, lst, lat);
    Topo { ra, dec, dist_km, alt, az, alt_refracted: alt + coords::refraction_deg(alt) }
}

/// Rise / transit / set as JD(UTC) within ±0.5 day of `jd_utc`. NaN where none.
fn events(body: Body, jd_utc: f64, lat: f64, lon_east: f64, elev: f64) -> (f64, f64, f64, f64) {
    let alt_at = |jd: f64| topocentric_sky(body, jd, lat, lon_east, elev).alt_refracted;
    let steps = 144; // 10-minute sampling over 24h
    let mut prev_jd = jd_utc - 0.5;
    let mut prev_alt = alt_at(prev_jd);
    let mut rise = f64::NAN;
    let mut set = f64::NAN;
    let mut transit = prev_jd;
    let mut transit_alt = prev_alt;
    for i in 1..=steps {
        let jd = jd_utc - 0.5 + (i as f64) / (steps as f64);
        let alt = alt_at(jd);
        if alt > transit_alt {
            transit_alt = alt;
            transit = jd;
        }
        if prev_alt < 0.0 && alt >= 0.0 && rise.is_nan() {
            rise = bisect_cross(&alt_at, prev_jd, jd);
        }
        if prev_alt >= 0.0 && alt < 0.0 && set.is_nan() {
            set = bisect_cross(&alt_at, prev_jd, jd);
        }
        prev_jd = jd;
        prev_alt = alt;
    }
    // Refine transit by parabolic-ish bisection on the derivative sign.
    (rise, transit, set, transit_alt)
}

fn bisect_cross(f: &dyn Fn(f64) -> f64, mut a: f64, mut b: f64) -> f64 {
    let mut fa = f(a);
    for _ in 0..24 {
        let m = 0.5 * (a + b);
        let fm = f(m);
        if (fa < 0.0) == (fm < 0.0) {
            a = m;
            fa = fm;
        } else {
            b = m;
        }
    }
    0.5 * (a + b)
}

pub fn sky_snapshot_json(jd_utc: f64, lat: f64, lon_east: f64, elev: f64) -> String {
    let year = time::year_from_jd(jd_utc);
    let dt = time::delta_t_seconds(year);
    let jd_tt = jd_utc + dt / 86400.0;
    let t = time::centuries(jd_tt);
    let (dpsi, deps) = time::nutation_deg(t);
    let eps_true = time::mean_obliquity_deg(t) + deps;
    let lst = (time::gast_deg(jd_utc, dpsi, eps_true) + lon_east).rem_euclid(360.0);

    let mut out = String::with_capacity(2048);
    out.push_str("{\n");
    out.push_str("  \"schema_version\": \"ephemeris-snapshot.v1\",\n");
    out.push_str(&format!("  \"engine_version\": \"solar-ephemeris {}\",\n", env!("CARGO_PKG_VERSION")));
    out.push_str("  \"time\": {");
    out.push_str(&format!("\"jd_utc\":{:.8},\"jd_tt\":{:.8},\"delta_t_seconds\":{:.2},\"lst_deg\":{:.6},\"obliquity_deg\":{:.6}", jd_utc, jd_tt, dt, lst, eps_true));
    out.push_str("},\n");
    out.push_str("  \"observer\": {");
    out.push_str(&format!("\"lat_deg\":{:.6},\"lon_deg\":{:.6},\"elev_m\":{:.1}", lat, lon_east, elev));
    out.push_str("},\n");
    out.push_str("  \"accuracy\": {\"class\":\"analytic apparent place (Meeus); validated vs JPL Horizons\",\"theory\":\"Sun Meeus-25, Moon Meeus-47 (principal terms)\",\"validated_against\":\"JPL Horizons DE441\",\"non_goal\":\"navigation / occultation timing\"},\n");
    out.push_str("  \"bodies\": [\n");
    for (i, body) in ALL_BODIES.iter().enumerate() {
        let s = topocentric_sky(*body, jd_utc, lat, lon_east, elev);
        let (rise, transit, set, transit_alt) = events(*body, jd_utc, lat, lon_east, elev);
        let ang_size = 2.0 * (body.radius_km() / s.dist_km).asin() * (180.0 / std::f64::consts::PI) * 3600.0;
        if i > 0 {
            out.push_str(",\n");
        }
        out.push_str("    {");
        out.push_str(&format!("\"name\":\"{}\",\"kind\":\"{}\",", body.name(), body.kind()));
        out.push_str(&format!("\"ra_deg\":{:.6},\"dec_deg\":{:.6},\"distance_km\":{:.1},", s.ra, s.dec, s.dist_km));
        out.push_str(&format!("\"alt_deg\":{:.5},\"az_deg\":{:.5},\"alt_refracted_deg\":{:.5},\"above_horizon\":{},", s.alt, s.az, s.alt_refracted, s.alt_refracted > 0.0));
        out.push_str(&format!("\"compass\":\"{}\",", compass(s.az)));
        out.push_str(&format!("\"angular_size_arcsec\":{:.2},\"horizontal_parallax_deg\":{:.6},", ang_size, coords::horizontal_parallax_deg(s.dist_km)));
        out.push_str(&format!("\"rise_jd\":{},\"transit_jd\":{},\"set_jd\":{},\"transit_alt_deg\":{:.3}", jnum(rise), jnum(transit), jnum(set), transit_alt));
        out.push('}');
    }
    out.push_str("\n  ],\n");
    out.push_str("  \"warnings\": [\"Analytic apparent place; research/observing-planning only, not navigation.\"]\n");
    out.push_str("}\n");
    out
}

fn jnum(v: f64) -> String {
    if v.is_finite() {
        format!("{:.8}", v)
    } else {
        "null".to_string()
    }
}

fn compass(az_deg: f64) -> &'static str {
    const PTS: [&str; 16] = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    PTS[(((az_deg + 11.25).rem_euclid(360.0)) / 22.5) as usize % 16]
}

// --- WASM ABI (raw, no wasm-bindgen) ---
thread_local! {
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Compute a sky snapshot for a Unix time + observer; returns a pointer to UTF-8 JSON bytes.
#[no_mangle]
pub extern "C" fn sky_snapshot(unix_seconds: f64, lat_deg: f64, lon_deg_east: f64, elev_m: f64) -> *const u8 {
    let jd_utc = time::jd_from_unix(unix_seconds);
    let json = sky_snapshot_json(jd_utc, lat_deg, lon_deg_east, elev_m);
    RESULT.with(|cell| {
        *cell.borrow_mut() = json.into_bytes();
        cell.borrow().as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn result_len() -> usize {
    RESULT.with(|cell| cell.borrow().len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_is_well_formed() {
        // 2024-01-01 00:00 UTC ≈ JD 2460310.5, Boston.
        let json = sky_snapshot_json(2460310.5, 42.36, -71.06, 0.0);
        assert!(json.contains("ephemeris-snapshot.v1"));
        assert!(json.contains("\"name\":\"Sun\""));
        assert!(json.contains("\"name\":\"Moon\""));
    }
}
