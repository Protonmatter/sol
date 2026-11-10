# Independent geometric-vector investigation — 2026-11-04

Status: **the intended full-span scientific gate fails**. The current model
passes 131 of 160 captured DE441 vectors and fails 29 at the predeclared
10 arcsecond-equivalent budget. No tolerance, coefficient asset, numerical
implementation or UI accuracy status was changed to conceal these failures.

Requirements: `SOL-SCI-001`, `SOL-TEST-001`, `SOL-COV-001`, `SOL-REL-001`.

## Reference identity and conventions

The [raw pack](../tests/fixtures/horizons-vectors-20261104/README.md) retains ten
serial queries and original replies (62,777 bytes), exact URLs, acquisition
times and hashes. Its 16 proleptic Gregorian TDB epochs span years 1–9999.
The [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) defines the
explicit targets: planetary systems 1, 2, 4, 5, 6, 7 and 8; Earth centre 399;
Moon centre 301; origins Sun centre 10 or Earth centre 399. Requests 1/2 return
aliases 199/299. Giant-planet samples concern system barycentres, not body centres.

Requests select `VECTORS`, `ICRF`, `ECLIPTIC`, `NONE`, `AU-D`, position-only CSV
and explicit numeric JD/TDB/Gregorian dates. Raw headers bind DE441, geometric
states, the J2000 ecliptic, ICRF X axis and IAU76 obliquity. This differs from
apparent observer tables and their light-time-corrected ranges; see the
[API definitions](https://ssd-api.jpl.nasa.gov/doc/horizons.html).

- Predeclared plan SHA-256: `feabd6d48bec21972cd2c6cc51284fdc97d3e97aa12af0111237f3500f77e41c`.
- Reference manifest SHA-256: `263e63ea08502631a56b64adf135b186101ca56a2e19b632ba23d5fe75bb3ac7`.
- Both derived CSV copies SHA-256: `4267d3e08b844b8a0e98def3e23d0ccba3429c840fc8472acd364282bfa76e54`.

The primary metric is `norm(model-reference)/norm(reference) * 206264.80624709636`.
It includes radial error and is not angular separation. Its maximum was fixed
at 10 before acquisition. A radial-only adversarial example has essentially zero
angular error and correctly fails this full-vector budget. Actual angular
separation and signed radial ppm remain separately named diagnostics.

## Native comparison and failures

The Rust `geometric_vectors` example observes the actual 27-f64 System ABI in
canonical body order. It reads only the CSV's unique epoch column, never reference
coordinates. Earth subtraction supplies the geocentric Moon. The documented
thread-local buffer is copied immediately after pointer/length checks, before
another System call can replace it.

The existing TT mapping is inverted to place the model argument at the requested
TDB date; observed argument error was zero at all 16 samples. TT approximates
TDB within 2 ms according to the Horizons manual. This isolates coordinate-model
error from historical UTC/UT1/Delta-T uncertainty; it does not qualify ancient
civil-time accuracy or independently validate that inverse.

| Body / vector | Worst full-vector error, arcsecond-equivalent |
| --- | ---: |
| Mercury | 99.137081 |
| Venus | 124.086251 |
| Earth centre | 263.323209 |
| Mars system | 219.675756 |
| Jupiter system | 317.061676 |
| Saturn system | 743.490456 |
| Uranus system | 82.065446 |
| Neptune system | 30.916660 |
| Heliocentric Moon | 259.774707 |
| Geocentric Moon | 2106.184912 |

The worst geocentric Moon sample is JD/TDB 5373119.5 (year 9999). Its actual
angular error is 2105.190778 arcseconds, approximately 0.585 degrees. The
heliocentric Moon's reference norm is approximately one AU, so that comparison
alone conceals a larger relative error in the Earth–Moon vector.

All 120 samples at the 12 recorded epochs from years 1000 through 3000 pass.
Year 1 passes 8/10, year 5000 passes 3/10, and years 7000/9999 pass 0/10 each.
These samples do not qualify the continuous interval between them.

The initial and final source-bound reports are retained separately under
`build/geometric-vector-initial-20261104.json` and
`build/geometric-vector-final-20261104.json`. The final result records native
source/data and validation-tool hashes, exact command, host and every residual.
A small baseline test fixture additionally preserves the measured failure.
The [historical baseline](../tests/fixtures/geometric-vector-baseline-20261104.json)
is 99,379 bytes, SHA-256
`f795db2a59e2ea40e46790e77ff7ede7dbdba09f456e5a163838d2f653cc58a5`.
Its integrity test recomputes every residual against the raw pack and preserves
all 29 failed flags. It is a historical measurement, not a requirement that a
future improved model must continue to fail.

## Independent checks and isolated coefficient experiment

Independent review reproduced the matrix and verified aliases, frames, units,
TDB/TT mapping, body order and origin subtraction. No harness defect explaining
the scientific errors was identified. A separate evaluator parsed the pinned
upstream numeric literals without executing upstream JavaScript. It evaluated
VSOP/TOP with a separate generalized-equinoctial conversion. Across 128
source-parity vectors, maximum native discrepancies were 0.000004751
arcsecond-equivalent for planets and 0.000023925 for the geocentric Moon.
The lunar calculation reused the recovered folded initialization; it did not
independently reconstruct the complete raw ELP initialization. The reproducible
script and receipt are in `build/vector-upstream-parity-review-20261104/`.
These tiny differences rule out the inspected port evaluation/conversion loops
as explanations for the large DE441 residuals; they do not qualify the upstream
model or establish truncation as the sole cause.

A supplementary initialization review subsequently closed the normal-tier
folding limitation. It reconstructed raw coefficients independently in Python
for LLR mode 0 and JPL mode 1, checked the wrapper mapping and all six additional
JPL secular corrections, and compared every W0/CMPB/FMPB/CPER/FPER scalar.
Only the fully statically reviewed constant/initializer math blocks ran in fresh
restricted Node VM contexts; neither full upstream asset nor acquisition/dump
wrappers executed. The reviewed upstream and dump arrays were exactly equal
in both modes. Python differed only in 22 LLR and 27 JPL constant phases, at
most 3.55e-15 and 7.11e-15 respectively; no secular coefficient differed.

The independently reconstructed JPL initialization produces identical lunar
vectors at all 16 epochs in the separate Python evaluator. Packing the reviewed
upstream/V8 JPL initialization reproduces the current 241,540-byte lunar asset
exactly, SHA-256 `9f670b604c7b5189c9d70a1c2ab050672e6e8706aa0ab9b0cae439cb88171347`.
LLR-mode packing differs as a negative control. No initialization defect was
identified relative to the pinned upstream source. This does not establish
DE441 accuracy or parity with an independent authoritative Fortran implementation.
The supplementary scripts and receipts are retained under
`build/elp-initialization-review-20261104/`; receipt SHA-256 is
`ddb8b711d99a590781dd811774bda791741a13f0ef23c7d63dc1f785283a67ca`
and phase/mode receipt SHA-256 is
`1b99e2ea47156b2c8a11fa685a04042eb057579ad645782c797d4ff8a5876f77`.

Pinned upstream generator scripts filter amplitudes before applying time powers.
A scratch crate therefore substituted verified `08-big` VSOP/TOP and `12-full`
ELP inputs at upstream revision `2f679a1f698b4f20f9579d94da24af51559458ed`.
It reused static literal extraction, the trusted initializer and pure serializers.
Only the diagnostic extractor copy's input/node caps changed to admit the larger
verified inputs; product gates/manifests were untouched. No upstream JS executed.

That experiment passed 141/160, with 19 remaining failures and no newly failing
previously passing sample. Neptune improved to 16/16. The geocentric Moon's
maximum barely changed: 2106.184912 to 2103.291420. Experimental blobs total
2,884,625 bytes versus the current 385,509 without clearing the budget. Replacing
production assets is therefore not justified by this experiment. Its receipt
and matrix are in `build/vector-tier-probe-20261104/report.json`.
Truncation contributes to some discrepancies; remaining secular/model/reference
differences require further investigation rather than a fit to validation rows.

## Corrections, checks and remaining work

P2 — unsupported deep-time scientific claims in `top2013.rs` and the System
snapshot comment are corrected. Published full-theory precision does not qualify
this truncated port. The crate README now distinguishes sampled evidence and
remaining notice review.

The native ABI/JSON regression now covers all 16 epochs and binds each complete
xyz triple to its named body. A swapped-body negative control prevents the old
per-coordinate search from accepting misassociated triples. This tests interface
parity, not independent DE441 accuracy.

P2 — correcting the source comments exposed a provenance-gate defect: the gate
required today's entire source file to equal a historical reference checksum.
It now verifies the complete immutable archived file through `git show`, extracts
the one named eight-vector test matrix, and requires the current literal matrix
to match that archive. Native identities, finite outputs, measured errors and the
strict 0.5 arcsecond-equivalent source-parity budget remain enforced. The frozen
[source fixture](../tests/fixtures/top2013-source-parity-25efcd5.rs.txt) is byte-identical
to the referenced Git object: 5,675 bytes, SHA-256
`e52c55152d5cfe5f26eed83125cd9b5bba172619cb3caf4276f4e9cdb2af3554`.
Tests accept unrelated current comments while rejecting altered current vectors
or any changed archival bytes. Independent review found no provenance weakening.
The extractor recognizes the existing Rust function/tuple layout; unsupported
structural rewrites fail closed and need explicit review. This is not code approval
or independent astronomical qualification.

The offline loader refuses changed raw bytes, identities, frame/correction/units,
calendar, epoch order/cardinality, budgets and derived values. Numeric fragments,
nonfinite vectors and malformed CSV headers fail admission. The CLI has no network
fallback and writes only new files under `build/` or `coverage/`; admitted
scientific failures still retain their complete finite result. Raw Git attributes
protect captured bytes on Windows.

```text
python -m unittest discover -s tests/python -p test_horizons_vectors.py -v
python tools/validate_vectors.py --report build/NEW-vector-report.json
cargo test --locked --offline -p solar-ephemeris system_positions_fast_path_matches_the_json_snapshot_exactly
cargo test --workspace --locked --offline
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
python tools/validate_docs.py
python tools/validate_sdlc.py
git diff --check
```

The vector CLI currently returns **1**, faithfully reporting the scientific
failure. Passing unit/integrity/interface tests must not be called a passing
full-span accuracy gate. No new mandatory CI job or accepted UI evidence was
fabricated from this failing matrix; the eight UI registry records remain
source-parity samples. Continuous, apparent-place, range/event, platform,
distribution and production qualification remain separate.

## Source-bound verification follow-up

Final full Python discovery passed **567 tests**, including eleven vector
admission/metric/baseline tests and seven source-parity provenance tests. The
real eight-record source-parity CLI passes; the independent 160-vector CLI still
returns 1 with all 29 failures retained. Final independent reviews found no
remaining actionable harness/provenance issue. Syntax, 168-file documentation,
27-requirement SDLC and diff checks pass. Windows checkout-filter simulation
preserves all 17 files in the raw vector pack. These passing software checks
do not clear the failed scientific accuracy budget.

All 196 workspace Rust tests, formatting and clippy passed. Refreshed configured
Rust line coverage passed at **95.54%** (8,009/8,383 lines, unchanged 90% floor),
with the same documented Windows ARM64 Rust LLD workaround. The LCOV SHA-256 is
`8cdb34ccaaca9c98f6973741da50324dd680230f56ada31ee86f4a4bc7976d2d`;
its receipt binds all 34 source files and tools under
`coverage/production-20261104-vectors-rust-coverage-receipt.json`.

Both rebuilt WASM files are byte-identical to the previously tested range
artifact (manifest SHA-256
`14f9cc29e37f6e77c45496cc297dd5265ec8a039cfb9208863f885e30f824082`).
Ephemeris remains `aa2ecdf33c2ffb74a0bba12fc7fb160e41d9b99c2005b15059e6f22739d58f5c`;
solar remains `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199`.
The identity receipt is `coverage/production-20261104-vector-wasm-identity.json`.
No new rendering qualification is inferred; earlier source-bound GPU results
continue to describe those exact runtime bytes.

The sampled-error figure and source hashes are retained as
`coverage/production-20261104-vector-errors.png` and its adjacent JSON receipt.
It plots points with equal epoch spacing, uses the full-vector metric, labels
the failed budget and distinguishes the isolated experiment from production.
Neither interpolation nor a continuous accuracy span is implied.

Rollback removes only the new tools/example/reference fixtures and test
extensions and reverses their docs. Preserve the earlier moon timing, lunar
range, optics, canonical generation and coefficient-recovery work. No deployed
service, publication or production coefficient asset changed.
