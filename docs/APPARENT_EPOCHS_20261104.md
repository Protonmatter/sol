# Apparent-coordinate epoch characterization — 2026-11-04

Status: independent scientific comparison fails at its unchanged budgets.
This evidence separates geocentric apparent direction from the earlier
[geometric vectors](GEOMETRIC_VECTORS_20261104.md). Production formulas,
coefficient assets, calendar and UI qualification status remain unchanged.
Requirements: `SOL-SCI-001`, `SOL-TEST-001`, `SOL-COV-001`.

## Reference and native calculation

The [raw packet](../tests/fixtures/horizons-apparent-20261104/README.md) preserves
nine Horizons responses, 76,784 bytes, acquired from
`2026-11-04T03:15:18.481783+00:00` to
`2026-11-04T03:15:25.193400+00:00`, returned API version 1.2. Exact URLs,
identities, hashes, byte counts and acquisition times are retained. The plan
was frozen before the first request; acquisition code is preserved as inert text.

Every request uses Earth geocenter, airless output, Gregorian JD/TT and decimal
degrees. Primary Q2 is apparent true-equator/equinox-of-date RA/Dec. Q45 retains
apparent ICRF RA/Dec for a separate rotation diagnostic; Q30 retains TDB−UT.
Targets are Sun10, Moon301, Mercury199, Venus299 and planetary systems4/5/6/7/8.
These system barycenters are explicit; distant planet-center solutions are not
silently substituted. See [Horizons definitions](https://ssd.jpl.nasa.gov/horizons/manual.html)
and [API time parameters](https://ssd-api.jpl.nasa.gov/doc/horizons.html).

Sixteen TT instants span AD 1–9999. AD 1 uses Jan2 to keep the inverted native UTC
input inside its supported bounds. The native example reads only the unique
epoch inputs from the CSV, inverts `AstroTime`'s UTC→TT mapping with eight
iterations, checks the actual TT argument within one millisecond and invokes
the real `sky_snapshot_json`. Reference coordinates never enter that calculation.
The validator consumes its explicit geocentric apparent fields. Matching TT
isolates coordinate-model error; it does not qualify historical UTC/UT1,
future leap seconds, Earth orientation or local event times.

| Artifact | SHA-256 |
| --- | --- |
| Predeclared plan | `abea667213681f709bd67a35cd6676ce320fe7180eabc4f0efeda180761bf88d` |
| Packet manifest | `3b9a11e641cdf6471f6833a1c80ff5d15eaffd67e3e61c21f9696a457b0f98c9` |
| Derived CSV, both copies | `b98196468203f96efbb2adc106aa5b008b19091295d3ca5f165b29d760ba8c7a` |
| Historical native baseline | `5c45699b9267e4437af170eb94a94a05d7bb098ee7684ce0abccdad93068ce65` |

## Complete primary result

At the fixed great-circle budgets of 10 arcseconds for Sun/planets and 12 for
Moon, **117/144 pass and 27 fail**. No samples or failures were removed.

| Recorded epoch(s) | Passing directions | Worst residual at the stated individual epoch |
| --- | --- | --- |
| AD 1 Jan 2 | 8/9 | Moon 27.669342″ |
| Twelve recorded epochs from AD 1000 through AD 3000 | 108/108 | Discrete tests only |
| AD 2100, included in the grouped row above | 9/9 | Mars 4.050408″ |
| AD 2200, included in the grouped row above | 9/9 | Mars 2.847176″ |
| AD 5000 | 1/9 | Moon 92.522294″ |
| AD 7000 | 0/9 | Jupiter 457.079906″ |
| AD 9999 | 0/9 | Saturn 2690.849833″, about 0.74746° |

`tests/fixtures/geocentric-apparent-baseline-20261104.json` retains all 144
reference/native directions, thresholds, residuals, time checks and results,
plus source identities. It is immutable historical evidence; tests do not
require future models to retain its errors. The actual scientific CLI returns 1.
Passing admission/metric tests qualifies no continuous date interval.

## Diagnosed contributions and next correction

P1 scientific qualification finding — `lib.rs::geocentric`,
`planets.rs::planet_apparent_ecliptic`,
`coords.rs::precess_ecliptic_from_j2000` and `time.rs`'s obliquity/nutation
reduction: the retained apparent pipeline fails 27 independent samples; both
target theory and aggregate rotation materially affect distant-date output.
The impact is incorrect apparent directions inside the exploration calendar.
The UI continues to withhold validated accuracy status.

The owning code reveals distinct paths: Sky apparent places use VSOP2013 for
every planet; System positions/orbit ellipses use TOP2013 for the four giants.
Thus geometric and apparent Saturn errors are not a same-theory frame-error
comparison. The crate README and TOP2013 source comment now state this scope.

An independent read-only diagnostic projects retained Q45 directions through
the current aggregate precession/obliquity/nutation rotation and compares the
paired Q2 coordinates. Its Python transcription was checked against a compiled
probe calling the actual public Rust functions: maximum disagreement across
all 144 directions was `5.104326536e-10` arcseconds.

| Epoch | Maximum aggregate rotation discrepancy |
| --- | ---: |
| AD 3000 | 0.181476″ |
| AD 5000 | 17.421877″ |
| AD 7000 | 136.947771″ |
| AD 9999 | 905.889179″ |

This diagnostic also includes reference-frame/bias conventions. It does not
identify one formula as the sole cause. Separations are not additive and can
cancel. The script and all 144 diagnostic rows are retained under
`build/apparent-frame-review-20261104/`; receipt SHA-256:
`94f7a28290cd2d590e284c1901f781ec3bd23d7e3c64a726b775979229fa53ca`.

A scratch A/B switches only giant target evaluation to TOP2013 at the current
and retarded times, retaining Earth/velocity/reduction, assets and budgets.
It still passes 117/144 with 27 failures and zero newly failing previously
passing samples. Saturn at AD 9999 improves 2690.849833″→294.184791″; all
non-giant records remain exactly unchanged. No product substitution was made.

Review caught locale-default decoding in the first scratch driver, which could
damage UTF-8 comments. Explicit UTF-8 reads/LF writes corrected this P3
diagnostic issue. A fresh replay produced exactly the same 144 numerical rows;
its source diff contains only the intended experimental edits in `lib.rs` and
`planets.rs`. Corrected report:
`build/apparent-top-target-probe-utf8-20261104/report.json`, SHA-256
`41dbdc07b6cb0ea2b5a9aaf6123da51a24e950b34c26f95796616fea31290617`.

The next justified work combines independently validated long-term rotation
and target-model investigation. Test a candidate against this complete matrix,
existing geometric, observer/range and event regressions, and rebuilt native/
WASM behavior. Neither the scratch switch nor a fit to these rows clears the
existing accuracy budgets.

## Admission, checks and operational scope

The offline loader rejects changed identities, frame/time/calendar/quantity,
missing/duplicate/reordered epochs, malformed numeric fragments, nonfinite or
out-of-domain directions, changed budgets, rewritten plan and derived/raw
disagreement. Git attributes preserve raw bytes. Native projection admission
checks exact TT identity/tolerance, observer binding, unique complete major
bodies and explicit finite geocentric true-of-date fields. It supplements the
separate full v3 schema/semantic gates.

Eleven new tests cover those paths, immutable historical failure retention,
spherical wrap/pole/antipodal cases, NaN/boolean controls, body-specific budgets
and protected report paths. Reports use only new files under `build/` or
`coverage/`. Offline replay has no network fallback or registry mutation.

```text
python -m compileall -q tools/horizons_apparent.py tools/validate_apparent.py tests/python/test_horizons_apparent.py
python -m unittest discover -s tests/python -p test_horizons_apparent.py -v
python -O -m unittest discover -s tests/python -p test_horizons_apparent.py -v
python tools/validate_apparent.py --report build/NEW-apparent-report.json
cargo test --workspace --locked --offline
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
python tools/validate_accuracy_evidence.py
python tools/validate_docs.py
python tools/validate_sdlc.py
git diff --check
```

Full Python discovery passes 578 tests; Rust workspace tests pass all 204.
Formatting, clippy and real eight-record source parity pass. Independent review
found no actionable raw-admission or primary-harness defect. The scientific CLI
remains failed. Source-bound checks after the wording correction are retained
separately; no earlier receipt is silently reassigned to changed source bytes.

The final source-bound comparison is
`build/geocentric-apparent-final-20261104.json`; all 144 numerical records are
identical to the initial historical baseline after the comment clarification.
The current geometric CLI also remains failed, with its original 29/160
failures retained in `build/geometric-vector-after-apparent-20261104.json`.

Fresh configured Rust coverage passes 8,231/8,607 lines (95.63146%) and all
204 tests with the unchanged 90% floor and documented Windows ARM64 LLD
workaround. The LCOV SHA-256 is
`d0edd20ac4fd1bc019fe544a2d49d324800a7e170958f5897e779528edc80261`;
`coverage/production-20261104-apparent-rust-coverage-receipt.json` binds all
34 current source files and tools. Both rebuilt WASM binaries are byte-identical
to the tested grazing-final artifact (manifest SHA-256
`64d15f3d5203424be31549e6e57b2c39afc42bfc3f2ccfd76e12ec8fc0d0f26d`):
ephemeris `f70579126467431cccfceea5e69f11faa001e1eb4c4773c0b141d4a123d5c554`,
solar `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199`.
The source/byte identity receipt is
`coverage/production-20261104-apparent-final-wasm-identity.json`.

All 16 real native snapshots additionally passed the full Python and Node v3
schema/semantic readers, beyond the comparison's consumed-field projection.
That receipt is `coverage/production-20261104-apparent-contracts.json`.
These are native contract checks, not a new browser/rendering qualification.
Cargo's package inventory includes the new example and CSV; all 16 packet
files preserve their bytes under Git clean-filter checks with `autocrlf=true`.
Documentation (173 Markdown files), SDLC (27 requirements) and diff checks pass.

No production formula, dependency, public API, threshold or calendar limit
changes in this evidence unit. No commit, push, deployment, new cloud VM or
release promotion was performed. Continuous/physical UTC/event accuracy,
platform and full-production qualification remain held.

Rollback removes only these new apparent fixtures/validator/example/tests/docs
and attribute entry, restoring clarified wording if required. Preserve earlier
event, range, moon-time, optics, coefficient and canonical-generation work.
