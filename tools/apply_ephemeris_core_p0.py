#!/usr/bin/env python3
"""One-shot source migration for the precision branch; removed after application."""

from pathlib import Path

path = Path("crates/solar-ephemeris/src/lib.rs")
text = path.read_text(encoding="utf-8")

text = text.replace(
    "//! Pure math (Meeus). Produces apparent geocentric RA/Dec and topocentric alt/az for an\n"
    "//! observer, plus rise/transit/set — emitted as `ephemeris-snapshot.v1` JSON. Validated\n"
    "//! against JPL Horizons (see tools/validate_ephemeris.py).",
    "//! Deterministic analytic astronomy. The v2 contract separates geocentric and\n"
    "//! topocentric apparent coordinates and carries UTC, TAI, TT, UT1, DUT1, polar\n"
    "//! motion, and Earth-orientation quality explicitly.",
)
text = text.replace(
    "pub mod coords;\n",
    "pub mod coords;\npub mod earth_orientation;\n",
)
text = text.replace(
    "pub mod time;\n",
    "pub mod time;\npub mod timescales;\n",
)
text = text.replace(
    "use coords::AU_KM;\n",
    "use coords::AU_KM;\nuse timescales::AstroTime;\n",
)

start = text.index("/// Apparent geocentric equatorial position + geocentric distance (km).")
end = text.index("/// Rise / transit / set as JD(UTC)")
replacement = r'''/// Apparent geocentric equatorial position + geocentric distance (km).
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

'''
text = text[:start] + replacement + text[end:]

text = text.replace(
    "pub fn system_snapshot_json(jd_utc: f64) -> String {\n"
    "    let year = time::year_from_jd(jd_utc);\n"
    "    let jd_tt = jd_utc + time::delta_t_seconds(year) / 86400.0;\n",
    "pub fn system_snapshot_json(jd_utc: f64) -> String {\n"
    "    let jd_tt = AstroTime::from_jd_utc(jd_utc).jd_tt;\n",
)

text = text.replace(
    '        assert!(json.contains("ephemeris-snapshot.v1"));',
    '        assert!(json.contains("ephemeris-snapshot.v2"));\n'
    '        assert!(json.contains("topocentric_apparent_ra_deg"));\n'
    '        assert!(json.contains("dut1_seconds"));',
)

old_test_end = '''        assert!(json.contains("\\\"name\\\":\\\"Moon\\\""));
    }
}'''
new_test_end = '''        assert!(json.contains("\\\"name\\\":\\\"Moon\\\""));
    }

    #[test]
    fn lunar_topocentric_coordinates_are_not_geocentric_aliases() {
        let astro = AstroTime::from_jd_utc(2_400_000.5 + 61_223.0);
        let moon = topocentric_sky_at_time(Body::Moon, &astro, 42.36, -71.06, 0.0);
        let separation = (moon.topocentric_ra - moon.geocentric_ra).abs()
            + (moon.topocentric_dec - moon.geocentric_dec).abs();
        assert!(separation > 1.0e-5);
    }
}'''
if old_test_end not in text:
    raise SystemExit("test-end marker not found")
text = text.replace(old_test_end, new_test_end)

path.write_text(text, encoding="utf-8")
