# Public Sky WASM precision replay — 2026-11-05

Status: **all 70,650 sampled public-WASM comparisons pass; independent saved-result
review complete with no actionable findings**.
This study closes a coverage gap between the earlier native apparent-coordinate
sweep and the [actual System WASM geometric replay](SYSTEM_WASM_PRECISION_20261105.md).
It executes the public Sky ABI from the unchanged browser-tested ephemeris binary.
Illustrative Earth, application code, coefficients and numerical budgets are unchanged.

## Frozen scope and identities

- Module SHA-256: `2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2`.
- Executed stage manifest:
  `1283b98ea07ab58f65ad9773ab10aff492021adb796435992db735de218fa273`.
- Original Horizons reference manifest:
  `d3ea57a0eef1347dda375f0f66614a8d4235a0a179d08bbdba2184cec0e6cccb`.
- Frozen experiment plan:
  `26ed10380bc4b7fd68038a59c2c6f9e607e27ee4939355833abaff04fb4e0b3d`.

The matrix retains every one of the original 3,925 model arguments from the
[1900–2200 plan](PRECISION_WINDOW_20261104.md), including padded calendar
boundaries, the fixed grid and deterministic irregular samples. Eight independent
WASM instances use fixed contiguous partitions; no instance modifies the binary.
Every public `sky_snapshot` call uses the same declared observer, latitude 0,
east longitude 0, elevation 0, solely to exercise that original API.

The comparator uses the explicitly named **geocentric apparent** RA/Dec and
geocentric range fields for Sun, Moon and seven other planets. Topocentric aliases
and observer range are distinct fields and are not substituted. All nine targets
at all 3,925 epochs require 35,325 records and 70,650 pointing/range decisions.
The existing limits remain 10 arcsec for Sun/planet pointing, 12 arcsec for the
Moon, and `max(1km,10ppm × reference range)` for range. No residual is fitted.

The original public native time mapping supplies a UTC numeric argument for each
declared model TT argument. Each returned snapshot's numeric `jd_tt` must match
that declared argument within 1ms and pass the original request-binding guard.
This is a numerical time-argument check, not a measured physical TT–TDB difference,
historical clock reconstruction, future leap-second prediction or Earth-rotation
guarantee. The existing retained TT/TDB comparison proxy remains explicitly scoped.

## Collection and admission

Each complete raw UTF-8 JSON response is copied immediately from the current
post-call WASM memory, retained unchanged and hashed. All 117 objects in every
snapshot pass the original `parseEphemerisSnapshot` and
`assertEphemerisRequestBinding` frontend boundaries before the record is admitted.
The snapshot's existing unvalidated evidence marker remains required.

All 45 collection inputs are checked before and after execution. This includes
the exact complete frontend static dependency closure: `ephemerisContract.js`,
`ephemerisSchema.js`, `solarContract.js`, `solarSchema.js` and
`sourceAttribution.js`; all current Rust source/data, the module, stage manifest,
reference manifest, original time mapping and collection scripts are also bound.
Empty/subset source maps cannot pass the independent final admission. The
analysis has a separate closed static Python import inventory, including the
existing stable angular-separation implementation and its local dependencies.

An initial partial collection omitted `sourceAttribution.js` from its explicit
inventory. That experiment was stopped by its observed owned PID and its handle
returned terminal exit 1. Its plan, source, partial raw outputs and stop receipt
remain under `build/wasm-sky-precision-20261105-01/`; it supplies no full-result
or complete-input qualification. The corrected full experiment is separately
retained under `build/wasm-sky-precision-20261105-02/`. Neither its dates nor limits
were narrowed. No test job is restarted because a status observation expires.

Five Node guard groups pass: exact owned-byte copy, actual memory growth,
span/UTF-8 rejection, reader/binding/major-body rejection, and complete partition
coverage. Seven Python admission groups pass, including strict source population,
changed dates/limits/observer rejection, invalid values, raw snapshot extraction,
identity/clock/duplicate adversaries, RA wrap/poles and fixed range limits.
The first, middle and last date preflight snapshots pass the original frontend.

## Complete sampled result

The original collection handle returns terminal exit0 and is closed. All eight
partitions complete, all 45 original input hashes remain stable, and all 3,925
raw snapshots are retained: **525,786,491 original response bytes**. Collection
takes 1,674.551 seconds across eight isolated instances. This is a CPU collection
observation, not an application performance or platform comparison.

All **459,225 body records** pass the original frontend reader/request binding.
The complete raw responses also pass the original Python v3 parser, schema and
semantic validator: **3,925 snapshots, zero failures**. All 12 analysis source/data
identities, including the original live schema and metric dependencies, remain
stable before/after analysis. The complete comparison contains **70,650 decisions,
zero failures**, with no failing samples discarded or limits changed.

