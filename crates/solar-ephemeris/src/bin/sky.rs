//! CLI: print an ephemeris-snapshot.v1 for a Unix time + observer.
//! Usage: sky <unix_seconds> <lat_deg> <lon_deg_east> <elev_m>

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.len() < 4 {
        eprintln!("usage: sky <unix_seconds> <lat_deg> <lon_deg_east> <elev_m>");
        std::process::exit(2);
    }
    let unix: f64 = args[0].parse().expect("unix_seconds");
    let lat: f64 = args[1].parse().expect("lat_deg");
    let lon: f64 = args[2].parse().expect("lon_deg_east");
    let elev: f64 = args[3].parse().expect("elev_m");
    let jd = solar_ephemeris::time::jd_from_unix(unix);
    println!("{}", solar_ephemeris::sky_snapshot_json(jd, lat, lon, elev));
}
