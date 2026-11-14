//! Observe explicit geocentric fields of the actual snapshot at matched TT.
//! Reference coordinates are never read: only the unique Sun epoch column.
use solar_ephemeris::{sky_snapshot_json, time, timescales::AstroTime};

fn main() {
    let epochs: Vec<f64> = include_str!("../data/horizons-apparent-20261104.csv")
        .lines()
        .filter(|line| line.starts_with("sun,"))
        .map(|line| line.split(',').nth(4).unwrap().parse().unwrap())
        .collect();
    assert_eq!(epochs.len(), 16);
    for jd_tt in epochs {
        // This inverse isolates coordinate-model error; it does not validate
        // the input UTC/UT1 approximation against historical Earth rotation.
        let mut jd_utc = jd_tt;
        for _ in 0..8 {
            jd_utc += jd_tt - AstroTime::from_jd_utc(jd_utc).jd_tt;
        }
        let unix = (jd_utc - time::UNIX_EPOCH_JD) * 86400.0;
        let actual_utc = time::jd_from_unix(unix);
        let error_seconds = (AstroTime::from_jd_utc(actual_utc).jd_tt - jd_tt) * 86400.0;
        assert!(error_seconds.abs() <= 0.001, "TT argument did not converge");
        let snapshot = sky_snapshot_json(actual_utc, 0.0, 0.0, 0.0);
        assert!(!snapshot.starts_with("{\"error\""), "{snapshot}");
        println!(
            "{{\"requested_jd_tt\":{jd_tt:.9},\"tt_argument_error_seconds\":{error_seconds:.17e},\"snapshot\":{}}}",
            snapshot.replace('\n', "")
        );
    }
}
