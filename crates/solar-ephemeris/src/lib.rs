//! Deterministic ephemeris + topocentric sky engine (Sun & Moon for P0).
//!
//! Deterministic analytic astronomy. The v3 contract separates geocentric and
//! topocentric apparent coordinates and carries UTC, TAI, TT, UT1, DUT1, polar
//! motion, and Earth-orientation quality explicitly.

mod binread;
pub mod blob_validate;
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
    observer_range_km: f64,
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
    // Subtract the terrestrial observer vector in the same equatorial frame as
    // the geocentric direction. The distance is not the geocentric parallax base.
    let h = (ra - lst).to_radians();
    let d = dec.to_radians();
    let x = dist_km * d.cos() * h.cos() - 6378.14 * rho_cos;
    let y = dist_km * d.cos() * h.sin();
    let z = dist_km * d.sin() - 6378.14 * rho_sin;
    let observer_range_km = x.hypot(y).hypot(z);
    let (alt, az) = coords::alt_az(ra_t, dec_t, lst, observer_lat);
    Topo {
        geocentric_ra: ra,
        geocentric_dec: dec,
        topocentric_ra: ra_t,
        topocentric_dec: dec_t,
        dist_km,
        observer_range_km,
        alt,
        az,
        alt_refracted: alt + coords::refraction_deg(alt),
    }
}

/// Catalogue (J2000) place of a star advanced by proper motion to `years` past J2000.
/// μα is stored as μα·cosδ (the SIMBAD/Hipparcos convention), so the RA rate is divided
/// back by cosδ — the clamp keeps Polaris (δ ≈ 89.26°, cosδ ≈ 0.013) finite; its RA
/// legitimately moves fast near the pole and the great-circle motion stays correct.
fn star_catalog_place_of_date(star: &stars::Star, years: f64) -> (f64, f64) {
    let dec = star.dec_deg + star.pm_dec_mas_yr * years / 3.6e6;
    let cos_dec = (star.dec_deg.to_radians()).cos().abs().max(1e-6);
    let ra = star.ra_deg + star.pm_ra_mas_yr * years / 3.6e6 / cos_dec;
    (ra, dec)
}

/// Apparent topocentric place of a catalogue star. At infinite distance its
/// geocentric and topocentric right ascension/declination are identical.
fn star_topocentric(star: &stars::Star, jd_utc: f64, lat: f64, lon_east: f64, _elev: f64) -> Topo {
    let astro = AstroTime::from_jd_utc(jd_utc);
    let t = time::centuries(astro.jd_tt);
    let (dpsi, deps) = time::nutation_deg(t);
    let eps_true = time::mean_obliquity_deg(t) + deps;
    let eps0 = time::mean_obliquity_deg(0.0);
    // Proper motion first (in the J2000 frame), then the standard reduction.
    let years = (astro.jd_tt - time::J2000) / 365.25;
    let (ra_cat, dec_cat) = star_catalog_place_of_date(star, years);
    let (lon0, lat0) = coords::equ_to_ecl(ra_cat, dec_cat, eps0);
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
        observer_range_km: f64::INFINITY,
        alt,
        az,
        alt_refracted: alt + coords::refraction_deg(alt),
    }
}

const STANDARD_REFRACTION_DEG: f64 = 34.0 / 60.0;

/// Standard geometric centre altitude used for a rise/set crossing. Topocentric
/// parallax is already applied by `topocentric_sky`, so the Sun and Moon need
/// only atmospheric refraction plus their instantaneous apparent semidiameter.
fn standard_altitude_deg(body: Body, distance_km: f64) -> f64 {
    match body {
        Body::Sun | Body::Moon => {
            let semidiameter = (body.radius_km() / distance_km)
                .clamp(-1.0, 1.0)
                .asin()
                .to_degrees();
            -(STANDARD_REFRACTION_DEG + semidiameter)
        }
        _ => -STANDARD_REFRACTION_DEG,
    }
}

/// Start of the observer's local mean-solar day, expressed as JD(UTC).
/// Civil timezone/DST is deliberately not inferred from longitude.
fn local_solar_day_start(jd_utc: f64, lon_east: f64) -> f64 {
    let offset_days = lon_east / 360.0;
    ((jd_utc - 0.5 + offset_days).floor() + 0.5) - offset_days
}

/// Rise / transit / set as JD(UTC) during the observer's local mean-solar day.
/// NaN is returned when an event does not occur in that interval.
fn events(body: Body, jd_utc: f64, lat: f64, lon_east: f64, elev: f64) -> EventSolution {
    events_detailed(
        &|jd| {
            let sky = topocentric_sky(body, jd, lat, lon_east, elev);
            (
                sky.alt - standard_altitude_deg(body, sky.observer_range_km),
                sky.alt,
            )
        },
        local_solar_day_start(jd_utc, lon_east),
    )
}

fn star_events(
    star: &stars::Star,
    jd_utc: f64,
    lat: f64,
    lon_east: f64,
    elev: f64,
) -> EventSolution {
    events_detailed(
        &|jd| {
            let sky = star_topocentric(star, jd, lat, lon_east, elev);
            (sky.alt + STANDARD_REFRACTION_DEG, sky.alt)
        },
        local_solar_day_start(jd_utc, lon_east),
    )
}

#[derive(Debug)]
struct EventSolution {
    values: (f64, f64, f64, f64),
    transit_failed: bool,
}

