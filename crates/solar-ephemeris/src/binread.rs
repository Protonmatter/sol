//! Minimal little-endian byte cursor for the packed ephemeris blobs
//! (`data/*.bin`, produced from ephem.js — see tools/ephemeris-data/). Panics on
//! truncation: the blobs are committed build inputs, so a short read is a corrupt
//! checkout, not a runtime condition worth handling.

pub(crate) struct Reader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    pub(crate) fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, pos: 0 }
    }

    pub(crate) fn u32(&mut self) -> usize {
        u32::from_le_bytes(self.take::<4>()) as usize
    }

    pub(crate) fn i32(&mut self) -> i32 {
        i32::from_le_bytes(self.take::<4>())
    }

    pub(crate) fn i16(&mut self) -> i16 {
        i16::from_le_bytes(self.take::<2>())
    }

    pub(crate) fn u8(&mut self) -> u8 {
        let byte = self.bytes[self.pos];
        self.pos += 1;
        byte
    }

    pub(crate) fn f64(&mut self) -> f64 {
        f64::from_le_bytes(self.take::<8>())
    }

    fn take<const N: usize>(&mut self) -> [u8; N] {
        let chunk: [u8; N] = self.bytes[self.pos..self.pos + N].try_into().unwrap();
        self.pos += N;
        chunk
    }
}
