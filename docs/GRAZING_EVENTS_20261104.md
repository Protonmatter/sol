# Grazing rise and set regressions — 2026-11-04

The local native event solver now recovers short above/below-threshold excursions
between its ten-minute samples. It also distinguishes a zero-valued tangency
from a sign-changing crossing and retains exact sampled boundary roots.
These changes establish numerical behavior within the retained model. They do
not qualify physical event accuracy, a continuous date interval, or a release.

## Findings and change

**P1 — `crates/solar-ephemeris/src/lib.rs`, `events_detailed`.** A complete
short daylight/night interval could fit between consecutive grid samples.
The previous sign-only scan then returned `calculated/none_in_window` for a
real modeled crossing. Refining transit did not help: transit optimizes true
centre altitude, while rise/set use a separate crossing margin that includes
the body's instantaneous standard threshold.

The solver retains the existing grid and checks sampled crossing-margin maxima
that remain nonpositive and minima that remain nonnegative. A bounded ternary
search contracts those unimodal brackets to representable-JD resolution,
retaining the best sampled point through rounded ties. A strictly positive
excursion in the signed margin brackets two roots, which use the existing
bisection solver. The search does not assume the extremum itself belongs to
the requested day: each root is filtered separately into `[start,end)` and the
earliest event of each direction is retained.

**P2 — exact coarse-grid zero, same symbol.** The old `negative -> zero` and
`zero -> negative` comparisons could report coincident rise and set at a
tangency. They could also fill both fields at one root of a short excursion,
preventing recovery of the other root. Direct interval bisection now requires
strictly opposite signs. A zero centre sample is classified only with opposite
signs on its two sides; an excursion can still be recovered around that zero.

**P2 — boundary rounding, `refine_grazing_crossings`.** Independent review of
the initial fix showed that wider-bracket bisection could move an already
sampled zero one representable JD below the inclusive start. The final helper
retains that exact zero as the appropriate root. A root at the exclusive end
remains excluded.

No event schema, body threshold, public function, worker deadline or orbital
coefficient changes are part of this fix. The transit algorithm and its
existing subsecond/adjacent-float boundary regressions remain in place.

## Reproduction

An ignored, isolated copy of the pre-change crate reproduced 120-second
analytic positive and negative excursions with both events missing. An
independent bracket search within the same Sun model also found these cases:

| UTC mean-solar day, longitude 0°, elevation 0 m | Latitude | Before | Final expected model roots, JD UTC |
| --- | --- | --- | --- |
| 2026-11-03 | 75.68509740498632° N | Both rise and set absent | Rise 2461347.9869471425; set 2461347.9890555553 |
| 2026-05-03 | 73.2646937471169° N | Set absent | Set 2461164.4955318607; the earlier day's rise remains 2461163.528020356 |

The November upper crossing margin is only +0.0003° (1.08 arcseconds), and all
ten-minute samples are negative. The resulting modeled daylight lasts about
182 seconds. The May lower crossing margin reaches −0.001° before midnight.
These deliberately tuned numerical cases are sensitive to model and atmosphere
errors; the listed times must not be interpreted as measured sunrise/set truth.

Ignored diagnostic files under `build/event-grazing-probe-20261104/` retain the
pre-change source, final source, focused diff, source hashes, probe and before/
after logs. No external reference was synthesized from these modeled values.

## Regression and validation scope

Eight added Rust regressions exercise positive/negative excursions, distinct
margin/altitude extrema, earliest-event selection, absent/tangent cases, exact
grid roots, exact local-day boundaries and both Sun counterexamples. Analytic
20-millisecond excursions are exercised at modern and year-9999 JDs. Exact
boundary roots include zero, modern even/odd and upper-range even/odd binary64
starts. Numerical root tolerances are not physical accuracy budgets.

The final source SHA-256 is
`5ef44f00e5967667167d2c6df83dd37ea81777839df6837a9636a61909e910fc`.
The frozen `after.rs` is byte-identical; an earlier line-ending-only difference
in that diagnostic copy was corrected before final identity verification.

- `cargo test -p solar-ephemeris --lib`: independent review passed all 52 tests,
  including the eight added regressions and prior transit/boundary checks.
- `cargo fmt --all -- --check` and
  `cargo clippy --workspace --all-targets -- -D warnings`: passed.
- `PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py'
  -v`: all 567 tests passed. `python tools/validate_sdlc.py` passed all 27
  requirements; `python tools/validate_docs.py` passed 170 Markdown files;
  `git diff --check` passed.