| Body | Largest recorded geocentric pointing residual | Declared model JD | Fixed limit |
| --- | ---: | ---: | ---: |
| Sun |0.488941965″ |2494129.5 |10″ |
| Moon |0.462506651″ |2466739.5 |12″ |
| Mercury |0.505293227″ |2520139.5 |10″ |
| Venus |0.640459406″ |2487319.5 |10″ |
| Mars |0.573187102″ |2465359.5 |10″ |
| Jupiter |1.384427312″ |2465239.5 |10″ |
| Saturn |1.096296189″ |2523139.5 |10″ |
| Uranus |1.939378352″ |2524189.5 |10″ |
| Neptune |0.943172918″ |2509999.5 |10″ |

The largest absolute range residual is **4,023.576800km**, Uranus at
JD2523919.5, against its distance-dependent 28,456.014433km limit. The largest
range-budget fraction is **14.30255%**, Mars at JD2498929.5: 98.759270km against
690.501137km. These are different maxima and remain separately recorded.

Earth-orientation metadata remains honest about its separate domain:

| Existing engine status | Snapshot count |
| --- | ---: |
| Pre-UTC UT1 proxy |950 |
| Degraded / no bundled EOP coverage |2,254 |
| Rapid |707 |
| Predicted |14 |

The numeric input semantics are historical UT1 proxy in 950 snapshots and UTC
in 2,975. The maximum numeric `jd_tt` argument discrepancy is 0 at stored binary64
resolution. None of these counts or the numerical round trip measures physical
clock/Earth-rotation accuracy. The product evidence marker stays unvalidated.

Independent review rebuilds the complete epoch matrix and parses all 190 original
response files. It revalidates all 3,925 full raw snapshots with both original
readers, recomputes all 70,650 measurements using an independent haversine angle
formula, and matches every CSV field/decision, all 18 absolute maxima and all 18
worst budget fractions. The largest arithmetic difference from the analyzer's
cross/dot angular formula is 1.80913e-10 arcsec. All eight shard inventories,
all raw hashes, the final 45 collection and 12 analysis input hashes, and the
time/EOP counts agree. It finds no actionable P0–P3 issue and performs no
duplicate WASM sweep or application edit.

Exact completion identities:

- Execution receipt: `4e0ec70dd14df8156aa44d41a99807de361807285d3823ece1e372df107951e7`.
- Summary: `5282583b909c96c25bc30065f728ea131c7e3662cefbe70877b128df4c8430d2`.
- Complete 25,090,258-byte comparison CSV:
  `acd166422ccabdfa9983f60ee2c9d490dea7abb2bcb89dec683a8d03cfc83993`.
- Independent review:
  `0b2c174ac0917a93180d12f1f7ced123f48d72473722e4ffdb4f6d5045eba720`.
- Controller terminal-state and final reviewed-input readback:
  `f8e726fbf8be02abf03b103a4338cbba0ba8c20e165e694989167b060c3cb48e`.

Together with the separate 39,250-comparison
[System geometric replay](SYSTEM_WASM_PRECISION_20261105.md), the same ephemeris
binary now passes all 109,900 retained geometric, apparent-direction and range
checks. The studies use distinct original public ABI paths; this combined count
is not a single browser run or a continuous/platform qualification.

Commands used after the collector's successful terminal completion:

```text
node --test build/wasm-sky-precision-20261105-02/checks.test.mjs
python build/wasm-sky-precision-20261105-02/admission.test.py -v
python build/wasm-sky-precision-20261105-02/analyze.py
```

These are retained experiment commands, not an instruction to overwrite outputs.
The analyzer creates its completion report and CSV once; incomplete/failed output
remains evidence. The original System replay's 52 input hashes are also freshly
rechecked and unchanged. No application or scientific algorithm is modified.

## Qualification limits

This is finite sampled geocentric apparent-coordinate verification of the public
WASM output, not a continuous bound over the calendar. It does not independently
qualify topocentric observer accuracy, rise/set/transit events, catalogue-star
physics, physical Earth orientation, browser scheduling/GPU behavior, hosted CI
or a release. Validating those emitted fields structurally does not establish
their independent numerical accuracy. The agreed years 1–9999 approximate
exploration boundary outside the precision window is unchanged.

The separate fingerprint diagnostic stage in the
[orbit rendering report](ORBIT_CURVE_RENDERING_20261105.md) preserves all application
source and WASM identities. This experiment stays bound to the stage manifest
named above; it is not silently reassigned to another artifact.
