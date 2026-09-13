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

## Hosted rendering follow-through on `bab45fd`

Commit `bab45fdf62febe2c1535cb11529d4c249bb5c475` published the 18-file follow-up.
Both additional threads were answered and resolved; the subsequent readback has 18
total threads and zero unresolved. The source and portable-profile correction passes
hosted Linux Node 22.23.2: 926/926 tests and 97 typechecked files. The hosted immutable
artifact manifest is `37debffdd350e66ce9d8c6af410fee8488d8f3de084aa5dc32ec6acca9d461ed`.
The synthetic merge is `2a829587c6ae8557b84c06dbebe5f292c0496e26`, with parents
`841ba94eabe588f745625a995d20bf6c79ac97f3` and the published head.

Two remaining graphics failures prevent a hosted release-gate success:

- CI run `34777710433`, reusable JavaScript job `103778920137`: the original browser
  gate reports `insufficient Earth sphere draws: 0`. Its five-second nominal probe
  records no completed `drawElements` calls, with the view active, animation enabled,
  document visible, context alive and Earth selected. This does not establish why
  frames were absent. The early failure artifact omitted the separately collected
  page/console errors, and did not record native RAF delivery or actual elapsed time.
  A synchronous rendering exception therefore remains unruled. The dependent release
  gate fails correctly because the aborted run did not produce combined coverage.
- Standalone Coverage run `34777710327`, JavaScript job `103778751127`: the original
  browser gate passes with three Earth samples, 108 indexed draws, 0.12566385 radians
  and the frozen-transform negative control. All component gates pass: planet 93,
  rings 11, optics 187, high-LOD incident work, terrain 32, solar 17 and phenomena 8.
  The integrated sequence then exhausts its 240-second overall budget after 11 checks
  and 13 captures. Native context restoration arrives after 59.3 ms, but callback and
  rendered-readiness completion do not occur before the overall deadline. No page or
  console errors are present in this separate full-application artifact.

CI finishes with 14 successful jobs and two failures (JavaScript and its dependent
release gate); standalone Coverage has two successful jobs and one failure. No rerun,
deadline increase, numerical tolerance change or rendering-detail reduction was used.
Failure artifacts `10323899105` and `10324406066`, exact logs and identities are
preserved under ignored `build/pr107-review-bab45fd/`. Frame scheduling, capture work
and production rendering cost are being measured before attributing a root cause.

### Additional review at `bab45fd`

The subsequent automated review adds three findings, identified by their original
comment IDs: `4000658093` (pending mapped images on departure), `4000658095` (nested
per-fragment optical quadrature), and `4000658099` (single-observation gallery retry).
They remain distinct from the hosted diagnostic failures above.

Mapped-image cancellation now shares the existing selection-change ownership rule:
remove pending cache entries, mark them deferred, then detach handlers and clear `src`.
Departure retains ready textures and reentry requests fresh cancelled demand. The
mission gallery exposes a native Retry image button after transfer, integrity, decode
or dimension failure, including Neptune's single option. Loading/ready entries cannot
be restarted with this action; generation and abort guards still reject stale results.
Three new regressions failed before the fixes. The corrected focused suite passes
32/32 on Node 22.23.2, including the existing reentry test updated for intentional
pending-request cancellation. An independent read-only review also passes those 32
tests. Exact logs are retained in `build/pr107-review-bab45fd/recovery-*.txt`.

### Measured browser-observer cost

