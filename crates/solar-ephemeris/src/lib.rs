//! Deterministic ephemeris + topocentric sky engine (Sun & Moon for P0).
//!
//! Deterministic analytic astronomy. The v2 contract separates geocentric and
//! topocentric apparent coordinates and carries UTC, TAI, TT, UT1, DUT1, polar
//! motion, and Earth-orientation quality explicitly.

mod binread;
pub mod coords;
pub mod earth_orientation;
pub mod elpmpp02;
mod elpmpp02_data;
pub mod physics;
pub mod planets;
pub mod stars;
pub mod time;
pub mod timescales;
pub mod top2013;
mod top2013_data;
pub mod vsop2013;
mod vsop2013_data;

use coords::AU_KM;
use std::cell::RefCell;
use timescales::AstroTime;

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
    Body::Sun,
    Body::Moon,
    Body::Mercury,
    Body::Venus,
    Body::Mars,
    Body::Jupiter,
    Body::Saturn,
    Body::Uranus,
    Body::Neptune,
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
    fn elements(self) -> Option<&'static vsop2013::Planet> {
        match self {
            Body::Mercury => Some(vsop2013_data::mer()),
            Body::Venus => Some(vsop2013_data::ven()),
            Body::Mars => Some(vsop2013_data::mar()),
            Body::Jupiter => Some(vsop2013_data::jup()),
            Body::Saturn => Some(vsop2013_data::sat()),
            Body::Uranus => Some(vsop2013_data::ura()),
            Body::Neptune => Some(vsop2013_data::nep()),
            _ => None,
        }
    }
}

/// Apparent geocentric equatorial position + geocentric distance (km).
fn geocentric(body: Body, astro: &AstroTime) -> (f64, f64, f64) {
    let t = time::centuries(astro.jd_tt);
    let (dpsi, deps) = time::nutation_deg(t);
    let eps_true = time::mean_obliquity_deg(t) + deps;
    let (lambda, beta, dist_km) = match body {
        Body::Sun => {
            let (l, b, dist_au) = planets::sun_apparent_ecliptic(astro.jd_tt, dpsi);
            (l, b, dist_au * AU_KM)
        }
        Body::Moon => elpmpp02::moon_apparent_ecliptic(astro.jd_tt, dpsi),
        _ => {
            let el = body.elements().expect("planet elements");
            let (l, b, dist_au) = planets::planet_apparent_ecliptic(el, astro.jd_tt, dpsi);
            (l, b, dist_au * AU_KM)
        }
    };
    let (ra, dec) = coords::ecl_to_equ(lambda, beta, eps_true);
    (ra, dec, dist_km)
}

struct Topo {
    geocentric_ra: f64,
    geocentric_dec: f64,
    topocentric_ra: f64,
    topocentric_dec: f64,
    dist_km: f64,
    alt: f64,
    az: f64,
    alt_refracted: f64,
}

fn topocentric_sky(body: Body, jd_utc: f64, lat: f64, lon_east: f64, elev: f64) -> Topo {
    let astro = AstroTime::from_jd_utc(jd_utc);
    topocentric_sky_at_time(body, &astro, lat, lon_east, elev)
}

fn topocentric_sky_at_time(
    body: Body,
    astro: &AstroTime,
    lat: f64,
    lon_east: f64,
    elev: f64,
) -> Topo {
    let t = time::centuries(astro.jd_tt);
    let (dpsi, deps) = time::nutation_deg(t);
    let eps_true = time::mean_obliquity_deg(t) + deps;
    let (ra, dec, dist_km) = geocentric(body, astro);
    let (observer_lat, observer_lon) = earth_orientation::corrected_observer_geodetic(
        lat,
        lon_east,
        astro.eop.xp_arcsec,
        astro.eop.yp_arcsec,
    );
    let lst = (time::gast_deg(astro.jd_ut1, dpsi, eps_true) + observer_lon).rem_euclid(360.0);
    let (rho_sin, rho_cos) = coords::observer_rho(observer_lat, elev);
    let (ra_t, dec_t) = coords::topocentric(ra, dec, dist_km, lst, rho_sin, rho_cos);
    let (alt, az) = coords::alt_az(ra_t, dec_t, lst, observer_lat);
    Topo {
        geocentric_ra: ra,
        geocentric_dec: dec,
        topocentric_ra: ra_t,
        topocentric_dec: dec_t,
        dist_km,
        alt,
        az,
        alt_refracted: alt + coords::refraction_deg(alt),
    }
}

