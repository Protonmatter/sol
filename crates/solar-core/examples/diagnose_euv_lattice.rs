//! Offline R2 morphology control: only cellular frequency changes. No filtering,
//! volume, palette or camera dependence. This is not the current EUV recipe.
use solar_core::appearance::{cellular_field, direction, dot, regions};
use std::f64::consts::{PI, TAU};
use std::fs::OpenOptions;
use std::io::{BufWriter, Write};
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out = PathBuf::from(std::env::args().nth(1).ok_or("output directory required")?);
    std::fs::create_dir_all(&out)?;
    let regions = regions(42, 0.0, 1);
    let mut base = Vec::with_capacity(512 * 256);
    for y in 0..256 {
        for x in 0..512 {
            let p = direction(
                -PI / 2.0 + (y as f64 + 0.5) * PI / 256.0,
                (x as f64 + 0.5) * TAU / 512.0,
            );
            base.push(
                (0.12
                    + regions
                        .iter()
                        .map(|r| 2.0 * ((dot(p, r.center) - 1.0) / 0.015).exp())
                        .sum::<f64>()) as f32,
            );
        }
    }
    for cell_km in [10000.0, 20000.0] {
        let path = out.join(format!("r2-frequency-{}.f32", cell_km as u32));
        let mut writer =
            BufWriter::new(OpenOptions::new().write(true).create_new(true).open(path)?);
        for y in 0..1024 {
            let lat = -PI / 2.0 + (y as f64 + 0.5) * PI / 1024.0;
            for x in 0..2048 {
                let lon = (x as f64 + 0.5) * TAU / 2048.0;
                let p = direction(lat, lon);
                let u = lon / TAU * 512.0 - 0.5;
                let v = (lat / PI + 0.5) * 256.0 - 0.5;
                let ix = u.floor() as i32;
                let iy = v.floor() as i32;
                let tx = u - u.floor();
                let ty = v - v.floor();
                let fetch = |dx: i32, dy: i32| {
                    f64::from(
                        base[((iy + dy).clamp(0, 255) * 512 + (ix + dx).rem_euclid(512)) as usize],
                    )
                };
                let brightness = (1.0 - ty) * ((1.0 - tx) * fetch(0, 0) + tx * fetch(1, 0))
                    + ty * ((1.0 - tx) * fetch(0, 1) + tx * fetch(1, 1));
                let cell = cellular_field(42, p, 0.0, cell_km, 1200.0, 1)?;
                writer.write_all(
                    &((brightness * (0.65 * (cell - 0.2)).exp()) as f32).to_le_bytes(),
                )?;
            }
        }
        writer.flush()?;
    }
    Ok(())
}
