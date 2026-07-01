//! TOP2013 analytic theory of the outer planets (Jupiter, Saturn, Uranus, Neptune).
//!
//! A faithful port of ephem.js's TOP2013 evaluator (06-normal tier). TOP2013 is the IMCCE companion
//! to VSOP2013, built for the outer planets over a long span (≈ −4000…+8000), where it is markedly
//! more accurate than VSOP2013 for the giants (their VSOP error reaches hundreds of arcseconds by
//! ±6000 yr; TOP2013 stays sub-arcsecond). The engine uses TOP2013 for the four giants and VSOP2013
//! for the rest, so deep-time heliocentric positions of Jupiter–Neptune are tight.
//!
//! Each element l ∈ {a, L, k, h, q, p} is a Poisson series:
//!   l(t) = Σ_power t^power · Σ_term [Ccos·cos(mult·DMU·t) + Csin·sin(mult·DMU·t)]   (+ mm·t for L)
//! with t in Julian millennia from J2000 and DMU the Jupiter–Saturn great-inequality frequency. The
//! (L, power 1, mult 0) term is the mean motion and is supplied by `mm` instead. Coefficients live in
//! the generated `top2013_data` module; the result feeds `vsop2013::equinoctial_to_xyz`.

use crate::top2013_data::{TopPlanet, JUP, NEP, SAT, URA};

/// Great-inequality fundamental frequency (rad / 1000 yr); every term's frequency is `mult · DMU`.
const DMU: f64 = 0.359536228504931;

/// Maps the engine's outer-planet index (0=Jupiter, 1=Saturn, 2=Uranus, 3=Neptune) to its series.
fn planet(idx: usize) -> &'static TopPlanet {
    match idx {
        0 => &JUP,
        1 => &SAT,
        2 => &URA,
        _ => &NEP,
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
        // ephem.js TOP2013 ground truth (heliocentric ecliptic-J2000 AU) at ±5000 yr, from
        // tools/ephemeris-data/truth.js. The Rust port must reproduce the source to sub-arcsec.
        let cases: [(usize, f64, [f64; 3]); 8] = [
            (0, 5000.0, [-4.32774859, -3.36860619, 0.11833825]),
            (0, -5000.0, [-4.78884702, -2.48413965, 0.12775014]),
            (1, 5000.0, [7.09745989, -6.89521046, -0.24948087]),
            (1, -5000.0, [-8.36349070, 4.39065942, 0.16433556]),
            (2, 5000.0, [-12.78922132, 13.37406412, 0.18478171]),
            (2, -5000.0, [-11.04731187, 14.82682534, 0.23011759]),
            (3, 5000.0, [10.61844988, 27.83186896, -0.82077486]),
            (3, -5000.0, [-30.22443600, -0.64202797, 0.70168486]),
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
    fn jupiter_near_j2000_matches_vsop() {
        // TOP2013 and VSOP2013 agree to well under an arcsecond near the present.
        let top = helio_xyz(0, 0.0);
        let vsop = crate::vsop2013::helio_xyz(&crate::vsop2013_data::JUP, 0.0);
        let d =
            ((top[0] - vsop[0]).powi(2) + (top[1] - vsop[1]).powi(2) + (top[2] - vsop[2]).powi(2))
                .sqrt();
        let r = (top[0] * top[0] + top[1] * top[1] + top[2] * top[2]).sqrt();
        let arcsec = (d / r) * 206264.806;
        assert!(
            arcsec < 1.0,
            "TOP vs VSOP Jupiter at J2000 = {arcsec} arcsec"
        );
    }
}
