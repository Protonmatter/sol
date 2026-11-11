//! VSOP2013 analytic planetary theory (ephem.js's pinned 08-big coefficient tier).
//!
//! Evaluates the equinoctial-element Poisson series and converts to heliocentric
//! ecliptic (dynamical equinox & ecliptic J2000) rectangular coordinates in AU.
//! Coefficient data lives in the generated `vsop2013_data` module.

pub type Phase = &'static [(u8, i16)];

pub struct Term {
    pub s: f64,
    pub c: f64,
    pub phi: Phase,
    pub phase: usize,
}

pub type Series = &'static [&'static [Term]];

pub struct Planet {
    pub gm: f64,
    pub a: Series,
    pub l: Series,
    pub k: Series,
    pub h: Series,
    pub q: Series,
    pub p: Series,
    pub phases: &'static [Phase], // distinct ordered phase tuples, in first-use order
}

// VSOP2013 fundamental arguments: value at J2000 (rad) + rate (rad per 1000 yr).
const FREQ: [(f64, f64); 17] = [
    (4.402608631669, 26087.9031406856),
    (3.176134461576, 10213.2855474345),
    (1.753470369433, 6283.07585035322),
    (6.203500014141, 3340.61243414546),
    (4.09136000305, 1731.17045272186),
    (1.713740719173, 1704.4508550272),
    (5.598641292287, 1428.94891784427),
    (2.805136360408, 1364.75651362999),
    (2.32698973462, 1361.92320763284),
    (0.599546107035, 529.690961562325),
    (0.874018510107, 213.299086108488),
    (5.481225395663, 74.781659030778),
    (5.311897933164, 38.132972226125),
    (0.0, 0.359536228504931),
    (5.19846640063, 77713.7714481804),
    (1.62790513602, 84334.6615717837),
    (2.35555563875, 83286.9142477147),
];

// Retain the exact ordered phase sum and separate sin/cos evaluations. Results
// are shared only within this call's epoch, never interpolated or carried over.
fn phase_table(p: &Planet, f: &[f64; 17]) -> Vec<(f64, f64)> {
    p.phases
        .iter()
        .map(|phase| {
            let mut phi = 0.0;
            for &(idx, mult) in phase.iter() {
                phi += f[(idx - 1) as usize] * (mult as f64);
            }
            (phi.sin(), phi.cos())
        })
        .collect()
}

fn eval(series: Series, jm2k: f64, phases: &[(f64, f64)]) -> f64 {
    let mut rv = 0.0;
    let mut tpow = 1.0;
    for power in series.iter() {
        let mut sum = 0.0;
        for term in power.iter() {
            let (sin, cos) = phases[term.phase];
            sum += term.s * sin + term.c * cos;
        }
        rv += sum * tpow;
        tpow *= jm2k;
    }
    rv
}

/// Heliocentric ecliptic-J2000 rectangular coordinates (AU) at Julian years from J2000.
pub fn helio_xyz(p: &Planet, jy2k: f64) -> [f64; 3] {
    let jm2k = jy2k / 1000.0;
    let mut f = [0.0f64; 17];
    for i in 0..17 {
        f[i] = FREQ[i].0 + FREQ[i].1 * jm2k;
    }
    let phases = phase_table(p, &f);
    let a = eval(p.a, jm2k, &phases);
    let l = eval(p.l, jm2k, &phases);
    let k = eval(p.k, jm2k, &phases);
    let h = eval(p.h, jm2k, &phases);
    let q = eval(p.q, jm2k, &phases);
    let pp = eval(p.p, jm2k, &phases);
    equinoctial_to_xyz(a, l, k, h, q, pp)
}

/// Heliocentric orbital elements at `jy2k`: (a AU, eccentricity, inclination rad,
/// ascending node Ω rad, argument of perihelion ω rad) — for drawing the orbit ellipse.
pub fn elements(p: &Planet, jy2k: f64) -> (f64, f64, f64, f64, f64) {
    let jm2k = jy2k / 1000.0;
    let mut f = [0.0f64; 17];
    for i in 0..17 {
        f[i] = FREQ[i].0 + FREQ[i].1 * jm2k;
    }
    let phases = phase_table(p, &f);
    let a = eval(p.a, jm2k, &phases);
    let k = eval(p.k, jm2k, &phases);
    let h = eval(p.h, jm2k, &phases);
    let q = eval(p.q, jm2k, &phases);
    let pp = eval(p.p, jm2k, &phases);
    let e = (k * k + h * h).sqrt();
    let varpi = h.atan2(k);
    let inc = 2.0 * (q * q + pp * pp).sqrt().min(1.0).asin();
    let node = pp.atan2(q);
    (a, e, inc, node, varpi - node)
}