impl EventSolution {
    fn json(&self) -> String {
        let (rise, transit, set, altitude) = self.values;
        let mut output = String::from("\"events\":{");
        for (index, (name, jd)) in [("rise", rise), ("transit", transit), ("set", set)]
            .iter()
            .enumerate()
        {
            if index > 0 {
                output.push(',');
            }
            let failed = *name == "transit" && self.transit_failed;
            let calculation = if failed { "failed" } else { "calculated" };
            let occurrence = if failed {
                "unknown"
            } else if jd.is_finite() {
                "occurs"
            } else {
                "none_in_window"
            };
            output.push_str(&format!("\"{}\":{{\"jd\":{},\"calculation_status\":\"{}\",\"occurrence_status\":\"{}\",\"source\":{{\"engine\":\"solar-ephemeris\",\"version\":\"{}\"}}", name, jnum(*jd), calculation, occurrence, env!("CARGO_PKG_VERSION")));
            if *name == "transit" {
                output.push_str(&format!(",\"altitude_deg\":{}", jnum(altitude)));
            }
            output.push('}');
        }
        output.push('}');
        output
    }
}

// Kept as a test convenience for the reviewed P05 numerical regressions.
#[cfg(test)]
fn events_core(sample: &dyn Fn(f64) -> (f64, f64), start: f64) -> (f64, f64, f64, f64) {
    events_detailed(sample, start).values
}

/// `sample_at` returns `(crossing_margin_deg, true_centre_altitude_deg)`.
fn events_detailed(sample_at: &dyn Fn(f64) -> (f64, f64), day_start_jd_utc: f64) -> EventSolution {
    let steps = 144; // 10-minute sampling over one local mean-solar day
    let mut prev_jd = day_start_jd_utc;
    let (mut prev_margin, initial_alt) = sample_at(prev_jd);
    let mut rise = f64::NAN;
    let mut set = f64::NAN;
    let mut transit = f64::NAN;
    let mut transit_alt = f64::NAN;
    let mut transit_failed = false;
    let h = 1.0 / steps as f64;
    let (left_margin, mut left_alt) = sample_at(day_start_jd_utc - h);
    if prev_margin == 0.0 {
        let right_margin = sample_at(day_start_jd_utc + h).0;
        if left_margin < 0.0 && right_margin > 0.0 {
            rise = day_start_jd_utc;
        }
        if left_margin > 0.0 && right_margin < 0.0 {
            set = day_start_jd_utc;
        }
    }
    let mut centre_alt = initial_alt;
    let day_end = day_start_jd_utc + 1.0;
    for i in 1..=steps {
        let jd = day_start_jd_utc + (i as f64) / (steps as f64);
        let (margin, alt) = sample_at(jd);
        // A boundary sample is a candidate only with evidence on both sides.
        // Extended samples bracket a genuine peak; they do not belong to this day.
        if transit.is_nan() && !transit_failed && centre_alt > left_alt && centre_alt >= alt {
            let peak = refine_culmination(
                sample_at,
                prev_jd - h,
                prev_jd,
                jd,
                day_start_jd_utc,
                day_end,
            );
            if peak.is_nan() {
                transit_failed = true;
            }
            if (day_start_jd_utc..day_end).contains(&peak) {
                transit = peak;
                transit_alt = sample_at(peak).1;
            }
        }
        if prev_margin < 0.0 && margin >= 0.0 && rise.is_nan() {
            rise = bisect_cross(&|time| sample_at(time).0, prev_jd, jd);
        }
        if prev_margin >= 0.0 && margin < 0.0 && set.is_nan() {
            set = bisect_cross(&|time| sample_at(time).0, prev_jd, jd);
        }
        prev_jd = jd;
        prev_margin = margin;
        left_alt = centre_alt;
        centre_alt = alt;
    }
    // Include a peak just before the end whose nearest grid point is the end.
    if transit.is_nan()
        && !transit_failed
        && centre_alt > left_alt
        && centre_alt > sample_at(day_end + h).1
    {
        let peak = refine_culmination(
            sample_at,
            day_end - h,
            day_end,
            day_end + h,
            day_start_jd_utc,
            day_end,
        );
        if peak.is_nan() {
            transit_failed = true;
        }
        if (day_start_jd_utc..day_end).contains(&peak) {
            transit = peak;
            transit_alt = sample_at(peak).1;
        }
    }
    if !(day_start_jd_utc..day_end).contains(&rise) {
        rise = f64::NAN;
    }
    if !(day_start_jd_utc..day_end).contains(&set) {
        set = f64::NAN;
    }
    EventSolution {
        values: (rise, transit, set, transit_alt),
        transit_failed,
    }
}

