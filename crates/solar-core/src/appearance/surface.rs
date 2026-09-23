use super::*;
pub fn planck_ratio(t: f64) -> Result<f64, &'static str> {
    if !t.is_finite() || !(2000.0..=20000.0).contains(&t) {
        return Err("temperature");
    }
    let c = 6.62607015e-34 * 299792458.0 / (550e-9 * 1.380649e-23);
    Ok((c / 5772.0_f64).exp_m1() / (c / t).exp_m1())
}
pub fn limb(mu: f64, u: f64) -> Result<f64, &'static str> {
    if !mu.is_finite() || !u.is_finite() || !(0.0..=1.0).contains(&mu) || !(0.0..=1.0).contains(&u)
    {
        return Err("limb input");
    }
    Ok(1.0 - u * (1.0 - mu))
}
pub fn transfer_segment(input: f64, j: f64, alpha: f64, ds: f64) -> Result<f64, &'static str> {
    if [input, j, alpha, ds]
        .iter()
        .any(|x| !x.is_finite() || *x < 0.0)
    {
        return Err("transfer input");
    }
    let tau = alpha * ds;
    let result = input * (-tau).exp()
        + if tau == 0.0 {
            j * ds
        } else if tau < 1e-8 {
            (j * ds) * (-(-tau).exp_m1() / tau)
        } else {
            j * (-(-tau).exp_m1()) / alpha
        };
    if result.is_finite() {
        Ok(result)
    } else {
        Err("transfer overflow")
    }
}
pub fn mix(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^= x >> 16;
    x
}
pub fn cell_hash(seed: u32, c: [i32; 3], generation: i32) -> u32 {
    mix(seed
        ^ mix(c[0] as u32)
        ^ mix(c[1] as u32).rotate_left(11)
        ^ mix(c[2] as u32).rotate_left(22)
        ^ mix(generation as u32))
}
fn unit(x: u32) -> f64 {
    f64::from(x >> 8) / 16777216.0
}
pub fn granulation_visibility(diameter_px: f64) -> f64 {
    let x = ((diameter_px * 1000.0 / (2.0 * 695700.0) - 1.0) / 2.0).clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}
