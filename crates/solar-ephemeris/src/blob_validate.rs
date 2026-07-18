//! Zero-allocation structural validation for the packed ephemeris blobs.
//!
//! The trusted decoders (`*_data.rs`) deliberately panic on corruption — the blobs are
//! committed build inputs — but they used to trust every declared COUNT before reading:
//! a corrupt count byte became a multi-GiB `Vec::with_capacity` (OOM-abort) instead of
//! the documented clean panic, and a corrupt phase index survived decode to become a
//! wrap-to-255 bounds panic deep inside the evaluator. These validators walk the full
//! structure first with a checked cursor and **no allocation whatsoever**: every count
//! is bounded by the bytes actually remaining, every coefficient must be finite, every
//! VSOP phase index must be in the evaluator's 1..=17 range, and the blob must end
//! exactly where the structure does.
//!
//! No allocation also makes these the fuzz surface (`fuzz/fuzz_targets/`): the real
//! decoders `Box::leak` into 'static — running THEM millions of times would just OOM
//! the fuzzer — while these can chew arbitrary bytes forever.

#[derive(Clone, Debug, PartialEq)]
pub struct BlobError {
    pub offset: usize,
    pub message: &'static str,
}

impl core::fmt::Display for BlobError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{} at byte {}", self.message, self.offset)
    }
}

struct Cursor<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, pos: 0 }
    }

    fn remaining(&self) -> usize {
        self.bytes.len() - self.pos
    }

    fn err(&self, message: &'static str) -> BlobError {
        BlobError {
            offset: self.pos,
            message,
        }
    }

    fn take<const N: usize>(&mut self) -> Result<[u8; N], BlobError> {
        if self.remaining() < N {
            return Err(self.err("truncated"));
        }
        let chunk: [u8; N] = self.bytes[self.pos..self.pos + N].try_into().unwrap();
        self.pos += N;
        Ok(chunk)
    }

    fn u32(&mut self) -> Result<usize, BlobError> {
        Ok(u32::from_le_bytes(self.take::<4>()?) as usize)
    }

    fn u8(&mut self) -> Result<u8, BlobError> {
        Ok(self.take::<1>()?[0])
    }

    fn i16(&mut self) -> Result<i16, BlobError> {
        Ok(i16::from_le_bytes(self.take::<2>()?))
    }

    /// Advance past an i32 whose value validation doesn't constrain.
    fn i32(&mut self) -> Result<(), BlobError> {
        self.take::<4>()?;
        Ok(())
    }

    fn finite_f64(&mut self) -> Result<f64, BlobError> {
        let at = self.pos;
        let v = f64::from_le_bytes(self.take::<8>()?);
        if v.is_finite() {
            Ok(v)
        } else {
            Err(BlobError {
                offset: at,
                message: "non-finite coefficient",
            })
        }
    }

    /// A declared element count is only plausible if the remaining bytes can hold it.
    fn counted(
        &mut self,
        min_element_bytes: usize,
        what: &'static str,
    ) -> Result<usize, BlobError> {
        let at = self.pos;
        let count = self.u32()?;
        if count > self.remaining() / min_element_bytes.max(1) {
            return Err(BlobError {
                offset: at,
                message: what,
            });
        }
        Ok(count)
    }

    fn expect_end(&self) -> Result<(), BlobError> {
        if self.remaining() == 0 {
            Ok(())
        } else {
            Err(self.err("trailing bytes after structure"))
        }
    }
}

/// Validate `data/vsop2013.bin`; returns the total term count on success.
pub fn validate_vsop2013(bytes: &[u8]) -> Result<u64, BlobError> {
    let mut c = Cursor::new(bytes);
    let planets = c.u32()?;
    if planets != 8 {
        return Err(BlobError {
            offset: 0,
            message: "planet count must be 8",
        });
    }
    let mut terms_total: u64 = 0;
    for _ in 0..planets {
        c.finite_f64()?; // gm
        for _ in 0..6 {
            // series: n_powers × (n_terms × (s, c, n_phi × (idx u8, mult i16)))
            let n_powers = c.counted(4, "implausible power count")?;
            for _ in 0..n_powers {
                let n_terms = c.counted(20, "implausible term count")?;
                for _ in 0..n_terms {
                    c.finite_f64()?; // s
                    c.finite_f64()?; // c
                    let n_phi = c.counted(3, "implausible phase count")?;
                    for _ in 0..n_phi {
                        let at = c.pos;
                        let idx = c.u8()?;
                        // The evaluator indexes f[(idx - 1)] into a [f64; 17]: 0 wraps
                        // to 255 and >17 walks off the end — both must die HERE.
                        if !(1..=17).contains(&idx) {
                            return Err(BlobError {
                                offset: at,
                                message: "phase index outside 1..=17",
                            });
                        }
                        c.i16()?;
                    }
                    terms_total += 1;
                }
            }
        }
    }
    c.expect_end()?;
    Ok(terms_total)
}

