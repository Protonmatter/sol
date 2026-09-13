# Scientific workspace implementation ledger

Baseline: `1f2073f8befbe3725380d46ab63fcbb79db56289`.
Checkout: `sol-review-20260911`; original implementation branch `codex/sol-correctness-experience`, review branch `codex/sol-observation-workspace`.
Authority: user-approved implementation of RFC 0003 on the selected correctness checkout.
Status: implemented local engineering candidate; scientific appearance and product qualification held.
Latest candidate: `build/destinations-preview-03`; the final continuation evidence below supersedes the earlier previews.
The separate dirty checkout was not changed. Review publication is authorized; production qualification and deployment remain separate.

## Delivery

- D0: Accepted RFC 0003 and SPEC/UX/requirements alignment recorded, with three new requirements.
- D1/D5: Inventory covers 21 static rasters, procedural/fallback identities and ten existing dynamic SDO channels. Eleven original static files have verified official byte identities and rectangular browse previews. Runtime and build checks reject unsupported global mapping and unapproved dynamic URLs. All 21 static global-mapping qualifications remain held.
- D2/D3/D4: Shared workspace integrated across Sun, My Sky and Solar System. Navy/gold presentation, persistent responsive destinations, contextual inspector, optional timeline, focus/restore, object-selection disclosure, and essential source/time/feed/readiness outside closed controls are implemented.
- D6: Deterministic display-radius limits, full satellite/ring envelopes, common moon-system scaling, shared drawing/picking/camera transforms, depth-aware contextual moon guides, and physical-scale control semantics are implemented. Ephemeris centers and real transits/eclipses remain authoritative.
- D7: Local automated integration, semantic rendering, source-bound coverage, release cache checks and initial desktop/mobile screenshot inspection passed. Manual accessibility, physical-device, recruited-user and full appearance qualification remain outstanding.

## Scientific boundaries

The immutable v3 contracts, state estimation, worker admission and accepted/pending presentation remain unchanged. No new dependency, telemetry or runtime provider was added. The September 13 correction adds one original NASA SDO archive image with pinned provenance. Existing dynamic SDO image calls are policy checked before use; their mutable capture time remains unknown unless independently supplied.

Source-byte matches and spherical-map qualification are separate evidence. Original raster bytes and attribution are retained. Unqualified textures and invented surface detail are replaced at runtime by explicitly labeled low-detail appearances. This reduces detail in the current candidate; it does not establish a fully qualified NASA/JPL 3-D reconstruction. Mission-derived archive previews retain their own credits and coverage caveats.

The retained Earth product has additional primary provenance at NASA Earth Observatory's Blue Marble 2002 article, which links product 57752 and describes historical composites and shaded topography. Its exact pixel registration has not been established, so this research did not promote its global mapping eligibility.

Collision clearance is a presentation invariant for supported valid states. Planets are not moved to avoid projected overlaps. Actual occultations, eclipses and projected orbit crossings are retained. Test samples and geometric bounds are not a continuous physical no-collision proof across arbitrary epochs or catalogues.

## Earlier workspace candidate identity

- Staged root: `build/workspace-preview-04`.
- Release identifier: `workspace-preview-04`.
- Build-reported digest: `996c77c00080b2223d34af213b54f5799af5662e5f59d181bed1e5a0b470cfde`.
- Source SHA is the baseline commit; this uncommitted candidate additionally binds exact asset/module bytes in its release manifest. It is not a clean committed release or protected-promotion attestation.

## Validation record

All commands below ran locally. Browser commands used installed Chrome with local fixtures and SwiftShader; these results do not establish physical GPU or device performance.