/// Contract a sampled unimodal maximum bracket to at most one second, continuing
/// to floating-point resolution if it still contains a local-day boundary.
/// This is numerical convergence, not an external event-accuracy assertion.
fn refine_culmination(
    sample: &dyn Fn(f64) -> (f64, f64),
    mut left: f64,
    centre: f64,
    mut right: f64,
    day_start: f64,
    day_end: f64,
) -> f64 {
    let mut best = centre;
    let mut best_alt = sample(centre).1;
    for _ in 0..128 {
        let straddles_boundary = [day_start, day_end]
            .iter()
            .any(|boundary| left <= *boundary && *boundary <= right);
        if (right - left) * 86400.0 <= 1.0 && !straddles_boundary {
            break;
        }
        let a = left + (right - left) / 3.0;
        let b = right - (right - left) / 3.0;
        if a <= left || b >= right || a >= b {
            break;
        }
        let aa = sample(a).1;
        let ab = sample(b).1;
        for (jd, alt) in [(a, aa), (b, ab)] {
            if alt > best_alt {
                best = jd;
                best_alt = alt;
            }
        }
        if aa < ab {
            left = a;
        } else if aa > ab {
            right = b;
        } else {
            // Rounded equality provides no directional evidence. Preserve the
            // best sampled point, especially a midnight boundary on a numerical
            // plateau, instead of discarding it toward an arbitrary side.
            left = a.min(best);
            right = b.max(best);
        }
    }
    // A one-second bracket alone cannot distinguish a peak just across midnight.
    // If subdivision reaches machine resolution, inspect the boundary and its
    // adjacent representable JDs. Require strict local evidence for an exact
    // boundary maximum; unresolved flat numerical values remain unavailable.
    for boundary in [day_start, day_end] {
        if left <= boundary && boundary <= right {
            let below = adjacent_float(boundary, false);
            let above = adjacent_float(boundary, true);
            let boundary_alt = sample(boundary).1;
            let below_alt = sample(below).1;
            let above_alt = sample(above).1;
            for (jd, alt) in [
                (left, sample(left).1),
                (right, sample(right).1),
                (boundary, boundary_alt),
                (below, below_alt),
                (above, above_alt),
            ] {
                if alt > best_alt {
                    best = jd;
                    best_alt = alt;
                }
            }
            if best == boundary {
                return if boundary_alt > below_alt && boundary_alt > above_alt {
                    boundary
                } else {
                    f64::NAN
                };
            }
            return if best_alt > boundary_alt {
                best
            } else {
                f64::NAN
            };
        }
    }
    // The complete bracket now lies on one side of each boundary.
    if best >= left && best <= right {
        best
    } else {
        // An unsampled midpoint is not evidence of a maximum.
        f64::NAN
    }
}

// Equivalent to next_up/next_down without raising the crate's Rust 1.85 MSRV.
fn adjacent_float(value: f64, upwards: bool) -> f64 {
    if value == 0.0 {
        return if upwards {
            f64::from_bits(1)
        } else {
            -f64::from_bits(1)
        };
    }
    let bits = value.to_bits();
    f64::from_bits(if upwards == (value > 0.0) {
        bits + 1
    } else {
        bits - 1
    })
}