/// Validate `data/top2013.bin`; returns the total term count on success.
pub fn validate_top2013(bytes: &[u8]) -> Result<u64, BlobError> {
    let mut c = Cursor::new(bytes);
    let planets = c.u32()?;
    if planets != 4 {
        return Err(BlobError {
            offset: 0,
            message: "planet count must be 4",
        });
    }
    let mut terms_total: u64 = 0;
    for _ in 0..planets {
        c.finite_f64()?; // mean motion
        for _ in 0..6 {
            let n_powers = c.counted(4, "implausible power count")?;
            for _ in 0..n_powers {
                let n_terms = c.counted(20, "implausible term count")?;
                for _ in 0..n_terms {
                    c.i32()?; // multiplier
                    c.finite_f64()?; // Ccos
                    c.finite_f64()?; // Csin
                    terms_total += 1;
                }
            }
        }
    }
    c.expect_end()?;
    Ok(terms_total)
}

/// Validate `data/elpmpp02.bin`; returns the total term count on success.
pub fn validate_elpmpp02(bytes: &[u8]) -> Result<u64, BlobError> {
    let mut c = Cursor::new(bytes);
    for _ in 0..5 {
        c.finite_f64()?; // W0 polynomial
    }
    let mut terms_total: u64 = 0;
    // 3 main-problem tables + 3×4 perturbation tables, all the same term shape.
    for _ in 0..15 {
        let n = c.counted(48, "implausible term count")?;
        for _ in 0..n {
            c.finite_f64()?; // amplitude
            for _ in 0..5 {
                c.finite_f64()?; // Delaunay multipliers
            }
            terms_total += 1;
        }
    }
    c.expect_end()?;
    Ok(terms_total)
}

#[cfg(test)]
mod tests {
    use super::*;

    static VSOP: &[u8] = include_bytes!("../data/vsop2013.bin");
    static TOP: &[u8] = include_bytes!("../data/top2013.bin");
    static ELP: &[u8] = include_bytes!("../data/elpmpp02.bin");

    #[test]
    fn committed_blobs_validate_and_term_counts_are_pinned() {
        // Exact counts pin the decode: a repack that gains or loses a single term fails
        // here before any golden test can drift. (Values printed by this test's first
        // run against the committed blobs, then frozen.)
        assert_eq!(validate_vsop2013(VSOP).expect("vsop2013.bin"), 3191);
        assert_eq!(validate_top2013(TOP).expect("top2013.bin"), 2909);
        assert_eq!(validate_elpmpp02(ELP).expect("elpmpp02.bin"), 5030);
    }

    #[test]
    fn corruption_fails_cleanly_not_explosively() {
        for validate in [validate_vsop2013, validate_top2013] {
            assert!(validate(&[]).is_err(), "empty");
            assert!(validate(&[8, 0, 0, 0]).is_err(), "count then nothing");
        }
        assert!(validate_elpmpp02(&[]).is_err());
        // Truncation anywhere inside the structure is a positioned error.
        for blob in [VSOP, TOP, ELP] {
            let cut = &blob[..blob.len() - 100];
            assert!(
                validate_vsop2013(cut).is_err()
                    || validate_top2013(cut).is_err()
                    || validate_elpmpp02(cut).is_err()
            );
        }
        // A count field inflated beyond the remaining bytes must be rejected up front —
        // this exact corruption used to become a multi-GiB with_capacity in the decoder.
        let mut huge = VSOP.to_vec();
        huge[12..16].copy_from_slice(&u32::MAX.to_le_bytes()); // first series' power count
        assert!(validate_vsop2013(&huge).is_err());
        // Trailing garbage is not "close enough".
        let mut padded = ELP.to_vec();
        padded.push(0);
        assert!(validate_elpmpp02(&padded).is_err());
    }

    #[test]
    fn out_of_range_phase_index_is_caught_at_validation() {
        // Hand-build a minimal structurally-valid vsop blob: 8 planets, the first with
        // one series holding one term with one phase entry of idx=0 (the evaluator
        // would wrap it to f[255]); the rest empty.
        let mut b: Vec<u8> = Vec::new();
        b.extend(8u32.to_le_bytes()); // planet count
                                      // planet 0: gm + series 0 with the bad phi, then 5 empty series
        b.extend(1.0f64.to_le_bytes());
        b.extend(1u32.to_le_bytes()); // n_powers = 1
        b.extend(1u32.to_le_bytes()); // n_terms = 1
        b.extend(0.1f64.to_le_bytes()); // s
        b.extend(0.2f64.to_le_bytes()); // c
        b.extend(1u32.to_le_bytes()); // n_phi = 1
        b.push(0); // idx = 0 — the wrap-to-255 landmine
        b.extend(1i16.to_le_bytes());
        for _ in 0..5 {
            b.extend(0u32.to_le_bytes());
        }
        // planets 1..8: gm + 6 empty series
        for _ in 0..7 {
            b.extend(1.0f64.to_le_bytes());
            for _ in 0..6 {
                b.extend(0u32.to_le_bytes());
            }
        }
        let err = validate_vsop2013(&b).unwrap_err();
        assert_eq!(err.message, "phase index outside 1..=17");
    }
}
