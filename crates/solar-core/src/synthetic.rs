use crate::active_region::{ActiveRegion, Polarity};
use crate::constants::SECONDS_PER_DAY;
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
    next_birth_seconds: Option<f64>,
    generated_until_seconds: Option<f64>,
    scheduled_rate_per_second: f64,
    pub config: SyntheticConfig,
}

impl SyntheticSolarModel {
    pub fn new(config: SyntheticConfig) -> Self {
        Self {
            rng: XorShift64::new(config.seed),
            next_id: 1,
            next_birth_seconds: None,
            generated_until_seconds: None,
            scheduled_rate_per_second: f64::NAN,
            config,
        }
    }

    /// Generate all Poisson-process arrivals in [now, now + dt). The next event
    /// time is retained, making the sequence invariant to how callers partition
    /// the same interval.
    pub fn generate_births(
        &mut self,
        now_seconds: f64,
        dt_seconds: f64,
        _grid: &SolarGrid,
    ) -> Vec<ActiveRegion> {
        assert!(now_seconds.is_finite());
        assert!(dt_seconds.is_finite() && dt_seconds >= 0.0);
        if let Some(previous_end) = self.generated_until_seconds {
            assert!(
                (now_seconds - previous_end).abs() <= 1.0e-6,
                "synthetic generation must be sequential: expected {previous_end}, got {now_seconds}"
            );
        }

        let end_seconds = now_seconds + dt_seconds;
        let rate = self.effective_rate_per_second();
        if !rate.is_finite() || rate <= 0.0 {
            self.next_birth_seconds = None;
            self.generated_until_seconds = Some(end_seconds);
            self.scheduled_rate_per_second = rate;
            return Vec::new();
        }

        if self.next_birth_seconds.is_none()
            || (rate - self.scheduled_rate_per_second).abs() > f64::EPSILON
        {
            self.next_birth_seconds = Some(now_seconds + self.sample_interarrival_seconds(rate));
            self.scheduled_rate_per_second = rate;
        }

        let mut out = Vec::new();
        while let Some(birth_seconds) = self.next_birth_seconds {
            if birth_seconds >= end_seconds {
                break;
            }
            out.push(self.sample_region(birth_seconds));
            self.next_birth_seconds =
                Some(birth_seconds + self.sample_interarrival_seconds(rate));
        }
        self.generated_until_seconds = Some(end_seconds);
        out
    }

    fn effective_rate_per_second(&self) -> f64 {
        self.config.birth_rate_per_day as f64 * self.config.activity_index as f64
            / SECONDS_PER_DAY
    }

    fn sample_interarrival_seconds(&mut self, rate_per_second: f64) -> f64 {
        let u = self.rng.next_f64_open_closed();
        -u.ln() / rate_per_second
    }

    fn sample_region(&mut self, birth_seconds: f64) -> ActiveRegion {
        let hemi = if self.rng.next_f32() < 0.5 { -1.0 } else { 1.0 };
        let lat = hemi
            * (self.config.mean_latitude_deg
                + self.config.latitude_sigma_deg * self.rng.normal_approx());
        let lon = 360.0 * self.rng.next_f32();
        let complexity = (0.35 + 0.65 * self.rng.next_f32()).clamp(0.0, 1.0);
        let flux = self.config.mean_flux_norm
            * (0.55 + 1.20 * self.rng.next_f32())
            * (0.75 + complexity);

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

        let region = ActiveRegion {
            id: self.next_id,
            birth_seconds,
            lat_deg: lat.clamp(-40.0, 40.0),
            lon_deg: lon,
            flux_norm: flux,
            area_msh: 150.0 + 1800.0 * complexity,
            tilt_deg: hemi * (4.0 + 18.0 * self.rng.next_f32()),
            complexity,
            polarity,
            confidence: 0.65,
        };
        self.next_id += 1;
        region
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

    fn next_f64_open_closed(&mut self) -> f64 {
        let v = self.next_u64() >> 11;
        ((v + 1) as f64) / ((1u64 << 53) as f64)
    }

    fn normal_approx(&mut self) -> f32 {
        let mut sum = 0.0;
        for _ in 0..12 {
            sum += self.next_f32();
        }
        sum - 6.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn polarity_follows_hales_law() {
        let grid = SolarGrid::new(72, 36);
        let mut model = SyntheticSolarModel::new(SyntheticConfig::default());
        let births = model.generate_births(0.0, SECONDS_PER_DAY * 60.0, &grid);
        assert!(births.len() > 40, "need a decent sample, got {}", births.len());
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
        assert!(obeys as f32 / births.len() as f32 > 0.8);
    }

    #[test]
    fn nan_activity_yields_no_births() {
        let grid = SolarGrid::new(72, 36);
        let mut model = SyntheticSolarModel::new(SyntheticConfig {
            activity_index: f32::NAN,
            ..SyntheticConfig::default()
        });
        assert!(model.generate_births(0.0, SECONDS_PER_DAY, &grid).is_empty());
    }

    #[test]
    fn same_seed_reproduces_births() {
        let grid = SolarGrid::new(72, 36);
        let mut a = SyntheticSolarModel::new(SyntheticConfig::default());
        let mut b = SyntheticSolarModel::new(SyntheticConfig::default());
        let ba = a.generate_births(0.0, SECONDS_PER_DAY, &grid);
        let bb = b.generate_births(0.0, SECONDS_PER_DAY, &grid);
        assert_eq!(ba.len(), bb.len());
        for (x, y) in ba.iter().zip(bb.iter()) {
            assert_eq!(x.id, y.id);
            assert_eq!(x.birth_seconds, y.birth_seconds);
            assert!((x.lat_deg - y.lat_deg).abs() < 1e-6);
            assert!((x.lon_deg - y.lon_deg).abs() < 1e-6);
        }
    }

    #[test]
    fn event_stream_is_partition_invariant() {
        let grid = SolarGrid::new(72, 36);
        let mut one = SyntheticSolarModel::new(SyntheticConfig::default());
        let all = one.generate_births(0.0, 10.0 * SECONDS_PER_DAY, &grid);

        let mut partitioned = SyntheticSolarModel::new(SyntheticConfig::default());
        let mut parts = Vec::new();
        for day in 0..10 {
            parts.extend(partitioned.generate_births(
                day as f64 * SECONDS_PER_DAY,
                SECONDS_PER_DAY,
                &grid,
            ));
        }

        assert_eq!(all.len(), parts.len());
        for (a, b) in all.iter().zip(parts.iter()) {
            assert_eq!(a.id, b.id);
            assert_eq!(a.birth_seconds, b.birth_seconds);
            assert_eq!(a.polarity, b.polarity);
            assert!((a.flux_norm - b.flux_norm).abs() < f32::EPSILON);
        }
    }
}
