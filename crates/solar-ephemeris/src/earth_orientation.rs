#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Quality {
    Rapid,
    Predicted,
    Degraded,
    PreUtcUt1Proxy,
}

impl Quality {
    pub fn name(self) -> &'static str {
        match self {
            Self::Rapid => "rapid",
            Self::Predicted => "predicted",
            Self::Degraded => "degraded",
            Self::PreUtcUt1Proxy => "pre_utc_ut1_proxy",
        }
    }

    pub fn precision_ready(self) -> bool {
        matches!(self, Self::Rapid | Self::Predicted)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct EarthOrientation {
    pub dut1_seconds: f64,
    pub xp_arcsec: f64,
    pub yp_arcsec: f64,
    pub dut1_uncertainty_seconds: f64,
    pub source: &'static str,
    pub quality: Quality,
}

impl EarthOrientation {
    pub fn degraded(source: &'static str) -> Self {
        Self {
            dut1_seconds: 0.0,
            xp_arcsec: 0.0,
            yp_arcsec: 0.0,
            dut1_uncertainty_seconds: 0.9,
            source,
            quality: Quality::Degraded,
        }
    }
}
