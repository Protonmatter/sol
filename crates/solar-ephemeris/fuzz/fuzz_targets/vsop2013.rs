// The validator is the fuzz surface by design: zero-allocation, so arbitrary bytes can
// be chewed forever, while the trusted decoder (which Box::leaks into 'static) stays
// behind it. Any panic/OOB/overflow here is a real bug — Err returns are the job.
#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = solar_ephemeris::blob_validate::validate_vsop2013(data);
});