| Command | Result |
| --- | --- |
| `cargo test --workspace --locked` | Passed |
| `cargo fmt --all --check` | Passed |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | Passed |
| `python tools/build_wasm.py --locked --out-root build/workspace-wasm` | Both WASM engines built |
| `python -m unittest discover -s tests/python` with tools on PYTHONPATH | 234 tests passed; workspace-python-final.log |
| `npm test` | 678 tests passed |
| `node tools/check_node_coverage.mjs` | Lines 98.52%, branches 91.23%, functions 94.70%; all 90% gates passed |
| `python tools/typecheck_web.py` | 72 files passed |
| `python tools/validate_visual_assets.py` | 21 rasters, 11 verified original byte identities; inventory passed |
| `python tools/validate_visual_assets.py --require-qualified` | Expected nonzero: mercury qualification hold; no global-map qualification claimed |
| `python tools/validate_sdlc.py` | 19 requirements and governance passed |
| `python tools/validate_docs.py` | 167 Markdown files passed before final ledger update; rechecked afterward |
| `python tools/validate_web_static.py` | Passed |
| `python tools/validate_ux_contract.py` | Passed |
| `node tools/browser_validation.mjs --web-root=build/workspace-preview-04 --output-dir=coverage/workspace-browser-04` | Passed actual runtime and WebGL semantic assertions |
| `node tools/experience_validation.mjs --web-root=build/workspace-preview-04 --out=coverage/workspace-experience-04` | Passed workspace, scientific, worker, reflow and existing local performance gate |
| `node tools/sky_validation.mjs --web-root=build/workspace-preview-04 --out=coverage/workspace-sky-04` | Passed selection, focus, privacy, redirect, share/bootstrap and recovery |
| `node tools/collect_node_coverage.mjs --web-root=build/workspace-preview-04 --output-dir=coverage/workspace-node-04` | 678 tests passed with source binding |
| `node tools/merge_web_coverage.mjs --web-root=build/workspace-preview-04 --node-input=coverage/workspace-node-04/coverage-final.json --browser-input=coverage/workspace-browser-04/coverage-final.json --output-dir=coverage/workspace-combined-04 --minimum-lines=90` | Combined runtime lines 96.08%; 90% gate passed |
| `node tools/release_cache_validation.mjs --a=build/workspace-preview-02 --b=build/workspace-preview-03 --c=build/workspace-preview-04 --out=coverage/workspace-release-cache` | Passed explicit update, retained old client/offline artifact, corrupt-candidate rejection |
| `git diff --check` | Passed; line-ending warnings only |

Preview-03 initial screenshots were inspected at 1440 and 320 pixels plus Sky at 320 pixels; automated reflow also covered 390 pixels. Preview-04 differs only by an HTMLInputElement JSDoc cast, and all browser suites reran against its exact bytes. Sky horizon labels remain dense; the textual browser supplies the readable selection path.

The WebGL run retained the existing Sun, Earth atmosphere, camera and rotation assertions. Io's shadow covered 0.0504 of the disk against 0.0505 predicted, with 0.5 pixel offset; the eclipse assertion passed. These checks validate retained geometry/shadow behavior, not planetary texture registration or photometric calibration.

## Remaining qualification and rollout

- Complete source-specific projection, pixel orientation, prime-meridian alignment, coverage and material/color review before enabling each global map. Do not promote by changing status flags alone.
- Qualify linear-light/material treatment and all NASA/JPL-grounded 3-D appearances against source observations with independent review.
- Complete screen-reader, physical-device and formative user checks before claiming WCAG conformance or product readiness.
- Live mutable imagery availability was not qualified by offline browser fixtures.
- Hosted CI, protected promotion and deployed behavior were not tested locally. The user authorized commit, push and a PR when implementation work is complete. Scientific/manual qualification remains a production-promotion hold; it does not prevent a tested, explicitly scoped review PR.
- Rollback must use a complete compatible artifact. Do not mix old/new code, WASM, snapshots and asset manifests.

## Changed files

See `CHANGED_FILES.txt` for the exact allowlist captured from this checkout. Product changes are concentrated in the workspace, display geometry, source policy and provenance paths; the remaining changes add requirements and regression/build/browser enforcement.

## September 13 observation-led correction

The user rejected the first candidate as a technician control panel. The revised default
now leads with a preserved NASA SDO/AIA 171 Å observation, a slim navigation rail and a
compact overview. Research remains an explicit mode with all original scientific controls.
The image is a still captured on 2026-09-12 at 00:07:22 UTC, not a live feed or registered
model frame. Its original pixels/caption are unchanged; capture time and retrieval time
are distinct. The browse image is educational and does not qualify global globe mapping.

