use super::*;
use crate::differential_rotation::carrington_advection_deg_per_day;
use std::f64::consts::{PI, TAU};
pub const ROTATION_DURATION_S: f64 = 6.0 * 86400.0;
#[derive(Clone, Debug)]
pub struct LifecycleRegion {
    pub id: u32,
    pub birth_s: f64,
    pub lifetime_s: f64,
    pub rise_s: f64,
    pub decay_s: f64,
    pub latitude_rad: f64,
    pub birth_longitude_rad: f64,
    pub peak_radius_rad: f64,
    pub temperature_k: f64,
    pub peak_strength: f64,
}
#[derive(Clone, Debug)]
pub struct RegionPose {
    pub id: u32,
    pub center: Vec3,
    pub radius_rad: f64,
    pub temperature_k: f64,
    pub strength: f64,
}
fn smooth(x: f64) -> f64 {
    let x = x.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}
impl LifecycleRegion {
    pub fn pose(&self, time: f64) -> Result<RegionPose, &'static str> {
        if [
            time,
            self.birth_s,
            self.lifetime_s,
            self.rise_s,
            self.decay_s,
            self.latitude_rad,
            self.birth_longitude_rad,
            self.peak_radius_rad,
            self.temperature_k,
            self.peak_strength,
        ]
        .iter()
        .any(|v| !v.is_finite())
            || self.lifetime_s <= 0.0
            || self.rise_s <= 0.0
            || self.decay_s <= 0.0
            || self.rise_s + self.decay_s > self.lifetime_s
            || self.latitude_rad.abs() > PI / 2.0
            || !(0.0..=0.3).contains(&self.peak_radius_rad)
            || self.peak_strength < 0.0
            || !(2000.0..=20000.0).contains(&self.temperature_k)
        {
            return Err("region lifecycle");
        }
        let age = time - self.birth_s;
        let envelope = if age <= 0.0 || age >= self.lifetime_s {
            0.0
        } else {
            smooth(age / self.rise_s) * smooth((self.lifetime_s - age) / self.decay_s)
        };
        let lon = self.birth_longitude_rad
            + carrington_advection_deg_per_day(self.latitude_rad.to_degrees()).to_radians() * age
                / 86400.0;
        Ok(RegionPose {
            id: self.id,
            center: direction(self.latitude_rad, lon),
            radius_rad: self.peak_radius_rad * envelope,
            temperature_k: self.temperature_k,
            strength: self.peak_strength * envelope,
        })
    }
}
pub fn rotation_regions(seed: u32) -> Vec<LifecycleRegion> {
    regions(seed, 0.0, 1)
        .into_iter()
        .map(|r| LifecycleRegion {
            id: r.id,
            birth_s: -172800.0 + f64::from(r.id) * 43200.0,
            lifetime_s: 345600.0,
            rise_s: 21600.0,
            decay_s: 86400.0,
            latitude_rad: r.center[2].asin(),
            birth_longitude_rad: r.center[1].atan2(r.center[0]),
            peak_radius_rad: r.radius,
            temperature_k: r.temperature,
            peak_strength: 2.5,
        })
        .collect()
}
pub fn lifecycle_field(
    regions: &[LifecycleRegion],
    time: f64,
    lmax: usize,
) -> Result<(Vec<RegionPose>, FieldSolution), &'static str> {
    let poses = regions
        .iter()
        .map(|r| r.pose(time))
        .collect::<Result<Vec<_>, _>>()?;
    let field = solve_pfss(
        |p| {
            let mut br = 0.35 * p[2];
            for r in &poses {
                let lon = r.center[1].atan2(r.center[0]);
                let lat = r.center[2].asin();
                let a = direction(lat, lon - 0.075);
                let b = direction(lat + 0.025, lon + 0.075);
                br += r.strength
                    * (((dot(p, a) - 1.0) / 0.025).exp() - ((dot(p, b) - 1.0) / 0.025).exp());
            }
            br
        },
        lmax,
        2.5,
    )?;
    Ok((poses, field))
}
#[derive(Clone, Debug)]
pub struct BoundaryGrid {
    pub lon_count: usize,
    pub lat_count: usize,
    pub values: Vec<f64>,
}
impl BoundaryGrid {
    pub fn new(lon_count: usize, lat_count: usize, values: Vec<f64>) -> Result<Self, &'static str> {
        if !(8..=256).contains(&lon_count)
            || !(4..=128).contains(&lat_count)
            || values.len() != lon_count * lat_count
            || values.iter().any(|v| !v.is_finite() || v.abs() > 1e6)
        {
            return Err("boundary grid bounds");
        }
        Ok(Self {
            lon_count,
            lat_count,
            values,
        })
    }
    fn latitude_edge(&self, y: usize) -> f64 {
        -PI / 2.0 + y as f64 * PI / self.lat_count as f64
    }
    pub fn flux_integral(&self) -> f64 {
        (0..self.lat_count)
            .map(|y| {
                let w = TAU / self.lon_count as f64
                    * (self.latitude_edge(y + 1).sin() - self.latitude_edge(y).sin());
                self.values[y * self.lon_count..(y + 1) * self.lon_count]
                    .iter()
                    .sum::<f64>()
                    * w
            })
            .sum()
    }
    /// Exact overlap of piecewise-constant spherical cell means; conserves total flux.
    pub fn resample(&self, lon: usize, lat: usize) -> Result<Self, &'static str> {
        let mut out = Self::new(lon, lat, vec![0.0; lon.saturating_mul(lat).min(32769)])?;
        for y in 0..lat {
            let lo = -PI / 2.0 + y as f64 * PI / lat as f64;
            let hi = -PI / 2.0 + (y + 1) as f64 * PI / lat as f64;
            let ys = y * self.lat_count / lat;
            let ye = ((y + 1) * self.lat_count).div_ceil(lat).min(self.lat_count);
            for x in 0..lon {
                let left = x as f64 * TAU / lon as f64;
                let right = (x + 1) as f64 * TAU / lon as f64;
                let xs = x * self.lon_count / lon;
                let xe = ((x + 1) * self.lon_count).div_ceil(lon).min(self.lon_count);
                let mut integral = 0.0;
                for sy in ys..ye {
                    let wlat = hi.min(self.latitude_edge(sy + 1)).sin()
                        - lo.max(self.latitude_edge(sy)).sin();
                    for sx in xs..xe {
                        let wlon = right.min((sx + 1) as f64 * TAU / self.lon_count as f64)
                            - left.max(sx as f64 * TAU / self.lon_count as f64);
                        integral += self.values[sy * self.lon_count + sx] * wlat * wlon;
                    }
                }
                out.values[y * lon + x] = integral / ((right - left) * (hi.sin() - lo.sin()));
            }
        }
        Ok(out)
    }
    /// Area-weighted midpoint harmonic projection of admitted cell means.
    /// Resolution is constrained by source sampling; no invented subpixel field.
    pub fn solve(&self, lmax: usize, rss: f64) -> Result<FieldSolution, &'static str> {
        if lmax == 0 || lmax > 64 || lmax > self.lon_count / 2 || lmax >= self.lat_count {
            return Err("boundary harmonic resolution");
        }
        let mean = self.flux_integral() / (4.0 * PI);
        let mut coefficients = Vec::new();
        for l in 1..=lmax {
            for m in 0..=l {
                let (mut cosine, mut sine) = (0.0, 0.0);
                for y in 0..self.lat_count {
                    let lat = (self.latitude_edge(y) + self.latitude_edge(y + 1)) / 2.0;
                    let weight = TAU / self.lon_count as f64
                        * (self.latitude_edge(y + 1).sin() - self.latitude_edge(y).sin());
                    for x in 0..self.lon_count {
                        let p = direction(lat, (x as f64 + 0.5) * TAU / self.lon_count as f64);
                        let (a, b) = harmonic(l, m, p);
                        let weighted = (self.values[y * self.lon_count + x] - mean) * weight;
                        cosine += weighted * a;
                        sine += weighted * b;
                    }
                }
                coefficients.push(Harmonic { l, m, cosine, sine });
            }
        }
        let mut field = FieldSolution::new(rss, coefficients)?;
        field.monopole_removed = mean;
        Ok(field)
    }
}
#[derive(Clone, Debug, PartialEq)]
pub struct TraceSeed {
    pub id: u32,
    pub position: Vec3,
}
/// Exponential-race weighted sampling without replacement on equal-area candidates.
/// IDs identify candidate directions, not ranks; select once then pose for a sequence.
pub fn weighted_seeds(
    field: &FieldSolution,
    seed: u32,
    count: usize,
    candidates: usize,
) -> Result<Vec<TraceSeed>, &'static str> {
    if !(1..=64).contains(&count) || !(64..=4096).contains(&candidates) || count > candidates {
        return Err("seed bounds");
    }
    let mut ranked = Vec::new();
    for i in 0..candidates {
        let p = direction(
            (1.0 - 2.0 * (i as f64 + 0.5) / candidates as f64).asin(),
            i as f64 * 2.399963229728653,
        );
        let weight = dot(field.field(scale(p, 1.005)), p).abs();
        if weight <= 1e-12 {
            continue;
        }
        let u = (f64::from(mix(seed ^ i as u32)) + 0.5) / 4294967296.0;
        ranked.push((
            -u.ln() / weight,
            TraceSeed {
                id: i as u32,
                position: scale(p, 1.005),
            },
        ));
    }
    ranked.sort_by(|a, b| a.0.total_cmp(&b.0).then_with(|| a.1.id.cmp(&b.1.id)));
    ranked.truncate(count);
    let mut result: Vec<_> = ranked.into_iter().map(|(_, s)| s).collect();
    result.sort_by_key(|s| s.id);
    Ok(result)
}
pub fn pose_seeds(seeds: &[TraceSeed], elapsed_s: f64) -> Result<Vec<TraceSeed>, &'static str> {
    if !elapsed_s.is_finite() || !(-ROTATION_DURATION_S..=ROTATION_DURATION_S).contains(&elapsed_s)
    {
        return Err("seed pose time");
    }
    Ok(seeds
        .iter()
        .map(|s| {
            let r = norm(s.position);
            let lat = (s.position[2] / r).asin();
            let lon = s.position[1].atan2(s.position[0])
                + carrington_advection_deg_per_day(lat.to_degrees()).to_radians() * elapsed_s
                    / 86400.0;
            TraceSeed {
                id: s.id,
                position: scale(direction(lat, lon), r),
            }
        })
        .collect())
}
