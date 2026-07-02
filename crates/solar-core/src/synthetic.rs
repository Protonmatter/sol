use crate::active_region::{ActiveRegion, Polarity};
use crate::grid::SolarGrid;

#[derive(Clone, Debug)]
pub struct SyntheticConfig {
    pub seed: u64,
    pub activity_index: f32,
    pub birth_rate_per_day: f32,
    pub mean_latitude_deg: f32,
    pub latitude_sigma_deg: f32,
    pub mean_flux_norm: f32,
}

impl Default for SyntheticConfig {
    fn default() -> Self {
        Self {
            seed: 42,
            activity_index: 0.9,
            birth_rate_per_day: 4.0,
            mean_latitude_deg: 16.0,
            latitude_sigma_deg: 7.0,
            mean_flux_norm: 0.75,
        }
    }
}

#[derive(Clone, Debug)]
pub struct SyntheticSolarModel {
    rng: XorShift64,
    next_id: u64,
    pub config: SyntheticConfig,
}

impl SyntheticSolarModel {
    pub fn new(config: SyntheticConfig) -> Self {
        Self {
            rng: XorShift64::new(config.seed),
            next_id: 1,
            config,
        }
    }

    pub fn generate_births(
        &mut self,
        now_seconds: f64,
        dt_seconds: f64,
        _grid: &SolarGrid,
    ) -> Vec<ActiveRegion> {
        let dt_days = (dt_seconds / 86_400.0) as f32;
        let expected = self.config.birth_rate_per_day * self.config.activity_index * dt_days;
        let count = poisson_sample(&mut self.rng, expected);
        let mut out = Vec::with_capacity(count);

        for _ in 0..count {
            let hemi = if self.rng.next_f32() < 0.5 { -1.0 } else { 1.0 };
            let lat = hemi
                * (self.config.mean_latitude_deg
                    + self.config.latitude_sigma_deg * self.rng.normal_approx());
            let lon = 360.0 * self.rng.next_f32();
            let complexity = (0.35 + 0.65 * self.rng.next_f32()).clamp(0.0, 1.0);
            let flux = self.config.mean_flux_norm
                * (0.55 + 1.20 * self.rng.next_f32())
                * (0.75 + complexity);

            // Hale's law: within a cycle the leading-spot polarity is coherent per hemisphere
            // and opposite between hemispheres (it flips at each ~11-yr cycle boundary; this is
            // a single-cycle engine, so the parity is fixed). ~8% of real regions violate it
            // ("anti-Hale"), which the second draw reproduces. The old 50/50 coin flip per
            // region produced a magnetically impossible Sun.
            let hale = if hemi > 0.0 {
                Polarity::LeadingPositive
            } else {
                Polarity::LeadingNegative
            };
            let polarity = if self.rng.next_f32() < 0.08 {
                match hale {
                    Polarity::LeadingPositive => Polarity::LeadingNegative,
                    Polarity::LeadingNegative => Polarity::LeadingPositive,
                }
            } else {
                hale
            };
            out.push(ActiveRegion {
                id: self.next_id,
                birth_seconds: now_seconds,
                lat_deg: lat.clamp(-40.0, 40.0),
                lon_deg: lon,
                flux_norm: flux,
                area_msh: 150.0 + 1800.0 * complexity,
                tilt_deg: hemi * (4.0 + 18.0 * self.rng.next_f32()),
                complexity,
                polarity,
                confidence: 0.65,
            });
            self.next_id += 1;
        }
        out
    }
}

#[derive(Clone, Debug)]
struct XorShift64 {
    state: u64,
}

impl XorShift64 {
    fn new(seed: u64) -> Self {
        Self { state: seed.max(1) }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }

    fn next_f32(&mut self) -> f32 {
        let v = self.next_u64() >> 40;
        (v as f32) / ((1u64 << 24) as f32)
    }

    /// Irwin–Hall approximation to a standard normal. Twelve uniforms are required for unit
    /// variance (Var[U]=1/12 each); the previous six-uniform version had σ=√0.5≈0.707, so every
    /// configured sigma (e.g. `latitude_sigma_deg`) silently acted ~29% tighter than stated.
    fn normal_approx(&mut self) -> f32 {
        let mut sum = 0.0;
        for _ in 0..12 {
            sum += self.next_f32();
        }
        sum - 6.0
    }
}

fn poisson_sample(rng: &mut XorShift64, lambda: f32) -> usize {
    if lambda <= 0.0 {
        return 0;
    }
    let l = (-lambda).exp();
    let mut k = 0usize;
    let mut p = 1.0f32;
    loop {
        k += 1;
        p *= rng.next_f32().max(1e-7);
        if p <= l {
            return k - 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polarity_follows_hales_law() {
        let grid = SolarGrid::new(72, 36);
        let mut model = SyntheticSolarModel::new(SyntheticConfig::default());
        let births = model.generate_births(0.0, 86_400.0 * 60.0, &grid);
        assert!(
            births.len() > 40,
            "need a decent sample, got {}",
            births.len()
        );
        let obeys = births
            .iter()
            .filter(|ar| {
                let hale = if ar.lat_deg > 0.0 {
                    Polarity::LeadingPositive
                } else {
                    Polarity::LeadingNegative
                };
                ar.polarity == hale
            })
            .count();
        // ~92% Hale-obeying by construction; require a clear hemispheric signal.
        assert!(
            obeys as f32 / births.len() as f32 > 0.8,
            "{obeys}/{} regions obey Hale's law",
            births.len()
        );
    }

    #[test]
    fn same_seed_reproduces_births() {
        let grid = SolarGrid::new(72, 36);
        let mut a = SyntheticSolarModel::new(SyntheticConfig::default());
        let mut b = SyntheticSolarModel::new(SyntheticConfig::default());
        let ba = a.generate_births(0.0, 86_400.0, &grid);
        let bb = b.generate_births(0.0, 86_400.0, &grid);
        assert_eq!(ba.len(), bb.len());
        for (x, y) in ba.iter().zip(bb.iter()) {
            assert_eq!(x.id, y.id);
            assert!((x.lat_deg - y.lat_deg).abs() < 1e-6);
            assert!((x.lon_deg - y.lon_deg).abs() < 1e-6);
        }
    }
}
