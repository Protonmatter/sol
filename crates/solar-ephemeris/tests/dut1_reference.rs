//! UT1 = UTC + DUT1 sets the Earth's rotation angle. Every other captured Horizons pointing
//! fixture is from 2026, where |DUT1| is below 0.08 s and moves the sky by about one
//! arcsecond: well inside those fixtures' 10 and 12 arcsecond budgets, so they stay green if
//! DUT1 is dropped. These rows are from two days where |DUT1| is 0.67 to 0.76 s, with both
//! signs, and are held to a budget that a dropped or reversed DUT1 cannot meet.
//!
//! The reference is `tests/fixtures/horizons-observer-dut1-20261112` at the repository root:
//! unmodified NASA/JPL Horizons replies, their request URLs and hashes. The CSV here is the
//! byte-identical derived matrix, admitted by `tests/python/test_horizons_dut1_reference.py`.

use solar_ephemeris::sky_snapshot_json;

const MATRIX: &str = include_str!("../data/horizons-observer-dut1-20261112.csv");
/// About four times the worst measured residual (0.45 arcsec) and a fifth of the smallest
/// displacement a dropped DUT1 causes in this cohort (9.2 arcsec).
const POINTING_BUDGET_ARCSEC: f64 = 2.0;
/// The limit every other Horizons observer fixture applies to the tabulated DUT1.
const DUT1_BUDGET_SECONDS: f64 = 0.003;
/// Earth rotation in arcseconds of hour angle per UT1 second: 15 times the ratio of the
/// sidereal to the solar day.
const ROTATION_ARCSEC_PER_UT1_SECOND: f64 = 15.0 * 1.002_737_811_911_354_5;

struct Row<'a> {
    case: &'a str,
    body: &'a str,
    jd_utc: f64,
    latitude: f64,
    longitude: f64,
    elevation: f64,
    ra: f64,
    dec: f64,
    az: f64,
    alt: f64,
    dut1: f64,
}

fn rows() -> Vec<Row<'static>> {
    let mut lines = MATRIX.lines();
    assert_eq!(
        lines.next(),
        Some("case,body,jd_utc,latitude_deg,longitude_deg_east,elevation_m,ra_deg,dec_deg,az_deg,alt_deg,dut1_seconds,raw_sha256")
    );
    let rows: Vec<_> = lines
        .map(|line| {
            let cells: Vec<_> = line.split(',').collect();
            assert_eq!(cells.len(), 12, "{line}");
            let number = |index: usize| -> f64 {
                let value: f64 = cells[index].parse().expect("numeric reference cell");
                assert!(value.is_finite());
                value
            };
            Row {
                case: cells[0],
                body: cells[1],
                jd_utc: number(2),
                latitude: number(3),
                longitude: number(4),
                elevation: number(5),
                ra: number(6),
                dec: number(7),
                az: number(8),
                alt: number(9),
                dut1: number(10),
            }
        })
        .collect();
    assert_eq!(rows.len(), 12, "two days, two sites, three bodies");
    rows
}

/// Great-circle separation of two directions given as (latitude-like, longitude-like) degrees.
fn separation_arcsec(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let (a, b, delta) = (
        lat1.to_radians(),
        lat2.to_radians(),
        (lon1 - lon2).to_radians(),
    );
    (a.sin() * b.sin() + a.cos() * b.cos() * delta.cos())
        .clamp(-1.0, 1.0)
        .acos()
        .to_degrees()
        * 3600.0
}

/// The number that follows `"key":` in whitespace-free JSON text.
fn number_after(json: &str, key: &str) -> f64 {
    let marker = format!("\"{key}\":");
    let start = json
        .find(&marker)
        .unwrap_or_else(|| panic!("{key} missing"))
        + marker.len();
    let rest = &json[start..];
    let end = rest
        .find(|c: char| !(c.is_ascii_digit() || matches!(c, '-' | '+' | '.' | 'e' | 'E')))
        .unwrap_or(rest.len());
    let value: f64 = rest[..end]
        .parse()
        .unwrap_or_else(|_| panic!("{key} is not a number"));
    assert!(value.is_finite(), "{key}");
    value
}

