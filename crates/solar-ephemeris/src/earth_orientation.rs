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
    /// Supplied DUT1 formal error, propagated with absolute interpolation
    /// weights. This excludes interpolation error and unmodeled subdaily terms.
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

pub const EOP_SOURCE: &str = "IERS Bulletin A finals2000A.all, USNO capture 2026-11-04";
pub const RAPID_START_MJD: f64 = 41_684.0;
pub const RAPID_END_MJD: f64 = 61_342.0;
pub const PREDICTION_END_MJD: f64 = 61_714.0;

const ROW_COUNT: usize = 20_031;
const HEADER_BYTES: usize = 16;
const ROW_BYTES: usize = 33;
const TABLE: &[u8] = include_bytes!("../data/earth-orientation.bin");

#[derive(Clone, Copy)]
struct DailyRow {
    xp: f64,
    yp: f64,
    dut1: f64,
    error: f64,
    prediction_flags: u8,
}

impl DailyRow {
    fn valid(self) -> bool {
        [self.xp, self.yp, self.dut1, self.error]
            .iter()
            .all(|value| value.is_finite())
            && self.xp.abs() <= 2.0
            && self.yp.abs() <= 2.0
            && self.dut1.abs() <= 0.9
            && (0.0..=0.9).contains(&self.error)
            && self.prediction_flags <= 3
    }

    fn exact(self) -> EarthOrientation {
        EarthOrientation {
            dut1_seconds: self.dut1,
            xp_arcsec: self.xp,
            yp_arcsec: self.yp,
            dut1_uncertainty_seconds: self.error,
            source: EOP_SOURCE,
            quality: if self.prediction_flags == 0 {
                Quality::Rapid
            } else {
                Quality::Predicted
            },
        }
    }
}

// The offline generator verifies the entire source and every output byte. At
// runtime additionally bound the header and every referenced row, without an
// allocation, global mutable cache, or parser exposed to untrusted providers.
fn table_row(data: &[u8], index: usize) -> Option<DailyRow> {
    if data.len() != HEADER_BYTES + ROW_COUNT * ROW_BYTES
        || data.get(..8)? != b"SOLEOP01"
        || u32::from_le_bytes(data.get(8..12)?.try_into().ok()?) as usize != ROW_COUNT
        || i32::from_le_bytes(data.get(12..16)?.try_into().ok()?) != RAPID_START_MJD as i32
        || ROW_COUNT as f64 != PREDICTION_END_MJD - RAPID_START_MJD + 1.0
        || index >= ROW_COUNT
    {
        return None;
    }
    let start = HEADER_BYTES + index * ROW_BYTES;
    let read = |offset: usize| -> Option<f64> {
        Some(f64::from_le_bytes(
            data.get(start + offset..start + offset + 8)?
                .try_into()
                .ok()?,
        ))
    };
    let row = DailyRow {
        xp: read(0)?,
        yp: read(8)?,
        dut1: read(16)?,
        error: read(24)?,
        prediction_flags: *data.get(start + 32)?,
    };
    row.valid().then_some(row)
}

