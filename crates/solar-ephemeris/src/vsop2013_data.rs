//! VSOP2013 planetary coefficients, parsed once at first use from the packed
//! little-endian blob `data/vsop2013.bin` (generated from ephem.js — see
//! tools/ephemeris-data/). This replaces ~230 KB of generated Rust source: the
//! blob is `include_bytes!`d and decoded into exactly the `Planet` / `Term`
//! structures the evaluator (`vsop2013.rs`) already expects, so the math and the
//! coefficient values are byte-for-byte unchanged.

use super::binread::Reader;
use super::vsop2013::{Planet, Series, Term};
use std::sync::OnceLock;

static BLOB: &[u8] = include_bytes!("../data/vsop2013.bin");

/// The eight planets in blob order: Mercury, Venus, EMB, Mars, Jupiter, Saturn, Uranus, Neptune.
fn all() -> &'static [Planet; 8] {
    static PLANETS: OnceLock<[Planet; 8]> = OnceLock::new();
    PLANETS.get_or_init(|| {
        let mut r = Reader::new(BLOB);
        let count = r.u32();
        let mut planets = Vec::with_capacity(count);
        for _ in 0..count {
            let gm = r.f64();
            let mut s: [Series; 6] = [&[]; 6];
            for slot in s.iter_mut() {
                *slot = read_series(&mut r);
            }
            planets.push(Planet {
                gm,
                a: s[0],
                l: s[1],
                k: s[2],
                h: s[3],
                q: s[4],
                p: s[5],
            });
        }
        planets
            .try_into()
            .unwrap_or_else(|_| unreachable!("vsop2013.bin declared a planet count other than 8"))
    })
}

fn read_series(r: &mut Reader) -> Series {
    let n_powers = r.u32();
    let mut powers: Vec<&'static [Term]> = Vec::with_capacity(n_powers);
    for _ in 0..n_powers {
        let n_terms = r.u32();
        let mut terms = Vec::with_capacity(n_terms);
        for _ in 0..n_terms {
            let s = r.f64();
            let c = r.f64();
            let n_phi = r.u32();
            let mut phi = Vec::with_capacity(n_phi);
            for _ in 0..n_phi {
                phi.push((r.u8(), r.i16()));
            }
            terms.push(Term {
                s,
                c,
                phi: Box::leak(phi.into_boxed_slice()),
            });
        }
        powers.push(Box::leak(terms.into_boxed_slice()));
    }
    Box::leak(powers.into_boxed_slice())
}

pub fn mer() -> &'static Planet {
    &all()[0]
}
pub fn ven() -> &'static Planet {
    &all()[1]
}
pub fn emb() -> &'static Planet {
    &all()[2]
}
pub fn mar() -> &'static Planet {
    &all()[3]
}
pub fn jup() -> &'static Planet {
    &all()[4]
}
pub fn sat() -> &'static Planet {
    &all()[5]
}
pub fn ura() -> &'static Planet {
    &all()[6]
}
pub fn nep() -> &'static Planet {
    &all()[7]
}
