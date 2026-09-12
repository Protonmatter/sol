//! Re-evaluate only the eight committed TOP2013 source-parity sample epochs.
//! This is not an independent JPL accuracy comparison.
fn main() {
    for index in 0..4 {
        for years in [5000.0, -5000.0] {
            let p = solar_ephemeris::top2013::helio_xyz(index, years);
            println!("{index} {years} {} {} {}", p[0], p[1], p[2]);
        }
    }
}
