# Nutation characterization — 2026-11-07

Status: initial isolated numerical characterization; no production algorithm change.
The original full-series prototype's unit cohort is **failed: 76 pass, three fail**.
The later [regression-oracle follow-up](NUTATION_REGRESSIONS_20261107.md) preserves
that failure while independently replacing model-specific numerical expectations.
Its revised library unit suites pass in separate source cohorts; the production
model remains unchanged. The sections below retain the original characterization.
The 1900–2200 target, 10/12-arcsecond pointing budgets, approximate exploration
outside that target, current WASMs and unvalidated UI status remain unchanged.
Requirements: `SOL-SCI-001`, `SOL-TEST-001`, `SOL-COV-001`.

The [ERFA source candidate follow-up](NUTATION_ERFA_CANDIDATE_20261107.md)
adds independently checked source reconstruction, full workspace coverage,
native/WASM parity and mixed seasonal results in a later private cohort.
It does not apply a production model change or complete source-delivery,
browser, timing or release qualification.

## Reference conventions and experiment

The current `time::nutation_deg` uses four terms. JPL documents Horizons apparent
of-date coordinates as EOP-corrected IAU76/80, with IAU 1976 precession over
1799–2202 and IAU 1980 nutation. A direct IAU2000B/2006 substitution changes
conventions as well as truncation. The experiment therefore evaluates full
IAU 1980 first, with the other nutation models retained as diagnostic controls.
See [Horizons reference frames and Earth orientation](https://ssd.jpl.nasa.gov/horizons/manual.html).

The already-captured SOFA 2023-10-11 archive has SHA-256
`d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2`.
Its unmodified C sources compile offline in the existing cached Linux ARM64
image. All eight published nutation-coordinate test values pass. The actual
current Rust time/coordinate functions are compiled directly from the frozen
checkout, rather than inferred from a transcription.

The union contains 3,940 TT epochs: the existing padded/irregular 3,925-epoch
precision set, historical apparent epochs and the published reference-test date.
The maximum Python-versus-actual-Rust rotation disagreement across all 35,469
paired directions is about 9.05e-10 arcseconds. Raw reference, native outputs,
source hashes, compiled invocations and complete comparison rows are retained.

## Rotation and actual geocentric results

Paired retained Q45 apparent ICRF directions are first projected through the
current precession/obliquity conventions, changing only nutation. This isolates
an aggregate rotation comparison; it does not evaluate planetary theory or
establish a physical pointing bound. Within the approved window there are
35,298 dense directions. Their worst paired-rotation discrepancy changes from
0.420719409 arcseconds with the current approximation to 0.124134180 with full
IAU 1980. Individual residuals can increase through cancellation. Reference
frame and EOP differences remain in this discrepancy and are not additive.

The 77-term IAU2000B control differs from full IAU2000A by up to about 3.53 mas
in the relative-rotation angle over the approved sampled inputs. This is model
parity, not observer accuracy. USNO's approximately 1 mas description of IAU2000B
is scoped to 1995–2050; it is not a 1900–2200 guarantee. See
[the NOVAS C3.1 guide](https://aa.usno.navy.mil/downloads/novas/NOVAS_C3.1_Guide.pdf).
The IAU2000 controls retain the old precession/obliquity here deliberately;
they are not coherent proposed replacement pipelines.

Two private copies of the current ephemeris add the same observation-only hook
to the unchanged geocentric calculation. The prototype then replaces only the
nutation function and adds the 106-term numerical table. Both evaluate all
35,460 body/epoch combinations, invert the actual UTC-to-TT mapping within
one millisecond, and emit finite coordinates. Every geocentric range is exactly
equal between the two variants. Nineteen actual public Sky snapshots per variant
also pass strict JSON, complete schema and semantic admission.

| Actual geocentric comparison | Current private baseline | Full-series private prototype |
| --- | ---: | ---: |
| Approved-window dense directions | 35,298 | 35,298 |
| Directions exceeding unchanged budgets | 0 | 0 |
| Worst residual | 1.939378246 arcseconds, Uranus | 1.760395169 arcseconds, Uranus |
| Sampled 2026 geocentric directions | 108 | 108 |
| Worst residual in those 2026 samples | 0.777417505 arcseconds | 0.607111537 arcseconds |
| Full historical 144-direction matrix failures | 28 | 28 |

Among the approved-window dense directions, 21,345 improve and 13,953 worsen;
the largest increase is about 0.298955 arcseconds. No new budget failures occur.
The 2026 row is geocentric data from the dense packet, not the four-site seasonal
topocentric campaign. Older historical failure counts belong to their earlier
coefficient/source cohorts. The fresh private baseline above uses current code.
No sampled maximum establishes a continuous, sub-0.1-arcsecond or full-calendar
guarantee. No actual-WASM or seasonal observer replay is claimed for the prototype.

## Original failed regressions

A new private full-IAU1980 reference criterion fails against the current four-term
function as expected, then passes against the prototype. Across all 3,940 epochs,
prototype angles match the unmodified C reference within about 2.8e-15 arcseconds
per component. This component-level result does not clear the complete unit gate.

The prototype's library unit suite runs all 79 cases: 76 pass and three fail.
The original failed suite, its exit 101 and logs remain unchanged. A separate
continuation performs additional characterization; it does not exclude tests,
change tolerances, relabel the failure or promote the prototype.

| Failed existing regression | Observed output change at the same input |
| --- | --- |
| Fixed Alshain zenith observer | Altitude changes from 90 degrees to 89.999996805 degrees; strict snapshot JSON remains finite, but the 2e-6-degree zenith assertion fails |
| Arctic short daylight | Rise shifts +1.188728 seconds; set shifts -1.190418 seconds relative to the retained model-specific roots |
| Arctic short night | Set shifts +0.468716 seconds; the retained 0.1-second assertion fails |

Both Sun crossings remained calculated in the public snapshots. At this initial
checkpoint the failures had not been cleared as fixture-only issues. The later
[follow-up](NUTATION_REGRESSIONS_20261107.md) supplies independent bracketing,
current-model zenith construction and fault controls while preserving the original
failure cases and receipts. Numerical-model integration remains a separate hold.

## Source and delivery boundary

The reference-derived prototype and complete original SOFA source notices remain
private comparison inputs. No SOFA code/table enters the application, rebuild
kit, package, browser inventory or component notices. No public license change,
dependency installation, runtime network call or new accuracy status occurs.
Any proposed integration still needs source/attribution and distribution review,
resolved regressions, complete reference replay, native/WASM parity, performance
and browser checks. This experiment does not decide license compatibility.

All 1,768 source entries remain equal through runtime collection and analysis;
the subsequent report/cross-reference edits have a separate snapshot. Recorded
container IDs are absent after execution. The approved Illustrative Earth and
both product WASMs remain untouched. Hardware/normal-fallback timing passes and
the unresolved whole-driver 200 ms hold retain their own earlier evidence.

Evidence is under
`build/nutation-characterization-20261107-07644321ac844759aaf9e74b50f510d2/`:

- `inputs.json`, `reference-receipt.json` and `reference-angles.csv`: immutable
  reference identity, published checks and all four model outputs.
- `analysis-utf8.json` and `paired-rotation-comparisons-utf8.csv`: complete
  rotation-only comparisons and native/transcription agreement.
- `baseline-red-receipt.json`, `prototype-receipt.json` and
  `prototype-full-unit.log`: the new reference criterion and failed full suite.
- `continuation-receipt.json`, `native-analysis-utf8.json` and
  `native-position-comparisons-utf8.csv`: subsequent actual-calculation measurements,
  mixed residual changes and strict snapshot admission. The fixed-case files
  contain concatenated pretty JSON documents despite their `.jsonl` suffix;
  strict stream decoding is recorded and the raw files are not rewritten.
- `runtime-closure.json`: source stability and recorded owner absence.

A locale-default documentation-audit read failed before checkpoint publication.
Explicit UTF-8 analysis replays then renewed all snapshot decoding and reproduced
every metric and both complete comparison CSVs exactly. Original producers and
results remain retained; `utf8-replay-plan.json` and `utf8-replay-result.json`
identify the correction and correspondence. The documentation audit also uses
explicit UTF-8. No application or numerical source changed for this correction.

Rollback removes this new report and only its cross-reference paragraph in
[the accuracy contract](ACCURACY_CONTRACT.md); restore the exact contract backup
to retain its preceding bytes. Preserve all unrelated work and historical data.
The production-readiness goal remains active.
