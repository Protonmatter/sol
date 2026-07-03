# Ephemeris data pipeline (VSOP2013 + ELP-MPP02 → Rust)

The planet coefficients in `crates/solar-ephemeris/src/vsop2013_data.rs` and the Moon
coefficients in `elpmpp02_data.rs` are generated (not hand-written) from the truncated tiers
published by the MIT-licensed [ephem.js](https://github.com/THRASTRO/ephem.js) project
(IMCCE **VSOP2013**, Simon et al.; **ELP-MPP02**, Chapront — the `jpl`/DE405 fit).

## Packed binary form (what is committed)

The coefficient tables are **not** committed as Rust source. They live as compact little-endian
blobs under `crates/solar-ephemeris/data/` (`vsop2013.bin`, `elpmpp02.bin`, `top2013.bin` — ~380 KB
total vs ~1.1 MB of generated `.rs`), `include_bytes!`d and decoded once at first use by the sibling
`*_data.rs` modules (`binread.rs` is the shared little-endian cursor). This keeps ~1 MB of tables
out of the compiler, rust-analyzer, and the rustfmt path. The blobs were produced from the generated
`.rs` by a one-shot serializer (`src/genbin.rs`, preserved in git history); the `pack_*.py` /
`gen_top.js` steps below still emit the `.rs` form, so to regenerate from a new ephem.js tier:
produce the `.rs`, then re-run that serializer to repack the `.bin`.

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

## Moon (ELP-MPP02)

```bash
# 1. Fetch a tier (06-normal is plenty — the truncation level does not limit accuracy here):
curl -o elpmpp02_normal.js \
  https://raw.githubusercontent.com/THRASTRO/ephem.js/develop/src/elpmpp02/dist/06-normal/min/elpmpp02.js

# 2. Capture the coeffs and run the one-time argument folding (CMPB/FMPB/CPER/FPER/W0):
node dump_elp.js elpmpp02_normal.js     # -> elpmpp02_init.json

# 3. Pack JSON -> Rust:
python pack_elp.py ../../crates/solar-ephemeris/src/elpmpp02_data.rs
```

`dump_elp.js` re-implements ephem.js's `elpmpp_init` so the heavy per-term setup is done at
build time; the Rust evaluator (`elpmpp02.rs`) is just the runtime series sum + the Laskar
precession to J2000. Validated geocentric Moon RA/Dec to ~3″ vs Horizons. **Note:** the
remaining accuracy lever was *not* the tier — the of-date reduction must use the full Meeus
Ch. 21 ecliptic precession (longitude *and* latitude); a longitude-only shift leaves a
~12″/26 yr declination error on every body.

## Outer planets (TOP2013)

The four giants (Jupiter–Neptune) use **TOP2013** instead of VSOP2013: VSOP2013-06-normal drifts to
hundreds of arcseconds for them by ±6000 yr, while TOP2013 (the IMCCE long-span outer-planet theory)
stays sub-arcsecond. `crates/solar-ephemeris/src/top2013_data.rs` is generated from the same ephem.js:

```bash
curl -o top2013_normal.js \
  https://raw.githubusercontent.com/THRASTRO/ephem.js/develop/src/top2013/dist/06-normal/min/top2013.js
node gen_top.js          # -> crates/solar-ephemeris/src/top2013_data.rs (analytic Poisson series)
```

`gen_top.js` decodes ephem.js's packed series: each term is `(mult, Ccos, Csin)` with argument
`mult · DMU · t` (t in Julian millennia, `DMU = 0.359536228504931` — the Jupiter–Saturn great-inequality
frequency); the mean longitude L adds the secular `mm · t`, and the `(L, power 1, mult 0)` term is
dropped. The Rust evaluator (`top2013.rs`) reuses `vsop2013::equinoctial_to_xyz`; a unit test pins it to
ephem.js ground truth at ±5000 yr to sub-arcsecond. NOTE: tabulating TOP (or TOP−VSOP) as Chebyshev
fails — the osculating elements / the two theories' short-period terms carry signal that aliases or
dephases; the analytic series is the only compact, exact form.
