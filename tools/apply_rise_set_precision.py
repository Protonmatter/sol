#!/usr/bin/env python3
"""One-time, marker-bounded rise/set precision migration for PR #7.

The script is intentionally idempotent and touches only the event solver block
and its unit tests in solar-ephemeris/src/lib.rs. Remove it after application.
"""

from __future__ import annotations

from pathlib import Path

PATH = Path("crates/solar-ephemeris/src/lib.rs")
START = "/// Rise / transit / set as JD(UTC) within ±0.5 day of `jd_utc`. NaN where none."
END = "pub fn sky_snapshot_json"
NEW_MARKER = "const STANDARD_REFRACTION_DEG: f64 = 34.0 / 60.0;"

EVENT_BLOCK = r'''const STANDARD_REFRACTION_DEG: f64 = 34.0 / 60.0;

/// Standard geometric centre altitude used for a rise/set crossing. Topocentric
/// parallax is already applied by `topocentric_sky`, so the Sun and Moon need
/// only atmospheric refraction plus their instantaneous apparent semidiameter.
fn standard_altitude_deg(body: Body, distance_km: f64) -> f64 {
    match body {
        Body::Sun | Body::Moon => {
            let semidiameter = (body.radius_km() / distance_km)
                .clamp(-1.0, 1.0)
                .asin()
                .to_degrees();
            -(STANDARD_REFRACTION_DEG + semidiameter)
        }
        _ => -STANDARD_REFRACTION_DEG,
    }
}

/// Start of the observer's local mean-solar day, expressed as JD(UTC).
/// Civil timezone/DST is deliberately not inferred from longitude.
fn local_solar_day_start(jd_utc: f64, lon_east: f64) -> f64 {
    let offset_days = lon_east / 360.0;
    ((jd_utc - 0.5 + offset_days).floor() + 0.5) - offset_days
}

/// Rise / transit / set as JD(UTC) during the observer's local mean-solar day.
/// NaN is returned when an event does not occur in that interval.
fn events(
    body: Body,
    jd_utc: f64,
    lat: f64,
    lon_east: f64,
    elev: f64,
) -> (f64, f64, f64, f64) {
    events_core(
        &|jd| {
            let sky = topocentric_sky(body, jd, lat, lon_east, elev);
            (
                sky.alt - standard_altitude_deg(body, sky.dist_km),
                sky.alt,
            )
        },
        local_solar_day_start(jd_utc, lon_east),
    )
}

fn star_events(
    star: &stars::Star,
    jd_utc: f64,
    lat: f64,
    lon_east: f64,
    elev: f64,
) -> (f64, f64, f64, f64) {
    events_core(
        &|jd| {
            let sky = star_topocentric(star, jd, lat, lon_east, elev);
            (sky.alt + STANDARD_REFRACTION_DEG, sky.alt)
        },
        local_solar_day_start(jd_utc, lon_east),
    )
}

/// `sample_at` returns `(crossing_margin_deg, true_centre_altitude_deg)`.
fn events_core(
    sample_at: &dyn Fn(f64) -> (f64, f64),
    day_start_jd_utc: f64,
) -> (f64, f64, f64, f64) {
    let steps = 144; // 10-minute sampling over one local mean-solar day
    let mut prev_jd = day_start_jd_utc;
    let (mut prev_margin, initial_alt) = sample_at(prev_jd);
    let mut rise = f64::NAN;
    let mut set = f64::NAN;
    let mut transit = prev_jd;
    let mut transit_alt = initial_alt;
    for i in 1..=steps {
        let jd = day_start_jd_utc + (i as f64) / (steps as f64);
        let (margin, alt) = sample_at(jd);
        if alt > transit_alt {
            transit_alt = alt;
            transit = jd;
        }
        if prev_margin < 0.0 && margin >= 0.0 && rise.is_nan() {
            rise = bisect_cross(&|time| sample_at(time).0, prev_jd, jd);
        }
        if prev_margin >= 0.0 && margin < 0.0 && set.is_nan() {
            set = bisect_cross(&|time| sample_at(time).0, prev_jd, jd);
        }
        prev_jd = jd;
        prev_margin = margin;
    }

    // Refine culmination with a three-point parabolic fit around the best sample.
    let h = 1.0 / (steps as f64);
    let a_m = sample_at(transit - h).1;
    let a_p = sample_at(transit + h).1;
    let denom = a_m - 2.0 * transit_alt + a_p;
    if denom < 0.0 {
        let dx = 0.5 * (a_m - a_p) / denom;
        transit += dx * h;
        transit_alt -= 0.125 * (a_p - a_m) * (a_p - a_m) / denom;
    }
    (rise, transit, set, transit_alt)
}

fn bisect_cross(f: &dyn Fn(f64) -> f64, mut a: f64, mut b: f64) -> f64 {
    let mut fa = f(a);
    for _ in 0..24 {
        let m = 0.5 * (a + b);
        let fm = f(m);
        if (fa < 0.0) == (fm < 0.0) {
            a = m;
            fa = fm;
        } else {
            b = m;
        }
    }
    0.5 * (a + b)
}

'''