Pinned candidate-03 application bytes reproduce a substantial measurement overhead:
the original Earth observer takes 2,891.0 ms for four accepted samples, including
2,759.5 ms sampled in native `getUniform`. Ordinary preceding ticks take 11.9–19.9 ms;
instrumented ticks take 379–1,305 ms. Separate 4x and 6x CPU-throttled runs pass with
five samples in 3,768.2 and 3,919.5 ms, respectively. None reproduces the hosted
zero-draw failure. Synchronous GPU queries can wait for prior rendering work; the
profile identifies a waiting point rather than the GPU command responsible.
This interpretation is consistent with the documented synchronization cost of query
APIs in [MDN's WebGL guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_blocking_api_calls_in_production).

A separate full-application 4x CPU-throttled run passes all original 19 checks and
20 full-page/canvas pairs in 81.525 seconds. Native context restoration arrives in
66 ms, its application callback completes in 397 ms, and actual readiness arrives in
16.677 seconds. The original 10-second/40-second/240-second limits remain unchanged.
Native `getError` occupies 49.343 seconds of sampled time: 38.786 seconds in production
upload admission and 10.557 seconds in harness state snapshots. Upload checks remain
mandatory; this does not establish that transfers caused the queued GPU work. PNG
encoding was not isolated as a bottleneck and its options are unchanged. Windows CPU
throttling does not reproduce the resource envelope of hosted Linux runners.
Detailed commands, profiles, attribution and limitations are preserved in the ignored
`build/pr107-review-bab45fd/perf/INVESTIGATION.md` and associated per-run artifacts.

The final probe uses successful draw-local uploads only to select candidate Earth
draws. It does not depend on separately queried uniform-location object identity.
Every accepted epoch still reads the actual GPU program, mode, model and normal;
the original inverse-transpose, orthonormality, rotation-rate and frozen-transform
assertions are unchanged. Unrelated draws and duplicate accepted epochs avoid GPU
queries. Native calls, arguments, return values and exceptions remain forwarded.
Independent RAF heartbeat and initial/final state are diagnostic only and never paint
or advance either clock. Failure artifacts now retain page/console errors even if
their separate DOM snapshot fails.

Independent review reproduced a pre-existing timer-starvation gap: three samples at
100, 200 and 5,200 ms passed because a native GPU call delayed the timer. Admission
now uses monotonic time after the final GPU readback and rejects completion after
5,000 ms. The nominal timer, minimum three samples and four-sample early-exit target
remain unchanged. A draw that finishes late is still forwarded but is not inspected.
The independent reproduction now correctly fails with two admissible samples; all 32
dedicated probe/diagnostic tests pass on Node 22.23.2, including exact-boundary, stale
GPU transforms, upload rejection, program changes, offsets and cleanup cases.

A sequential original/current pair against the same historical candidate-03 bytes
passes with five actual GPU samples and the frozen negative control in each run.
All 168 declared historical source hashes were verified using an ignored detached
source checkout. The original observer takes 3,537.2 ms, versus 3,435.7 ms with the
new helper (2.87% shorter). Sampled native `getUniform` time decreases from 3,315.957
to 2,970.487 ms (10.42%). The new observer sees 181 indexed draws, inspects five Earth
candidates and skips 176 unrelated draws before querying; no sample finishes late.
This is a modest measured wall-time improvement, not a reproduced diagnosis of the
hosted zero-draw result. Exact script/helper/test hashes and results are retained in
`build/pr107-review-bab45fd/perf/paired-probe-results.json`; initial source-association
and browser-path setup rejections remain preserved separately.

### Density-column implementation and candidate qualification

The third review correction replaces nested density quadrature with paired
512-by-512 outward-column fields: 2,097,152 bytes each for Earth and Mars. Production
surface and shell shaders retain the original scattering, phase, shadow splitting
and linear-light composition expressions. Endpoint subtraction, an exact oblate
coordinate/path-length transformation and analytic density-one subdatum segments
preserve signed physical terrain endpoints. All original incident fields and their
offline solver sources remain unchanged. Both optical fields must pass admission;
there is no expensive nested-quadrature fallback while resources are unavailable.
Companion failure cancels both transfers and failed upload rolls back both textures.

The first production lookup shader passes the existing 187 GPU assertions against
the independent Python reference with unchanged tolerances. Whole-source JavaScript
passes 974/974 on Node 22.23.2 and Node 24.18.0, including exact generated field-byte
parity. Source-only Node coverage is 22,674/23,129 lines (98.03%), 5,520/6,037 branches
(91.43%) and 710/746 functions (95.17%), above the original 90% requirements. Full
Python passes 366/366; JSDoc typecheck passes 99 files. The 32-test optical build/admission
suite independently confirms that all four numerical fields remain optional at install,
all required metadata stays critical, and missing/corrupted demand cannot be cached.
Scientific fingerprints include both column modules. The generated data manifest alone
is classified as generated coverage data; executable field logic remains in scope.

Candidate-04 manifest `d98e4d4275eb14bb78c7963f49ce523cf93e3409b533ab87e0be91eba366d63a`
was built before static validation identified two missing module-preload declarations.
It was not GPU-qualified. Adding the two declarations makes static validation pass.
Candidate-05 contains 192 assets, base revision `bab45fd`, namespace
`releases/pr107-review-candidate-05/`, and manifest SHA-256
`5f707ea308cf06d58d7f515e053649ff4cdffd8024ce4d8c10b2cda026328159`.
Its independently staged Node collection passes all 974 tests. Evidence remains under
`build/pr107-review-bab45fd/candidate04/` and `candidate05/`.

The first candidate-05 4x CPU-throttled full-app diagnostic fails at initial Sun atlas
admission after 28.688 seconds, with one manifest check and no captures. The source
hash associations match, the atlas responds HTTP 200, and recorded page, console,
shader, WebGL and request-error collections are empty. Profiling attributes 22.367
seconds to `getError` inside reference-image upload during initial System entry,
before the harness pauses animation. The atlas's exact rejection reason was not
retained; timer starvation across its 20-second lifetime is a hypothesis, not a
confirmed diagnosis. The GPU queue or first-use shader work responsible is being
investigated. Subsequent GPU gates were stopped, and this artifact is not presented
as qualified. Original deadlines, numerical tolerances and visual detail are retained.

### Controlled cold-start diagnosis and production specialization

A subsequent instrumented baseline confirms the exact failure: `TimeoutError: Solar
atlas load timed out`. Its manifest is
`476d46de298fbe5b09d06b11339e4531a9066bfa1ac46a63f40d0daf58e36ade`.
HTTP headers arrive at 290 ms; the stream continuation waits until 23,370 ms and the
deadline fires at 23,638 ms. The late decoded bitmap is correctly closed and rejected.
The native reference-upload `getError` waiting point occupies 22,791.5 ms. This
reproduces event-loop starvation rather than a failed HTTP response or invalid image.

The paired diagnostic changes only the sphere shader selection and inert diagnostic
metadata. It compiles atmosphere-disabled bodies with a constant zero flag, retaining
the unchanged physical shader for admitted Earth/Mars fields. Under the same 4x CPU
throttle, assets, logger and original deadlines, the atlas completes in 2,861 ms and
all 19 physical checks / 20 capture pairs pass in 85.062 seconds. Its manifest is
`1e02296a675108fd0d782cfb29e4076cb0443e57591c5dcf9386f95434433542`.
Exact comparison and profiles remain in `build/pr107-review-bab45fd/cold-baseline-run/`
and `cold-specialized-run/`. First physical Earth readiness still takes 19.648 seconds
and restored Mars readiness 24.957 seconds. The total is comparable to candidate-03's
81.525 seconds; this supports isolating startup cost, not an overall performance claim.

Production uses stable base and physical sphere programs, explicit per-program uniform
maps and the same attribute locations. Moons and deferred transparent callbacks retain
the base program. Pending/disabled/ready Earth and Mars, moon draws and context restore
are covered by a regression that failed before implementation. Both physical shader
exports and numerical field identities remain unchanged by this specialization.

Candidate-06 contains 192 assets and manifest SHA-256
`1818a2e1edfcc0094e0bd274a3c7c3cd97d56b7ad63d74f0ef428793858e5777`,
under `releases/pr107-review-candidate-06/`, built from base revision `bab45fd` and
the recorded working-tree source hashes. Full source suites pass 976/976 on both
Node 22.23.2 and Node 24.18.0. Node-only coverage is 22,688/23,143 lines (98.03%),
5,525/6,043 branches (91.42%) and 711/747 functions (95.18%). Typecheck passes 99
files; static, SDLC (23 requirements) and UX contract checks pass. Its GPU qualification
is recorded below independently from the earlier diagnostic candidates.

The staged Node collection also passes 976/976. Planet appearance passes 95/95:
all original 93 checks plus exact disabled-material parity and a deliberate material
drift negative control. All 89 GPU probe pairs match, including six spatial seam
patches, visible Sun emission, illustrative shells and untextured surfaces. The
evidence records all four expanded shader hashes as well as staged module identities.

The original full physical application passes all 19 checks with 20 full-page/canvas
pairs in 73.963 seconds. Native context restoration arrives in 2.9 ms, the callback
completes in 68.3 ms, and actual rendering readiness arrives in 22,245.3 ms from the
restore request. The original 10-second/40-second/240-second limits remain unchanged.
Source differences and page/console errors are empty. A cancelled Jupiter image
records the expected `ERR_ABORTED` during selection changes. Desktop Earth, mobile
Earth, source-facing Sun and restored Mars screenshots were inspected separately.

The candidate's atmospheric gate passes all original 187 assertions. Maximum-detail
incident validation passes at 74,305 vertices, with exactly equal illumination at
all 4,753 shared lower-LOD points; the maximum shared error is zero. Direction norm
error is at most 3.371e-9. Warm high-LOD draw/readback times are 7.0–7.4 ms on this
software-WebGL host; these are vertex-only checks, not total frame timings.

The complete original browser journey passes, including four submitted Earth draws
over 0.1884957788 radians, the frozen-transform negative control, and Io transit and
eclipse controls. Combined staged Node/Chromium line coverage is 13,097/13,511 (96.93%)
with all 91 handwritten runtime modules retained in the denominator; the minimum
remains 90%. Separate staged component gates pass rings 11/11, terrain shadows 32/32,
solar appearance 17/17 and planetary phenomena 8/8. All nine GPU/browser commands
exit zero. Full Python remains 366/366 on the unchanged final Python changes; no
additional engine code or fixtures changed after that run. The full Rust suite is
not rerun locally for this renderer/build follow-up; hosted checks remain separate.

Exact completed GPU commands, output paths and manifest identity are retained in
`build/pr107-review-bab45fd/candidate06/gpu-commands.ps1`. They use Node 22.23.2 and
Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, with
`--web-root=build/pr107-review-candidate-06`; the physical gate includes `--context-loss`.
Component outputs are beneath `build/pr107-review-bab45fd/candidate06/`, except rings
at `coverage/pr107-review-bab45fd-candidate06-ring/`. Source test commands are
`node --experimental-vm-modules --test tests/web/*.test.mjs`,
`node tools/check_node_coverage.mjs`, `python -m unittest discover -s tests/python -p 'test_*.py' -v`,
`python tools/typecheck_web.py`, `python tools/validate_web_static.py`,
`python tools/validate_docs.py`, `python tools/validate_sdlc.py`,
`python tools/validate_ux_contract.py`, and `git diff --check`. The command receipts
retain the actual task-local Node paths, Python module path and output arguments.

The remaining inline review findings are
[mapped-image cancellation](https://github.com/Protonmatter/sol/pull/107#discussion_r4000658093),
[fragment optical work](https://github.com/Protonmatter/sol/pull/107#discussion_r4000658095), and
[mission-image retry](https://github.com/Protonmatter/sol/pull/107#discussion_r4000658099).
Their code corrections and regression evidence are included here for publication.
GitHub replies, resolved-thread state and fresh hosted check results are read back
after the commit is pushed; local qualification alone does not assert those outcomes.

### Latest correction inventory

This follow-up modifies/adds 30 files relative to `bab45fd`; the complete review task
from `d338c7a` spans 52 unique files. Ignored stage builds, browser captures, diagnostic
variants and logs are evidence only and are excluded from the commit.

| File | Purpose |
| --- | --- |
| `apps/web/index.html` | Preload the two admitted optical modules |
| `apps/web/js/orrery.js` | Cancel pending images, admit paired optical fields, select separate sphere programs |
| `apps/web/js/orreryShaders.js` | Use density-column lookup and export asserted base sphere variants |
| `apps/web/js/planetPhenomena.js` | Explicit failed-image retry with lifecycle guards |
| `apps/web/js/atmosphereColumnField.js` | Bounded lookup, independent CPU sampling and strict paired loading |
| `apps/web/js/atmosphereColumnManifest.js` | Pinned field format, source, profile and byte identities |
| `apps/web/data/optics/earth-columns-v1.f32` | Reproducible 2,097,152-byte Earth density field |
| `apps/web/data/optics/mars-columns-v1.f32` | Reproducible 2,097,152-byte Mars density field |
| `docs/SPEC.md` | Optical and retry/cancellation contracts |
| `docs/rfcs/0005-physical-rendering.md` | Accepted resource, shader routing and validation requirements |
| `docs/requirements.json` | Traceability for optical fields and gallery recovery |
| `docs/plans/2026-09-13-physical-rendering/OPTICS_SOURCES.md` | Equations, bounds, provenance and approximation limits |
| `docs/plans/2026-09-13-physical-rendering/PR_REVIEW_FOLLOWUP.md` | Review evidence, failed candidates and qualification inventory |
| `tests/python/test_incident_release_build.py` | Actual optional-field install/demand and fingerprint regressions |
| `tests/python/test_physical_assets.py` | Column schema, source, byte and corruption admission |
| `tests/web/helpers/orreryHarness.mjs` | Paired field injection and shader routing observations |
| `tests/web/orreryIncidentLifecycle.test.mjs` | Readiness, cancellation, upload rollback and program routing |
| `tests/web/planetAppearanceRuntime.test.mjs` | Image departure, retained ready resources and stale callbacks |
| `tests/web/planetPhenomena.test.mjs` | Retry, decode failure, single-option and disposal regressions |
| `tests/web/atmosphereColumns.test.mjs` | Exact generation, numerical comparisons and strict loader behavior |
| `tests/web/earthSpinProbe.test.mjs` | Actual helper sampling, deadline, GPU evidence and cleanup regressions |
| `tools/atmosphere_validation.mjs` | Test shipped lookup shader against the unchanged reference oracle |
| `tools/incident_budget_validation.mjs` | Bind shipped columns for surface fallback in production vertex testing |
| `tools/planet_appearance_validation.mjs` | Original material assertions plus base/physical GPU parity |
| `tools/browser_validation.mjs` | Use bounded spin helper and retain early runtime error evidence |
| `tools/earth_spin_probe.mjs` | Draw-local candidate filtering and strict five-second GPU admission |
| `tools/build_web.py` | Four optional numerical fields and complete scientific fingerprints |
| `tools/js_coverage_scope.mjs` | Classify only generated field metadata outside executable coverage |
| `tools/validate_physical_assets.py` | Validate exact field schemas, source identities and finite contents |
| `tools/prepare_atmosphere_columns.mjs` | Explicit offline deterministic field generation |