- `cargo llvm-cov --workspace --all-features --locked --offline
  --fail-under-lines 90 --lcov --output-path
  coverage/production-20261104-grazing-rust.lcov`: all 204 workspace tests
  passed; 8,231/8,607 lines (95.63146%) passed the unchanged 90% floor.
  The same documented Windows ARM64 LLD override was used. The adjacent
  `production-20261104-grazing-rust-coverage-receipt.json` binds all 34 source
  files and the LCOV SHA-256
  `a2b8ff1690af713d02cf3c914d2f4e2f29ada8c65e4d06bc7e74592ef0227414`.
- `python tools/validate_accuracy_evidence.py`: all eight bounded source-theory
  parity records passed. `python tools/validate_vectors.py --report
  build/geometric-vector-after-grazing-20261104.json`: expected exit 1;
  all 160 records are unchanged, including the 29 independent-reference
  failures. The event correction changes no orbit-accuracy conclusion.

The final immutable local artifact is
`build/production-20261104-grazing-final-site`, release
`local-production-grazing-final-20261104`. It was rebuilt with the existing
`tools/build_wasm.py` and `tools/build_web.py`; its base revision identifies
the starting commit, not a committed or hosted candidate. Identity:

- Release manifest SHA-256:
  `64d15f3d5203424be31549e6e57b2c39afc42bfc3f2ccfd76e12ec8fc0d0f26d`.
- Ephemeris WASM SHA-256:
  `f70579126467431cccfceea5e69f11faa001e1eb4c4773c0b141d4a123d5c554`.

`node build/event-grazing-probe-20261104/worker.mjs` exercised the staged
`createSkyWorkerClient`, actual module worker and v3 schema/request binding in
Chrome 156.0.8078.48 on Windows ARM64. Seven complete 117-object snapshots
covered both Arctic cases, Boston, both poles, year 1 and year 9999; all passed
in 0.893–3.001 seconds, below the unchanged 10-second per-job deadline.
The diagnostic also compared all 27 fast-path position coordinates at 16
epochs to the prior range artifact and found bitwise equality. The receipt is
`coverage/production-20261104-grazing-final-worker.json`, bound to the exact
source, probe, artifact manifest and WASM.

`node build/event-grazing-probe-20261104/cancellation.mjs` additionally passed
real pending-request cancellation, recovery in a fresh worker, rejection of
obsolete/replaced results and publication of the latest selected event result.
Its receipt is `coverage/production-20261104-grazing-cancellation.json`.
The local blank test page isolates the production worker modules; these are
not whole-application rendering or physical-device acceptance runs.

An independent read-only review reproduced the grid-root/tangency/boundary
issues and found no remaining actionable code finding in the final delta.
Its callback-count probe measured ordinary sinusoidal crossings unchanged at
236 evaluations, while an always-above/below case increased from 184 to 265.
Two alternating optimized native batches, six measurements per latitude/model,
measured snapshot medians of 525.5→574.5 ms for Boston and 483.5→581.5 ms at
74° latitude. The source-bound diagnostic is
`build/event-grazing-probe-20261104/final-performance.json`. These measurements
establish the added local cost, not a cross-device speed guarantee.

Local artifacts and local browser results do not replace hosted CI,
cross-platform performance, or independent astronomical event qualification.

## Remaining limits

The later [precision-window coefficient change](PRECISION_WINDOW_20261104.md)
replaces VSOP06 with VSOP08. The two native Sun fixtures were independently
rebracketed against that model, preserving their0.1-second tolerance and
adding explicit signs at the otherwise misleading ten-minute grid samples.
For2026-11-03, latitude75.6851502314488 produces roots JD2461347.986947038
and2461347.989055454; for2026-05-03, latitude73.26461985104527 produces
rise2461163.5280210646 and set2461164.4955326924. Independent extrema/root
bisection output is retained in `build/precision-grazing-retune-20261104/`.
These are numerical model regressions. Earlier values/performance/artifact
receipts above remain historical and do not attest the larger coefficient set.

The coarse grid assumes each detected extremum bracket is unimodal; this is
not a root-isolation guarantee for arbitrary high-frequency functions. A
constant zero-valued interval has no uniquely determined crossing time in this
solver. Transit boundary ambiguity retains its existing `failed/unknown`
behavior. No broader event qualification or continuous date envelope is claimed.

Refining previously unsearched extrema adds bounded CPU work, particularly
for high-latitude objects that remain above or below the standard threshold.
The unchanged worker timeout remains the admission limit. Slower physical
devices require their own measurements.

Rollback for this uncommitted local change is to restore the event solver and
its associated regressions from the retained pre-change source; do not discard
unrelated accumulated workspace changes. No deployed system was changed.
