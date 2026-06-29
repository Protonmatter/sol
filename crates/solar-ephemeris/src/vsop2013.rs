//! VSOP2013 analytic planetary theory (truncated to ephem.js's 06-normal tier).
//!
//! Evaluates the equinoctial-element Poisson series and converts to heliocentric
//! ecliptic (dynamical equinox & ecliptic J2000) rectangular coordinates in AU.
//! Coefficient data lives in the generated `vsop2013_data` module.

pub struct Term {
    pub s: f64,
    pub c: f64,
    pub phi: &'static [(u8, i16)],
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

fn eval(series: Series, jm2k: f64, f: &[f64; 17]) -> f64 {
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

/// Heliocentric ecliptic-J2000 rectangular coordinates (AU) at Julian years from J2000.
pub fn helio_xyz(p: &Planet, jy2k: f64) -> [f64; 3] {
    let jm2k = jy2k / 1000.0;
    let mut f = [0.0f64; 17];
    for i in 0..17 {
        f[i] = FREQ[i].0 + FREQ[i].1 * jm2k;
    }
    let a = eval(p.a, jm2k, &f);
    let l = eval(p.l, jm2k, &f);
    let k = eval(p.k, jm2k, &f);
    let h = eval(p.h, jm2k, &f);
    let q = eval(p.q, jm2k, &f);
    let pp = eval(p.p, jm2k, &f);
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
    let a = eval(p.a, jm2k, &f);
    let k = eval(p.k, jm2k, &f);
    let h = eval(p.h, jm2k, &f);
    let q = eval(p.q, jm2k, &f);
    let pp = eval(p.p, jm2k, &f);
    let e = (k * k + h * h).sqrt();
    let varpi = h.atan2(k);
    let inc = 2.0 * (q * q + pp * pp).sqrt().min(1.0).asin();
    let node = pp.atan2(q);
    (a, e, inc, node, varpi - node)
}

/// Equinoctial elements (a, mean longitude L, k=e·cosϖ, h=e·sinϖ,
/// q=sin(i/2)·cosΩ, p=sin(i/2)·sinΩ) → heliocentric ecliptic Cartesian (AU).
fn equinoctial_to_xyz(a: f64, l: f64, k: f64, h: f64, q: f64, p: f64) -> [f64; 3] {
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