/// Apparent topocentric place of a catalogue star. At infinite distance its
/// geocentric and topocentric right ascension/declination are identical.
fn star_topocentric(star: &stars::Star, jd_utc: f64, lat: f64, lon_east: f64, _elev: f64) -> Topo {
    let astro = AstroTime::from_jd_utc(jd_utc);
    let t = time::centuries(astro.jd_tt);
    let (dpsi, deps) = time::nutation_deg(t);
    let eps_true = time::mean_obliquity_deg(t) + deps;
    let eps0 = time::mean_obliquity_deg(0.0);
    let (lon0, lat0) = coords::equ_to_ecl(star.ra_deg, star.dec_deg, eps0);
    let (lon_d, lat_d) = coords::precess_ecliptic_from_j2000(lon0, lat0, t);
    let (ra, dec) = coords::ecl_to_equ(lon_d + dpsi, lat_d, eps_true);
    let (observer_lat, observer_lon) = earth_orientation::corrected_observer_geodetic(
        lat,
        lon_east,
        astro.eop.xp_arcsec,
        astro.eop.yp_arcsec,
    );
    let lst = (time::gast_deg(astro.jd_ut1, dpsi, eps_true) + observer_lon).rem_euclid(360.0);
    let (alt, az) = coords::alt_az(ra, dec, lst, observer_lat);
    Topo {
        geocentric_ra: ra,
        geocentric_dec: dec,
        topocentric_ra: ra,
        topocentric_dec: dec,
        dist_km: f64::INFINITY,
        alt,
        az,
        alt_refracted: alt + coords::refraction_deg(alt),
    }
}

/// Rise / transit / set as JD(UTC) within ±0.5 day of `jd_utc`. NaN where none.
fn events(body: Body, jd_utc: f64, lat: f64, lon_east: f64, elev: f64) -> (f64, f64, f64, f64) {
    events_core(
        &|jd| topocentric_sky(body, jd, lat, lon_east, elev).alt_refracted,
        jd_utc,
    )
}

fn star_events(
    star: &stars::Star,
    jd_utc: f64,
    lat: f64,
    lon_east: f64,
    elev: f64,
) -> (f64, f64, f64, f64) {
    events_core(
        &|jd| star_topocentric(star, jd, lat, lon_east, elev).alt_refracted,
        jd_utc,
    )
}