/// Quintic-trilinear hashed vector domain warp. Amplitude is 1.25 cells,
/// frequency 0.18/cell; independent seed domain keeps site attributes unchanged.
fn domain_warp(seed: u32, x: Vec3) -> Vec3 {
    let q = scale(x, 0.18);
    let base = q.map(|v| v.floor() as i32);
    let fraction = [0, 1, 2].map(|i| q[i] - f64::from(base[i]));
    let fade = fraction.map(|f| f * f * f * (f * (6.0 * f - 15.0) + 10.0));
    let mut vector = [0.0; 3];
    for z in 0..=1 {
        for y in 0..=1 {
            for xx in 0..=1 {
                let corner = [xx, y, z];
                let cell = [base[0] + xx, base[1] + y, base[2] + z];
                let weight = (0..3)
                    .map(|i| {
                        if corner[i] == 0 {
                            1.0 - fade[i]
                        } else {
                            fade[i]
                        }
                    })
                    .product::<f64>();
                let h = cell_hash(seed ^ 0x6a09e667, cell, 0);
                for (i, value) in vector.iter_mut().enumerate() {
                    *value += weight * (2.0 * unit(mix(h ^ (0x100 + i as u32))) - 1.0);
                }
            }
        }
    }
    add(x, scale(vector, 1.25))
}
/// Cartesian cellular reference; no seam or longitude/pole coordinate division.
pub fn granulation(seed: u32, p: Vec3, time: f64, support: i32) -> Result<f64, &'static str> {
    cellular_field(seed, p, time, 1000.0, 1200.0, support)
}
/// Statistical morphology: one C1 blended site per Cartesian lattice cell.
/// EUV morphology is distinct from 1000-km photospheric granulation.
pub fn cellular_field(
    seed: u32,
    p: Vec3,
    time: f64,
    cell_km: f64,
    lifetime_s: f64,
    support: i32,
) -> Result<f64, &'static str> {
    if !cell_km.is_finite()
        || !(500.0..=30000.0).contains(&cell_km)
        || !lifetime_s.is_finite()
        || !(60.0..=7200.0).contains(&lifetime_s)
    {
        return Err("cellular recipe");
    }
    if !time.is_finite()
        || !(0.0..=ROTATION_DURATION_S).contains(&time)
        || p.iter().any(|v| !v.is_finite())
        || !(1..=2).contains(&support)
        || (norm(p) - 1.0).abs() > 1e-6
    {
        return Err("granulation input");
    }
    let x = domain_warp(seed, scale(p, 695700.0 / cell_km));
    let birth_interval = lifetime_s / 2.0;
    let cell = x.map(|v| v.floor() as i32);
    let mut nearest = [f64::INFINITY; 2];
    for dz in -support..=support {
        for dy in -support..=support {
            for dx in -support..=support {
                let c = [cell[0] + dx, cell[1] + dy, cell[2] + dz];
                let phase = unit(cell_hash(seed, c, 0)) * birth_interval;
                let generation = ((time - phase) / birth_interval).floor() as i32;
                let mut blended = [0.0; 3];
                let mut weight = 0.0;
                for g in [generation - 1, generation] {
                    let age = time - phase - f64::from(g) * birth_interval;
                    let envelope = (std::f64::consts::PI * age / lifetime_s).sin().powi(2);
                    let h = cell_hash(seed, c, g);
                    let site = [0, 1, 2].map(|i| {
                        f64::from(c[i]) + 0.5 + 0.4 * (unit(mix(h ^ (i as u32 + 1))) - 0.5)
                    });
                    for i in 0..3 {
                        blended[i] += envelope * site[i];
                    }
                    weight += envelope;
                }
                let site = scale(blended, 1.0 / weight);
                let delta = add(x, scale(site, -1.0));
                let d = dot(delta, delta);
                if d < nearest[0] {
                    nearest[1] = nearest[0];
                    nearest[0] = d;
                } else if d < nearest[1] {
                    nearest[1] = d;
                }
            }
        }
    }
    Ok(((nearest[1] - nearest[0]) * 3.0 - 0.3).clamp(-1.0, 1.0))
}

/// Finite nonrepeating local brightening moving from first point along arc length.
pub fn pulse(
    arc_length_r: f64,
    time_s: f64,
    onset_s: f64,
    duration_s: f64,
    speed_r_s: f64,
    width_r: f64,
    amplitude: f64,
) -> Result<f64, &'static str> {
    if [
        arc_length_r,
        time_s,
        onset_s,
        duration_s,
        speed_r_s,
        width_r,
        amplitude,
    ]
    .iter()
    .any(|v| !v.is_finite())
        || arc_length_r < 0.0
        || duration_s <= 0.0
        || speed_r_s < 0.0
        || width_r <= 0.0
        || amplitude < 0.0
    {
        return Err("pulse input");
    }
    let age = time_s - onset_s;
    if age <= 0.0 || age >= duration_s {
        return Ok(0.0);
    }
    let envelope = (std::f64::consts::PI * age / duration_s).sin().powi(2);
    Ok(amplitude * envelope * (-0.5 * ((arc_length_r - speed_r_s * age) / width_r).powi(2)).exp())
}