fn bisect_cross(f: &dyn Fn(f64) -> f64, mut a: f64, mut b: f64) -> f64 {
    let mut fa = f(a);
    if fa == 0.0 {
        return a;
    }
    if f(b) == 0.0 {
        return b;
    }
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
    if !jd_utc.is_finite() || !(1721425.5..5373484.5).contains(&jd_utc) {
        return "{\"error\":\"Unsupported epoch: My Sky requires proleptic Gregorian years 1 through 9999\"}".into();
    }
    if !lat.is_finite()
        || !(-90.0..=90.0).contains(&lat)
        || !lon_east.is_finite()
        || !(-360.0..=360.0).contains(&lon_east)
        || !elev.is_finite()
        || !(-12000.0..=100000.0).contains(&elev)
    {
        return "{\"error\":\"Invalid observer: latitude [-90,90], longitude [-360,360], elevation [-12000,100000] required\"}".into();
    }
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
    out.push_str("  \"schema_version\": \"ephemeris-snapshot.v3\",\n");
    out.push_str(&format!(
        "  \"engine_version\": \"solar-ephemeris {}\",\n",
        env!("CARGO_PKG_VERSION")
    ));
    let day_start = local_solar_day_start(jd_utc, lon_east);
    out.push_str(&format!("  \"events_window\":{{\"convention\":\"observer_local_mean_solar_day\",\"time_scale\":\"UTC\",\"interval\":\"[start,end)\",\"start_jd\":{},\"end_jd\":{}}},", jnum(day_start), jnum(day_start+1.0)));
    out.push_str("  \"time\": {");
    out.push_str(&format!(
        "\"calendar\":\"proleptic_gregorian\",\"input_time_semantics\":\"{}\",",
        if astro.jd_tai.is_some() {
            "utc"
        } else {
            "historical_ut1_proxy"
        }
    ));
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
        "\"terrestrial_lat_deg\":{},\"terrestrial_lon_deg_east\":{},\"polar_motion_corrected_lat_deg\":{:.8},\"polar_motion_corrected_lon_deg_east\":{:.8},\"elev_m\":{}",
        jnum(lat), jnum(lon_east), observer_lat, observer_lon, jnum(elev)
    ));
    out.push_str("},\n");
    out.push_str(
        "  \"accuracy\": {\"evidence_status\":\"unvalidated\",\"evidence_record_ids\":[],",
    );
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
        let event_solution = events(*body, jd_utc, lat, lon_east, elev);
        let angular_size = 2.0
            * (body.radius_km() / s.observer_range_km).asin()
            * (180.0 / std::f64::consts::PI)
            * 3600.0;
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
            "\"ra_deg\":{:.9},\"dec_deg\":{:.9},\"geocentric_apparent_ra_deg\":{:.9},\"geocentric_apparent_dec_deg\":{:.9},\"topocentric_apparent_ra_deg\":{:.9},\"topocentric_apparent_dec_deg\":{:.9},\"geocentric_range_km\":{},\"observer_range_km\":{},\"range_approximation\":\"finite\",",
            s.topocentric_ra,
            s.topocentric_dec,
            s.geocentric_ra,
            s.geocentric_dec,
            s.topocentric_ra,
            s.topocentric_dec,
            jnum(s.dist_km), jnum(s.observer_range_km)
        ));
        out.push_str(&format!(
            "\"alt_deg\":{},\"az_deg\":{},\"alt_refracted_deg\":{},\"above_horizon\":{},",
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
        out.push_str(&event_solution.json());
        out.push('}');
    }

    for star in stars::STARS.iter() {
        let s = star_topocentric(star, jd_utc, lat, lon_east, elev);
        let event_solution = star_events(star, jd_utc, lat, lon_east, elev);
        out.push_str(",\n    {");
        out.push_str(&format!(
            "\"name\":\"{}\",\"kind\":\"star\",\"coordinate_frame\":\"true_equator_and_equinox_of_date\",",
            star.name
        ));
        out.push_str(&format!(
            "\"ra_deg\":{:.9},\"dec_deg\":{:.9},\"geocentric_apparent_ra_deg\":{:.9},\"geocentric_apparent_dec_deg\":{:.9},\"topocentric_apparent_ra_deg\":{:.9},\"topocentric_apparent_dec_deg\":{:.9},\"geocentric_range_km\":null,\"observer_range_km\":null,\"range_approximation\":\"infinite_catalogue_star\",",
            s.topocentric_ra,
            s.topocentric_dec,
            s.geocentric_ra,
            s.geocentric_dec,
            s.topocentric_ra,
            s.topocentric_dec
        ));
        out.push_str(&format!(
            "\"alt_deg\":{},\"az_deg\":{},\"alt_refracted_deg\":{},\"above_horizon\":{},",
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
        out.push_str(&event_solution.json());
        out.push('}');
    }
    out.push_str("\n  ],\n");
    out.push_str(
        "  \"warnings\": [\"Analytic apparent place; research and observing-planning only. Catalogue stars approximate infinite distance; annual parallax and aberration are omitted.\"",
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
        v.to_string()
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

/// The system view's planet table, in the ONE canonical order shared by the JSON
/// snapshot and the raw `system_positions` fast path (the browser indexes by position).
fn system_planet_table() -> [(&'static str, &'static vsop2013::Planet); 8] {
    [
        ("Mercury", vsop2013_data::mer()),
        ("Venus", vsop2013_data::ven()),
        ("Earth", vsop2013_data::emb()),
        ("Mars", vsop2013_data::mar()),
        ("Jupiter", vsop2013_data::jup()),
        ("Saturn", vsop2013_data::sat()),
        ("Uranus", vsop2013_data::ura()),
        ("Neptune", vsop2013_data::nep()),
    ]
}

/// One body's heliocentric position on the system view's canonical model split:
/// Earth's centre (not the EMB), TOP2013 for the giants, VSOP2013 for the rest.
fn system_helio_xyz(name: &str, planet: &vsop2013::Planet, jy2k: f64) -> [f64; 3] {
    if name == "Earth" {
        return planets::earth_center(jy2k);
    }
    match top2013::outer_index(name) {
        Some(idx) => top2013::helio_xyz(idx, jy2k),
        None => vsop2013::helio_xyz(planet, jy2k),
    }
}

/// Heliocentric ecliptic-J2000 positions (AU) of the planets for the top-down orbit view.
pub fn system_snapshot_json(jd_utc: f64) -> String {
    let jd_tt = AstroTime::from_jd_utc(jd_utc).jd_tt;
    let jy2k = (jd_tt - time::J2000) / 365.25;
    let bodies = system_planet_table();
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
    let helio = system_helio_xyz;
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

// Legacy fixed-nine-body System time sanitizing; retained for that separate ABI.
// Sky snapshots and trajectories reject unsupported inputs instead of using this helper.

const UNIX_ABS_MAX: f64 = 4.0e11;

fn sanitize_unix(unix_seconds: f64) -> f64 {
    if unix_seconds.is_finite() {
        unix_seconds.clamp(-UNIX_ABS_MAX, UNIX_ABS_MAX)
    } else {
        0.0
    }
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
    let jd_utc = time::jd_from_unix(sanitize_unix(unix_seconds));
    let json = system_snapshot_json(jd_utc);
    RESULT.with(|cell| {
        *cell.borrow_mut() = json.into_bytes();
        cell.borrow().as_ptr()
    })
}

thread_local! {
    static POSITIONS: RefCell<Vec<f64>> = const { RefCell::new(Vec::new()) };
}

/// Per-frame animation fast path: heliocentric ecliptic-J2000 positions ONLY, as raw
/// f64 triples in `system_snapshot_json`'s exact body order (the eight planets, then the
/// Moon). Identical body math to the JSON path — `system_planet_table` +
/// `system_helio_xyz` are shared, so the two paths cannot drift — but it skips the
/// phase/magnitude/element work and, crucially, the JSON serialize→parse round-trip
/// that made a 60 fps animation loop the app's hottest path. The buffer stays valid
/// until the next `system_positions` call; read length via `system_positions_len`.
#[no_mangle]
pub extern "C" fn system_positions(unix_seconds: f64) -> *const f64 {
    let jd_utc = time::jd_from_unix(sanitize_unix(unix_seconds));
    let jd_tt = AstroTime::from_jd_utc(jd_utc).jd_tt;
    let jy2k = (jd_tt - time::J2000) / 365.25;
    let earth = planets::earth_center(jy2k);
    POSITIONS.with(|cell| {
        let mut values = cell.borrow_mut();
        values.clear();
        for (name, planet) in system_planet_table().iter() {
            let xyz = system_helio_xyz(name, planet, jy2k);
            values.extend_from_slice(&xyz);
        }
        let mg = elpmpp02::moon_xyz(jy2k);
        values.extend_from_slice(&[earth[0] + mg[0], earth[1] + mg[1], earth[2] + mg[2]]);
        values.as_ptr()
    })
}

/// Number of f64 values behind the most recent `system_positions` pointer.
#[no_mangle]
pub extern "C" fn system_positions_len() -> usize {
    POSITIONS.with(|cell| cell.borrow().len())
}

/// Topocentric alt/az track of a single body over `n` samples (no rise/set events, so it is cheap
/// enough to call densely) — for precise trajectory arcs in the sky dome. `body_idx` indexes
/// ALL_BODIES (0=Sun, 1=Moon, 2=Mercury, 3=Venus, 4=Mars, 5=Jupiter, 6=Saturn, 7=Uranus, 8=Neptune).
/// Samples start at `unix0` and step by `dt_seconds`. Returns JSON `[{"alt":..,"az":..,"up":bool},..]`
/// (refracted altitude). Unlike a fixed-RA sweep, this re-solves the body's position at every sample,
/// so it is exact for the fast-moving Moon as well as the Sun and planets.
fn body_track_json(
    body_idx: u32,
    lat_deg: f64,
    lon_deg_east: f64,
    elev_m: f64,
    unix0: f64,
    dt_seconds: f64,
    n: u32,
) -> String {
    let epoch_valid =
        |unix: f64| unix.is_finite() && (-62135596800.0..253402300800.0).contains(&unix);
    let span = dt_seconds * f64::from(n.saturating_sub(1));
    if body_idx as usize >= ALL_BODIES.len()
        || !lat_deg.is_finite()
        || !(-90.0..=90.0).contains(&lat_deg)
        || !lon_deg_east.is_finite()
        || !(-360.0..=360.0).contains(&lon_deg_east)
        || !elev_m.is_finite()
        || !(-12000.0..=100000.0).contains(&elev_m)
        || !epoch_valid(unix0)
        || !(2..=257).contains(&n)
        || !dt_seconds.is_finite()
        || dt_seconds == 0.0
        || dt_seconds.abs() > 3600.0
        || span.abs() > 172800.0
        || !epoch_valid(unix0 + span)
    {
        return "{\"error\":\"Trajectory request outside supported bounds\",\"code\":\"invalid_input\"}".into();
    }
    let body = ALL_BODIES[body_idx as usize];
    let count = n as usize;
    let mut out = String::new();
    if out.try_reserve(16 + 128 * count).is_err() {
        return "{\"error\":\"Trajectory allocation unavailable\",\"code\":\"capacity\"}".into();
    }
    out.push('[');
    let mut emitted = false;
    for i in 0..count {
        let unix = unix0 + (i as f64) * dt_seconds;
        let jd = time::jd_from_unix(unix);
        let s = topocentric_sky(body, jd, lat_deg, lon_deg_east, elev_m);
        // Never silently omit a requested sample or publish a partial trajectory.
        if !(s.alt_refracted.is_finite() && s.az.is_finite()) {
            return "{\"error\":\"Trajectory sample unavailable\",\"code\":\"engine_failed\"}"
                .into();
        }
        if emitted {
            out.push(',');
        }
        emitted = true;
        out.push_str(&format!(
            "{{\"alt\":{},\"az\":{},\"up\":{}}}",
            s.alt_refracted,
            s.az,
            s.alt_refracted > 0.0
        ));
    }
    out.push(']');
    out
}

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
    let out = body_track_json(
        body_idx,
        lat_deg,
        lon_deg_east,
        elev_m,
        unix0,
        dt_seconds,
        n,
    );
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
    fn legacy_system_time_sanitizing_remains_bounded() {
        assert_eq!(sanitize_unix(f64::NAN), 0.0);
        assert_eq!(sanitize_unix(1.0e30), UNIX_ABS_MAX);
    }

    #[test]
    fn sky_rejects_unsupported_epoch_instead_of_clamping() {
        for jd in [f64::NAN, 1721425.49, 5373484.5] {
            assert!(sky_snapshot_json(jd, 0.0, 0.0, 0.0).contains("\"error\""));
        }
    }

    #[test]
    fn raw_track_rejects_out_of_bounds_work_instead_of_clamping() {
        for (body, lat, unix, step, count) in [
            (9, 0.0, 1.7e9, 600.0, 145),
            (1, 91.0, 1.7e9, 600.0, 145),
            (1, 0.0, f64::NAN, 600.0, 145),
            (1, 0.0, 1.7e9, f64::NAN, 145),
            (1, 0.0, 1.7e9, 0.0, 145),
            (1, 0.0, 1.7e9, 600.0, 258),
            (1, 0.0, 1.7e9, 676.0, 257),
            (1, 0.0, 253402300799.0, 1.0, 2),
        ] {
            let result = body_track_json(body, lat, 0.0, 0.0, unix, step, count);
            assert!(result.contains("\"error\""), "invalid work was accepted");
            assert!(result.contains("\"code\""));
        }
        for count in [256, 257] {
            let result = body_track_json(1, 0.0, 0.0, 0.0, 1.7e9, 600.0, count);
            assert_eq!(result.matches("\"alt\"").count(), count as usize);
        }
        let result = body_track_json(1, 0.0, 0.0, 0.0, 1.7e9, 675.0, 257);
        assert_eq!(result.matches("\"alt\"").count(), 257);
    }

    #[test]
    fn event_status_distinguishes_ambiguous_boundary_from_no_occurrence() {
        let start = 2460000.5;
        let ambiguous = events_detailed(&|jd| (-1.0, 30.0 - (jd - start).powi(2)), start);
        assert!(ambiguous.transit_failed);
        assert!(ambiguous.values.1.is_nan() && ambiguous.values.3.is_nan());
        assert!(ambiguous
            .json()
            .contains("\"calculation_status\":\"failed\",\"occurrence_status\":\"unknown\""));
        let absent = events_detailed(&|jd| (-1.0, jd - start), start);
        assert!(!absent.transit_failed);
        assert!(absent.values.1.is_nan());
        assert!(absent.json().contains(
            "\"calculation_status\":\"calculated\",\"occurrence_status\":\"none_in_window\""
        ));
    }

    #[test]
    fn snapshot_is_well_formed() {
        // 2024-01-01 00:00 UTC ≈ JD 2460310.5, Boston.
        let json = sky_snapshot_json(2460310.5, 42.36, -71.06, 0.0);
        assert!(json.contains("ephemeris-snapshot.v3"));
        assert!(json.contains("\"geocentric_range_km\""));
        assert!(json.contains("\"observer_range_km\""));
        assert!(json.contains("\"events_window\""));
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

    #[test]
    fn standard_altitudes_use_upper_limb_for_sun_and_moon() {
        let sun = standard_altitude_deg(Body::Sun, AU_KM);
        assert!((-0.85..-0.80).contains(&sun));
        let moon = standard_altitude_deg(Body::Moon, 384_400.0);
        assert!((-0.86..-0.80).contains(&moon));
        assert!((standard_altitude_deg(Body::Venus, AU_KM) + 34.0 / 60.0).abs() < 1.0e-12);
    }

    #[test]
    fn local_solar_day_is_one_day_and_longitude_shifted() {
        let start = local_solar_day_start(2_460_310.75, 90.0);
        let next = local_solar_day_start(2_460_311.75, 90.0);
        assert!((next - start - 1.0).abs() < 1.0e-12);
        assert!((start - 2_460_310.25).abs() < 1.0e-12);
    }

    #[test]
    fn event_solver_uses_crossing_margin_but_reports_true_transit_altitude() {
        let day_start = 2_460_000.5;
        let sample = |jd: f64| {
            let phase = 2.0 * std::f64::consts::PI * (jd - day_start);
            let altitude = 30.0 * phase.sin();
            (altitude + STANDARD_REFRACTION_DEG, altitude)
        };
        let (rise, transit, set, transit_alt) = events_core(&sample, day_start);
        assert!(rise.is_finite() && set.is_finite() && transit.is_finite());
        assert!(transit_alt > 29.9);
        assert!((transit - (day_start + 0.25)).abs() < 1.0e-4);
    }

    #[test]
    fn culmination_requires_a_genuine_maximum_in_the_half_open_day() {
        let start = 2_460_000.5;
        for peak in [-0.02, -0.000001, 1.0, 1.000001, 1.02] {
            let sample = |jd: f64| {
                let a = -(jd - start - peak).powi(2);
                (a, a)
            };
            let (_, transit, _, altitude) = events_core(&sample, start);
            assert!(
                transit.is_nan() && altitude.is_nan(),
                "outside peak {peak}: {transit}"
            );
        }
        for peak in [0.0, 0.0001, 0.25, 0.9999] {
            let sample = |jd: f64| {
                let a = -(jd - start - peak).powi(2);
                (a, a)
            };
            let (_, transit, _, altitude) = events_core(&sample, start);
            assert!(transit >= start && transit < start + 1.0);
            assert!((transit - start - peak).abs() * 86400.0 <= 1.0);
            assert!((altitude - sample(transit).1).abs() < 1e-12);
        }
        let (_, transit, _, altitude) = events_core(&|jd| (jd, jd), start);
        assert!(transit.is_nan() && altitude.is_nan());
        let (_, transit, _, _) = events_core(
            &|jd| {
                let a = (4.0 * std::f64::consts::PI * (jd - start - 0.1)).cos();
                (a, a)
            },
            start,
        );
        assert!((transit - start - 0.1).abs() * 86400.0 <= 1.0);
    }

    #[test]
    fn culmination_resolves_subsecond_midnight_membership() {
        let start: f64 = 2_460_000.5;
        let end = start + 1.0;
        for boundary in [start, end] {
            for peak in [
                boundary - 0.01 / 86400.0,
                f64::from_bits(boundary.to_bits() - 1),
                boundary,
                f64::from_bits(boundary.to_bits() + 1),
                boundary + 0.01 / 86400.0,
            ] {
                let sample = |jd: f64| {
                    let altitude = -(jd - peak).powi(2);
                    (altitude, altitude)
                };
                let (_, transit, _, altitude) = events_core(&sample, start);
                if (start..end).contains(&peak) {
                    assert!(
                        (start..end).contains(&transit),
                        "peak {peak:.16}, returned {transit:.16}"
                    );
                    assert!(
                        (transit - peak).abs() <= 0.001 / 86400.0,
                        "peak {peak:.16}, returned {transit:.16}"
                    );
                    assert_eq!(altitude, sample(transit).1);
                } else {
                    assert!(
                        transit.is_nan() && altitude.is_nan(),
                        "outside peak {peak:.16}, returned {transit:.16}"
                    );
                }
            }
        }
    }

    #[test]
    fn culmination_rounding_ties_do_not_move_midnight_events() {
        let start: f64 = 2_460_000.5;
        let end = start + 1.0;
        for offset in [30.0, 60.0] {
            for boundary in [start, end] {
                for peak in [
                    boundary - 0.01 / 86400.0,
                    f64::from_bits(boundary.to_bits() - 1),
                    boundary,
                    f64::from_bits(boundary.to_bits() + 1),
                    boundary + 0.01 / 86400.0,
                ] {
                    let sample = |jd: f64| {
                        let altitude = offset - (jd - peak).powi(2);
                        (altitude, altitude)
                    };
                    let (_, transit, _, altitude) = events_core(&sample, start);
                    // With these offsets the exact/adjacent-JD peaks round to
                    // the same altitude at midnight. Their membership is
                    // unknowable from this numerical function: report null.
                    let boundary_unresolved = sample(boundary).1 == offset;
                    if boundary_unresolved || !(start..end).contains(&peak) {
                        assert!(
                            transit.is_nan() && altitude.is_nan(),
                            "offset {offset}, peak {peak:.16}, returned {transit:.16}"
                        );
                    } else {
                        assert!(
                            (start..end).contains(&transit),
                            "offset {offset}, interior peak {peak:.16}, returned {transit:.16}"
                        );
                        assert!((transit - peak).abs() * 86400.0 <= 1.0);
                        assert_eq!(altitude, sample(transit).1);
                    }
                }
            }
        }
    }

    #[test]
    fn event_serialization_preserves_boundary_membership() {
        let start = local_solar_day_start(2461222.5, -71.06);
        assert_eq!(jnum(start).parse::<f64>().unwrap(), start);
    }

    #[test]
    fn culmination_between_equal_adjacent_samples_is_found() {
        let start = 0.0;
        let peak = 0.5 / 144.0;
        let (_, transit, _, _) = events_core(
            &|jd| {
                let a = -(jd - peak).powi(2);
                (a, a)
            },
            start,
        );
        assert!((transit - peak).abs() * 86400.0 <= 1.0);
    }

    #[test]
    fn horizon_crossings_use_the_same_half_open_day() {
        for direction in [-1.0, 1.0] {
            for crossing in [0.0, 1.0] {
                let (rise, _, set, _) = events_core(&|jd| (direction * (jd - crossing), 1.0), 0.0);
                let event = if direction > 0.0 { rise } else { set };
                if crossing == 0.0 {
                    assert_eq!(event, 0.0);
                } else {
                    assert!(event.is_nan(), "end crossing: {event}");
                }
            }
        }
    }

    #[test]
    fn july_2026_boston_moon_events_belong_to_the_requested_day() {
        for day in 0..31 {
            let jd = 2_461_222.5 + day as f64;
            let start = local_solar_day_start(jd, -71.06);
            let (rise, transit, set, altitude) = events(Body::Moon, jd, 42.36, -71.06, 10.0).values;
            for event in [rise, transit, set] {
                assert!(
                    event.is_nan() || (start..start + 1.0).contains(&event),
                    "July {}: {event} outside {start}",
                    day + 1
                );
            }
            assert_eq!(transit.is_nan(), altitude.is_nan());
            if transit.is_finite() {
                let actual = topocentric_sky(Body::Moon, transit, 42.36, -71.06, 10.0).alt;
                assert!((actual - altitude).abs() < 1e-8);
                assert!(
                    actual
                        >= topocentric_sky(
                            Body::Moon,
                            transit - 2.0 / 86400.0,
                            42.36,
                            -71.06,
                            10.0
                        )
                        .alt
                );
                assert!(
                    actual
                        >= topocentric_sky(
                            Body::Moon,
                            transit + 2.0 / 86400.0,
                            42.36,
                            -71.06,
                            10.0
                        )
                        .alt
                );
            }
        }
    }

    #[test]
    fn abi_snapshot_with_hostile_inputs_stays_valid_json() {
        // Exercise the actual ABI: reject, never silently replace the requested epoch.
        sky_snapshot(f64::NAN, 0.0, 0.0, 0.0);
        let json = RESULT.with(|cell| String::from_utf8(cell.borrow().clone()).unwrap());
        assert!(json.starts_with("{\"error\":"));
        assert!(!json.contains("NaN"));
        sky_snapshot(1.7e9, f64::INFINITY, 0.0, 0.0);
        let json = RESULT.with(|cell| String::from_utf8(cell.borrow().clone()).unwrap());
        assert!(json.contains("Invalid observer"));
    }

    #[test]
    fn observer_range_obeys_independent_vector_triangle() {
        let jd = 2461222.5929050925;
        let astro = AstroTime::from_jd_utc(jd);
        let (lat, lon) = earth_orientation::corrected_observer_geodetic(
            0.0,
            0.0,
            astro.eop.xp_arcsec,
            astro.eop.yp_arcsec,
        );
        let (rho_sin, rho_cos) = coords::observer_rho(lat, 0.0);
        let observer_radius = 6378.14 * rho_sin.hypot(rho_cos);
        let (dpsi, deps) = time::nutation_deg(time::centuries(astro.jd_tt));
        let lst = (time::gast_deg(
            astro.jd_ut1,
            dpsi,
            time::mean_obliquity_deg(time::centuries(astro.jd_tt)) + deps,
        ) + lon)
            .to_radians();
        for body in [Body::Moon, Body::Sun] {
            let s = topocentric_sky_at_time(body, &astro, 0.0, 0.0, 0.0);
            // Law of cosines, using unit directions in the global equatorial frame,
            // independently of the production hour-angle Cartesian subtraction.
            let ra = s.geocentric_ra.to_radians();
            let dec = s.geocentric_dec.to_radians();
            let dot = dec.cos() * ra.cos() * rho_cos * lst.cos()
                + dec.cos() * ra.sin() * rho_cos * lst.sin()
                + dec.sin() * rho_sin;
            let expected = (s.dist_km.powi(2) + observer_radius.powi(2)
                - 2.0 * s.dist_km * 6378.14 * dot)
                .sqrt();
            assert!((s.observer_range_km - expected).abs() < 1e-7);
            assert!((s.observer_range_km - s.dist_km).abs() > 1.0);
        }
    }

    #[test]
    fn system_positions_fast_path_matches_the_json_snapshot_exactly() {
        // The raw fast path and the JSON path must be the SAME numbers: every fast-path
        // coordinate, formatted with the JSON path's own {:.8}, must appear verbatim in
        // the snapshot for the same instant. If the two model splits ever diverge
        // (e.g. one path switches Earth back to the EMB), this fails.
        let unix = 1.7e9;
        let _ = system_positions(unix);
        let values = POSITIONS.with(|cell| cell.borrow().clone());
        assert_eq!(values.len(), 27, "8 planets + Moon, xyz each");
        assert_eq!(system_positions_len(), 27);
        let json = system_snapshot_json(time::jd_from_unix(unix));
        for (i, chunk) in values.chunks(3).enumerate() {
            for (axis, value) in ["x_au", "y_au", "z_au"].iter().zip(chunk) {
                let needle = format!("\"{}\":{:.8}", axis, value);
                assert!(json.contains(&needle), "body {i}: {needle} not in snapshot");
            }
        }
    }

    #[test]
    fn proper_motion_moves_alpha_cen_a_full_arcminute_but_leaves_deneb_still() {
        // α Cen (μ ≈ 3.7″/yr) accumulates ~1.6′ in the 26 years since J2000 — the exact
        // drift the catalogue carried as error before proper motion was applied. Deneb
        // (μ ≈ 2.7 mas/yr) must stay put at this scale.
        let alpha_cen = stars::STARS
            .iter()
            .find(|s| s.name == "Rigil Kentaurus")
            .unwrap();
        let (ra, dec) = star_catalog_place_of_date(alpha_cen, 26.0);
        let dra_arc = (ra - alpha_cen.ra_deg) * alpha_cen.dec_deg.to_radians().cos();
        let ddec = dec - alpha_cen.dec_deg;
        let shift_deg = (dra_arc * dra_arc + ddec * ddec).sqrt();
        assert!(
            (0.025..0.028).contains(&shift_deg),
            "alpha Cen 26-yr shift {shift_deg}"
        );

        let deneb = stars::STARS.iter().find(|s| s.name == "Deneb").unwrap();
        let (ra_d, dec_d) = star_catalog_place_of_date(deneb, 26.0);
        let dra_d = (ra_d - deneb.ra_deg) * deneb.dec_deg.to_radians().cos();
        let shift_d = (dra_d * dra_d + (dec_d - deneb.dec_deg).powi(2)).sqrt();
        assert!(shift_d < 1e-4, "Deneb 26-yr shift {shift_d}");

        // Zero elapsed time is the identity — the catalogue place itself.
        let (ra0, dec0) = star_catalog_place_of_date(alpha_cen, 0.0);
        assert!(ra0 == alpha_cen.ra_deg && dec0 == alpha_cen.dec_deg);
    }

    #[test]
    fn abi_body_track_with_hostile_inputs_stays_valid_json() {
        let json = body_track_json(
            9999,
            f64::NAN,
            f64::INFINITY,
            f64::NAN,
            f64::NAN,
            f64::NAN,
            5,
        );
        assert!(json.contains("\"code\":\"invalid_input\""));
        assert!(!json.contains("NaN") && !json.contains("inf"));
        // Sane inputs still produce the full sample count.
        let ok = body_track_json(0, 40.71, -74.01, 10.0, 1.7e9, 600.0, 5);
        assert_eq!(ok.matches("\"alt\"").count(), 5);
    }
}
