# Physical Rendering Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development for independent
> source/geometry, optics and solar modules; integrate and review their shared boundary
> in order. The user has authorized execution; no additional execution-choice prompt.

**Goal:** Render source-backed relief and richer physical optical/solar structure while
preserving the scientific engines and honest source/mode/epoch disclosures.

**Architecture:** Keep immutable engines and native ES-module/WebGL2 frontend. Add
bounded source-qualified geometry and optical reference products plus dedicated draw
passes. Keep authoritative numerical references in offline scientific code; browser
transforms/GLSL evaluate admitted rendering inputs without evolving engine physics.

**Tech Stack:** Existing Python 3.11+ tools, native JavaScript, GLSL ES 3.00, Node tests,
Rust/WASM engine contracts. No package-manager or dependency changes.

**Spec:** `docs/rfcs/0005-physical-rendering.md`.

## Global constraints

- Preserve immutable physical positions, state estimation, supported epochs and inputs.
- Keep source/derived hashes, source epoch, wavelength, datum/frame and coverage.
- Reference/model appearance is not current weather or calibrated measured radiance.
- Keep failed sources explicit; no generated geography or unlabeled 3-D observations.
- Use existing branch; preserve all unrelated changes. Commit/push remain separate.

## Task 1: Contracts and baseline

- [x] Inspect clean `3e5faba` branch and relevant current contracts.
- [x] Run `npm test` baseline: 804 passed.
- [x] Record accepted RFC and this execution plan before dependent implementation.
- [x] Add planned requirement records; run `python tools/validate_sdlc.py`.

## Task 2: Numerical terrain and bounded demand

Files: `terrainGeometry.js`, `terrainAssets.js`, terrain manifest/products,
`tools/prepare_terrain_reference.py`, terrain Node/Python tests and source record.

Consumes numeric height grid plus explicit datum/coordinate metadata. Produces
`buildTerrainMesh(grid, options)` with interleaved xyz/normal, typed indices and finite
extents; `terrainReference(body)`, `loadTerrainReference(body, options)` expose hash-bound
same-origin assets. Root integrates mesh choice/lifecycle in `orrery.js`.

- [x] Write and run red tests for seam/pole continuity, signed decoding, units/datum,
  synthetic analytic slopes, flat equivalence, index bounds and failed source hashes.
- [x] Derive pinned NASA LOLA/PDS MOLA radial samples with immutable source hashes.
- [x] Implement finite, bounded meshes and source loader; run targeted tests green.
- [x] Integrate load-on-focus, actual terrain normals/vertices, LOD and conservative
  extents; preserve smooth fallback until ready and release stale GL resources.
- [x] Verify actual terrain silhouette, lighting, source orientation and camera bounds.

## Task 3: Atmospheric light transport

Files: `atmosphereOptics.js`, `atmosphereShaders.js`, independent Python reference,
optics Node/Python tests and source record. Root extends current surface shader and
draw orchestration; direct sunlight and night emission remain distinct terms.

Consumes immutable profile and physical-km camera/solar direction/radius inputs.
Produces profile lookup, uniform values, shared GLSL transfer and a limb pass.

- [x] Test analytical attenuation/vacuum, normalized phase functions, grazing finite
  rays, reference Fresnel/refraction limits and inverse-square flux before implementation.
- [x] Implement dimensional Earth/Mars reference scenarios and bounded integration.
- [x] Apply incident transmission to direct reflection and view transfer in linear
  color; draw off-disk scattering without double-counting the disk or old rim.
- [x] Run CPU/GPU comparisons at fixed physical geometry, test loss/fallback and state
  invariance. Report reference-only optical functions separately from enabled effects.

## Task 4: Layered, source-grounded Sun

Files: `solarAppearance.js`, `solarVolumeShaders.js`, solar manifest/atlas, preparation
tool, numerical/source tests, source record. Root integrates a dedicated Sun branch,
mode/source playback controls and texture/context lifecycle.

Consumes pinned registered AIA frames and explicitly modeled elevated structure.
Produces immutable frame/basis metadata, bounded deterministic playback and volume
shader uniforms. Never infer observed 3-D magnetic geometry from source brightness.

- [x] Test red finite-distance/WCS projection, hidden hemisphere, metadata/hash and
  deterministic bounded playback with pause/reduced motion.
- [x] Prepare source atlas and exact provenance; implement bounded volume emission
  and photosphere occlusion plus separate visible/EUV modes.