Reference: [NASA SDO original](https://sdo.gsfc.nasa.gov/assets/img/browse/2026/09/12/20260912_000722_1024_0171.jpg).
Source identity: 182,246 bytes; SHA-256
`7429a6b0cebf8b61d4a35783937836ebc5218dd194de9508a6c3da848aa55c99`.
The original-resolution caption was independently read by three reviewers; a downscaled
screenshot's ambiguous digit was resolved without changing or inventing metadata.

The Sun observation has its own source/time presentation and summary export, with null
model bundle identity. Failed image loading shows explicit unavailability, keeps the
model canvas hidden, and supports retry. Keyboard entry into Research transfers focus.
The compact overview fits above the image caption and scrolls locally when details expand.

System defaults retain planets, orbit paths, stars, labels and contextual moons. Optional
constellations, small-body/belt layers and reference guides start off. Both inaccurate
photographic-help restoration paths and neighbourhood-star inspector selection are fixed.
All catalogue functions, scientific engines, immutable v3 inputs and physical transforms
are preserved. Model and observed content are never registered by visual convenience.

The prior high-speed pixel-difference proxy became ambiguous with uniform fallback
surfaces: background/orbital changes can alter pixels without proving body spin. The
updated gate checks the native Earth rotation transform actually submitted to WebGL,
including an explicit frozen-transform rejection. Other semantic pixel checks remain.

### Final observation candidate identity

- Staged root and release identifier: `build/observation-preview-03`, `observation-preview-03`.
- Build-reported digest: `a9642178521d38a68c6b9573a78f02dc717af774f0779712281e0bb2cbba215a`.
- Source lineage remains baseline `1f2073f8befbe3725380d46ab63fcbb79db56289`; the release manifest binds the uncommitted candidate's exact modules and assets. This is local build evidence, not a committed release attestation.
- Original NASA image capture: `2026-09-12T00:07:22Z`; retrieval: `2026-09-13T05:03:15Z`. The UI labels it archival.
- Screenshot evidence: `coverage/observation-experience-03/observation-initial-1440.png` and `observation-initial-320.png`. Copies in the user's Screenshots folder were verified against these bytes.

### Final observation validation

All results below refer to the final observation candidate or its unchanged source files.
Rust engines, WASM inputs and dependencies were unchanged by this correction; the previously
verified WASM build was reused. No new Rust test run is claimed here.

| Command | Result |
| --- | --- |
| `python tools/build_web.py --wasm-dir build/workspace-wasm --out-root build/observation-preview-03 --release-id observation-preview-03 --source-sha 1f2073f8befbe3725380d46ab63fcbb79db56289 --repository Protonmatter/sol --run-id 7 --base-path /` | Built final candidate and immutable manifest |
| `node tools/collect_node_coverage.mjs --web-root=build/observation-preview-03 --output-dir=coverage/observation-node-coverage-03` | 687 tests passed |
| `node tools/check_node_coverage.mjs` | 98.53% lines, 91.41% branches, 94.80% functions; all 90% gates passed |
| `python -m unittest discover -s tests/python` with tools on PYTHONPATH | 240 tests passed |
| `python tools/typecheck_web.py` | 74 files passed |
| `python tools/validate_visual_assets.py` | Passed inventory and original observation identity checks; global-map qualifications remain held |
| `python tools/validate_sdlc.py` | 19 requirements and governance passed |
| `python tools/validate_docs.py` | 167 Markdown files passed; rechecked after this ledger update |
| `python tools/validate_web_static.py` | Passed |
| `python tools/validate_ux_contract.py` | Passed |
| `node tools/experience_validation.mjs --web-root=build/observation-preview-03 --out=coverage/observation-experience-03` | Passed Observe/Research, source separation, native focus, actual image failure/retry, 1440/900/390/320 reflow, and retained scientific/worker checks |
| `node tools/sky_validation.mjs --web-root=build/observation-preview-03 --out=coverage/observation-sky-03` | Passed privacy, selection, focus, sharing, redirects and recovery |
| `node tools/browser_validation.mjs --web-root=build/observation-preview-03 --output-dir=coverage/observation-browser-03b` | Passed actual WebGL geometry, transit, shadow, eclipse and rotation assertions |
| `node tools/merge_web_coverage.mjs --web-root=build/observation-preview-03 --node-input=coverage/observation-node-coverage-03/coverage-final.json --browser-input=coverage/observation-browser-03b/coverage-final.json --output-dir=coverage/observation-combined-03 --minimum-lines=90` | 96.14% combined runtime line coverage; 90% gate passed |
| `node tools/release_cache_validation.mjs --a=build/observation-preview-01 --b=build/observation-preview-02 --c=build/observation-preview-03 --out=coverage/observation-release-cache-03b` | Passed explicit update through the Offline disclosure, offline retention and corrupt-candidate rejection |
| `git diff --check` | Passed |

The native Earth draw-transform check measured 0.1885 radians of rotation over four
submitted draws and rejected a deliberately frozen transform. Io transit area was 0.0504
against 0.0505 predicted; shadow residual was 0.4 pixels with a 9.7-pixel diameter.
The no-transit and eclipse checks also passed. A fractional CSS screenshot fixture was
aligned to integer pixels before scientific measurements; production layout and test
tolerances were preserved. Earlier failed fixture runs remain in local coverage artifacts.

The default observation screenshot was inspected at desktop and mobile sizes. These
results do not establish full screen-reader conformance, physical-device/GPU behavior,
live-feed availability, planetary map registration or deployed readiness. The outstanding
qualification listed above remains in force. No commit, push, PR creation or deployment
was performed for this candidate.

## Final continuation: three-destination experience

The revised Sun hierarchy now extends to My Sky and Solar System. Selection updates a
compact contextual card; search, date, location and complete facts open existing tools on
intent. Native disclosures open before task focus moves. Selection in an already-open
object list preserves keyboard focus and the user's disclosure choice. Camera shortcuts
exit free flight through the existing control before anchoring; no physical centers move.

Sky cards consume the last admitted snapshot, displayed observer and actual provider,
including when a later request fails. Constellation scaffolding starts off; a display inset
and bounded text placement keep the compass and limb labels readable on narrow screens.
Reference body facts and NASA/mission archive previews remain separate from the 3-D scene.
Unqualified surface appearance is explicitly described as simplified. Image replacement
hides old pixels until the matching new source decodes. Galactic views clear planetary
facts, imagery and motion notices.

Scale, moon-suppression, Earth's Moon under-sampling and spin-rate notices stay visible
with tools closed, including focus mode. Their caption has its own content-sized grid row,
so a long notice cannot cover the canvas at 320 pixels. Actual five-year-per-second browser
playback verifies that behavior. The existing scientific engines, WASM inputs, ephemeris
and solar bundles, dependencies and coefficient data remain unchanged.

### Exact candidate and review base

- Release root/identifier: `build/destinations-preview-03`, `destinations-preview-03`.
- Digest: `75e0a68de61fd37f9e64d130701a32532c69eb97319aab31cff23fa619777aba`.
- Review base: fetched remote `master` at `841ba94eabe588f745625a995d20bf6c79ac97f3`.
- Base tree `d829010819155a202b6e36c433d0e4af2c45226f` exactly matched the original
  implementation HEAD tree. The new branch preserved all changes without a merge rewrite.
- Build source SHA records base lineage; exact candidate runtime bytes are bound by its
  release manifest. This local review artifact is not a protected promotion attestation.
- Prior PR 105 was already merged. The review uses the new branch
  `codex/sol-observation-workspace`; no merge, release activation or deployment is included.

### Final validation evidence

| Check / command | Result |
| --- | --- |
| `python tools/build_web.py --wasm-dir build/workspace-wasm --out-root build/destinations-preview-03 --release-id destinations-preview-03 --source-sha 841ba94eabe588f745625a995d20bf6c79ac97f3 --repository Protonmatter/sol --run-id 10 --base-path /` | Final candidate built |
| `npm test` | 705 tests passed |
| `node tools/collect_node_coverage.mjs --web-root=build/destinations-preview-03 --output-dir=coverage/destinations-node-03` | 705 tests passed with source binding |
| `node tools/check_node_coverage.mjs` | 98.56% lines, 91.74% branches, 94.90% functions; all 90% floors passed; `coverage/node-executed/coverage-summary.json` |
| Pinned coverage.py 7.15.2 provider + Python suite and exact `.github/workflows/coverage.yml` report/XML population | 28 provider and 240 Python tests passed; unchanged aggregate 90% gate passed at 91%; line coverage 3360/3616 = 92.92%; `coverage/destinations-python-gate-03.log` and `destinations-python-03.xml` |
| `python tools/typecheck_web.py` | 76 files passed |
| `python tools/validate_visual_assets.py` | 21 surface rasters, 11 verified official surface identities and one pinned observation; global-map holds preserved |
| `python tools/validate_sdlc.py` | 19 requirements, RFCs and workflows passed |
| `python tools/validate_docs.py` | 168 Markdown files passed; rechecked after ledger update |
| `python tools/validate_web_static.py` and `python tools/validate_ux_contract.py` | Passed |
| `node tools/experience_validation.mjs --web-root=build/destinations-preview-03 --out=coverage/destinations-experience-03c` | Passed all three views, native tasks, failure/recovery, worker checks, 1440/900/390/320 reflow and high-speed caption clearance |
| `node tools/sky_validation.mjs --web-root=build/destinations-preview-03 --out=coverage/destinations-sky-03` | Passed source-bound retention, selection/focus, privacy/consent, share/export and redirect rejection |
| `node tools/browser_validation.mjs --web-root=build/destinations-preview-03 --output-dir=coverage/destinations-browser-03` | Passed scientific WebGL assertions; four actual Earth draws, 0.1885 radians, frozen transform rejected; Io transit 0.0504 vs 0.0505 predicted, 0.5-pixel residual |
| `node tools/merge_web_coverage.mjs --web-root=build/destinations-preview-03 --node-input=coverage/destinations-node-03/coverage-final.json --browser-input=coverage/destinations-browser-03/coverage-final.json --output-dir=coverage/destinations-combined-03 --minimum-lines=90` | 96.14% combined runtime line coverage; 90% floor passed |
| `node tools/release_cache_validation.mjs --a=build/destinations-preview-01 --b=build/destinations-preview-02 --c=build/destinations-preview-03 --out=coverage/destinations-release-cache-03` | Passed explicit update, offline retention and corrupt-candidate rejection |
| `git diff --check` | Passed |

The Python gate now includes `tools/validate_visual_assets.py` in both report and XML
populations. Its aggregate gate is unchanged; there is no separate Python branch-rate
floor. The local run used Windows ARM64/Python 3.14.3; hosted Linux/Python 3.12 remains
separate evidence. Fresh Rust coverage and canonical cross-platform generation were not
rerun for this presentation-only continuation; earlier Rust/WASM evidence is retained above.

Failed intermediate evidence is preserved. A busy SwiftShader run produced only two Earth
draws in a fixed 550ms sample. The check now waits for four submitted draws, bounded at five
seconds; it retains the transform, rate and frozen-negative-control criteria. Browser
harnesses now wait for actual archive decode and settled visible export-button geometry
before their existing assertions/pointer actions. No numerical tolerance, coverage floor
or source population was reduced.

### Screenshots and remaining qualification

Final unedited screenshot evidence is in `coverage/destinations-experience-03c` and
`coverage/destinations-sky-03`. Desktop Sun, Sky and Earth context plus mobile Sky/System
were copied into the user's Screenshots folder and verified byte-for-byte. The Earth
context visibly states its simplified appearance; archive imagery is not a globe texture.

[Asset qualification](ASSET_QUALIFICATION.md) resolves official Earth/Moon source choices
and records the exact projection, orientation, coverage and color-pipeline work still
needed. Screen-reader conformance, physical-device/GPU performance, formative user study,
independent astronomical qualification, hosted CI and protected production promotion remain
distinct from this implementation's local checks. Rollback uses a complete compatible
artifact, never mixed modules/WASM/data. Publication is for code review; no production
activation is part of this change.
