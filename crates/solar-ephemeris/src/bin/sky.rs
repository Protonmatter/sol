//! CLI: print a live ephemeris-snapshot.v4 for a Unix time + observer.
//! Usage: sky <unix_seconds> <lat_deg> <lon_deg_east> <elev_m>

const USAGE: &str = "usage: sky <unix_seconds> <lat_deg> <lon_deg_east> <elev_m>";
const ARGUMENT_NAMES: [&str; 4] = ["unix_seconds", "lat_deg", "lon_deg_east", "elev_m"];

fn main() {
    let args: Vec<std::ffi::OsString> = std::env::args_os().skip(1).collect();
    if args.len() != ARGUMENT_NAMES.len() {
        eprintln!("{USAGE}");
        std::process::exit(2);
    }
    let mut values = [0.0; 4];
    for (index, argument) in args.iter().enumerate() {
        values[index] = match argument.to_str().and_then(|text| text.parse::<f64>().ok()) {
            Some(value) => value,
            None => {
                eprintln!(
                    "invalid {}: expected a number\n{USAGE}",
                    ARGUMENT_NAMES[index]
                );
                std::process::exit(2);
            }
        };
    }
    let [unix, lat, lon, elev] = values;
    let jd = solar_ephemeris::time::jd_from_unix(unix);
    let json = solar_ephemeris::sky_snapshot_json(jd, lat, lon, elev);
    if json.starts_with("{\"error\"") {
        eprintln!("{json}");
        std::process::exit(2);
    }
    println!("{json}");
}
