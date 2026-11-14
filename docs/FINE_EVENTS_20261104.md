# Fine Sun/Moon event references — 2026-11-04

The current engine passes 32 selected independent configured-model event checks
against finer retained Horizons grids. The conservative maximum difference from
the native event time to either reference interval endpoint is **1.436001 seconds**,
below the predeclared 10-second control. This is finite, selected reference
evidence. It does not establish continuous event accuracy or observed horizon
visibility throughout the approved 1900–2200 target.

The event algorithm, public API, renderer and numerical tables are unchanged.
The new native test and offline raw-reference tests make these cases repeatable
in the existing required Cargo/Python suites. UI/provider accuracy status remains
unvalidated. Supported years 1–9999 remain approximate outside the target.

## Quantities and frozen design

The preceding [event semantics report](EVENT_QUANTITIES_20261104.md) distinguishes
the native altitude-maximum quantity from meridian crossing. Its one-minute
three-point peak fit has no certified interpolation bound. This follow-up refines
those same 12 diagnostic Sun/Moon cases: latitudes 0,42.36,75 degrees, longitude
and elevation zero, on 2026-03-21 and 2026-06-21. Reusing selected diagnostic cases
does not create held-out validation.

The plan was frozen before acquisition, SHA-256
`90b5e6d6fd4f953122c3df9498696a8e524cda27fe7e8e8933423b91d20b8a67`.
It declares 32 six-minute requests, 361 rows each, using the documented
[Horizons interval-count method](https://ssd.jpl.nasa.gov/horizons/manual.html#specification-of-time)
to obtain approximately one-second output. Requests use Gregorian UT/JD, terrestrial
geodetic sites, airless apparent coordinates and quantities 2/4/20/49. Original
replies identify Sun/Moon and Earth with DE441, ITRF93, explicit units and EOP
source/coverage. Acquisition reuses the existing public NASA/JPL transport, one
attempt per query. No network call is added to the application or offline loader.

The frozen controls are 10 seconds for event comparisons; 10 arcseconds for Sun
pointing, 12 for Moon; 3ms DUT1; and range error no larger than max(1 km, 10 ppm).
Each selected rise/set interval brackets a strict directional sign change in:

```text
airless apparent centre altitude
    + 34/60 degrees
    + asin(body radius / independent observer range)
```

The Sun/Moon radii are 695700 km/1737.4 km and the AU is 149597870.7 km, matching
the configured model and raw reference conversion. Semidiameter uses independently
returned Q20 range. No native range is borrowed for the reference threshold.
Horizons' rise/set markers use their own horizon/refraction convention and are
not substituted for this configured quantity. Atmospheric variation and terrain
can materially change actual visibility; the
[Horizons event documentation](https://ssd.jpl.nasa.gov/horizons/manual.html#understanding-rise-elevation-max-transit-and-set-indicators)
also distinguishes elevation maximum from meridian transit.

Every peak retains the two adjacent one-second samples around its unique strict
sampled maximum, requiring the whole six-minute grid to increase then decrease.
That two-second interval is conditional on the sampled-unimodal interpretation;
a finite grid is not a continuous interpolation theorem. The raw e/t markers
remain context only and do not sharpen bounds. Every crossing interval is at
most 1.001 seconds and every peak interval at most 2.001 seconds, including JD
printing/binary64 allowance. The comparison metric is the larger absolute
difference from native time to the two endpoints, not distance to the midpoint.

## Portable packet and native correspondence

The retained [packet](../tests/fixtures/horizons-events-20261104/README.md) contains
all 32 original replies, 1,803,008 bytes, plus the frozen plan, acquisition record,
selector/acquirer/query-helper sources and compact derived CSV. Its manifest
SHA-256 is `0db1e72cf5ded11d7f83221584004c04e1783185beb9bb45882ef0e52ea57343`.
Both `events.csv` and the crate's `data/horizons-events-20261104.csv` have SHA-256
`699e457cb7b6f050b261ae3fbd35321f62b54788b55f8b29690373be02848248`.

The stdlib-only `tools/horizons_events.py` admits the pinned plan, original
acquisition and file associations, rejects changed frames/sites/epochs/columns,
requires 361 finite rows for every response, validates strict sample shapes and
regenerates the compact CSV byte-for-byte. Paths and read sizes are bounded;
returned mappings and interval records are immutable. `.gitattributes` preserves
original response bytes, including source whitespace and line endings.

The native observation probe uses the exact captured owning crate source plus
an appended read-only entry, qualification Rust 1.96.0 on Windows ARM64, with
locked offline build and retained stdout/stderr. It exports 11,552 sampled points
and 36 event rows; 32 selected events are finite. Four nonfinite rows remain context
only, not independent absence/failure certification. The native receipt SHA-256
is `d789c587ff45dd976e13fd6bccbb689b352d785aef01ccd524b1f2cfc6a75bea`.

The new current-source native regression checks all 32 compact intervals at the
fixed 10-second limit, with exact body/site/day membership and reference-width
checks. The current `lib.rs` differs from the captured probe prefix only by that
`#[cfg(test)]` regression. Independent byte correspondence verifies this fact;
no production numerical function changed. Current native tests and model replay
below separately exercise the updated source.

## Measured results and independent review

The final research summary is
`build/event-reference-20261104/analysis-unimodal.json`, SHA-256
`6e9a0cf400ad236e01498b9357a1cc987565bef14e18dda7595dd8de05521bdc`.

| Fixed control | Population | Worst result | Failures |
| --- | --- | --- | --- |
| Configured-model event endpoint difference | 32 events | 1.436001s /10s | 0 |
| Topocentric equatorial separation | 11,552 sampled points | 0.387936 arcseconds | 0 |
| Horizontal great-circle separation | 11,552 sampled points | 0.379765 arcseconds | 0 |
| Airless altitude difference | 11,552 sampled points | 0.379577 arcseconds | 0 |
| DUT1 difference | 11,552 sampled points | 0.236591ms /3ms | 0 |
| Observer range budget fraction | 11,552 sampled points | 15.6874% of allowed error | 0 |

The five per-point controls total 57,760 correlated comparisons, not statistically
independent trials. Independent read-only review reproduces all 32 raw-derived
intervals and endpoint metrics, verifies every portable response against the
original acquisition, matches both CSV copies and verifies current-source
correspondence. No actionable P0–P2 finding remains in that reviewed scope.
The portable review receipt is
`build/event-reference-review-20261104/portable-receipt.json`, SHA-256
`f0f70f382f37bcf69ee411cae4907ac6549fb68ddefc40f33f1376e1ffadfbae`.

Three research/validation P2 findings were preserved and closed:

- The originally executed runner verified the owning repository but omitted a
  check of the copied tree actually compiled. Independent post-run verification
  matches all copied files, exact source prefix/entry, transformed manifests,
  toolchain, executable and streams. That closes current artifact correspondence;
  it does not retroactively add a build-time guard. The executed runner is frozen
  separately. The future runner now checks copied inventory/content before and
  after, rejecting extra build sources and symlinks. Eleven isolated controls pass.
- The initial analyzer sharpened peak intervals with e-markers. The retained
  response footer allows marker error up to twice the search step. The corrected
  analyzer/module keep the full two-second conditional bracket and strict full-grid
  shape checks. The initial 1.279333-second result remains a preserved predecessor;
  use the final 1.436001-second result.
- The new manifest loader initially read all bytes after a stat-size check. A
  stale-stat/growing-file regression admitted an oversized manifest. It now reads
  at most 131073 bytes and rejects a length above 131072 before parsing. The new
  regression fails the earlier implementation and passes the correction.

The original source-correspondence review receipt is
`b026779dc2de0abb35ba4a58bc4e1f4d4c0a87a7ed7eeb7b6b7588aa4cc6ee30`;
future-guard control receipt SHA-256 is
`6cdfdd317031be6b1dd00495ce9a029cc5b44ddc24d056d536873207227bdbc2`.
Frozen original runs/reports are unchanged. Existing acquisition size checks occur
after the transport returns; they are admission limits, not a pre-allocation
transport cap or proof of hard end-to-end cancellation.

## Current checks, scope and rollback

```text
python -m py_compile tools/horizons_events.py tests/python/test_horizons_events.py
python -m unittest discover -s tests/python -p test_horizons_events.py -v
cargo fmt --all --check
cargo test --workspace --locked --offline
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
python tools/validate_precision_window.py --out-dir build/event-reference-20261104/model-current
python tools/build_wasm.py --locked --out-root build/event-reference-20261104/wasm-current
```

Seven focused Python tests pass, including raw/frame/epoch/site mutation,
nonfinite values, duplicate metadata, paths, sample shape, CSV identity and growing
manifest controls. All 223 workspace Rust tests pass. All 109,900 approved-window
model comparisons pass at 3,925 model epochs, unchanged budgets; current summary
SHA-256 is `3b06161e01cda4c9b2afd55d31fdfce1e576981ed1d43a6bc5fc526c17cf191d`.
Formatting and strict Clippy pass. The fresh qualification-compiler build
reproduces both preceding Windows WASM modules exactly:

- Ephemeris: `2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2`.
- Solar: `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199`.

The complete current Python run passes 643 repository tests and 39 provider tests.
Existing governed statement/branch coverage remains 90.500061% at the unchanged
90% floor. The new offline module separately measures 98% statement/branch
coverage in that same run; it is not silently added to the governed denominator.
Its module, test and complete raw-packet inputs are hash-checked before/after.
Receipt: `coverage/fine-events-python-20261104-receipt.json`.

No browser/GPU run is claimed for a newly staged release in this unit. Existing
runtime evidence stays bound to its original manifest; an eventual release must
stage and qualify its exact current source/artifact metadata. Likewise the earlier
37-file dirty package is historical evidence; the new regression CSV changes
future package contents and requires a fresh package inventory before publication.
Minimum-compiler hosted CI, distribution correspondence and release holds remain.

Rollback the new offline loader/tests, packet/compact fixture, native test,
attributes and documentation together, preserving unrelated goal work and frozen
research evidence. No production numerical behavior, schema, dependency, licensing,
Git history, published package or deployed system changed. Continuous historical
observer/event bounds, independent whole-day absence/earliest-event proof,
physical Earth rotation over 1900–2200 and broader device/accessibility acceptance
remain open. No commit, push, merge, workflow dispatch, publication or deployment
occurred.
