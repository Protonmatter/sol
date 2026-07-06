use core::f64::consts::PI;

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

const SOURCE: &str = "IERS Bulletin A Vol. XXXIX No. 027, 2026-07-02";
const RAPID: [(f64, f64, f64, f64); 7] = [
    (61_217.0, 0.011_613, 0.202_50, 0.393_65),
    (61_218.0, 0.012_088, 0.203_20, 0.392_68),
    (61_219.0, 0.012_700, 0.203_80, 0.391_74),
    (61_220.0, 0.013_357, 0.204_31, 0.390_83),
    (61_221.0, 0.013_998, 0.204_79, 0.389_93),
    (61_222.0, 0.014_514, 0.205_22, 0.389_22),
    (61_223.0, 0.014_873, 0.205_47, 0.388_64),
];

/// Return Earth-orientation parameters for UTC Julian Date.
///
/// Rapid-service values are linearly interpolated. The published Bulletin A
/// prediction equations are used only through the bulletin's one-year horizon.
/// All other dates return a labelled degraded value with a conservative DUT1
/// uncertainty instead of silently asserting UT1 equals UTC.
pub fn for_jd_utc(jd_utc: f64) -> EarthOrientation {
    let mjd = jd_utc - 2_400_000.5;
    if (RAPID[0].0..=RAPID[RAPID.len() - 1].0).contains(&mjd) {
        return rapid_interpolated(mjd);
    }
    if (61_223.0..=61_588.0).contains(&mjd) {
        return bulletin_prediction(mjd);
    }
    EarthOrientation::degraded("no bundled IERS EOP sample covers this UTC epoch")
}

fn rapid_interpolated(mjd: f64) -> EarthOrientation {
    let upper = RAPID
        .iter()
        .position(|row| row.0 >= mjd)
        .unwrap_or(RAPID.len() - 1);
    let lower = upper.saturating_sub(1);
    let (m0, d0, x0, y0) = RAPID[lower];
    let (m1, d1, x1, y1) = RAPID[upper];
    let fraction = if m1 == m0 { 0.0 } else { (mjd - m0) / (m1 - m0) };
    EarthOrientation {
        dut1_seconds: d0 + fraction * (d1 - d0),
        xp_arcsec: x0 + fraction * (x1 - x0),
        yp_arcsec: y0 + fraction * (y1 - y0),
        dut1_uncertainty_seconds: 0.000_062,
        source: SOURCE,
        quality: Quality::Rapid,
    }
}

fn bulletin_prediction(mjd: f64) -> EarthOrientation {
    let a = 2.0 * PI * (mjd - 61_223.0) / 365.25;
    let c = 2.0 * PI * (mjd - 61_223.0) / 435.0;
    let xp = 0.1443 + 0.0966 * a.cos() + 0.0955 * a.sin()
        - 0.0259 * c.cos()
        - 0.0720 * c.sin();
    let yp = 0.3687 + 0.0899 * a.cos() - 0.0868 * a.sin()
        - 0.0720 * c.cos()
        + 0.0259 * c.sin();
    let besselian_year = 1900.0
        + (mjd + 2_400_000.5 - 2_415_020.313_52) / 365.242_198_781;
    let phase = 2.0 * PI * besselian_year;
    let ut2_minus_ut1 = 0.022 * phase.sin() - 0.012 * phase.cos()
        - 0.006 * (2.0 * phase).sin()
        + 0.007 * (2.0 * phase).cos();
    let dut1 = -0.0018 - 0.00008 * (mjd - 61_231.0) - ut2_minus_ut1;
    let days = mjd - 61_223.0;
    EarthOrientation {
        dut1_seconds: dut1,
        xp_arcsec: xp,
        yp_arcsec: yp,
        dut1_uncertainty_seconds: (0.001 + 0.0002 * days).min(0.1),
        source: SOURCE,
        quality: Quality::Predicted,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_rapid_sample_is_preserved() {
        let eop = for_jd_utc(2_400_000.5 + 61_223.0);
        assert_eq!(eop.quality, Quality::Rapid);
        assert!((eop.dut1_seconds - 0.014_873).abs() < 1.0e-12);
        assert!((eop.xp_arcsec - 0.205_47).abs() < 1.0e-12);
        assert!((eop.yp_arcsec - 0.388_64).abs() < 1.0e-12);
    }

    #[test]
    fn uncovered_epoch_is_explicitly_degraded() {
        let eop = for_jd_utc(2_451_545.0);
        assert_eq!(eop.quality, Quality::Degraded);
        assert_eq!(eop.dut1_seconds, 0.0);
        assert_eq!(eop.dut1_uncertainty_seconds, 0.9);
    }
}
