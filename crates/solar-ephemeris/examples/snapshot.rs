use solar_ephemeris::sky_snapshot_json;
use std::env;

fn parse(index: usize, default: f64) -> f64 {
    env::args()
        .nth(index)
        .and_then(|value| value.parse::<f64>().ok())
        .unwrap_or(default)
}

fn main() {
    let jd_utc = parse(1, 2_461_223.5);
    let lat_deg = parse(2, 42.36);
    let lon_deg_east = parse(3, -71.06);
    let elev_m = parse(4, 0.0);
    print!("{}", sky_snapshot_json(jd_utc, lat_deg, lon_deg_east, elev_m));
}
