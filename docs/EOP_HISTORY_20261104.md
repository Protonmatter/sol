# Daily Earth orientation and clock coherence — 2026-11-04

The local candidate now uses the admitted IERS/USNO daily EOP history instead
of seven measured days and an older forecast approximation. In the retained
Sun/Moon diagnostic matrix, all17,292 DUT1 comparisons pass the original3ms
control; the largest difference is0.237556ms. The earlier failed/degraded
report remains intact. This is sampled evidence, not a continuous observer or
physical event-time guarantee.

## Source, table and runtime policy

The [immutable fixture](../tests/fixtures/iers-eop-20261104/README.md) and
[source manifest](../tools/ephemeris-data/eop-sources.json) retain six exact
source/provenance inputs. The official raw source is3,775,228 bytes, SHA-256
`f7c0e9e5033b92ecd2488cf20cdf015c8aa2229f3153eceafd17d862b19fc961`.
Its SHA-512 matches identical published checksum files captured before and after
download. The generator binds their plan, allowed origin, exact request/file
associations, digests, chronology, selected fields and output recipe.

The [USNO product description](https://maia.usno.navy.mil/products/bulletin-a)
and retained format identify the historical daily observations and predictions.
Use only Bulletin A x/y polar motion, UT1−UTC, reported DUT1 formal error and
individual I/P flags. Bulletin B values and celestial-pole offsets are not
applied to this engine's existing reduction.

The complete20,031-row table spans **1973-01-02T00:00:00UTC through
2027-11-05T00:00:00UTC**, inclusive at its exact knots. The19,659 observed
I/I knots end at2026-10-29T00:00:00UTC. Interpolation after that last observed
knot consumes predictions and reports predicted quality. The50 date-only rows
beyond the final usable knot do not extend coverage.

`earth-orientation.bin` is661,039 bytes, SHA-256
`994c3fe24df38b54dc404bc6c1d1b7db86aab6aae4d2f311d7ad8207b0a9038a`.
Two reconstructions with the final generator reproduce the exact bytes. Every
serialized value and flag also matches independently parsed original columns.
The binary contains a16-byte magic/count/start-MJD header followed by fixed
33-byte records: four little-endian binary64 values and one prediction flag byte.

The runtime returns exact knots directly, without subtract/add cancellation.
Between knots it uses a bounded four-point local polynomial, keeping edge
windows inside the table and observed-only windows inside the observed segment.
It interpolates continuous UT1−TAI, then restores the owning UTC leap offset.
All25 in-range leap transitions have adjacent-float regressions. Any contributing
prediction, including a negative-weight contribution, reports predicted quality.
Uncovered/nonfinite input, an invalid header or an invalid referenced row
produces the existing explicit degraded result. No extrapolation occurs.

The [IERS interpolation guidance](https://maia.usno.navy.mil/information/iers-gaz13.txt)
describes local interpolation and additional high-frequency corrections. This
bounded update omits the stated subdaily corrections. Reported DUT1 formal
errors are propagated conservatively using absolute weights; they exclude
interpolation and unmodeled subdaily error and are not calibrated total
observer/event uncertainty. No new network call, dependency or mutable global
cache is used by the runtime.

## Independent replay and native correspondence

The same twelve original JPL daily tables and unchanged numeric limits from
[the event-quantity diagnosis](EVENT_QUANTITIES_20261104.md) were replayed after
the data update. The new comparator reuses the reviewed returned-header parser
and angular metric. Each case retains1,441 one-minute rows; its full observed
EOP status and all elevation/meridian markers remain explicit.

| Measurement | Checks | Failures | Largest difference |
| --- | ---: | ---: | ---: |
| Topocentric equatorial direction |17,292 |0 |0.528874 arcseconds |
| Airless horizontal direction |17,292 |0 |0.533453 arcseconds |
| Airless altitude |17,292 |0 |0.522980 arcseconds |
| DUT1 |17,292 |0 |0.000237556 seconds |
| Three-point minute-grid peak-fit diagnostic |12 |0 |0.721783 seconds |

The original10″ Sun/12″ Moon pointing and3ms DUT1 controls are unchanged.
The peak-fit10-second diagnostic threshold is unchanged; its interpolation
has no certified error bound, so that residual is not a physical event-error bound.

The final boundary-corrected comparison is
`build/eop-boundaries-native-20261104/comparison.json`, SHA-256
`ae1dcde768ae3e8b5909c5a60cbc7676501bc058a90e55b2581627f1d4ebb43b`.
The exact-source observation receipt is `receipt-admitted.json`, SHA-256
`448962fd26dab55eafd9585446dbe9ddbc2a1ed265e1fd87676b771479be51c4`.
It binds43 owning inputs, exact copied numerical sources and read-only entries,
explicitly verified Cargo adaptations, successful commands and empty stderr.
The first attempt rejected its correspondence check before any completion
receipt; corrected full copying/wrapper checks and fresh executions produce
byte-identical outputs. That first attempt remains unaccepted history. The
final boundary fixes also reproduce both admitted numerical CSVs byte for byte.

Six complete original public-API snapshots pass both Python and Node readers
and the Sun/Moon serialization bridge. Maximum RA/Dec differences are
4.69e-13°/4.74e-10° and DUT1 difference is zero. Receipt
`public-api/receipt.json` has SHA-256
`9bb5e21f9f964b6d8e07212d36d586d8a92d5e68b94bd6ff7b7e3fc1c76cd28c`.
These correspondence checks are separate from the independent science replay.

The fresh1900–2200 precision sweep again passes all109,900 comparisons.
`build/eop-boundaries-precision-20261104/summary.json` has SHA-256
`888df0696c70ba213567e2342df2cbe5ed4b67671b2feb5254ce2a92f7e719ca`.
Its full comparison CSV remains byte-identical at
`2e3838d2eb05f623554404522674211f0bc359c6e7f5c2795036b811a4aa83a5`.
Independent review of the initial EOP change recomputed both complete matrices
and checked the source, copy, Cargo, output and public-reader links. The later
boundary corrections have fresh source correspondence and separate review.

## Clock representation defect corrected

The native ΔT field now uses `TAI−UTC +32.184−DUT1` directly in seconds.
The previous JD-derived calculation inherited rounding from constructing
large binary64 JDs. A reproduced1973 knot differs by42.5 microseconds.
Direct offset arithmetic preserves the small quantity; TT/UT1 construction
and orbital equations remain unchanged.

The first rebuilt worker run then exposed a valid1980 snapshot rejected by
the live v3 reader's fixed50-microsecond JD-derived ΔT check. The precise ΔT
and reconstructed JD difference disagree by50.0476 microseconds. Independent
construction over all20,031 source knots finds103 such valid cases, with a
53.7096-microsecond worst case. JD serialization at10 decimals preserves the
supported binary64 values exactly; the error comes from preceding JD additions.

The live v3 readers retain the legacy50-microsecond path and additionally
admit non-null-TAI records satisfying the well-conditioned atomic identity.
That bound is1ns for two9-decimal-second fields plus explicit scalar floating
roundoff, capped at the existing50-microsecond allowance for unusual magnitudes.
All other clock relations remain required. Live Python uses the existing
JavaScript difference-residual forms at the same2e-9-day limits, closing
demonstrated adjacent-float and huge-finite-value discrepancies.
Both frozen v2 implementations remain byte-identical.

Independent review exercised the actual JavaScript/Python predicates on41,023
controls per language and27 complete-snapshot controls. Precise and legacy
representations pass; contradictory clocks and missing anchors fail. The
[native-derived clock fixture](../tests/fixtures/ephemeris-clock-boundary-20261104.provenance.json)
is contract evidence, not independent astronomy truth. The failed earlier
worker run remains failed; subsequent successful stages have separate receipts.

## Periodic angle boundaries corrected

The next real-worker run exposed a different historical failure at
TT2446637.074895833. Polar motion produced a longitude a few nanodegrees below
360°, but fixed decimal formatting emitted360. The strict v3 reader correctly
rejected that open-boundary violation. Longitude, local sidereal time and
all three body/star right-ascension fields now use the existing binary64
round-trip serializer. A regression reproduces the original failure and
checks exact computed-to-parsed equality for the periodic fields of all117
bodies. No angle is clamped by serialization.

Independent review also reproduced a pre-existing upstream defect: a valid
tiny negative longitude, such as−1e-15°, can make binary64 `rem_euclid(360)`
return exactly360 before formatting. The bounded internal normalization now
maps only that rounded endpoint to the equivalent0° meridian, preserving
every wrapped value already below360°, including its immediate predecessor.
The same normalization covers the coordinate and sidereal angle outputs;
existing radian reduction order is preserved. Adversarial native tests cover
tiny normal/subnormal values, signed zero, exact turns, adjacent endpoints,
nonfinite propagation and the complete original public snapshot.

The serializer-only stage passed34 worker snapshots/576 reference checks and
the complete browser scenario before the additional normalization correction.
It is retained under `build/production-20261104-eop-periodic-site` as earlier
evidence, with manifest SHA-256
`dcbe0667754fd45985f79cb95ebace4557607d8f3d55a04eb2699db35f82b16a`.
The final source requires its own fresh artifact and receipts; earlier
failed/partial runs are never relabeled as passing.

## Build and verification state

All 222 Rust workspace tests pass. The unchanged 90% Rust line gate passes at
8,658/9,034 lines, 95.837946%. LCOV SHA-256 is
`471e2561f61c58cb5e5eb8618555616098d27bc3f3555a93ffbae117874e6c55`.
Fmt and clippy with warnings denied pass. Generator/source and CI admission
controls pass, including rehashed provenance and first-key conditional steps.
A clean minimal checkout reproduced and corrected a test-only assumption that
`build/` already existed; all14 generator tests then pass from that clean state.

The EOP generator is an unconditional blocking step in the required web CI job.
Its production module was added to both copies of the Python coverage include
list, expanding the governed denominator without changing its90% floor.
The full Python suite passes 629 repository and 39 provider tests, with
90.420503% at the governed statement/branch floor. The full Node run passes
1,428 tests. Their reuse for this final Rust-only boundary follow-up is admitted
by exact equality of all 30 recorded Python inputs and all 125 staged JS source
files. Final Rust, Chromium and native-device evidence is fresh.

The final local artifact is
`build/production-20261104-eop-boundaries-site`, manifest SHA-256
`8b103c4773cf33f6897a99df86fdebd9e2f9d0e52d80cf77aaa9b5420e871006`.
Its ephemeris WASM is 1,810,907 bytes, SHA-256
`2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2`;
solar WASM remains byte-identical. The base Git revision identifies the
uncommitted candidate's ancestry, rather than claiming committed correspondence.

| Final local gate | Result | Receipt |
| --- | --- | --- |
| Real strict Sky worker | 36 snapshots, 576 reference checks; maximum 3,334.1ms below unchanged 10,000ms deadline | `coverage/eop-boundaries-worker-20261104.json` |
| Complete SwiftShader browser scenario | Passed original application and WebGL gates | `coverage/eop-boundaries-browser-20261104/browser-evidence.json` |
| Combined Node/Chromium web line coverage | 17,801/18,249 lines, 97.54%; unchanged 90% floor | `coverage/eop-boundaries-combined-20261104/coverage-summary.json` |
| Actual native Adreno GPU | 20 checks and 20 captures, including context restoration, mobile layout and level-4 Mars physical terrain animation | `coverage/eop-boundaries-physical-native-20261104/evidence.json` |

The native run records the actual application renderer as Qualcomm Adreno
X1-85 through D3D11, without source differences or page/console/shader/WebGL
errors. The restored Mars, physical Earth and narrow Earth captures were also
visually inspected. This is local device evidence, not a broader platform claim.

`coverage/eop-boundaries-final-links-20261104.json` records 595 checks connecting
current sources, staged assets and the final reports. Its SHA-256 is
`04c0698b3805a7914c7fe123a3601f9904e536798890568115bbdcc61c566cea`.
The associated ignored recorder verifies source equality before admitting reused
coverage. No hosted dispatch, publication or production activation occurred.

Independent final review reports no remaining P0–P2 finding in this scoped
change. It independently reran all six new serialization/normalization tests,
verified the 43 native inputs/copies and two entry suffixes, readmitted the
six public snapshots through the actual Python and Node readers, replayed all
595 consolidated correspondence checks and verified all 40 native PNG hashes.
The initial tiny-negative-longitude P2 finding remains recorded with verified
closure. These checks preserve the distinction between current local evidence
and unperformed continuous-accuracy, platform and release qualification.
The retained final review receipt is
`build/eop-periodic-independent-review-20261104/receipt.json`, SHA-256
`644267fc518512c6a1f33403da5fd13c285f00fea900ad9ce89a89d33ef11cfa`.
Its separate replay receipt is
`final-links-replayed.json`, SHA-256
`c0d3e7560e95866c4825626717b6aa061a80fddb9663b0c2e5d9bcca6ecf2c49`.

## Files in this follow-up

This inventory describes the EOP/clock/angle follow-up, rather than attributing
all accumulated uncommitted work to this change.

- Runtime: `crates/solar-ephemeris/src/earth_orientation.rs`,
  `timescales.rs`, `coords.rs`, `time.rs`, `lib.rs` and
  `crates/solar-ephemeris/data/earth-orientation.bin`.
- Offline generation/admission: `tools/generate_eop.py`,
  `tools/ephemeris-data/eop-sources.json`, `tools/ephemeris-data/README.md`,
  `tools/validate_sdlc.py`, `tools/validate_ephemeris_snapshot.py` and
  `apps/web/js/ephemerisContract.js`.
- Required checks and raw-byte preservation: `.gitattributes`,
  `.github/workflows/ci.yml` and `.github/workflows/coverage.yml`.
- Tests: `tests/python/test_eop_generation.py`,
  `tests/python/test_ephemeris_v3.py`, `tests/python/test_sdlc_contract.py`
  and `tests/web/ephemerisV3.test.mjs`; native regressions reside in the owning
  runtime modules listed above.
- Clock fixtures: `tests/fixtures/ephemeris-clock-boundary-20261104.json`,
  `tests/fixtures/ephemeris-clock-boundary-20261104.provenance.json` and
  `tests/fixtures/ephemeris-clock-ulp-cases-20261104.json`.
- Immutable EOP fixture under `tests/fixtures/iers-eop-20261104/`:
  `finals2000A.all`, `readme.finals2000A`, `checksums-before.sha512`,
  `checksums-after.sha512`, `plan.json`, `acquisition.json` and explanatory
  `README.md`.
- Documentation: this report, `docs/EPHEMERIS_V3.md`,
  `docs/ACCURACY_CONTRACT.md`, `docs/STATUS.md`,
  `docs/EVENT_QUANTITIES_20261104.md` and
  `docs/superpowers/plans/2026-11-04-eop-history.md`.

Research probes, receipt recorders, local stages and coverage outputs remain
in ignored `build/` and `coverage/` paths. They are retained evidence and are
not application dependencies or committed generated junk.

## Reproduction and rollback

```text
python tools/generate_eop.py --check
python tools/generate_eop.py --out-dir build/NEW-eop-rebuild
python -m unittest discover -s tests/python -p test_eop_generation.py -v
cargo test --workspace --locked --offline
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
python tools/validate_precision_window.py --out-dir build/NEW-eop-precision
```

Use Python3.11+, the existing pinned Rust1.96.0 setup, existing caches and fresh
build destinations. The generator is offline and never overwrites runtime data;
`--check` is read-only. Exit0 means complete admitted correspondence,1 means
input/output/admission failure, and2 means invalid CLI use. No credentials or
elevation are required. No production system or Git history changed.

Rollback the EOP table/runtime/metadata and matching regressions together, then
rebuild and requalify a fresh artifact. Previous runtime/time/library source
copies remain under `build/eop-history-promotion-20261104/`. Restore only scoped
hunks; preserve unrelated accumulated work. Keep the accurate ΔT producer and
matching v3 reader policy together rather than recreating the representation bug.

The approved1900–2200 model target and approximate supported years1–9999 remain
unchanged. EOP coverage does not span that whole target. Continuous observer and
physical event accuracy, broader platform/device acceptance, distribution-notice
correspondence, hosted CI and release qualification remain separate work.

The subsequent [native Linux EOP verification](NATIVE_EOP_20261104.md) now
supplies fresh x86-64 evidence for this exact runtime: all222 Rust tests,
40 focused Python controls, original reader/observer checks,109,900 model
comparisons and exact EOP reconstructions pass. The actual Linux-built WASM
passes36 worker snapshots, complete browser execution and20 native Adreno
checks in Windows Chrome. A fresh complete binary reconstruction explains
the inspected host differences. This supplements the Windows evidence above;
it is not Linux GPU, continuous physical or production qualification.
