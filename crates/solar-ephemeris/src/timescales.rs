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
        let boundary = 2_400_000.5 + earth_orientation::PREDICTION_END_MJD;
        if jd_utc > boundary {
            return Self::future_nominal_utc(jd_utc, boundary);
        }
        Self::from_jd_utc_with_eop(jd_utc, earth_orientation::for_jd_utc(jd_utc))
    }

    /// Beyond bundled EOP, hold the last tabulated leap offset as a nominal
    /// calendar convention, not a prediction of UTC or future leap seconds.
    /// Anchor the existing approximate delta-T curve to the last EOP value.
    fn future_nominal_utc(jd_utc: f64, boundary: f64) -> Self {
        assert!(jd_utc.is_finite());
        let anchor = Self::from_jd_utc_with_eop(boundary, earth_orientation::for_jd_utc(boundary));
        let offset = anchor.tai_minus_utc_seconds.unwrap();
        let delta_t = anchor.delta_t_seconds + delta_t_seconds(year_from_jd(jd_utc))
            - delta_t_seconds(year_from_jd(boundary));
        let dut1 = offset + TT_MINUS_TAI_SECONDS - delta_t;
        let jd_tai = jd_utc + offset / SECONDS_PER_DAY;
        Self {
            jd_utc,
            jd_tai: Some(jd_tai),
            jd_tt: jd_tai + TT_MINUS_TAI_SECONDS / SECONDS_PER_DAY,
            jd_ut1: jd_utc + dut1 / SECONDS_PER_DAY,
            tai_minus_utc_seconds: Some(offset),
            delta_t_seconds: delta_t,
            eop: EarthOrientation {
                dut1_seconds: dut1,
                xp_arcsec: 0.0,
                yp_arcsec: 0.0,
                dut1_uncertainty_seconds: None,
                source: "Endpoint-anchored delta-T model; nominal UTC holds last tabulated leap offset; polar motion omitted",
                quality: Quality::ModeledFuture,
            },
        }
    }

    pub fn input_time_semantics(&self) -> &'static str {
        match self.eop.quality {
            Quality::ModeledFuture => "future_nominal_utc",
            Quality::PreUtcUt1Proxy => "historical_ut1_proxy",
            _ => "utc",
        }
    }

    pub fn time_scales_description(&self) -> &'static str {
        match self.eop.quality {
            Quality::ModeledFuture => "Nominal UTC holds the last tabulated TAI-UTC offset as an assumption, not a leap-second prediction; TT = nominal TAI + 32.184 s; UT1 from endpoint-anchored delta-T model; model uncertainty unknown",
            Quality::PreUtcUt1Proxy => "Historical input is a UT1 proxy; TAI unavailable; TT = UT1 + modeled delta-T",
            _ => "UTC to TAI from leap-second table, TT = TAI + 32.184 s, UT1 = UTC + DUT1",
        }
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
                // Retain second-scale precision instead of subtracting two
                // large JDs, whose binary64 rounding loses tens of microseconds.
                delta_t_seconds: tai_minus_utc + TT_MINUS_TAI_SECONDS - eop.dut1_seconds,
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
/// 37-second value effective since 2017-01-01. The last value is retained as a
/// nominal convention beyond the table, not a prediction of future leap seconds.
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
    fn future_nominal_clock_grows_and_preserves_boundary_scales() {
        let boundary = 2_400_000.5 + earth_orientation::PREDICTION_END_MJD;
        let at = AstroTime::from_jd_utc(boundary);
        let after = AstroTime::from_jd_utc(boundary + 1e-7);
        assert_eq!(at.eop.quality, Quality::Predicted);
        assert!((after.delta_t_seconds - at.delta_t_seconds).abs() < 1e-6);
        assert!((after.eop.dut1_seconds - at.eop.dut1_seconds).abs() < 1e-6);
        assert_eq!(after.eop.quality.name(), "modeled_future");
        assert!(!after.eop.quality.precision_ready());
        assert_eq!(after.eop.dut1_uncertainty_seconds, None);
        assert_eq!(after.input_time_semantics(), "future_nominal_utc");
        let before = AstroTime::from_jd_utc(boundary - 1e-7);
        assert!((before.delta_t_seconds - at.delta_t_seconds).abs() < 1e-6);
        let historical = AstroTime::from_jd_utc(gregorian_to_jd(1900, 1, 1));
        assert_eq!(historical.jd_tai, None);
        assert_eq!(historical.input_time_semantics(), "historical_ut1_proxy");
        assert_eq!(historical.eop.quality, Quality::PreUtcUt1Proxy);
        let mut previous = at.delta_t_seconds;
        for year in [2050, 2100, 2200] {
            let jd = gregorian_to_jd(year, 1, 1);
            let future = AstroTime::from_jd_utc(jd);
            assert!(future.delta_t_seconds > previous);
            previous = future.delta_t_seconds;
            assert_eq!(future.tai_minus_utc_seconds, Some(37.0));
            assert!(
                (future.jd_tt - (jd + 37.0 / SECONDS_PER_DAY + 32.184 / SECONDS_PER_DAY)).abs()
                    < 1e-10
            );
            assert!((future.delta_t_seconds - (69.184 - future.eop.dut1_seconds)).abs() < 1e-9);
            assert!((future.jd_ut1 - jd - future.eop.dut1_seconds / SECONDS_PER_DAY).abs() < 1e-9);
        }
        assert!(previous > 400.0);
    }

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
        // Retained observed DUT1 at MJD 61223 is 0.0148642 seconds.
        assert!((time.delta_t_seconds - 69.169_135_8).abs() < 2.0e-5);
        let tt_minus_tai = (time.jd_tt - time.jd_tai.unwrap()) * SECONDS_PER_DAY;
        assert!((tt_minus_tai - 32.184).abs() < 2.0e-5);
    }

    #[test]
    fn delta_t_seconds_preserves_sub_julian_day_precision() {
        for mjd in [41_684.0, 51_544.0, 57_754.5, 61_223.0, 61_342.75] {
            let jd = 2_400_000.5 + mjd;
            let time = AstroTime::from_jd_utc(jd);
            let expected = tai_minus_utc_seconds(jd).unwrap() + 32.184 - time.eop.dut1_seconds;
            assert!(
                (time.delta_t_seconds - expected).abs() < 1e-12,
                "MJD {mjd}, delta-T {:.12}, offset-derived {:.12}",
                time.delta_t_seconds,
                expected
            );
        }
    }
}
