#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = solar_ephemeris::blob_validate::validate_top2013(data);
});
