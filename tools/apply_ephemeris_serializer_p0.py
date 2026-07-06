#!/usr/bin/env python3
"""One-shot serializer migration for the precision branch; removed after application."""

from pathlib import Path

path = Path("crates/solar-ephemeris/src/lib.rs")
text = path.read_text(encoding="utf-8")
start = text.index("pub fn sky_snapshot_json(")
end = text.index("fn jnum(")
replacement = r'''pub fn sky_snapshot_json(jd_utc: f64, lat: f64, lon_east: f64, elev: f64) -> String {
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
    out.push_str("\"non_goal\":\"navigation, occultation prediction, or safety-critical timing\"},\n");
    out.push_str("  \"bodies\": [\n");

    for (index, body) in ALL_BODIES.iter().enumerate() {
        let s = topocentric_sky_at_time(*body, &astro, lat, lon_east, elev);
        let (rise, transit, set, transit_alt) = events(*body, jd_utc, lat, lon_east, elev);
        let angular_size = 2.0
            * (body.radius_km() / s.dist_km).asin()
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
    out.push_str("  \"warnings\": [\"Analytic apparent place; research and observing-planning only.\"");
    if !astro.eop.quality.precision_ready() {
        out.push_str(",\"Earth orientation is degraded for this epoch; sub-arcsecond topocentric accuracy is not asserted.\"");
    }
    out.push_str("]\n");
    out.push_str("}\n");
    out
}

'''
text = text[:start] + replacement + text[end:]
path.write_text(text, encoding="utf-8")