fn events_core(alt_at: &dyn Fn(f64) -> f64, jd_utc: f64) -> (f64, f64, f64, f64) {
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
            rise = bisect_cross(alt_at, prev_jd, jd);
        }
        if prev_alt >= 0.0 && alt < 0.0 && set.is_nan() {
            set = bisect_cross(alt_at, prev_jd, jd);
        }
        prev_jd = jd;
        prev_alt = alt;
    }
    // Refine the transit (culmination) with a 3-point parabolic fit around the best sample, so the
    // returned time/altitude are sub-minute rather than snapped to the 10-minute scan grid.
    let h = 1.0 / (steps as f64); // sample spacing, days
    let a_m = alt_at(transit - h);
    let a_p = alt_at(transit + h);
    let denom = a_m - 2.0 * transit_alt + a_p; // < 0 at a maximum (concave down)
    if denom < 0.0 {
        let dx = 0.5 * (a_m - a_p) / denom; // vertex offset in units of h, |dx| <= 0.5
        transit += dx * h;
        transit_alt -= 0.125 * (a_p - a_m) * (a_p - a_m) / denom;
    }
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
    let astro = AstroTime::from_jd_utc(jd_utc);
    let t = time::centuries(astro.jd_tt);
    let (dpsi, deps) = time::nutation_deg(t);
    let eps_true = time::mean_obliquity_deg(t) + deps;
    let (observer_lat, observer_lon) = earth_orientation::corrected_observer_geodetic(
        lat,
        lon_east,
        astro.eop.xp_arcsec,
        astro.eop.yp_arcsec,
    );
    let lst = (time::gast_deg(astro.jd_ut1, dpsi, eps_true) + observer_lon).rem_euclid(360.0);
    let accuracy_class = if astro.eop.quality.precision_ready() {
        "eop-aware apparent topocentric place"
    } else {
        "degraded Earth-orientation apparent topocentric place"
    };

    let mut out = String::with_capacity(4096);
    out.push_str("{\n");
    out.push_str("  \"schema_version\": \"ephemeris-snapshot.v2\",\n");
    out.push_str(&format!(
        "  \"engine_version\": \"solar-ephemeris {}\",\n",
        env!("CARGO_PKG_VERSION")
    ));
    out.push_str("  \"time\": {");
    out.push_str(&format!(
        "\"jd_utc\":{:.10},\"jd_tai\":{},\"jd_tt\":{:.10},\"jd_ut1\":{:.10},",
        astro.jd_utc,
        jnum(astro.jd_tai.unwrap_or(f64::NAN)),
        astro.jd_tt,
        astro.jd_ut1
    ));
    out.push_str(&format!(
        "\"tai_minus_utc_seconds\":{},\"dut1_seconds\":{:.9},\"delta_t_seconds\":{:.9},",
        jnum(astro.tai_minus_utc_seconds.unwrap_or(f64::NAN)),
        astro.eop.dut1_seconds,
        astro.delta_t_seconds
    ));
    out.push_str(&format!(
        "\"lst_deg\":{:.9},\"obliquity_deg\":{:.9},",
        lst, eps_true
    ));
    out.push_str("\"earth_orientation\":{");
    out.push_str(&format!(
        "\"source\":\"{}\",\"quality\":\"{}\",\"xp_arcsec\":{:.8},\"yp_arcsec\":{:.8},\"dut1_uncertainty_seconds\":{:.8}",
        astro.eop.source,
        astro.eop.quality.name(),
        astro.eop.xp_arcsec,
        astro.eop.yp_arcsec,
        astro.eop.dut1_uncertainty_seconds
    ));
    out.push_str("}},\n");
    out.push_str("  \"observer\": {");
    out.push_str(&format!(
        "\"terrestrial_lat_deg\":{:.8},\"terrestrial_lon_deg_east\":{:.8},\"polar_motion_corrected_lat_deg\":{:.8},\"polar_motion_corrected_lon_deg_east\":{:.8},\"elev_m\":{:.3}",
        lat, lon_east, observer_lat, observer_lon, elev
    ));
    out.push_str("},\n");
    out.push_str("  \"accuracy\": {");
    out.push_str(&format!("\"class\":\"{}\",", accuracy_class));
    out.push_str("\"coordinate_semantics\":\"ra_deg and dec_deg are apparent topocentric coordinates; geocentric and topocentric values are also emitted under explicit field names\",");
    out.push_str("\"time_scales\":\"UTC to TAI from leap-second table, TT = TAI + 32.184 s, UT1 = UTC + DUT1\",");
    out.push_str(&format!("\"eop_status\":\"{}\",", astro.eop.quality.name()));
    out.push_str("\"validation_scope\":\"Numerical claims are limited to the committed regression matrix and independently rerunnable JPL Horizons validation\",");
    out.push_str("\"valid_epoch\":\"Precision Earth rotation is limited to the declared EOP source coverage; outside it the snapshot is explicitly degraded\",");
    out.push_str(
        "\"non_goal\":\"navigation, occultation prediction, or safety-critical timing\"},\n",
    );
    out.push_str("  \"bodies\": [\n");

    for (index, body) in ALL_BODIES.iter().enumerate() {
        let s = topocentric_sky_at_time(*body, &astro, lat, lon_east, elev);
        let (rise, transit, set, transit_alt) = events(*body, jd_utc, lat, lon_east, elev);
        let angular_size =
            2.0 * (body.radius_km() / s.dist_km).asin() * (180.0 / std::f64::consts::PI) * 3600.0;
        if index > 0 {
            out.push_str(",\n");
        }
        out.push_str("    {");
        out.push_str(&format!(
            "\"name\":\"{}\",\"kind\":\"{}\",\"coordinate_frame\":\"true_equator_and_equinox_of_date\",",
            body.name(),
            body.kind()
        ));
        out.push_str(&format!(
            "\"ra_deg\":{:.9},\"dec_deg\":{:.9},\"geocentric_apparent_ra_deg\":{:.9},\"geocentric_apparent_dec_deg\":{:.9},\"topocentric_apparent_ra_deg\":{:.9},\"topocentric_apparent_dec_deg\":{:.9},\"distance_km\":{:.3},",
            s.topocentric_ra,
            s.topocentric_dec,
            s.geocentric_ra,
            s.geocentric_dec,
            s.topocentric_ra,
            s.topocentric_dec,
            s.dist_km
        ));
        out.push_str(&format!(
            "\"alt_deg\":{:.7},\"az_deg\":{:.7},\"alt_refracted_deg\":{:.7},\"above_horizon\":{},",
            s.alt,
            s.az,
            s.alt_refracted,
            s.alt_refracted > 0.0
        ));
        out.push_str(&format!("\"compass\":\"{}\",", compass(s.az)));
        out.push_str(&format!(
            "\"angular_size_arcsec\":{:.4},\"horizontal_parallax_deg\":{:.9},",
            angular_size,
            coords::horizontal_parallax_deg(s.dist_km)
        ));
        out.push_str(&format!(
            "\"rise_jd\":{},\"transit_jd\":{},\"set_jd\":{},\"transit_alt_deg\":{:.6}",
            jnum(rise),
            jnum(transit),
            jnum(set),
            transit_alt
        ));
        out.push('}');
    }

    for star in stars::STARS.iter() {
        let s = star_topocentric(star, jd_utc, lat, lon_east, elev);
        let (rise, transit, set, transit_alt) = star_events(star, jd_utc, lat, lon_east, elev);
        out.push_str(",\n    {");
        out.push_str(&format!(
            "\"name\":\"{}\",\"kind\":\"star\",\"coordinate_frame\":\"true_equator_and_equinox_of_date\",",
            star.name
        ));
        out.push_str(&format!(
            "\"ra_deg\":{:.9},\"dec_deg\":{:.9},\"geocentric_apparent_ra_deg\":{:.9},\"geocentric_apparent_dec_deg\":{:.9},\"topocentric_apparent_ra_deg\":{:.9},\"topocentric_apparent_dec_deg\":{:.9},\"distance_km\":null,",
            s.topocentric_ra,
            s.topocentric_dec,
            s.geocentric_ra,
            s.geocentric_dec,
            s.topocentric_ra,
            s.topocentric_dec
        ));
        out.push_str(&format!(
            "\"alt_deg\":{:.7},\"az_deg\":{:.7},\"alt_refracted_deg\":{:.7},\"above_horizon\":{},",
            s.alt,
            s.az,
            s.alt_refracted,
            s.alt_refracted > 0.0
        ));
        out.push_str(&format!("\"compass\":\"{}\",", compass(s.az)));
        out.push_str(&format!(
            "\"angular_size_arcsec\":0,\"horizontal_parallax_deg\":0,\"magnitude\":{:.2},",
            star.mag
        ));
        out.push_str(&format!(
            "\"rise_jd\":{},\"transit_jd\":{},\"set_jd\":{},\"transit_alt_deg\":{:.6}",
            jnum(rise),
            jnum(transit),
            jnum(set),
            transit_alt
        ));
        out.push('}');
    }
    out.push_str("\n  ],\n");
    out.push_str(
        "  \"warnings\": [\"Analytic apparent place; research and observing-planning only.\"",
    );
    if !astro.eop.quality.precision_ready() {
        out.push_str(",\"Earth orientation is degraded for this epoch; sub-arcsecond topocentric accuracy is not asserted.\"");
    }
    out.push_str("]\n");
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
    const PTS: [&str; 16] = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW",
        "NW", "NNW",
    ];
    PTS[(((az_deg + 11.25).rem_euclid(360.0)) / 22.5) as usize % 16]
}

