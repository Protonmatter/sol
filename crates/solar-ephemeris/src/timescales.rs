use crate::earth_orientation::{self, EarthOrientation, Quality};
use crate::time::{delta_t_seconds, year_from_jd};

pub const SECONDS_PER_DAY: f64 = 86_400.0;
const TT_MINUS_TAI_SECONDS: f64 = 32.184;

#[derive(Clone, Copy, Debug)]
pub struct AstroTime {
    pub jd_utc: f64,
    pub jd_tai: Option<f64>,
    pub jd_tt: f64,
    pub jd_ut1: f64,
    pub tai_minus_utc_seconds: Option<f64>,
    pub delta_t_seconds: f64,
    pub eop: EarthOrientation,
}

impl AstroTime {
    pub fn from_jd_utc(jd_utc: f64) -> Self {
        Self::from_jd_utc_with_eop(jd_utc, earth_orientation::for_jd_utc(jd_utc))
    }

    pub fn from_jd_utc_with_eop(jd_utc: f64, eop: EarthOrientation) -> Self {
        assert!(jd_utc.is_finite());
        assert!(eop.dut1_seconds.is_finite());
        assert!(eop.dut1_seconds.abs() <= 0.9);
        assert!(eop.xp_arcsec.is_finite());
        assert!(eop.yp_arcsec.is_finite());

        let jd_ut1 = jd_utc + eop.dut1_seconds / SECONDS_PER_DAY;
        if let Some(tai_minus_utc) = tai_minus_utc_seconds(jd_utc) {
            let jd_tai = jd_utc + tai_minus_utc / SECONDS_PER_DAY;
            let jd_tt = jd_tai + TT_MINUS_TAI_SECONDS / SECONDS_PER_DAY;
            Self {
                jd_utc,
                jd_tai: Some(jd_tai),
                jd_tt,
                jd_ut1,
                tai_minus_utc_seconds: Some(tai_minus_utc),
                delta_t_seconds: (jd_tt - jd_ut1) * SECONDS_PER_DAY,
                eop,
            }
        } else {
            let delta_t = delta_t_seconds(year_from_jd(jd_ut1));
            Self {
                jd_utc,
                jd_tai: None,
                jd_tt: jd_ut1 + delta_t / SECONDS_PER_DAY,
                jd_ut1,
                tai_minus_utc_seconds: None,
                delta_t_seconds: delta_t,
                eop: EarthOrientation {
                    quality: Quality::PreUtcUt1Proxy,
                    source: "pre-1972 UTC input treated as UT1 proxy; TT from delta-T model",
                    ..eop
                },
            }
        }
    }
}

pub fn gregorian_to_jd(year: i32, month: u8, day: u8) -> f64 {
    let mut y = year;
    let mut m = i32::from(month);
    if m <= 2 {
        y -= 1;
        m += 12;
    }
    let a = (y as f64 / 100.0).floor();
    let b = 2.0 - a + (a / 4.0).floor();
    (365.25 * (y as f64 + 4716.0)).floor()
        + (30.6001 * (m as f64 + 1.0)).floor()
        + f64::from(day)
        + b
        - 1524.5
}

/// TAI-UTC during the stepwise UTC era, including every transition through the
/// 37-second value effective since 2017-01-01.
pub fn tai_minus_utc_seconds(jd_utc: f64) -> Option<f64> {
    const LEAPS: [(i32, u8, u8, f64); 28] = [
        (1972, 1, 1, 10.0),
        (1972, 7, 1, 11.0),
        (1973, 1, 1, 12.0),
        (1974, 1, 1, 13.0),
        (1975, 1, 1, 14.0),
        (1976, 1, 1, 15.0),
        (1977, 1, 1, 16.0),
        (1978, 1, 1, 17.0),
        (1979, 1, 1, 18.0),
        (1980, 1, 1, 19.0),
        (1981, 7, 1, 20.0),
        (1982, 7, 1, 21.0),
        (1983, 7, 1, 22.0),
        (1985, 7, 1, 23.0),
        (1988, 1, 1, 24.0),
        (1990, 1, 1, 25.0),
        (1991, 1, 1, 26.0),
        (1992, 7, 1, 27.0),
        (1993, 7, 1, 28.0),
        (1994, 7, 1, 29.0),
        (1996, 1, 1, 30.0),
        (1997, 7, 1, 31.0),
        (1999, 1, 1, 32.0),
        (2006, 1, 1, 33.0),
        (2009, 1, 1, 34.0),
        (2012, 7, 1, 35.0),
        (2015, 7, 1, 36.0),
        (2017, 1, 1, 37.0),
    ];

    let mut offset = None;
    for (year, month, day, value) in LEAPS {
        if jd_utc >= gregorian_to_jd(year, month, day) {
            offset = Some(value);
        } else {
            break;
        }
    }
    offset
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::earth_orientation::Quality;

    #[test]
    fn leap_second_boundaries_are_complete() {
        assert_eq!(tai_minus_utc_seconds(gregorian_to_jd(1971, 12, 31)), None);
        assert_eq!(
            tai_minus_utc_seconds(gregorian_to_jd(1972, 1, 1)),
            Some(10.0)
        );
        assert_eq!(
            tai_minus_utc_seconds(gregorian_to_jd(2016, 12, 31)),
            Some(36.0)
        );
        assert_eq!(
            tai_minus_utc_seconds(gregorian_to_jd(2017, 1, 1)),
            Some(37.0)
        );
    }

    #[test]
    fn bulletin_sample_builds_consistent_scales() {
        let time = AstroTime::from_jd_utc(2_400_000.5 + 61_223.0);
        assert_eq!(time.eop.quality, Quality::Rapid);
        assert_eq!(time.tai_minus_utc_seconds, Some(37.0));
        assert!((time.delta_t_seconds - 69.169_127).abs() < 2.0e-5);
        let tt_minus_tai = (time.jd_tt - time.jd_tai.unwrap()) * SECONDS_PER_DAY;
        assert!((tt_minus_tai - 32.184).abs() < 2.0e-5);
    }
}