fn interpolate_eop(mjd: f64, first_mjd: f64, rows: [DailyRow; 4]) -> Option<EarthOrientation> {
    let x = mjd - first_mjd;
    if !x.is_finite() || !(0.0..=3.0).contains(&x) || !rows.iter().all(|row| row.valid()) {
        return None;
    }
    let reference_tai = crate::timescales::tai_minus_utc_seconds(2_400_000.5 + first_mjd)?;
    let epoch_tai = crate::timescales::tai_minus_utc_seconds(2_400_000.5 + mjd)?;
    let (mut xp, mut yp, mut dut1, mut error) = (0.0, 0.0, 0.0, 0.0);
    let mut predicted = false;
    for (i, row) in rows.iter().enumerate() {
        let mut weight = 1.0;
        for j in 0..4 {
            if i != j {
                weight *= (x - j as f64) / (i as f64 - j as f64);
            }
        }
        let tai = crate::timescales::tai_minus_utc_seconds(2_400_000.5 + first_mjd + i as f64)?;
        xp += weight * row.xp;
        yp += weight * row.yp;
        // UT1-TAI is continuous across a UTC leap. Use a nearby TAI offset as
        // the datum to avoid subtracting/restoring an unnecessarily large value.
        dut1 += weight * (row.dut1 - (tai - reference_tai));
        // Conservative propagation of the supplied formal errors without a
        // correlation assumption; excludes interpolation and unmodeled tides.
        error += weight.abs() * row.error;
        predicted |= weight != 0.0 && row.prediction_flags != 0;
    }
    dut1 += epoch_tai - reference_tai;
    if ![xp, yp, dut1, error].iter().all(|value| value.is_finite())
        || xp.abs() > 2.0
        || yp.abs() > 2.0
        || dut1.abs() > 0.9
        || error < 0.0
    {
        return None;
    }
    Some(EarthOrientation {
        dut1_seconds: dut1,
        xp_arcsec: xp,
        yp_arcsec: yp,
        dut1_uncertainty_seconds: error,
        source: EOP_SOURCE,
        quality: if predicted {
            Quality::Predicted
        } else {
            Quality::Rapid
        },
    })
}

fn lookup(data: &[u8], jd_utc: f64) -> Option<EarthOrientation> {
    let mjd = jd_utc - 2_400_000.5;
    if !mjd.is_finite() || !(RAPID_START_MJD..=PREDICTION_END_MJD).contains(&mjd) {
        return None;
    }
    let index = (mjd - RAPID_START_MJD).floor() as usize;
    let row = table_row(data, index)?;
    if mjd == RAPID_START_MJD + index as f64 {
        return Some(row.exact());
    }
    // Preserve the observed segment: a point between observed knots need not
    // consume a prediction merely to obtain a centered interpolation window.
    let last = if mjd <= RAPID_END_MJD {
        (RAPID_END_MJD - RAPID_START_MJD) as usize
    } else {
        ROW_COUNT - 1
    };
    let first = index.saturating_sub(1).min(last.checked_sub(3)?);
    interpolate_eop(
        mjd,
        RAPID_START_MJD + first as f64,
        [
            table_row(data, first)?,
            table_row(data, first + 1)?,
            table_row(data, first + 2)?,
            table_row(data, first + 3)?,
        ],
    )
}

pub fn for_jd_utc(jd_utc: f64) -> EarthOrientation {
    lookup(TABLE, jd_utc).unwrap_or_else(|| {
        EarthOrientation::degraded("no valid bundled IERS EOP sample covers this UTC epoch")
    })
}

pub fn coverage_days_remaining(jd_utc: f64) -> f64 {
    PREDICTION_END_MJD - (jd_utc - 2_400_000.5)
}