/// Heliocentric ecliptic-J2000 positions (AU) of the planets for the top-down orbit view.
pub fn system_snapshot_json(jd_utc: f64) -> String {
    let jd_tt = AstroTime::from_jd_utc(jd_utc).jd_tt;
    let jy2k = (jd_tt - time::J2000) / 365.25;
    let bodies: [(&str, &vsop2013::Planet); 8] = [
        ("Mercury", vsop2013_data::mer()),
        ("Venus", vsop2013_data::ven()),
        ("Earth", vsop2013_data::emb()),
        ("Mars", vsop2013_data::mar()),
        ("Jupiter", vsop2013_data::jup()),
        ("Saturn", vsop2013_data::sat()),
        ("Uranus", vsop2013_data::ura()),
        ("Neptune", vsop2013_data::nep()),
    ];
    const AU_PER_YEAR_KMS: f64 = 4.740_57; // 1 AU/yr in km/s
                                           // Earth's CENTRE, not the Earth-Moon barycentre: VSOP2013's EMB sits ~4671 km toward the
                                           // Moon. Using it as "Earth" also overstated the Earth→Moon separation by the same amount
                                           // (EMB + geocentric Moon double-counts the barycentre offset by the lunar mass fraction).
    let earth = planets::earth_center(jy2k);
    let sun_earth = (earth[0] * earth[0] + earth[1] * earth[1] + earth[2] * earth[2]).sqrt();
    let dt = 0.001; // years, for the velocity finite difference

    let mut out = String::with_capacity(2048);
    out.push_str("{\n  \"schema_version\": \"system-snapshot.v1\",\n");
    out.push_str(&format!("  \"jd_utc\": {:.6},\n  \"bodies\": [\n", jd_utc));
    // Jupiter–Neptune use TOP2013 (sub-arcsec for the giants over ±6000 yr, where VSOP2013 drifts to
    // hundreds of arcsec); the inner planets stay on VSOP2013. Same equinoctial frame, so they mix.
    let helio = |name: &str, planet: &vsop2013::Planet, t: f64| -> [f64; 3] {
        if name == "Earth" {
            return planets::earth_center(t);
        }
        match top2013::outer_index(name) {
            Some(idx) => top2013::helio_xyz(idx, t),
            None => vsop2013::helio_xyz(planet, t),
        }
    };
    for (i, (name, planet)) in bodies.iter().enumerate() {
        let xyz = helio(name, planet, jy2k);
        let r = (xyz[0] * xyz[0] + xyz[1] * xyz[1] + xyz[2] * xyz[2]).sqrt();
        let delta = {
            let d = [xyz[0] - earth[0], xyz[1] - earth[1], xyz[2] - earth[2]];
            (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt()
        };
        let ahead = helio(name, planet, jy2k + dt);
        let behind = helio(name, planet, jy2k - dt);
        let speed = {
            // Central difference — O(dt²) accurate vs the forward difference's O(dt).
            let d = [
                ahead[0] - behind[0],
                ahead[1] - behind[1],
                ahead[2] - behind[2],
            ];
            (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt() / (2.0 * dt) * AU_PER_YEAR_KMS
        };
        // Phase / illumination / magnitude only make sense for a body seen from Earth.
        let (phase, illum, mut mag) = if *name != "Earth" && delta > 1e-9 {
            let a = physics::phase_angle_deg(r, delta, sun_earth);
            (
                Some(a),
                Some(physics::illuminated_fraction(a)),
                physics::magnitude(name, r, delta, a),
            )
        } else {
            (None, None, None)
        };
        // Saturn: add the ring brightening term, which needs the geocentric equatorial direction.
        if *name == "Saturn" {
            if let Some(m) = mag {
                let g = [xyz[0] - earth[0], xyz[1] - earth[1], xyz[2] - earth[2]];
                let eps = 23.43928_f64.to_radians(); // J2000 obliquity (ecliptic→equatorial)
                let (ex, ey, ez) = (
                    g[0],
                    g[1] * eps.cos() - g[2] * eps.sin(),
                    g[1] * eps.sin() + g[2] * eps.cos(),
                );
                let ra = ey.atan2(ex).to_degrees();
                let dec = (ez / (ex * ex + ey * ey + ez * ez).sqrt())
                    .asin()
                    .to_degrees();
                mag = Some(m + physics::saturn_ring_mag(ra, dec));
            }
        }
        let (a, ecc, inc, node, argp) = match top2013::outer_index(name) {
            Some(idx) => top2013::elements(idx, jy2k),
            None => vsop2013::elements(planet, jy2k),
        };
        if i > 0 {
            out.push_str(",\n");
        }
        out.push_str(&format!(
            "    {{\"name\":\"{}\",\"x_au\":{:.8},\"y_au\":{:.8},\"z_au\":{:.8},\"dist_au\":{:.8},\
             \"geo_dist_au\":{:.8},\"speed_kms\":{:.3},\"phase_angle_deg\":{},\
             \"illuminated_fraction\":{},\"magnitude\":{},\"equilibrium_temp_k\":{},\"mean_temp_k\":{},\
             \"a_au\":{:.8},\"ecc\":{:.8},\"inc_deg\":{:.6},\"node_deg\":{:.6},\"argp_deg\":{:.6}}}",
            name, xyz[0], xyz[1], xyz[2], r, delta, speed,
            opt(phase, 2), opt(illum, 4), opt(mag, 2), opt(physics::equilibrium_temp_k(name, r), 1),
            opt(physics::mean_temp_k(name), 0),
            a, ecc, inc.to_degrees(), node.to_degrees(), argp.to_degrees()
        ));
    }
    // The Moon: ELP-MPP02 geocentric position added to Earth's CENTRE heliocentric position, so
    // the 3-D view places it beside the Earth with the correct direction, distance, and phase.
    {
        let mg = elpmpp02::moon_xyz(jy2k);
        let moon = [earth[0] + mg[0], earth[1] + mg[1], earth[2] + mg[2]];
        let r = (moon[0] * moon[0] + moon[1] * moon[1] + moon[2] * moon[2]).sqrt();
        let delta = (mg[0] * mg[0] + mg[1] * mg[1] + mg[2] * mg[2]).sqrt();
        let ea = planets::earth_center(jy2k + dt);
        let eb = planets::earth_center(jy2k - dt);
        let ma = elpmpp02::moon_xyz(jy2k + dt);
        let mb = elpmpp02::moon_xyz(jy2k - dt);
        let d = [
            (ea[0] + ma[0]) - (eb[0] + mb[0]),
            (ea[1] + ma[1]) - (eb[1] + mb[1]),
            (ea[2] + ma[2]) - (eb[2] + mb[2]),
        ];
        let speed = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt() / (2.0 * dt) * AU_PER_YEAR_KMS;
        let a = physics::phase_angle_deg(r, delta, sun_earth);
        let illum = physics::illuminated_fraction(a);
        out.push_str(&format!(
            ",\n    {{\"name\":\"Moon\",\"x_au\":{:.8},\"y_au\":{:.8},\"z_au\":{:.8},\"dist_au\":{:.8},\
             \"geo_dist_au\":{:.8},\"speed_kms\":{:.3},\"phase_angle_deg\":{:.2},\
             \"illuminated_fraction\":{:.4},\"magnitude\":null,\"equilibrium_temp_k\":null,\"mean_temp_k\":250,\
             \"a_au\":null,\"ecc\":null,\"inc_deg\":null,\"node_deg\":null,\"argp_deg\":null}}",
            moon[0], moon[1], moon[2], r, delta, speed, a, illum
        ));
    }
    out.push_str("\n  ]\n}\n");
    out
}

/// Format an optional float as a JSON number (or `null`).
fn opt(v: Option<f64>, prec: usize) -> String {
    match v {
        Some(x) if x.is_finite() => format!("{:.*}", prec, x),
        _ => "null".to_string(),
    }
}

// --- WASM ABI (raw, no wasm-bindgen) ---
thread_local! {
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Compute a sky snapshot for a Unix time + observer; returns a pointer to UTF-8 JSON bytes.
#[no_mangle]
pub extern "C" fn sky_snapshot(
    unix_seconds: f64,
    lat_deg: f64,
    lon_deg_east: f64,
    elev_m: f64,
) -> *const u8 {
    let jd_utc = time::jd_from_unix(unix_seconds);
    let json = sky_snapshot_json(jd_utc, lat_deg, lon_deg_east, elev_m);
    RESULT.with(|cell| {
        *cell.borrow_mut() = json.into_bytes();
        cell.borrow().as_ptr()
    })
}

/// Heliocentric positions of the planets for the orbit view; pointer to UTF-8 JSON.
#[no_mangle]
pub extern "C" fn system_snapshot(unix_seconds: f64) -> *const u8 {
    let jd_utc = time::jd_from_unix(unix_seconds);
    let json = system_snapshot_json(jd_utc);
    RESULT.with(|cell| {
        *cell.borrow_mut() = json.into_bytes();
        cell.borrow().as_ptr()
    })
}

/// Topocentric alt/az track of a single body over `n` samples (no rise/set events, so it is cheap
/// enough to call densely) — for precise trajectory arcs in the sky dome. `body_idx` indexes
/// ALL_BODIES (0=Sun, 1=Moon, 2=Mercury, 3=Venus, 4=Mars, 5=Jupiter, 6=Saturn, 7=Uranus, 8=Neptune).
/// Samples start at `unix0` and step by `dt_seconds`. Returns JSON `[{"alt":..,"az":..,"up":bool},..]`
/// (refracted altitude). Unlike a fixed-RA sweep, this re-solves the body's position at every sample,
/// so it is exact for the fast-moving Moon as well as the Sun and planets.
#[no_mangle]
pub extern "C" fn body_track(
    body_idx: u32,
    lat_deg: f64,
    lon_deg_east: f64,
    elev_m: f64,
    unix0: f64,
    dt_seconds: f64,
    n: u32,
) -> *const u8 {
    let body = ALL_BODIES[(body_idx as usize) % ALL_BODIES.len()];
    let count = n.min(2000) as usize;
    let mut out = String::with_capacity(16 + 36 * count);
    out.push('[');
    for i in 0..count {
        let unix = unix0 + (i as f64) * dt_seconds;
        let jd = time::jd_from_unix(unix);
        let s = topocentric_sky(body, jd, lat_deg, lon_deg_east, elev_m);
        if i > 0 {
            out.push(',');
        }
        out.push_str(&format!(
            "{{\"alt\":{:.4},\"az\":{:.4},\"up\":{}}}",
            s.alt_refracted,
            s.az,
            s.alt_refracted > 0.0
        ));
    }
    out.push(']');
    RESULT.with(|cell| {
        *cell.borrow_mut() = out.into_bytes();
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
        assert!(json.contains("ephemeris-snapshot.v2"));
        assert!(json.contains("topocentric_apparent_ra_deg"));
        assert!(json.contains("dut1_seconds"));
        assert!(json.contains("\"name\":\"Sun\""));
        assert!(json.contains("\"name\":\"Moon\""));
    }

    #[test]
    fn lunar_topocentric_coordinates_are_not_geocentric_aliases() {
        let astro = AstroTime::from_jd_utc(2_400_000.5 + 61_223.0);
        let moon = topocentric_sky_at_time(Body::Moon, &astro, 42.36, -71.06, 0.0);
        let separation = (moon.topocentric_ra - moon.geocentric_ra).abs()
            + (moon.topocentric_dec - moon.geocentric_dec).abs();
        assert!(separation > 1.0e-5);
    }
}