TEST_MARKER = '''    #[test]
    fn lunar_topocentric_coordinates_are_not_geocentric_aliases() {
        let astro = AstroTime::from_jd_utc(2_400_000.5 + 61_223.0);
        let moon = topocentric_sky_at_time(Body::Moon, &astro, 42.36, -71.06, 0.0);
        let separation = (moon.topocentric_ra - moon.geocentric_ra).abs()
            + (moon.topocentric_dec - moon.geocentric_dec).abs();
        assert!(separation > 1.0e-5);
    }
'''

TESTS = r'''

    #[test]
    fn standard_altitudes_use_upper_limb_for_sun_and_moon() {
        let sun = standard_altitude_deg(Body::Sun, AU_KM);
        assert!((-0.85..-0.80).contains(&sun));
        let moon = standard_altitude_deg(Body::Moon, 384_400.0);
        assert!((-0.86..-0.80).contains(&moon));
        assert!((standard_altitude_deg(Body::Venus, AU_KM) + 34.0 / 60.0).abs() < 1.0e-12);
    }

    #[test]
    fn local_solar_day_is_one_day_and_longitude_shifted() {
        let start = local_solar_day_start(2_460_310.75, 90.0);
        let next = local_solar_day_start(2_460_311.75, 90.0);
        assert!((next - start - 1.0).abs() < 1.0e-12);
        assert!((start - 2_460_310.25).abs() < 1.0e-12);
    }

    #[test]
    fn event_solver_uses_crossing_margin_but_reports_true_transit_altitude() {
        let day_start = 2_460_000.5;
        let sample = |jd: f64| {
            let phase = 2.0 * std::f64::consts::PI * (jd - day_start);
            let altitude = 30.0 * phase.sin();
            (altitude + STANDARD_REFRACTION_DEG, altitude)
        };
        let (rise, transit, set, transit_alt) = events_core(&sample, day_start);
        assert!(rise.is_finite() && set.is_finite() && transit.is_finite());
        assert!(transit_alt > 29.9);
        assert!((transit - (day_start + 0.25)).abs() < 1.0e-4);
    }
'''


def main() -> int:
    text = PATH.read_text(encoding="utf-8")
    if NEW_MARKER in text:
        print("rise/set precision migration already applied")
        return 0
    if START not in text or END not in text:
        raise SystemExit("event-solver markers not found")
    start = text.index(START)
    end = text.index(END, start)
    text = text[:start] + EVENT_BLOCK + text[end:]
    if TEST_MARKER not in text:
        raise SystemExit("test insertion marker not found")
    text = text.replace(TEST_MARKER, TEST_MARKER + TESTS, 1)
    PATH.write_text(text, encoding="utf-8")
    print(f"updated {PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
