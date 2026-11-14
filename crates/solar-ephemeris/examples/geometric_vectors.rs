//! Observe the existing f64 System ABI at the retained dynamical model arguments.
//! Reference coordinates are never read: only the unique Mercury epoch column.
use solar_ephemeris::{system_positions, system_positions_len, time, timescales::AstroTime};

fn main() {
    let epochs: Vec<f64> = include_str!("../data/horizons-vectors-20261104.csv")
        .lines()
        .filter(|line| line.starts_with("mercury,"))
        .map(|line| line.split(',').nth(4).unwrap().parse().unwrap())
        .collect();
    assert_eq!(epochs.len(), 16);
    let names = [
        "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "moon",
    ];
    println!("case,jd_tdb,tt_argument_error_seconds,x_au,y_au,z_au");
    for jd_tdb in epochs {
        // Isolate geometric-model error: TT and TDB differ by at most 2 ms.
        // This inverse is not independent historical UTC/UT1 qualification.
        let mut jd_utc = jd_tdb;
        for _ in 0..8 {
            jd_utc += jd_tdb - AstroTime::from_jd_utc(jd_utc).jd_tt;
        }
        let unix = (jd_utc - time::UNIX_EPOCH_JD) * 86400.0;
        let actual_tt = AstroTime::from_jd_utc(time::jd_from_unix(unix)).jd_tt;
        let error_seconds = (actual_tt - jd_tdb) * 86400.0;
        assert!(
            error_seconds.abs() <= 0.001,
            "model argument failed to converge"
        );
        let pointer = system_positions(unix);
        let length = system_positions_len();
        assert!(!pointer.is_null());
        assert_eq!(length, 27);
        // SAFETY: the documented ABI returns its thread-local Vec's pointer and
        // length. No subsequent System call occurs until this immediate copy;
        // the buffer cannot be mutated by another thread.
        let positions = unsafe { std::slice::from_raw_parts(pointer, length) }.to_vec();
        assert!(positions.iter().all(|value| value.is_finite()));
        for (index, name) in names.iter().enumerate() {
            let xyz = &positions[3 * index..3 * index + 3];
            println!(
                "{name},{jd_tdb:.9},{error_seconds:.17e},{:.17e},{:.17e},{:.17e}",
                xyz[0], xyz[1], xyz[2]
            );
        }
        println!(
            "geocentric-moon,{jd_tdb:.9},{error_seconds:.17e},{:.17e},{:.17e},{:.17e}",
            positions[24] - positions[6],
            positions[25] - positions[7],
            positions[26] - positions[8]
        );
    }
}