- [x] Integrate render passes and concise reference source/geometry/time disclosure.
- [x] Verify actual source-facing orientation, 3-D limb/occlusion and animation;
  independently inspect claims and browser render evidence.

## Task 5: Remaining qualified feature/product coverage

- [x] Audit solid-body data and dense-atmosphere/giant-weather/aurora sources against
  RFC0005 admission requirements. Implement supported products with bounded source
  coverage rather than weakening existing qualification gates.
- [x] Add source/date/band-aware feature presentation for Saturn north hexagon/south
  decagon and body-specific aurorae; do not call a contextual image a registered field.
- [x] Add enabled material reflection/refraction only when source/geometry reference
  checks establish their declared scope. Record unavailable effects explicitly.

## Task 6: Integration, review and evidence

- [x] Register new assets/types in build validation and generated manifests as needed.
- [x] Run `npm test`, targeted Python tests, `python tools/typecheck_web.py`, visual
  assets, SDLC, docs and UX validators. Run existing GPU appearance harnesses.
- [x] Stage a new immutable build with existing validated WASM; capture selected
  terrain/Sun/atmospheric views. Check errors, immutable state, camera and fallback.
- [x] Independent code/scientific review; fix concrete findings, rerun affected gates.
- [x] Update SPEC/source docs/RFC alignment and ledger with exact evidence and remaining
  limitations. Do not mark the RFC Implemented before its repository gates are met.

## Progress ledger

Current integration owner: root. Terrain, optics and solar workers own distinct new
files only. Shared renderer, build and documentation integration remains sequential.
Final scope/evidence will be recorded here to survive conversation compaction.


### Integration checkpoint (before final staged qualification)

- Added worker-prepared source terrain, physical radius/normal integration, native-grid
  cast shadows, bounded LOD and resource disposal. Review found stale readiness after
  eviction and retained high LOD after zoom-out; both corrected with regression coverage.
- Earth/Mars atmospheric surface + limb passes are integrated. Incident solar refraction
  now executes in the production vertex shader; direction and curved-path extinction
  feed direct light. Independent GPU gate: 77/77 cases passed. View/scatter rays remain
  straight; no qualified ocean/ice/cloud mask exists for new specular glint.
- NASA/SDO atlas has bounded hash/byte/dimension loading and fixed source-frame geometry.
  The Sun button isolates inspection without moving physical bodies; Our system restores
  surrounding bodies and guides. Source controls now live in the visible overview.
- Five historical giant-planet source images are admitted (719,558 bytes total). The
  selected-body gallery preserves dates, bands and gaps and does not claim globe mapping.
- Initial preview01 proved actual Sun/atmosphere/terrain rendering, real Worker loads,
  mobile width and engine-state invariance. Its remaining console error exposed an unused
  external research-Sun fetch from other surfaces; view.js now gates that work to Today
  Research, with a deliberately red then green regression.
- Preview02 captured an in-progress shader precision mismatch and is retained as failed
  evidence. The optical vertex/fragment precision mismatch is corrected; a fresh immutable
  build is required. Do not reuse that artifact as passing evidence.
- Current open integration work: correct opaque/translucent Sun ordering with foreground
  rings/atmospheres; finish independent review and final staged screenshots/context restore.
- Initial full Node run passed859 tests before the last additions. Python335 had only two
  governance failures while new requirement rows were incomplete; mapping/catalogue are
  now valid. Fresh complete suites and source-bound coverage remain to be run.
- Docs, SDLC23 requirements, UX, static-web, body constants and current asset validators
  pass at this checkpoint. No engine or Rust source changed; no commit/push/merge/deploy.


### Final qualified local candidate

All implementation and local qualification tasks above are complete for the admitted
products. Preview04 corrects the intermediate failures, uses fresh WASM from unchanged
source, and passes the complete browser journey, numerical gates, recovery and source
checks. See [VERIFIED_BUILD](VERIFIED_BUILD.md) for the exact manifest, commands, source
inventory, failed-run history and remaining product/model scope. The RFC remains
Accepted; local qualification does not establish deployment or universal body coverage.

### PR review follow-up

The [PR review record](PR_REVIEW_FOLLOWUP.md) tracks the later rendering-budget,
resource-lifecycle, selection and hosted-validation findings against PR 107. It preserves
the preview04 evidence above and identifies the follow-up candidate separately.
