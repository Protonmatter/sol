use super::*;
use crate::differential_rotation::carrington_advection_deg_per_day;
use std::f64::consts::PI;
/// CPU reference of the browser's fully resolved illustrative EUV surface.
/// Includes the 512x256 base-grid bilinear filtering, Carrington unadvection,
/// correlated EUV morphology, and the declared exp(0.65*(cell-0.2)) display modulation.
/// Row zero is south; west-positive longitude; texel centers; no palette/bloom.
pub fn euv_reference_raster(
    seed: u32,
    time: f64,
    recipe: u32,
    width: usize,
    height: usize,
) -> Result<Vec<f32>, &'static str> {
    if recipe > 1
        || !time.is_finite()
        || !(0.0..=21600.0).contains(&time)
        || !(1..=2048).contains(&width)
        || !(1..=1024).contains(&height)
    {
        return Err("raster bounds");
    }
    let regions = regions(seed, 0.0, recipe);
    let mut base = Vec::with_capacity(512 * 256);
    for y in 0..256 {
        for x in 0..512 {
            let p = direction(
                -PI / 2.0 + (y as f64 + 0.5) * PI / 256.0,
                (x as f64 + 0.5) * 2.0 * PI / 512.0,
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
    let mut output = Vec::with_capacity(width * height);
    for y in 0..height {
        let lat = -PI / 2.0 + (y as f64 + 0.5) * PI / height as f64;
        for x in 0..width {
            let lon = (x as f64 + 0.5) * 2.0 * PI / width as f64
                - carrington_advection_deg_per_day(lat.to_degrees()).to_radians() * time / 86400.0;
            let p = direction(lat, lon);
            let u = lon.rem_euclid(2.0 * PI) / (2.0 * PI) * 512.0 - 0.5;
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
            let cell = euv_structure(p, time, seed)?;
            output.push((brightness * (0.65 * (cell - 0.2)).exp()) as f32);
        }
    }
    Ok(output)
}

/// Eight R4 pre-display component rasters. Region/core attachments are admitted
/// offline geometry; no PFSS extrapolation or new footpoints occur during sampling.
pub fn hierarchical_rasters(
    seed: u32,
    time: f64,
    regions: &[EmissionRegion],
    width: usize,
    height: usize,
) -> Result<Vec<Vec<f32>>, &'static str> {
    if !time.is_finite()
        || !(0.0..=21600.0).contains(&time)
        || !(1..=2048).contains(&width)
        || !(1..=1024).contains(&height)
        || regions.len() > 10
    {
        return Err("hierarchy raster bounds");
    }
    let mut out = (0..8)
        .map(|_| Vec::with_capacity(width * height))
        .collect::<Vec<_>>();
    for y in 0..height {
        let lat = -PI / 2.0 + (y as f64 + 0.5) * PI / height as f64;
        for x in 0..width {
            let lon = (x as f64 + 0.5) * 2.0 * PI / width as f64
                - carrington_advection_deg_per_day(lat.to_degrees()).to_radians() * time / 86400.0;
            let values = surface_components(direction(lat, lon), time, seed, regions)?;
            for (i, value) in values.iter().enumerate() {
                out[i].push(*value as f32);
            }
        }
    }
    Ok(out)
}
