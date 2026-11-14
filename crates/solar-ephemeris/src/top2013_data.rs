//! TOP2013 outer-planet coefficients, parsed once at first use from the packed
//! little-endian blob `data/top2013.bin` (generated from ephem.js — see
//! tools/ephemeris-data/). This replaces ~150 KB of generated Rust source; the
//! evaluator lives in `top2013.rs`.
#![allow(clippy::type_complexity)] // the [a,L,k,h,q,p][power][term] shape is the domain, not accidental

use super::binread::Reader;
use std::collections::BTreeMap;
use std::sync::OnceLock;

static BLOB: &[u8] = include_bytes!("../data/top2013.bin");

pub struct TopTerm {
    pub mult: i32,
    pub phase: usize,
    pub cc: f64,
    pub cs: f64,
}

pub struct TopPlanet {
    pub mm: f64,                                   // mean motion (rad / 1000 yr), added to L
    pub elems: [&'static [&'static [TopTerm]]; 6], // [a,L,k,h,q,p][power][term]
    pub multipliers: &'static [i32],               // distinct phase arguments, in first-use order
}

/// Jupiter, Saturn, Uranus, Neptune in blob order.
fn all() -> &'static [TopPlanet; 4] {
    static PLANETS: OnceLock<[TopPlanet; 4]> = OnceLock::new();
    PLANETS.get_or_init(|| {
        // Structural validation first — see blob_validate.rs (clean panic, no OOM).
        if let Err(e) = crate::blob_validate::validate_top2013(BLOB) {
            panic!("data/top2013.bin is corrupt: {e}");
        }
        let mut r = Reader::new(BLOB);
        let count = r.u32();
        let mut planets = Vec::with_capacity(count);
        for _ in 0..count {
            let mm = r.f64();
            let mut elems: [&'static [&'static [TopTerm]]; 6] = [&[]; 6];
            let mut phase_ids = BTreeMap::new();
            let mut multipliers = Vec::new();
            for el in elems.iter_mut() {
                *el = read_element(&mut r, &mut phase_ids, &mut multipliers);
            }
            planets.push(TopPlanet {
                mm,
                elems,
                multipliers: Box::leak(multipliers.into_boxed_slice()),
            });
        }
        planets
            .try_into()
            .unwrap_or_else(|_| unreachable!("top2013.bin declared a planet count other than 4"))
    })
}

fn read_element(
    r: &mut Reader,
    phase_ids: &mut BTreeMap<i32, usize>,
    multipliers: &mut Vec<i32>,
) -> &'static [&'static [TopTerm]] {
    let n_powers = r.u32();
    let mut powers: Vec<&'static [TopTerm]> = Vec::with_capacity(n_powers);
    for _ in 0..n_powers {
        let n_terms = r.u32();
        let mut terms = Vec::with_capacity(n_terms);
        for _ in 0..n_terms {
            let mult = r.i32();
            let cc = r.f64();
            let cs = r.f64();
            let phase = *phase_ids.entry(mult).or_insert_with(|| {
                let id = multipliers.len();
                multipliers.push(mult);
                id
            });
            terms.push(TopTerm {
                mult,
                phase,
                cc,
                cs,
            });
        }
        powers.push(Box::leak(terms.into_boxed_slice()));
    }
    Box::leak(powers.into_boxed_slice())
}

pub fn jup() -> &'static TopPlanet {
    &all()[0]
}
pub fn sat() -> &'static TopPlanet {
    &all()[1]
}
pub fn ura() -> &'static TopPlanet {
    &all()[2]
}
pub fn nep() -> &'static TopPlanet {
    &all()[3]
}
