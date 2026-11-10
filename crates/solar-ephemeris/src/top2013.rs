//! TOP2013 analytic theory of the outer planets (Jupiter, Saturn, Uranus, Neptune).
//!
//! A faithful port of ephem.js's TOP2013 evaluator (08-big tier). TOP2013 is the IMCCE companion
//! to VSOP2013. Published full-theory accuracy over −4000…+8000 does not qualify this truncated
//! tier or establish a continuous bound. The System view uses TOP2013 for the four giants and
//! VSOP2013 for the rest. Sky apparent places currently use VSOP2013 for all planets;
//! source parity and independent astronomical accuracy remain separate checks.
//!
//! Each element l ∈ {a, L, k, h, q, p} is a Poisson series:
//!   l(t) = Σ_power t^power · Σ_term [Ccos·cos(mult·DMU·t) + Csin·sin(mult·DMU·t)]   (+ mm·t for L)
//! with t in Julian millennia from J2000 and DMU the Jupiter–Saturn great-inequality frequency. The
//! (L, power 1, mult 0) term is the mean motion and is supplied by `mm` instead. Coefficients live in
//! the generated `top2013_data` module; the result feeds `vsop2013::equinoctial_to_xyz`.

use crate::top2013_data::{self, TopPlanet};

/// Great-inequality fundamental frequency (rad / 1000 yr); every term's frequency is `mult · DMU`.
const DMU: f64 = 0.359536228504931;

/// Maps the engine's outer-planet index (0=Jupiter, 1=Saturn, 2=Uranus, 3=Neptune) to its series.
fn planet(idx: usize) -> &'static TopPlanet {
    match idx {
        0 => top2013_data::jup(),
        1 => top2013_data::sat(),
        2 => top2013_data::ura(),
        _ => top2013_data::nep(),
    }
}

fn eval_elem(p: &TopPlanet, el: usize, t: f64) -> f64 {
    let mut total = 0.0;
    let mut tpow = 1.0;
    for (power, terms) in p.elems[el].iter().enumerate() {
        let mut sum = 0.0;
        for &(mult, cc, cs) in terms.iter() {
            if el == 1 && power == 1 && mult == 0 {
                continue; // the mean motion — added via `mm` below
            }
            let arg = mult as f64 * DMU * t;
            sum += cc * arg.cos() + cs * arg.sin();
        }
        total += sum * tpow;
        tpow *= t;
    }
    if el == 1 {
        total += p.mm * t; // mean longitude's secular term
    }
    total
}

/// Heliocentric ecliptic-J2000 rectangular coordinates (AU) of an outer planet at Julian years from
/// J2000. `idx`: 0=Jupiter, 1=Saturn, 2=Uranus, 3=Neptune.
pub fn helio_xyz(idx: usize, jy2k: f64) -> [f64; 3] {
    let t = jy2k / 1000.0;
    let p = planet(idx);
    let a = eval_elem(p, 0, t);
    let l = eval_elem(p, 1, t);
    let k = eval_elem(p, 2, t);
    let h = eval_elem(p, 3, t);
    let q = eval_elem(p, 4, t);
    let pp = eval_elem(p, 5, t);
    crate::vsop2013::equinoctial_to_xyz(a, l, k, h, q, pp)
}

/// Osculating elements (a AU, e, inc rad, node Ω rad, argument of perihelion ω rad) — for the orbit
/// ellipse. Same convention as `vsop2013::elements`.
pub fn elements(idx: usize, jy2k: f64) -> (f64, f64, f64, f64, f64) {
    let t = jy2k / 1000.0;
    let p = planet(idx);
    let a = eval_elem(p, 0, t);
    let k = eval_elem(p, 2, t);
    let h = eval_elem(p, 3, t);
    let q = eval_elem(p, 4, t);
    let pp = eval_elem(p, 5, t);
    let e = (k * k + h * h).sqrt();
    let varpi = h.atan2(k);
    let inc = 2.0 * (q * q + pp * pp).sqrt().min(1.0).asin();
    let node = pp.atan2(q);
    (a, e, inc, node, varpi - node)
}

/// Outer-planet index for a body name, or `None` for the inner planets / Sun / Moon.
pub fn outer_index(name: &str) -> Option<usize> {
    match name {
        "Jupiter" => Some(0),
        "Saturn" => Some(1),
        "Uranus" => Some(2),
        "Neptune" => Some(3),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_top2013_source_deep_time() {
        // TOP2013 08-big source parity at the same ±5000 yr model arguments.
        // References use the pinned upstream numeric element solver and an
        // independent Cartesian reduction; its normal-tier control reproduces
        // the archived eight source vectors. This is not JPL accuracy evidence.
        let cases: [(usize, f64, [f64; 3]); 8] = [
            (0, 5000.0, [-4.32842172, -3.36821410, 0.11803611]),
            (0, -5000.0, [-4.78977502, -2.48306535, 0.12736790]),
            (1, 5000.0, [7.09907027, -6.89865121, -0.24955423]),
            (1, -5000.0, [-8.36072079, 4.38752123, 0.16447946]),
            (2, 5000.0, [-12.78733622, 13.37617692, 0.18528392]),
            (2, -5000.0, [-11.04880315, 14.82653222, 0.22977684]),
            (3, 5000.0, [10.62259522, 27.82984520, -0.82112857]),
            (3, -5000.0, [-30.22626634, -0.64396146, 0.70189552]),
        ];
        for (idx, t, truth) in cases {
            let p = helio_xyz(idx, t);
            let d =
                ((p[0] - truth[0]).powi(2) + (p[1] - truth[1]).powi(2) + (p[2] - truth[2]).powi(2))
                    .sqrt();
            let r = (truth[0] * truth[0] + truth[1] * truth[1] + truth[2] * truth[2]).sqrt();
            let arcsec = (d / r) * 206264.806;
            assert!(
                arcsec < 0.5,
                "idx {idx} @{t} yr: {arcsec} arcsec off TOP2013 source"
            );
        }
    }

    #[test]
    fn jupiter_at_j2000_meets_independent_vector_budget() {
        // Retained DE441 target 5 / Sun 10, JDTDB 2451545, geometric ICRF /
        // ecliptic J2000 AU: data/horizons-vectors-20261104.csv. Test each
        // truncated model against independent truth; agreement between two
        // analytic models does not establish either one's accuracy.
        let truth: [f64; 3] = [4.001177161126058, 2.938576106966103, -0.101_785_276_633_744];
        let radius = truth[0].hypot(truth[1]).hypot(truth[2]);
        for (name, actual) in [
            ("TOP2013 normal", helio_xyz(0, 0.0)),
            (
                "VSOP2013 big",
                crate::vsop2013::helio_xyz(crate::vsop2013_data::jup(), 0.0),
            ),
        ] {
            assert!(actual.iter().all(|value| value.is_finite()));
            let delta = (actual[0] - truth[0])
                .hypot(actual[1] - truth[1])
                .hypot(actual[2] - truth[2]);
            let equivalent_arcsec = delta / radius * 206264.80624709636;
            assert!(
                equivalent_arcsec <= 10.0,
                "{name} Jupiter at J2000: {equivalent_arcsec} arcsec equivalent"
            );
        }
    }
}
