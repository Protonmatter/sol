#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Polarity {
    LeadingPositive,
    LeadingNegative,
}

#[derive(Clone, Debug)]
pub struct ActiveRegion {
    pub id: u64,
    pub birth_seconds: f64,
    pub lat_deg: f32,
    pub lon_deg: f32,
    pub flux_norm: f32,
    pub area_msh: f32,
    pub tilt_deg: f32,
    pub complexity: f32,
    pub polarity: Polarity,
    pub confidence: f32,
}

impl ActiveRegion {
    pub fn age_days(&self, now_seconds: f64) -> f32 {
        ((now_seconds - self.birth_seconds).max(0.0) / 86_400.0) as f32
    }

    pub fn flare_hazard(&self, activity_index: f32) -> f32 {
        let flux = self.flux_norm.max(0.0).ln_1p();
        (0.05 + 0.22 * flux + 0.48 * self.complexity + 0.25 * activity_index).clamp(0.0, 1.0)
    }
}