fn value_noise(seed: u32, q: Vec3, generation: i32) -> f64 {
    let base = q.map(|v| v.floor() as i32);
    let f = [0, 1, 2].map(|i| q[i] - f64::from(base[i]));
    let fade = f.map(|v| v * v * v * (v * (6.0 * v - 15.0) + 10.0));
    let mut result = 0.0;
    for z in 0..=1 {
        for y in 0..=1 {
            for x in 0..=1 {
                let c = [x, y, z];
                let weight = (0..3)
                    .map(|i| if c[i] == 0 { 1.0 - fade[i] } else { fade[i] })
                    .product::<f64>();
                let h = cell_hash(seed, [base[0] + x, base[1] + y, base[2] + z], generation);
                result += weight * (2.0 * unit(h) - 1.0);
            }
        }
    }
    result
}
/// Illustrative EUV morphology, separate from photospheric cellular granulation.
/// Three octave correlated value noise, absolute-time quintic epoch crossfade.
pub fn euv_structure(p: Vec3, time: f64, seed: u32) -> Result<f64, &'static str> {
    if p.iter().any(|v| !v.is_finite())
        || (norm(p) - 1.0).abs() > 1e-6
        || !time.is_finite()
        || !(0.0..=ROTATION_DURATION_S).contains(&time)
    {
        return Err("EUV structure input");
    }
    let q = domain_warp(seed, scale(p, (695700.0 / 10000.0) * 0.35));
    let epoch = time / 1200.0;
    let generation = epoch.floor() as i32;
    let t = epoch - epoch.floor();
    let blend = t * t * t * (t * (6.0 * t - 15.0) + 10.0);
    let mut result = 0.0;
    for (i, weight) in [0.55, 0.30, 0.15].iter().enumerate() {
        let octave_seed = seed ^ 0x9e3779b9_u32.wrapping_mul(i as u32 + 1);
        let position = scale(q, (1_u32 << i) as f64);
        let a = value_noise(octave_seed, position, generation);
        let b = value_noise(octave_seed, position, generation + 1);
        result += weight * (a * (1.0 - blend) + b * blend);
    }
    Ok(result)
}

#[derive(Clone, Copy, Debug)]
pub struct EuvComponents {
    pub first_octave: f64,
    pub hole: f64,
    pub medium: f64,
    pub quiet_meso: f64,
    pub fine: f64,
}
fn epoch_noise(seed: u32, q: Vec3, time: f64, period: f64) -> f64 {
    let epoch = time / period;
    let g = epoch.floor() as i32;
    let f = epoch - epoch.floor();
    let w = f * f * f * (f * (6.0 * f - 15.0) + 10.0);
    value_noise(seed, q, g) * (1.0 - w) + value_noise(seed, q, g + 1) * w
}
/// R4 hierarchy components, reusing the R3 correlated field rather than cellular edges.
pub fn euv_components(p: Vec3, time: f64, seed: u32) -> Result<EuvComponents, &'static str> {
    if p.iter().any(|v| !v.is_finite())
        || (norm(p) - 1.0).abs() > 1e-6
        || !time.is_finite()
        || !(0.0..=ROTATION_DURATION_S).contains(&time)
    {
        return Err("EUV component input");
    }
    let q = domain_warp(seed, scale(p, (695700.0 / 10000.0) * 0.35));
    let n0 = epoch_noise(seed ^ 0x9e3779b9, q, time, 1200.0);
    let n1 = epoch_noise(seed ^ 0x3c6ef372, scale(q, 2.0), time, 1200.0);
    let n2 = epoch_noise(seed ^ 0xdaa66d2b, scale(q, 4.0), time, 1200.0);
    let c = epoch_noise(seed ^ 0xa54ff53a, scale(q, 0.14), time, 21600.0);
    let h = ((c - 0.08) / 0.30).clamp(0.0, 1.0);
    Ok(EuvComponents {
        first_octave: n0,
        quiet_meso: (0.5 + 0.5 * (0.55 * n0 + 0.30 * n1 + 0.15 * n2).clamp(-1.0, 1.0)).powi(2),
        hole: h * h * (3.0 - 2.0 * h),
        medium: (1.0 - (1.8 * (0.7 * n0 + 0.3 * n1)).abs()).max(0.0).powi(3),
        fine: 0.5 + 0.5 * n2,
    })
}