/// Equinoctial elements (a, mean longitude L, k=e·cosϖ, h=e·sinϖ,
/// q=sin(i/2)·cosΩ, p=sin(i/2)·sinΩ) → heliocentric ecliptic Cartesian (AU).
/// Shared with the TOP2013 evaluator (`top2013.rs`), which uses the same element set.
pub fn equinoctial_to_xyz(a: f64, l: f64, k: f64, h: f64, q: f64, p: f64) -> [f64; 3] {
    let e = (k * k + h * h).sqrt();
    let varpi = h.atan2(k);
    let sin_half_i = (q * q + p * p).sqrt().min(1.0);
    let inc = 2.0 * sin_half_i.asin();
    let node = p.atan2(q);
    let omega = varpi - node;
    let m = l - varpi;
    let mut ecc = m;
    for _ in 0..20 {
        let delta = (ecc - e * ecc.sin() - m) / (1.0 - e * ecc.cos());
        ecc -= delta;
        if delta.abs() < 1e-13 {
            break;
        }
    }
    let xp = a * (ecc.cos() - e);
    let yp = a * (1.0 - e * e).sqrt() * ecc.sin();
    let (co, so) = (omega.cos(), omega.sin());
    let (cn, sn) = (node.cos(), node.sin());
    let (ci, si) = (inc.cos(), inc.sin());
    [
        (co * cn - so * sn * ci) * xp + (-so * cn - co * sn * ci) * yp,
        (co * sn + so * cn * ci) * xp + (-so * sn + co * cn * ci) * yp,
        (so * si) * xp + (co * si) * yp,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    // Original scalar series evaluator: ordered phase construction and term
    // accumulation remain an oracle independent of any phase-result table.
    fn scalar_eval(series: Series, jm2k: f64, f: &[f64; 17]) -> f64 {
        let mut rv = 0.0;
        let mut tpow = 1.0;
        for power in series.iter() {
            let mut sum = 0.0;
            for term in power.iter() {
                let mut phi = 0.0;
                for &(idx, mult) in term.phi.iter() {
                    phi += f[(idx - 1) as usize] * (mult as f64);
                }
                sum += term.s * phi.sin() + term.c * phi.cos();
            }
            rv += sum * tpow;
            tpow *= jm2k;
        }
        rv
    }

    #[test]
    fn compact_phase_indices_preserve_ordered_argument_tuples() {
        let planets = [
            crate::vsop2013_data::mer(),
            crate::vsop2013_data::ven(),
            crate::vsop2013_data::emb(),
            crate::vsop2013_data::mar(),
            crate::vsop2013_data::jup(),
            crate::vsop2013_data::sat(),
            crate::vsop2013_data::ura(),
            crate::vsop2013_data::nep(),
        ];
        for p in planets {
            let terms: Vec<_> = [p.a, p.l, p.k, p.h, p.q, p.p]
                .iter()
                .flat_map(|series| series.iter())
                .flat_map(|power| power.iter())
                .collect();
            let unique: std::collections::BTreeSet<_> = terms.iter().map(|term| term.phi).collect();
            assert_eq!(p.phases.len(), unique.len());
            assert!(
                p.phases.len() * 2 < terms.len(),
                "distinct-index storage must remove repeated phase sums"
            );
            for term in terms {
                assert_eq!(p.phases[term.phase], term.phi);
            }
        }
    }

    #[test]
    fn phase_reuse_preserves_scalar_position_and_element_bits() {
        let mut epochs: Vec<f64> = include_str!("../data/horizons-vectors-20261104.csv")
            .lines()
            .filter(|line| line.starts_with("mercury,"))
            .map(|line| {
                let jd: f64 = line.split(',').nth(4).unwrap().parse().unwrap();
                (jd - crate::time::J2000) / 365.25
            })
            .collect();
        assert_eq!(epochs.len(), 16);
        for years in [-5000.0, 0.0, 5000.0] {
            for days in [0.0, 1.0, 49.0, 99.0] {
                let unix = 1_767_225_600.0 + years * 365.25 * 86400.0 + days * 86400.0;
                let jd = crate::time::jd_from_unix(unix);
                epochs.push(
                    (crate::timescales::AstroTime::from_jd_utc(jd).jd_tt - crate::time::J2000)
                        / 365.25,
                );
            }
        }
        epochs.extend([0.0, -0.0]);
        let planets = [
            crate::vsop2013_data::mer(),
            crate::vsop2013_data::ven(),
            crate::vsop2013_data::emb(),
            crate::vsop2013_data::mar(),
            crate::vsop2013_data::jup(),
            crate::vsop2013_data::sat(),
            crate::vsop2013_data::ura(),
            crate::vsop2013_data::nep(),
        ];
        for jy2k in epochs {
            let jm2k = jy2k / 1000.0;
            let f: [f64; 17] = core::array::from_fn(|i| FREQ[i].0 + FREQ[i].1 * jm2k);
            for (idx, p) in planets.iter().enumerate() {
                let [a, l, k, h, q, pp] =
                    [p.a, p.l, p.k, p.h, p.q, p.p].map(|series| scalar_eval(series, jm2k, &f));
                let xyz = equinoctial_to_xyz(a, l, k, h, q, pp);
                assert_eq!(
                    helio_xyz(p, jy2k).map(f64::to_bits),
                    xyz.map(f64::to_bits),
                    "planet {idx} at {jy2k}"
                );
                let e = (k * k + h * h).sqrt();
                let varpi = h.atan2(k);
                let inc = 2.0 * (q * q + pp * pp).sqrt().min(1.0).asin();
                let node = pp.atan2(q);
                let expected = [a, e, inc, node, varpi - node];
                let actual = elements(p, jy2k);
                assert_eq!(
                    [actual.0, actual.1, actual.2, actual.3, actual.4].map(f64::to_bits),
                    expected.map(f64::to_bits),
                    "elements {idx} at {jy2k}"
                );
            }
        }
    }
}
