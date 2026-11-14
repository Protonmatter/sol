# Production readiness investigation — 2026-11-03

Status: in progress. Sol is not fully qualified for production by this report.
The later [apparent-coordinate epoch study](APPARENT_EPOCHS_20261104.md) retains
27 failures among 144 independent matched-TT directions and separates the Sky
and System planetary model paths. Full-span apparent accuracy remains held.
This is the initial checkpoint; the [native optical-program follow-up](NATIVE_OPTICS_20261103.md)
records the subsequent shader correction and its separate qualification evidence.
The [astronomy reference follow-up](ASTRONOMY_REFERENCE_20261103.md) records the
later raw Horizons corpus, offline/native pointing regressions and evidence-gate
corrections; its scope does not clear the continuous scientific accuracy holds.
The [extended rendering matrix](RENDERING_MATRIX_20261103.md) records the later
seven passing local appearance, optical, terrain and observation validators.
The [coefficient recovery](COEFFICIENT_RECOVERY_20261103.md) subsequently adds
two exact source-to-blob reconstructions and records the upstream notice
discrepancy; distribution correspondence remains held.
The [lunar range follow-up](LUNAR_RANGE_20261103.md) adds independently captured
Q20 references, corrects the missing Earth light-time displacement and tightens
provider/reference parsing, with separate source-bound runtime validation.
The [Rust coverage follow-up](RUST_COVERAGE_20261103.md) subsequently passes the
existing 90% local line gate at 95.32%, including all 196 workspace tests.
The [native canonical moon follow-up](CANONICAL_MOON_20261103.md) subsequently
qualifies the unchanged moon generation contract with two exact-image VM runs
and independent review. It does not qualify the full production release.
The [geometric-vector investigation](GEOMETRIC_VECTORS_20261104.md) subsequently
records the independent deep-time failures without changing budgets or the
supported calendar. The [grazing-event correction](GRAZING_EVENTS_20261104.md)
then fixes short horizon excursions and exact-zero boundary handling, with a
separate rebuilt WASM artifact, worker checks and fresh 95.63% Rust coverage.
Requirements: `SOL-SCI-001`, `SOL-TEST-001`, `SOL-COV-001`, `SOL-VIS-001`,
`SOL-REL-001`. The research/learning operational boundary remains unchanged.

## Candidate identity and scope

The inspected checkout matches remote master at
`3a55a795767f3043112673ea561cdaf6dc7e2d0f`. The moon-time patch is uncommitted.
The older sibling `repo` checkout has pre-existing changes and was not edited.
No commit, push, merge, deployment, dependency installation, generated moon-table
replacement, or change to a qualification threshold was performed.

The local staged artifact is `build/production-20261103-site`, release ID
`local-production-20261103`. Its manifest SHA-256 is
`508f43a4f74e596d12da933a40a796ca730bc7c98199ff1fa85bf432eb26ee4a`.
Its base SHA identifies the starting revision; per-file source and staged hashes
bind the uncommitted runtime changes. It is not a hosted release artifact.

Runtime observations: Windows ARM64, Node 24.18.0, Python 3.14.3, Cargo 1.96.0,
Chrome 156.0.8078.48. These differ from some pinned CI runtimes. Native WebGL
identified Qualcomm Adreno X1-85 through ANGLE D3D11; the default browser suite
separately identified SwiftShader. Launch flags alone were not used as GPU proof.

## Verified defect and correction

P2 — `apps/web/js/moonorbits.js`, `moonElementsAt` / `withinMoonValidity`:
Horizons satellite element knots and held-out vectors use TDB, but interpolation
and validity checks used a UTC Julian date. The existing browser-model vector
test made the same time-scale mistake in its input conversion, masking the error.

