# Ephemeris data pipeline (VSOP2013 → Rust)

The planet coefficients in `crates/solar-ephemeris/src/vsop2013_data.rs` are generated
(not hand-written) from the **VSOP2013** truncated tiers published by the MIT-licensed
[ephem.js](https://github.com/THRASTRO/ephem.js) project (IMCCE VSOP2013, Simon et al.).

## Regenerate (needs Node)

```bash
# 1. Fetch a tier (e.g. 06-normal) of the packed VSOP2013 data:
curl -o vsop2013_normal.js \
  https://raw.githubusercontent.com/THRASTRO/ephem.js/develop/src/vsop2013/dist/06-normal/min/vsop2013.js

# 2. Dump the coefficient series to JSON (minimal THREE/Orbit stubs; see dump_vsop.js):
node dump_vsop.js          # -> vsop2013_data.json

# 3. Pack JSON -> Rust:
python pack_vsop.py ../../crates/solar-ephemeris/src/vsop2013_data.rs
```

The Rust evaluator (`crates/solar-ephemeris/src/vsop2013.rs`) reads these and is validated
against JPL Horizons by `tools/validate_ephemeris.py`. Tiers (02-tiny … 10-extreme) trade
size for accuracy; 06-normal gives arcsecond-class positions over ±6000 yr.
