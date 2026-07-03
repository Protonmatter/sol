//! ELP-MPP02 lunar coefficients, parsed once at first use from the packed
//! little-endian blob `data/elpmpp02.bin` (generated from ephem.js — see
//! tools/ephemeris-data/). This replaces ~640 KB of generated Rust source; the
//! decoded CMPB/FMPB/CPER/FPER tables and the W0 mean-longitude polynomial feed
//! the evaluator in `elpmpp02.rs` unchanged.

use super::binread::Reader;
use super::elpmpp02::Term;
use std::sync::OnceLock;

static BLOB: &[u8] = include_bytes!("../data/elpmpp02.bin");

struct Tables {
    w0: [f64; 5],
    main: [&'static [Term]; 3],
    pert: [[&'static [Term]; 4]; 3],
}

fn tables() -> &'static Tables {
    static TABLES: OnceLock<Tables> = OnceLock::new();
    TABLES.get_or_init(|| {
        let mut r = Reader::new(BLOB);
        let mut w0 = [0.0f64; 5];
        for x in w0.iter_mut() {
            *x = r.f64();
        }
        let mut main: [&'static [Term]; 3] = [&[]; 3];
        for slot in main.iter_mut() {
            *slot = read_terms(&mut r);
        }
        let mut pert: [[&'static [Term]; 4]; 3] = [[&[]; 4]; 3];
        for group in pert.iter_mut() {
            for slot in group.iter_mut() {
                *slot = read_terms(&mut r);
            }
        }
        Tables { w0, main, pert }
    })
}

fn read_terms(r: &mut Reader) -> &'static [Term] {
    let n = r.u32();
    let mut terms = Vec::with_capacity(n);
    for _ in 0..n {
        let amp = r.f64();
        let mut f = [0.0f64; 5];
        for x in f.iter_mut() {
            *x = r.f64();
        }
        terms.push(Term { amp, f });
    }
    Box::leak(terms.into_boxed_slice())
}

pub fn w0() -> &'static [f64; 5] {
    &tables().w0
}
pub fn main() -> &'static [&'static [Term]; 3] {
    &tables().main
}
pub fn pert() -> &'static [[&'static [Term]; 4]; 3] {
    &tables().pert
}