/// Rotate the observer's geodetic normal into the instantaneous rotation frame.
/// R_x(-yp) R_y(-xp) preserves the existing first-order IERS sign convention,
/// without the tan(latitude) singularity. Inputs xp/yp are arcseconds.
/// At an exact terrestrial pole the normal is independent of input longitude;
/// its rotated horizontal projection defines longitude. With zero motion at a
/// pole the caller's longitude is retained as the local meridian convention.
pub fn corrected_observer_geodetic(
    lat_deg: f64,
    lon_east_deg: f64,
    xp_arcsec: f64,
    yp_arcsec: f64,
) -> (f64, f64) {
    const ARCSEC_TO_RAD: f64 = PI / (180.0 * 3600.0);
    if xp_arcsec == 0.0 && yp_arcsec == 0.0 {
        return (lat_deg, crate::coords::wrap_degrees(lon_east_deg));
    }
    let lat = lat_deg.to_radians();
    let lon = lon_east_deg.to_radians();
    let xp = xp_arcsec * ARCSEC_TO_RAD;
    let yp = yp_arcsec * ARCSEC_TO_RAD;
    let horizontal = if lat_deg.abs() == 90.0 {
        0.0
    } else {
        lat.cos()
    };
    let (x, y, z) = (horizontal * lon.cos(), horizontal * lon.sin(), lat.sin());
    let x1 = xp.cos() * x - xp.sin() * z;
    let z1 = xp.sin() * x + xp.cos() * z;
    let y2 = yp.cos() * y + yp.sin() * z1;
    let z2 = -yp.sin() * y + yp.cos() * z1;
    (
        z2.atan2(x1.hypot(y2)).to_degrees(),
        crate::coords::wrap_degrees(y2.atan2(x1).to_degrees()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn historical_daily_observation_is_available_at_its_exact_knot() {
        let eop = for_jd_utc(2_400_000.5 + 51_544.0);
        assert_eq!(eop.quality, Quality::Rapid);
        assert_eq!(eop.dut1_seconds, 0.355_477_9);
        assert_eq!(eop.xp_arcsec, 0.043_301);
        assert_eq!(eop.yp_arcsec, 0.377_867);
        assert_eq!(eop.dut1_uncertainty_seconds, 0.000_009_9);
    }

    #[test]
    fn expanded_source_coverage_excludes_the_empty_date_only_tail() {
        assert_eq!(RAPID_START_MJD, 41_684.0);
        assert_eq!(RAPID_END_MJD, 61_342.0);
        assert_eq!(PREDICTION_END_MJD, 61_714.0);
    }

    #[test]
    fn leap_day_interpolation_does_not_smear_the_utc_discontinuity() {
        let before = for_jd_utc(2_400_000.5 + 57_753.5);
        let after = for_jd_utc(2_400_000.5 + 57_754.5);
        assert!(before.dut1_seconds < -0.4);
        assert!(after.dut1_seconds > 0.58);
        assert_eq!(before.quality, Quality::Rapid);
        assert_eq!(after.quality, Quality::Rapid);
    }

    #[test]
    fn exact_poles_remain_valid_under_nonzero_polar_motion() {
        for lat in [-90.0, 90.0] {
            for lon in [0.0, 71.0, 180.0, -90.0] {
                let (corrected, longitude) =
                    corrected_observer_geodetic(lat, lon, 0.20547, 0.38864);
                assert!((-90.0..=90.0).contains(&corrected), "{corrected}");
                assert!((0.0..360.0).contains(&longitude));
                let reference = corrected_observer_geodetic(lat, 0.0, 0.20547, 0.38864);
                assert!((corrected - reference.0).abs() < 1e-10);
                assert!((longitude - reference.1).abs() < 1e-8);
            }
        }
    }

    #[test]
    fn exact_rapid_sample_is_preserved() {
        let eop = for_jd_utc(2_400_000.5 + RAPID_END_MJD);
        assert_eq!(eop.quality, Quality::Rapid);
        // Exact selected Bulletin A columns at MJD 61342 in the retained source.
        assert_eq!(eop.dut1_seconds, -0.052_611_8);
        assert_eq!(eop.xp_arcsec, 0.142_839);
        assert_eq!(eop.yp_arcsec, 0.318_278);
        assert_eq!(eop.dut1_uncertainty_seconds, 0.000_013_7);
    }

    #[test]
    fn zero_polar_motion_is_identity() {
        let corrected = corrected_observer_geodetic(42.36, -71.06, 0.0, 0.0);
        assert!((corrected.0 - 42.36).abs() < 1.0e-12);
        assert!((corrected.1 - 288.94).abs() < 1.0e-12);
    }

    #[test]
    fn tiny_negative_longitudes_wrap_inside_the_open_interval() {
        for lon in [-1.0e-15, -f64::MIN_POSITIVE, -f64::from_bits(1), -0.0, 0.0] {
            for (xp, yp) in [(0.0, 0.0), (0.2, 0.0)] {
                let (lat, actual) = corrected_observer_geodetic(0.0, lon, xp, yp);
                assert!(lat.is_finite());
                assert!((0.0..360.0).contains(&actual), "{lon}: {actual}");
                assert_eq!(actual, 0.0);
            }
        }
        let below = f64::from_bits(360.0f64.to_bits() - 1);
        assert_eq!(corrected_observer_geodetic(0.0, below, 0.0, 0.0).1, below);
    }

    #[test]
    fn uncovered_epoch_is_explicitly_degraded() {
        let eop = for_jd_utc(2_440_000.5);
        assert_eq!(eop.quality, Quality::Degraded);
        assert_eq!(eop.dut1_seconds, 0.0);
        assert_eq!(eop.dut1_uncertainty_seconds, 0.9);
    }

    #[test]
    fn coverage_boundary_is_declared_and_testable() {
        let final_supported = 2_400_000.5 + PREDICTION_END_MJD;
        assert_eq!(for_jd_utc(final_supported).quality, Quality::Predicted);
        assert_eq!(for_jd_utc(final_supported + 1.0).quality, Quality::Degraded);
        assert_eq!(coverage_days_remaining(final_supported), 0.0);
    }

    #[test]
    fn every_daily_knot_returns_exact_retained_values_and_flags() {
        for index in 0..ROW_COUNT {
            let row = table_row(TABLE, index).unwrap();
            let eop = for_jd_utc(2_400_000.5 + RAPID_START_MJD + index as f64);
            assert_eq!(eop.xp_arcsec.to_bits(), row.xp.to_bits());
            assert_eq!(eop.yp_arcsec.to_bits(), row.yp.to_bits());
            assert_eq!(eop.dut1_seconds.to_bits(), row.dut1.to_bits());
            assert_eq!(eop.dut1_uncertainty_seconds.to_bits(), row.error.to_bits());
            assert_eq!(
                eop.quality,
                if row.prediction_flags == 0 {
                    Quality::Rapid
                } else {
                    Quality::Predicted
                }
            );
            assert_eq!(
                row.prediction_flags == 0,
                RAPID_START_MJD + index as f64 <= RAPID_END_MJD
            );
        }
    }

    #[test]
    fn endpoints_adjacent_floats_and_nonfinite_inputs_do_not_extrapolate() {
        let start = 2_400_000.5 + RAPID_START_MJD;
        let end = 2_400_000.5 + PREDICTION_END_MJD;
        let observed_end = 2_400_000.5 + RAPID_END_MJD;
        let below = |value: f64| f64::from_bits(value.to_bits() - 1);
        let above = |value: f64| f64::from_bits(value.to_bits() + 1);
        for value in [
            below(start),
            above(end),
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
        ] {
            let eop = for_jd_utc(value);
            assert_eq!(eop.quality, Quality::Degraded);
            assert_eq!(eop.dut1_seconds, 0.0);
            assert_eq!(eop.dut1_uncertainty_seconds, 0.9);
        }
        for value in [start, above(start), below(observed_end), observed_end] {
            assert_eq!(for_jd_utc(value).quality, Quality::Rapid);
        }
        for value in [above(observed_end), below(end), end] {
            assert_eq!(for_jd_utc(value).quality, Quality::Predicted);
        }
    }

    #[test]
    fn every_interval_has_finite_bounded_interpolation_and_correct_quality() {
        for index in 0..ROW_COUNT - 1 {
            let mjd = RAPID_START_MJD + index as f64 + 0.5;
            let eop = for_jd_utc(2_400_000.5 + mjd);
            assert!(eop.dut1_seconds.is_finite() && eop.dut1_seconds.abs() <= 0.9);
            assert!(eop.xp_arcsec.is_finite() && eop.yp_arcsec.is_finite());
            assert!(
                eop.dut1_uncertainty_seconds.is_finite() && eop.dut1_uncertainty_seconds >= 0.0
            );
            assert_eq!(
                eop.quality,
                if mjd <= RAPID_END_MJD {
                    Quality::Rapid
                } else {
                    Quality::Predicted
                }
            );
        }
    }

    #[test]
    fn all_source_leap_boundaries_preserve_continuous_ut1_minus_tai() {
        let mut leaps = 0;
        for index in 1..ROW_COUNT {
            let boundary = 2_400_000.5 + RAPID_START_MJD + index as f64;
            let before_jd = f64::from_bits(boundary.to_bits() - 1);
            let after_jd = f64::from_bits(boundary.to_bits() + 1);
            let before_tai = crate::timescales::tai_minus_utc_seconds(before_jd).unwrap();
            let tai = crate::timescales::tai_minus_utc_seconds(boundary).unwrap();
            if tai != before_tai {
                leaps += 1;
                let before = for_jd_utc(before_jd);
                let at = for_jd_utc(boundary);
                let after = for_jd_utc(after_jd);
                assert!((before.dut1_seconds - before_tai - (at.dut1_seconds - tai)).abs() < 1e-9);
                assert!((after.dut1_seconds - at.dut1_seconds).abs() < 1e-9);
                assert_eq!(before.quality, Quality::Rapid);
                assert_eq!(at.quality, Quality::Rapid);
                assert_eq!(after.quality, Quality::Rapid);
            }
        }
        assert_eq!(leaps, 25);
    }

    #[test]
    fn local_polynomial_reproduces_cubic_and_tracks_negative_weight_prediction() {
        let base = DailyRow {
            xp: 0.0,
            yp: 0.0,
            dut1: 0.0,
            error: 0.00001,
            prediction_flags: 0,
        };
        let mut rows = [base; 4];
        for (i, row) in rows.iter_mut().enumerate() {
            let t = i as f64;
            row.xp = 0.01 * t.powi(3);
            row.yp = 0.1 + 0.01 * t;
            row.dut1 = 0.005 * (t - 1.0).powi(3);
        }
        rows[3].prediction_flags = 1;
        let result = interpolate_eop(51_545.5, 51_544.0, rows).unwrap();
        assert!((result.xp_arcsec - 0.03375).abs() < 1e-14);
        assert!((result.yp_arcsec - 0.115).abs() < 1e-14);
        assert!((result.dut1_seconds - 0.000625).abs() < 1e-14);
        assert!((result.dut1_uncertainty_seconds - 0.0000125).abs() < 1e-15);
        assert_eq!(result.quality, Quality::Predicted);
        assert_eq!(
            interpolate_eop(51_545.0, 51_544.0, rows).unwrap().quality,
            Quality::Rapid
        );
        assert!(interpolate_eop(51_543.0, 51_544.0, rows).is_none());
    }

    #[test]
    fn synthetic_constant_ut1_tai_has_an_exact_unsmeared_utc_jump() {
        let before = DailyRow {
            xp: 0.0,
            yp: 0.0,
            dut1: -0.4,
            error: 0.00001,
            prediction_flags: 0,
        };
        let after = DailyRow {
            dut1: 0.6,
            ..before
        };
        let rows = [before, before, after, after];
        assert!(
            (interpolate_eop(57_753.5, 57_752.0, rows)
                .unwrap()
                .dut1_seconds
                + 0.4)
                .abs()
                < 1e-14
        );
        assert!(
            (interpolate_eop(57_754.5, 57_752.0, rows)
                .unwrap()
                .dut1_seconds
                - 0.6)
                .abs()
                < 1e-14
        );
    }

    #[test]
    fn malformed_header_or_referenced_row_cannot_partially_interpolate() {
        assert!(lookup(&[], 2_400_000.5 + RAPID_START_MJD).is_none());
        let mut changed = TABLE.to_vec();
        changed[0] ^= 1;
        assert!(lookup(&changed, 2_400_000.5 + RAPID_START_MJD).is_none());
        for (offset, bytes) in [
            (8, u32::MAX.to_le_bytes().to_vec()),
            (HEADER_BYTES, f64::NAN.to_le_bytes().to_vec()),
            (HEADER_BYTES + 24, (-0.1f64).to_le_bytes().to_vec()),
            (HEADER_BYTES + 32, vec![4]),
            (
                HEADER_BYTES + ROW_BYTES,
                f64::INFINITY.to_le_bytes().to_vec(),
            ),
        ] {
            let mut changed = TABLE.to_vec();
            changed[offset..offset + bytes.len()].copy_from_slice(&bytes);
            assert!(lookup(&changed, 2_400_000.5 + RAPID_START_MJD + 0.5).is_none());
        }
    }
}
