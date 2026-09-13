# PR 107 review follow-up

This record follows the historical [verified local candidate](VERIFIED_BUILD.md).
It does not replace that earlier artifact or its measured results. The follow-up
targets [PR 107](https://github.com/Protonmatter/sol/pull/107), branch
`codex/sol-observation-workspace`, from head
`d338c7ac996f0efa75b0e93ecac7e2958be7793c` against base
`841ba94eabe588f745625a995d20bf6c79ac97f3`.

## Verified review findings

| Review | Problem | Correction and regression scope |
| --- | --- | --- |
| [P1 incident-ray work](https://github.com/Protonmatter/sol/pull/107#discussion_r4000304908) | Up to seven ray integrations per surface vertex multiplied by terrain LOD and animation frames | Profile-bound incident field; no ray shooting in the production vertex path; unchanged independent optical tolerances |
| [P2 terrain retry](https://github.com/Protonmatter/sol/pull/107#discussion_r4000304911) | A rejected detail entry survived the documented layer retry | Off/on explicitly retries the demanded failed body and LOD; ordinary paints do not retry and ready entries remain warm |
| [P2 playback lifecycle](https://github.com/Protonmatter/sol/pull/107#discussion_r4000304912) | Hidden source playback retained a misleading playing state and could stop scheduling on return | Pause on source unavailability; synchronize controls without requiring a drawable canvas; explicit restart retains source time |
| [P2 pending work](https://github.com/Protonmatter/sol/pull/107#discussion_r4000304913) | Leaving the workspace allowed pending terrain and atlas work to complete and upload | Abort loading entries on departure, retain ready entries, and reject stale completions before GPU upload even after reentry |
| [P2 star selection, review body](https://github.com/Protonmatter/sol/pull/107#pullrequestreview-5191071687) | Returning from galactic context could retain stale star details and disabled focus | Clear both star-selection representations; refresh detail, selection status, focus availability and object rows |

The lifecycle tests first reproduced the findings as deliberate failures. They exercise
the actual Orrery module with controlled asynchronous loaders, including cancelled work
that completes after departure and after a new request. They also verify unchanged
scientific epoch/body records and reuse of ready resources.

## Bounded optical implementation

The incident field stores 75,075 samples per body in a 385 by 65 by 3 RGBA32F
layout: 1,201,200 bytes each for Earth and Mars. Each eligible surface vertex reads
eight texels. No incident shooting integration runs in a frame, at startup, or when
terrain LOD changes. The explicit offline generator retains the RK4 reference equations
and records its source, optical profile, lookup domain, binary and browser identities.
Build and runtime admission reject incompatible fields.

The lookup uses the local density gradient and normal curvature to retain ellipsoidal
effects. Physical altitude stays separate from display body inflation. Earth admits
0 to 16 km and Mars -24 to 24 km relative to the optical reference surface; the full
admitted MOLA high-detail mesh fits the supported altitude and curvature domain.
Unavailable fields retain disclosed straight incident transfer. Refraction is demanded
for the selected or anchored close Earth/Mars view; ready fields may also serve that
body when it is no longer selected. Observer and scattering paths remain straight.

The expanded production-shader numerical gate passed 187 assertions across 36 incident
geometries plus transfer/material checks. Direction tolerance remains 0.003 degrees;
each transmission channel retains `0.0002 + 0.002*abs(reference)` admission. The measured
maximum direction difference was 0.00023523 degrees, and maximum absolute transmission
difference was 0.000327275 (the largest fraction of its case-specific allowed error was
45.1%). CPU/GPU field interpolation remained within its separate 0.00005 transmission
limit. These are reference-model comparisons, not measured weather or native GPU claims.

Failed coarse-grid and angle-subtraction candidates remain recorded in ignored build
evidence. The final cosine grid concentrates samples near the horizon; a signed small
bend angle avoids subtracting two large approximate GLSL angles. No tolerance or terrain
detail reduction was used to admit the correction.

## Hosted failure investigation

Both failed workflows exercised synthetic merge
`e2596c2ffe92e8f3f2431cf26c7de166ac86ff0a`, whose parents were the base and PR head
listed above. Local PR-head tests and synthetic-merge hosted tests are distinct evidence.

- Coverage run `34770959773`, job `103760345825`: the first Sun capture exceeded the
  existing 75-second reference-readiness deadline; the failure diagnostic also timed out.
- CI run `34770959982`, job `103760409018`: Sun/Earth image checks progressed, but the
  Earth rotation probe recorded no matching submitted draws in its five-second window.
- These failures are consistent with excessive graphics work, but the logs alone do
  not establish its cause. The original thresholds and deadlines remain unchanged.
- The rotation probe now saves submitted/surface/Earth/duplicate-epoch counts and
  activity, visibility, animation, context-loss and inspection-error evidence before
  assertions, so future failures remain distinguishable.

Independent investigation also reproduced a full-app test routing defect: the staged
bootstrap used `/sol/`, while the harness served only `/`. The extracted preview server
now mounts and navigates the manifest base path. HTTP regressions cover both mounts,
immutable asset paths, mount isolation and malformed base paths. An intermediate route
check verified all 184 then-staged assets by HTTP status, byte count and SHA-256; that
intermediate artifact is not the final rendering qualification.

A context-recovery diagnostic reproduced a false failure in the browser polling
handshake: the native restored event arrived 51.3 ms after the request and the
application callback returned after 104.1 ms, while the polling wait still expired
after ten seconds. The test now retains a main-world native-event promise before
requesting restoration. It enforces the original ten-second event deadline and
separately bounds actual terrain/optics readiness to forty seconds from the request.
Negative controls reject missing, late, unmatched and still-lost restoration events.
No application recovery timeout was changed. Failed polling and diagnostic artifacts
remain preserved separately from the successful full application run.

## Qualification status

The frozen runtime candidate is `build/pr107-review-candidate-02`, mounted at `/sol/`,
with namespace `releases/pr107-review-candidate-02/` and 188 admitted assets. Its release
manifest SHA-256 is
`ae731256fd691c6a0651371b04fb59f87cf02b7e43b02179d3e314e2b17b1215`.
The manifest records the starting revision above; per-file hashes identify this
working-tree preview. It is not a claim that the uncommitted preview was already a
GitHub release. WASM was freshly rebuilt with the lockfile; engine sources did not change.

| Command or gate | Local result |
| --- | --- |
| `python tools/build_wasm.py --locked --out-root build/pr107-review-wasm` | Passed; fresh solar and ephemeris WASM |
| `npm test` | 919 tests passed |
| `node tools/check_node_coverage.mjs` | Passed unchanged 90% thresholds: lines 98.01%, branches 91.32%, functions 94.79% |
| `node tools/collect_node_coverage.mjs --web-root=build/pr107-review-candidate-02 --output-dir=build/pr107-review-d338c7a/node-complete` | 919 tests passed; complete staged runtime denominator collected |
| `PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py' -v` | 352 tests passed, including 18 physical asset admission tests |
| `python tools/typecheck_web.py` | 97 files passed |
| `python tools/validate_web_static.py` | Passed |
| `node tools/atmosphere_validation.mjs --web-root=build/pr107-review-candidate-02 --out=build/pr107-review-d338c7a/atmosphere-final` | 187 assertions passed; unchanged numerical limits |
| `node tools/incident_budget_validation.mjs --web-root=build/pr107-review-candidate-02 --out=build/pr107-review-d338c7a/incident-budget-final` | Both actual MOLA mesh extremes passed; 4,753 common vertices retained identical illumination |
| `node tools/physical_rendering_validation.mjs --web-root=build/pr107-review-candidate-02 --out=build/pr107-review-d338c7a/physical-final-pass --context-loss` | 19 checks and 20 full-page/canvas capture pairs passed; no source mismatches, page/console/shader/GL errors or failed requests |
| `node tools/browser_validation.mjs --web-root=build/pr107-review-candidate-02 --output-dir=build/pr107-review-d338c7a/browser-final` | Complete Sun/Sky/System journey passed; four Earth draws measured 0.1885 rad, frozen-transform control rejected, orbit round-trip pixel delta zero |
| `node tools/planet_appearance_validation.mjs --web-root=build/pr107-review-candidate-02 --out=build/pr107-review-d338c7a/planet-appearance-final` | 93 assertions passed |
| `node tools/ring_appearance_validation.mjs --web-root=build/pr107-review-candidate-02 --out=coverage/pr107-review-ring-appearance-final` | 11 assertions passed; tool's existing output-root restriction preserved |
| `node tools/terrain_shadow_validation.mjs --web-root=build/pr107-review-candidate-02 --out=build/pr107-review-d338c7a/terrain-shadow-final` | 32 assertions passed |
| `node tools/solar_appearance_validation.mjs --web-root=build/pr107-review-candidate-02 --out=build/pr107-review-d338c7a/solar-appearance-final` | 17 assertions passed |
| `node tools/planet_phenomena_validation.mjs --web-root=build/pr107-review-candidate-02 --out=build/pr107-review-d338c7a/planet-phenomena-final` | 8 assertions passed |

Combined coverage uses the final staged Node input at
`build/pr107-review-d338c7a/node-complete/coverage-final.json` and Chromium input at
`build/pr107-review-d338c7a/browser-final/coverage-final.json`, with
`node tools/merge_web_coverage.mjs --web-root=build/pr107-review-candidate-02` and
the corresponding `--node-input`, `--browser-input` and `--output-dir` arguments.
The complete 90-module runtime denominator passed the unchanged 90% line gate at
96.90% (12,874 of 13,285 lines). The four final context tests cover tooling; the
collected application coverage is byte-identical to the preceding 915-test collection.

The maximum-detail incident gate exercised 74,305 vertices and read back 668,745 finite
components. Its three warm vertex-draw/readback samples were 6.8, 6.6 and 6.9 milliseconds
under Chrome 151 / SwiftShader. This measures the vertex pass on this host; it does not
qualify complete-scene frame rate or native GPU performance. The complete admitted MOLA
mesh ranged from -7.0163 to 22.1211 km and remained inside the incident field domain.

The successful full application run took 64.4 seconds. Its native restoration event
arrived after 43.8 ms, the synchronous app callback returned after 107.3 ms, and actual
Mars terrain/incident-field rendering was ready after 14,350.8 ms. The engine epoch and
complete body records stayed unchanged through recovery, source playback, camera/layer
changes and the 390-pixel viewport. All five historical observation images loaded with
their admitted native dimensions and source links.

Independent lifecycle, loader, provenance and numerical reviews found no additional
actionable P0-P2 after correction. Twelve extra off-grid numerical cases passed the
original limits. A separate boundary-straddling Mars sample at -0.14 km, latitude
40 degrees, azimuth 119 degrees and zenith 90.0043 degrees exposed a roughly
0.000354-degree horizon displacement: its field transmission is nonzero while the
reference ray is occluded. That sample is recorded as a limitation, not included in
the passing transmission count. Its approximately 21 m horizon scale falls inside
the documented exclusions for sub-triangle horizon precision and uniform all-rays
accuracy; it does not establish a visible rendering defect or empirical calibration.

Local qualification is complete for this source snapshot. Hosted results are recorded
separately by the PR checks for the published head and synthetic merge; these local
results do not establish their outcome. The full Rust test suite was not rerun locally
for this rendering/tooling follow-up; the fresh locked WASM build passed and Rust sources
are unchanged. Native GPU frame rate, other browser engines, physical mobile devices,
empirical atmospheric calibration and deployment remain unqualified. No engine/schema/
ephemeris change, merge or deployment is part of this task.

## Changed-file inventory

This inventory records all 36 new or modified files reported by
`git ls-files -m -o --exclude-standard` for the review follow-up before publication.
Ignored build artifacts, screenshots, and raw validation evidence are not committed.

| Path | Review follow-up change |
| --- | --- |
| `.gitattributes` | Preserve numerical `.f32` fields as binary bytes. |
| `.github/workflows/coverage.yml` | Run the terrain incident-work budget gate and retain its evidence. |
| `apps/web/data/optics/earth-incident-v1.f32` | Add the generated Earth incident-refraction and optical-column field. |
| `apps/web/data/optics/mars-incident-v1.f32` | Add the generated Mars field covering admitted negative and positive terrain heights. |
| `apps/web/index.html` | Preload the incident-field runtime and manifest modules. |
| `apps/web/js/atmosphereIncident.js` | Admit and load pinned numerical fields; perform bounded interpolation with explicit domain checks and cancellation. |
| `apps/web/js/atmosphereIncidentManifest.js` | Bind field bytes, dimensions, domains, profiles, generator, and consumer identities. |
| `apps/web/js/atmosphereShaders.js` | Identify the retained RK4 shader as the offline field generator. |
| `apps/web/js/orrery.js` | Integrate incident caching; correct terrain retry, resource cancellation, source playback, and star-selection lifecycle. |
| `apps/web/js/orreryShaders.js` | Replace per-vertex shooting integration with the bounded incident-field lookup. |
| `apps/web/js/physicalRendering.js` | Abort pending cache work while retaining completed resources. |
| `docs/OPERATIONS.md` | Document optical-field operation, retry, cancellation, and rendering qualification limits. |
| `docs/SPEC.md` | Specify cached incident transport and its source, model, and lifecycle boundaries. |
| `docs/VALIDATION_PLAN.md` | Add field-admission, numerical, work-budget, and lifecycle validation requirements. |
| `docs/plans/2026-09-13-physical-rendering/IMPLEMENTATION.md` | Record the review follow-up and final implementation checkpoints. |
| `docs/plans/2026-09-13-physical-rendering/OPTICS_SOURCES.md` | Record field provenance, generation, interpolation, numerical comparisons, and limitations. |
| `docs/plans/2026-09-13-physical-rendering/PR_REVIEW_FOLLOWUP.md` | Map review findings to corrections, validation evidence, and this complete inventory. |
| `docs/requirements.json` | Link optical, terrain, and solar requirements to the new implementation and regression evidence. |
| `docs/rfcs/0005-physical-rendering.md` | Align the accepted rendering contract with bounded lookup work and resource lifecycle guarantees. |
| `tests/python/test_physical_assets.py` | Reject missing, corrupt, rebound, invalid, or identity-inconsistent incident products. |
| `tests/web/atmosphereIncident.test.mjs` | Verify field geometry, work bounds, load integrity, cancellation, deadlines, and both admitted bodies. |
| `tests/web/contextRestore.test.mjs` | Verify retained native restoration evidence, the original deadline, and missing, late, or unmatched events. |
| `tests/web/helpers/orreryHarness.mjs` | Provide explicit incident/terrain/atlas I/O boundaries and record GPU uploads and queued notifications. |
| `tests/web/orreryIncidentLifecycle.test.mjs` | Cover field abort, retry, resource retention/release, stale callbacks, and cache/context replacement. |
| `tests/web/orreryPhysicalLifecycle.test.mjs` | Cover terrain retry, source controls, inactive and zero-width views, star selection, and scientific-state preservation. |
| `tests/web/physicalRendering.test.mjs` | Verify pending-only cache cancellation and release of late results. |
| `tests/web/stagedPreviewServer.test.mjs` | Verify declared base-path mounts, immutable asset routes, isolation, and malformed-path rejection. |
| `tools/atmosphere_validation.mjs` | Validate production lookup interpolation and incident transport against the numerical reference. |
| `tools/browser_validation.mjs` | Retain rotation-probe draw, epoch, visibility, and context diagnostics before assertions. |
| `tools/build_web.py` | Admit and fingerprint incident-field runtime, manifest, and numerical assets in staged builds. |
| `tools/context_restore.mjs` | Retain the matching native context-restoration promise and separate event and application-callback timings. |
| `tools/incident_budget_validation.mjs` | Exercise minimum and maximum MOLA mesh detail and compare retained vertices, finite output, and work cost. |
| `tools/physical_rendering_validation.mjs` | Use declared preview routes, require incident-field readiness, and verify full-app rendering and context recovery. |
| `tools/prepare_atmosphere_incident.mjs` | Generate deterministic incident fields with the retained bounded solver and provenance identities. |
| `tools/staged_preview_server.mjs` | Serve an immutable staged candidate under its declared site base path. |
| `tools/validate_physical_assets.py` | Enforce field bytes, sample bounds, schema, source identities, and reviewed generator-template admission. |

## Hosted Node 22 profile identity follow-up

Commit `34eea2785cb63937755187361b1b805e8c1f95b5` published the review corrections
above. All four inline threads were answered and resolved, and the older star-selection
review received a response. Hosted CI then exposed an additional portability defect:
Earth field admission failed under Node 22.23.2 before transfer. Mars admission passed.
CI run `34775925042` failed jobs `103773896332` and `103773954708`; standalone Coverage
run `34775924923` failed job `103773896206`. The release gate consequently failed.
Rust tests, Rust coverage/lint, cross-OS engine determinism, WASM, immutable web staging,
Python coverage and governance passed on that published head.

The same two failing tests were reproduced locally with an official checksum-verified
portable Node 22.23.2. Its middle Earth Rayleigh coefficient is
`0.01355776244792022`; Node 24.18.0 produces `0.013557762447920221`. The raw serialized
profile hashes differ even though the values map to the same GPU binary32 coefficient.
The original immutable source and numerical-field bytes were intact; no data corruption
was involved. Logs and the downloaded tool checksum remain in the ignored
`build/pr107-review-34eea27/` evidence directory.

The correction uses the shared `serializeAtmosphereProfile()` and the explicit
`atmosphere-profile-binary32-v1` encoding. SHA-256 binds versioned UTF-8 JSON with
typed nodes, sorted object keys, ordered arrays, semantic metadata and exact
big-endian binary32 words. It preserves signed zero and rejects nonfinite, overflowing
or unsupported values. Runtime admission, offline generation and the incident budget
gate use the same serializer. Runtime and Python release admission reject missing or
obsolete encodings; the former raw Float64 identity is no longer admitted.

This is an identity correction. Independent comparisons against `34eea27` prove that
the original Float64 profiles, uniform objects, derived radius-layer inputs and both
1,201,200-byte numerical fields are unchanged. Expanded generation GLSL remains
`6ea483ed5112d1eba16a0db8584a87da99858166fb8f0edc45e32d4fd3a97941`.
Numerical formulas, physical parameters, shader code and tolerances are unchanged.

Regressions retain the observed Node 22/24 coefficient pair, reject a changed adjacent
binary32 coefficient, and test encoding version, metadata, ordering, type separation,
signed zero, nonmutation and invalid inputs. Canonical replay produces identical full
identities and hashes under both runtimes. The stream-deadline test also now waits for
the reader to start before advancing its existing 10 ms mocked deadline. This removes
a race in which real hashing could consume the test deadline before a reader existed;
the production 20-second whole-operation deadline is unchanged.

## Additional review on the published correction

Review [5191828092](https://github.com/Protonmatter/sol/pull/107#pullrequestreview-5191828092)
examined `34eea27` and identified two further P2 findings:

| Review | Problem | Correction |
| --- | --- | --- |
| [Optional incident fields](https://github.com/Protonmatter/sol/pull/107#discussion_r4000560266) | Both numerical fields entered the critical service-worker precache, adding 2,402,400 bytes to every install | Keep the fields in the immutable release inventory as optional assets; retain on-demand hash verification and critical core assets |
| [Ready solar atlas](https://github.com/Protonmatter/sol/pull/107#discussion_r4000560268) | Restarting playback evicted a ready texture and repeated immutable download, verification, decode and upload | Restart playback while retaining ready/loading entries; retry only an unavailable atlas |

Both findings were reproduced by new regressions before the fixes. The build exception
names only the two admitted `.f32` paths; other data, runtime modules, manifests, core
HTML/JavaScript and both WASM engines retain their critical classification. Source and
staged admission still require valid field bytes. The actual service-worker harness
consumes an unedited generated manifest: installation and activation succeed with both
optional responses missing, neither field is fetched at install, a same-size corrupt
field is rejected and not cached, and a verified demanded field is cached. Missing core
`app.js` still rejects installation. Three new build tests, 25 existing release-artifact
tests and four service-worker tests passed.

The playback handler now calls `retry('reference')` only when the live cache entry is
`unavailable`. Three actual-Orrery regressions verify no extra transfer, texture release
or upload for ready entries; no cancellation or duplicate request for loading entries;
explicit recovery after failure; and reuse of the recovered entry. Cached source
playback remains usable when the source becomes offline, and paused epoch/body records
are unchanged. The focused Node 22 lifecycle suite passed 68 tests.

### Final follow-up qualification

The final source passes 926/926 JavaScript tests with both the checksum-verified
Node 22.23.2 runtime and installed Node 24.18.0. The complete Python 3.14.3 suite passes
356/356 tests with Node 22 on `PATH` for the service-worker integration. Type checking
passes for 97 files and static web validation passes. Node-only coverage retains its
complete denominator and 90% thresholds: lines/statements 22,462/22,917 (98.01%),
branches 5,395/5,905 (91.36%), and functions 694/732 (94.80%). Source coverage JSON
SHA-256 is `dd56d6f9e8134458b337fad1860eb2aa3761f18b94828f4c135ee3b3bd01b27f`.

The immutable local preview is `pr107-review-candidate-03`, staged from `apps/web`
with the previously verified locked WASM, `/sol/` base path, and 188 assets. Manifest
SHA-256 is `c86408649eb00c48c60be893bbd3bd6385cb9ea2534f026607cc4cffc2da5640`.
It records starting revision `34eea2785cb63937755187361b1b805e8c1f95b5`; per-file
source hashes bind the working-tree preview. It is not an exact committed or hosted
artifact. Both original field hashes are unchanged and their manifest roles are
`optional`. The first staging invocation rejected a source root of `.` because source
and output overlap; it created no candidate. The successful invocation uses `apps/web`.

Candidate-03 graphics checks pass 187/187 optical assertions with the existing
direction/transmission tolerances. The production incident-work gate passes at 4,753
and 74,305 vertices, with finite day/night outputs and exactly zero maximum illumination
difference across shared LOD points. Warm maximum-LOD vertex draw/readback took
7.1-7.3 ms on software WebGL; this is component evidence, not full-scene native FPS.

The full physical application passes 19 checks and 20 screenshot pairs, including
source playback, Earth night-light/optics comparisons, Moon/Mars terrain, all five
historical source images, context recovery and the 390-pixel layout. Native restoration
arrived after 3.0 ms; actual terrain/optical rendering was ready after 15,490.2 ms, within
the unchanged 10-second event and 40-second readiness limits. Source differences,
page errors and console errors are empty. The run spanned 19:19:29.365-19:20:45.603 UTC
on 13 September 2026. Root visually inspected the resulting Earth and Sun screenshots.

The original browser journey also passes, with the existing 5-second rotation and
75-second source-readiness deadlines. It records 0.1885 radians of Earth rotation
over four submitted draws, zero orbit-frame mean pixel difference, and passing Sun,
Earth and all four Io transit/eclipse/control frames. The frozen-transform negative
control remains enforced. Browser-only line coverage is 86.27%; unexecuted modules
remain in its denominator and this is not presented as the combined gate result.

Fresh staged Node 22 collection passes 926/926 tests and retains 90 modules. Staged
Node line coverage is 12,528/13,322 (94.03%); combined Node plus Chromium line coverage
is 12,911/13,322 (96.91%), exceeding the unchanged 90% gate. Combined branch coverage
is 5,857/6,201 (94.45%) and function coverage is 719/745 (96.51%). Staged source mapping
and source-only execution reports have distinct denominators; they are not substituted
for each other. Their coverage JSON SHA-256 identities are:

- Staged Node: `ed183a5fd22b42af9ad7cf2deaa96fe577c4ac18955af115e22d6c1a18150df3`.
- Chromium: `abcabcae3d3760292385cf577017766cbefa96faa8d2bba036dbc5a81ddbc871`.
- Combined: `514c1dba7c22972e390cfb7577b4e36b73bee32b7deaac279b22ca2e9b278457`.

Final commands include `node --experimental-vm-modules --test tests/web/*.test.mjs`
under both runtimes, `python -m unittest discover -s tests/python -p 'test_*.py' -v`,
`python tools/typecheck_web.py`, `python tools/validate_web_static.py`, and
`node tools/check_node_coverage.mjs`. Staged gates use `--web-root` pointing at
`build/pr107-review-candidate-03` with `tools/atmosphere_validation.mjs`,
`tools/incident_budget_validation.mjs`, `tools/physical_rendering_validation.mjs`,
`tools/browser_validation.mjs`, `tools/collect_node_coverage.mjs` and
`tools/merge_web_coverage.mjs`. Exact commands, output paths and hashes are retained
in `candidate03-commands.txt` and the coverage evidence files. Final docs, 23-requirement
SDLC, UX structure, strict UTF-8 and diff checks pass.

Local qualification is complete. Hosted results must be checked separately on the
published head and synthetic merge. The earlier candidate-02 component results remain
historical; unchanged shader and numerical-field bytes do not relabel that artifact.
Native GPU frame rate, other browser engines, physical mobile devices and empirical
atmospheric calibration remain unqualified. No merge or deployment is included.
Evidence remains in ignored `build/pr107-review-34eea27/`.

### Additional correction inventory

These 18 paths change after `34eea27`. Numerical field files are unchanged. Combined
with the preceding 36-file inventory, the complete review follow-up touches 39 unique
paths; ignored build evidence and downloaded validation tools are excluded.

| Path | Additional change |
| --- | --- |
| `apps/web/js/atmosphereOptics.js` | Define the shared versioned binary32 identity serializer without changing physical profiles. |
| `apps/web/js/atmosphereIncident.js` | Require the encoding version and canonical profile digest before transfer. |
| `apps/web/js/atmosphereIncidentManifest.js` | Record canonical profile identities and updated source bindings. |
| `apps/web/js/orrery.js` | Preserve ready/loading solar atlas entries during playback restart. |
| `tools/build_web.py` | Make only the two admitted incident fields optional installation assets. |
| `tools/prepare_atmosphere_incident.mjs` | Use the shared identity when generating field metadata. |
| `tools/incident_budget_validation.mjs` | Validate the shared identity and encoding version. |
| `tools/validate_physical_assets.py` | Reject obsolete or missing encoding versions during build admission. |
| `tests/web/atmosphereProfileIdentity.test.mjs` | Cover cross-runtime identity, changed GPU values, typed encoding and invalid inputs. |
| `tests/web/atmosphereIncident.test.mjs` | Cover obsolete identity rejection and deterministic stream cancellation. |
| `tests/web/orreryPhysicalLifecycle.test.mjs` | Cover ready/loading retention and explicit recovery on restart. |
| `tests/python/test_physical_assets.py` | Cover encoding-version admission for both bodies. |
| `tests/python/test_incident_release_build.py` | Cover optional installation, demand-time integrity and strict build inputs. |
| `docs/SPEC.md` | Specify the stable profile identity contract. |
| `docs/rfcs/0005-physical-rendering.md` | Align design and acceptance with the versioned encoding. |
| `docs/plans/2026-09-13-physical-rendering/OPTICS_SOURCES.md` | Define the encoding, source bindings and unchanged numerical contract. |
| `docs/requirements.json` | Link the new identity and installation regressions to `SOL-VIS-006`. |
| `docs/plans/2026-09-13-physical-rendering/PR_REVIEW_FOLLOWUP.md` | Preserve review, reproduction, validation and changed-file evidence. |