The patch retains the public UTC behavior of `jdFromUnix` and converts the moon
lookup epoch to TT with the engine's latest known offset: TAI−UTC = 37 seconds,
TT−TAI = 32.184 seconds. TT approximates TDB within 2 milliseconds, appropriate
to this view's 0.15-degree interpolation budget. This helper is scoped to the
shipped 2021–2030 satellite tables; it is not a historical time service. Future
leap seconds remain unknown. See [the accuracy contract](ACCURACY_CONTRACT.md)
and [Horizons time scales](https://ssd.jpl.nasa.gov/horizons/manual.html#time-scales).

Across all 11,985 committed held-out vectors, comparing the actual UTC instant:

| Measurement | Before correction | After correction |
| --- | ---: | ---: |
| Worst angular error | 0.935032° — Phobos | 0.138427° — Nereid |
| Worst radial error | 0.190389% | 0.189321% |
| Required limits | 0.15° / 0.25% | unchanged |

The corrected reference test and new synthetic epoch/boundary tests were first
observed failing on the original implementation, then passing with the patch.
The synthetic test anchors UTC to a calendar date independently of the production
conversion. A separate read-only review reported no actionable finding in the
three-file numerical patch and independently passed 45 focused moon tests.

P2 — `tools/physical_rendering_validation.mjs`, `paintAction('close-terrain')`:
the optional high-detail check waited for a level-4 terrain draw after reducing
the inherited system-camera distance by a fixed factor. At one observed Mars
distance (0.317 AU), that left the globe below the level-4 resource threshold;
the mesh never became demanded and the 40-second wait expired despite ready
terrain and optics. The tool now captures one actual terrain draw and uses its
observed display radius for close framing. It identifies Moon/Mars by the
admitted terrain reference datum and ground-draw mode, including the Moon's
enlarged display separation. Transparent shells can retain old terrain uniforms;
the mode check excludes those draws. Missing observed scale fails explicitly. Additional GL queries run
only during that preparation repaint. Application camera behavior is unchanged;
the original source, buffer, draw-count and optical assertions remain required.
Mars, displaced-Moon and stale-shell regressions were observed failing before
their fixes. The software-browser run subsequently submitted actual level-4
Moon and Mars meshes (131,841 vertices, 783,360 indices), passed context
restoration with nonblank restored output, and completed the animated Mars
terrain/physical-optics/HDR draw checks. This proves the tool path on observed
SwiftShader; the native startup reliability hold below remains open.

## Executed validation

| Command or check | Observed result |
| --- | --- |
| `npm test` | 1,405 passed on the final code/test tree; no failures or skips |
| `node --experimental-vm-modules --test tests/web/moons.test.mjs tests/web/moonOrientation.test.mjs tests/web/moonShadows.test.mjs tests/web/moonlock.test.mjs tests/web/motionContract.test.mjs tests/web/displayGeometry.test.mjs` | 62 passed |
| `PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py'` | 506 passed; expected injected lifecycle errors did not fail the suite |
| `cargo test --workspace --locked --offline` | 194 tests passed across workspace binaries/libraries; doc tests passed |
| `cargo fmt --all --check` | passed |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | passed |
| `python tools/validate_sdlc.py` | 27 requirements and workflow/traceability checks passed |
| `python tools/validate_docs.py` | 150 Markdown files passed after adding this report |
| `python tools/validate_ux_contract.py` | passed |
| `python tools/typecheck_web.py` | 122 files passed with TypeScript 5.9.3 |
| `python tools/validate_web_static.py` | passed |
| `python tools/validate_body_motion.py` | 10 body spins, 21 moon periods and seven speed presets passed |
| `python tools/validate_body_constants.py` | pinned constants and shader hygiene passed |
| `python tools/validate_accuracy_evidence.py` | eight bounded source-theory parity records passed; no independent accuracy claim |
| `python tools/check_eop_freshness.py` | approximately 240 days of prediction coverage remaining |
| `python tools/build_wasm.py --locked --out-root build/production-20261103-wasm` | both engines built with offline Cargo |
| `python tools/build_web.py --wasm-dir build/production-20261103-wasm --out-root build/production-20261103-site --release-id local-production-20261103 --source-sha 3a55a795767f3043112673ea561cdaf6dc7e2d0f --repository Protonmatter/sol --run-id 1` | staged and hash-validated |
| `node tools/check_node_coverage.mjs` | lines 98.28%, branches 91.22%, functions 96.12%; each exceeds 90% |
| `node tools/collect_node_coverage.mjs` followed by `node tools/merge_web_coverage.mjs`, with this staged artifact and fresh Node/Chromium inputs | whole hand-written runtime line coverage 97.48%; minimum 90% |
| `node tools/browser_validation.mjs --web-root=build/production-20261103-site --output-dir=coverage/production-20261103-browser` | passed on observed SwiftShader |
| `node tools/physical_rendering_validation.mjs --web-root=build/production-20261103-site --out=coverage/production-20261103-physical-native-repro --backend=native` | passed on observed Adreno GPU; see first-run failure below |
| `node tools/physical_rendering_validation.mjs --web-root=build/production-20261103-site --out=coverage/production-20261103-physical-swiftshader-ground --backend=swiftshader --context-loss --mars-optical-animation --terrain-close-detail` | passed on observed SwiftShader: both L4 meshes, source/buffer identities, context restoration, optical fields, animated Mars and matching HDR final draws |
| Python coverage using the unchanged workflow include list and `--fail-under=90` | 36 provider tests plus 506 Python tests passed; reported aggregate statement/branch coverage 91%, gate passed with local coverage.py 7.13.5 (CI pins 7.15.2) |
| Focused framing/startup/restoration suites | 13 passed, including displaced-Moon and stale-shell regressions |

The source-parity validator initially could not read its historical reference in
the shallow clone. Fetching only commit
`25efcd528c13bb46a0caf364b37b98801232e7be` restored that immutable evidence;
no source or validator behavior was changed.

The Chromium suite exercised actual staged WASM, camera controls, Sun color,
Earth oceans, illustrative planet appearances, rotation, transit shadows and
eclipse dimming. Camera round-trip mean channel delta was zero; the Io shadow
centroid was within 0.5 pixels of its predicted position. The passing native
physical run loaded real terrain workers, both height assets and optical fields,
verified source playback and galleries, and checked a 390-pixel viewport.
Screenshots were inspected locally. These observations do not certify all
devices, physical mobile input, screen readers or astronomical calibration.
The final expanded software run retained four submitted Mars animation draws,
with 0.188495 radians of rotation, source-bound terrain, optical fields and HDR.
Its context restoration completed within the original 40-second budget and
retained a decoded nonblank frame. Native expanded attempts failed earlier at
the original shader-completion gate; they do not qualify those same features
on the device.

## Open findings and qualification work

1. P1 initial reliability finding, **addressed for the tested local candidate** by
   the [native optical-program correction](NATIVE_OPTICS_20261103.md). The original
   evidence follows for traceability. `shaderPrograms.js` / physical
   `scatteringGenerator`: the first native physical run exceeded the existing
   30,000 ms shader-completion budget and retained the disclosed haze fallback.
   The exact same staged bytes passed on the next native run; later attempts
   reproduced the timeout before entering the close-detail checks. An isolated
   compile of the 37,637-character generator completed and linked in 19,364 ms.
   The initial run overlapped another browser validation; that is a possible
   contributor, not a proven cause. Preserve both outcomes and measure repeated
   startup under controlled load. Record each program's request, submission,
   polling gaps, first completion and document visibility before attributing
   slow compilation versus delayed polling. Do not
   increase the deadline or remove numerical work to hide the failure.
2. P2 reproducibility/qualification hold, **addressed for the current moon assets**
   by the [native exact-image follow-up](CANONICAL_MOON_20261103.md). The initial
   diagnostic `python tools/validate_moons.py`
   fails because this noncanonical Windows ARM runtime does not reproduce the
   reviewed generated bytes. The authoritative files were preserved. This
   platform-dependent issue and the required pinned Linux x86_64 two-run
   procedure are documented in [canonical generation](CANONICAL_GENERATION.md).
   Two later native Linux x86_64 image runs reproduced the reviewed hashes and
   passed all 11,985 checks; independent review preceded metadata qualification.
   The initial Windows inspection found no Docker CLI. The later WSL inspection
   found an ARM64 Docker daemon, which does not establish native x86_64 evidence.
3. Current immutable v3 evidence still does not qualify continuous independent
   planetary/lunar apparent-place, range and event accuracy. A separate raw
   [36-sample observer corpus](ASTRONOMY_REFERENCE_20261103.md) now provides a
   repeatable offline pointing regression, and the later
   [72-response range pack](LUNAR_RANGE_20261103.md) supplies sampled range
   regressions. Neither promotes UI accuracy status. The November 2
   weekly Horizons run `41397768616` passed at the unchanged master SHA, but its
   sampled network checks do not replace the missing evidence domains in
   [the validation plan](VALIDATION_PLAN.md) and [v3 contract](EPHEMERIS_V3.md).
4. Fresh Rust line coverage was initially unavailable. The later
   [local LLD run](RUST_COVERAGE_20261103.md) passed at 95.32% with all 196 tests;
   the failed default-linker profile run was retained separately.
   The remaining configured local GPU comparison tools subsequently passed in
   the [extended rendering matrix](RENDERING_MATRIX_20261103.md); the complete
   hosted CI/platform matrix has not run for this uncommitted candidate.
   Local Python coverage used the existing installed version, not CI's exact
   pin. Unit-test success does not establish missing coverage or platform gates.
5. Full cross-platform performance, native-browser repeatability, physical
   mobile/browser coverage, accessibility, accepted scientific evidence,
   protected release policy, served-byte verification and production rollback
   remain separate work. Existing provenance and scientific qualification holds
   in [status](STATUS.md) and [coefficient provenance](COEFFICIENT_PROVENANCE.md)
   have not been cleared by this patch.

## Retained local evidence and rollback

Fresh browser/coverage/native evidence is under
`coverage/production-20261103-*`. The first native failure and successful repeat
have separate directories; neither was overwritten. Logs are in the parent
workspace as `sol-production-*-20261103.log`. Generated evidence stays ignored
by Git. The staged manifest binds tested runtime bytes, not later documentation.

Rollback is limited to the reviewed moon-time and validation-framing patches
and their tests/docs. Use the
diff to reverse only those hunks; preserve any later unrelated edits. Delete no
source data and regenerate no moon table. No live release was changed, so this
local rollback requires no production action. Do not label the goal complete or
promote a release until the remaining qualification evidence is satisfied.