/// One body's object from the snapshot's `bodies` array.
fn body<'a>(json: &'a str, name: &str) -> &'a str {
    let marker = format!("{{\"name\":\"{name}\",");
    let start = json
        .find(&marker)
        .unwrap_or_else(|| panic!("{name} missing"));
    let rest = &json[start..];
    let end = rest[1..]
        .find("{\"name\":\"")
        .map_or(rest.len(), |index| index + 1);
    &rest[..end]
}

#[test]
fn pointing_and_dut1_match_horizons_where_dut1_is_large() {
    let mut snapshots: Vec<(&str, String)> = Vec::new();
    for row in rows() {
        if !snapshots.iter().any(|(case, _)| *case == row.case) {
            let json = sky_snapshot_json(row.jd_utc, row.latitude, row.longitude, row.elevation);
            snapshots.push((row.case, json.split_whitespace().collect()));
        }
        let json = &snapshots
            .iter()
            .find(|(case, _)| *case == row.case)
            .unwrap()
            .1;
        assert!(json.contains("\"schema_version\":\"ephemeris-snapshot.v4\""));
        assert!(
            (number_after(json, "jd_utc") - row.jd_utc).abs() < 1e-9,
            "{} snapshot is for another instant",
            row.case
        );

        let dut1 = number_after(json, "dut1_seconds");
        assert!(
            (dut1 - row.dut1).abs() <= DUT1_BUDGET_SECONDS,
            "{} DUT1 {dut1} s differs from Horizons {} s",
            row.case,
            row.dut1
        );
        // The engine must also report the UT1 it used, not only the DUT1 it looked up.
        let applied = (number_after(json, "jd_ut1") - number_after(json, "jd_utc")) * 86_400.0;
        assert!(
            (applied - row.dut1).abs() <= DUT1_BUDGET_SECONDS + 2e-4,
            "{} applies UT1 - UTC = {applied} s, Horizons DUT1 is {} s",
            row.case,
            row.dut1
        );

        let object = body(json, row.body);
        let horizontal = separation_arcsec(
            number_after(object, "alt_deg"),
            number_after(object, "az_deg"),
            row.alt,
            row.az,
        );
        assert!(
            horizontal <= POINTING_BUDGET_ARCSEC,
            "{}/{} altitude/azimuth is {horizontal} arcsec from Horizons",
            row.case,
            row.body
        );
        let equatorial = separation_arcsec(
            number_after(object, "topocentric_apparent_dec_deg"),
            number_after(object, "topocentric_apparent_ra_deg"),
            row.dec,
            row.ra,
        );
        assert!(
            equatorial <= POINTING_BUDGET_ARCSEC,
            "{}/{} RA/Dec is {equatorial} arcsec from Horizons",
            row.case,
            row.body
        );
    }
    assert_eq!(snapshots.len(), 4);
}

#[test]
fn the_cohort_and_budget_can_detect_a_dropped_or_reversed_dut1() {
    let rows = rows();
    assert!(
        rows.iter().any(|row| row.dut1 >= 0.6),
        "a large positive DUT1 is required"
    );
    assert!(
        rows.iter().any(|row| row.dut1 <= -0.6),
        "a large negative DUT1 is required"
    );
    for row in &rows {
        // Ignoring DUT1 turns the Earth by this hour angle; a body at declination dec then
        // moves by that angle times cos(dec). A reversed sign moves it twice as far.
        let displacement =
            ROTATION_ARCSEC_PER_UT1_SECOND * row.dut1.abs() * row.dec.to_radians().cos();
        assert!(
            displacement >= 4.0 * POINTING_BUDGET_ARCSEC,
            "{}/{} would move only {displacement} arcsec without DUT1",
            row.case,
            row.body
        );
    }
}
