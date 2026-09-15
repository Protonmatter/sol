# System appearance validation

Reviewed 2026-09-13. This record covers the follow-up to apply the Earth visual review
to every supported body: the Sun, eight planets, Earth's Moon and 21 catalogue moons.
The accepted display and scientific boundaries are in [RENDERING_CONTRACT.md](RENDERING_CONTRACT.md).
Source-specific decisions are in [MOON_SOURCES.md](MOON_SOURCES.md),
[RING_SOURCES.md](RING_SOURCES.md), [SUN_SOURCES.md](SUN_SOURCES.md),
[TITAN_SOURCES.md](TITAN_SOURCES.md) and [FOCUS_CAMERA.md](FOCUS_CAMERA.md).

## Candidate identity

All integrated local gates below ran against `build/system-polish-verified`.
Its release manifest SHA-256 is
`dc57fe07ca25d40569fc22040c8b94225800ffddcc2d67c422d19c8ca32f2f57`.
This was a dirty-tree candidate whose recorded HEAD
`e630ea8c43d92301002821fd19d0c7445105d2d7` establishes lineage only.
The manifest records actual source-input hashes; publication must compare every
source-input hash with a new committed build before transferring this evidence.
Documentation and the final offline-source tests were completed after web inputs froze.

Environment: Windows, Node 24.18, Chrome 151 with software WebGL2/SwiftShader,
Python 3.14 and the already available Pillow 12.2.0 source-preparation environment.
No dependency was installed for this change. Commands run from the repository root.
On this Windows host, browser checks use
`$env:CHROME_BIN='C:\Program Files\Google\Chrome\Application\chrome.exe'`.

## Executed gates

| Command | Result / retained local evidence |
| --- | --- |
| `node tools/check_node_coverage.mjs --output-dir=coverage/system-polish-node-final` | 778/778 tests; 97.85% lines, 91.76% branches, 95.22% functions. |
| `node tools/collect_node_coverage.mjs --web-root=build/system-polish-verified --output-dir=coverage/system-polish-node-all` | 778/778; denominator-complete runtime coverage retained. |
| `node tools/browser_validation.mjs --web-root=build/system-polish-verified --output-dir=coverage/system-polish-browser-ready` | Full scientific browser/WebGL checks passed. |
| `node tools/merge_web_coverage.mjs --web-root=build/system-polish-verified --node-input=coverage/system-polish-node-all/coverage-final.json --browser-input=coverage/system-polish-browser-ready/coverage-final.json --output-dir=coverage/system-polish-combined` | 96.50% whole-web lines, 94.31% branches, 96.65% functions. Zero-execution runtime files remain in the denominator. |
| `node tools/planet_appearance_validation.mjs --web-root=build/system-polish-verified --out=coverage/system-polish-gpu-final` | 77/77 actual GPU probes passed, including spatial longitude-wrap fixtures for registered color and moon modes. |
| `node tools/ring_appearance_validation.mjs --web-root=build/system-polish-verified --out=coverage/system-polish-rings-final` | 10/10 actual ring shader/profile probes passed. |
| `python tools/browser_smoke.py --web-root build/system-polish-verified` | Sun, My Sky and interactive Solar System passed. |
| `$env:PYTHONPATH='tools'; python -m unittest discover -s tests/python -p test_*.py` | 304/304 passed, including all ten new offline moon-preparation tests. `coverage/system-polish-python-final.log`. |
| `python tools/validate_visual_assets.py` | 24 mapped references, 21 legacy records, 11 official legacy identities and one pinned solar observation; generated registry matches. Original legacy holds remain. |
| `python tools/typecheck_web.py` | 80 files checked with repository-pinned TypeScript 5.9.3. |
| `python tools/validate_web_static.py` | Static module/source wiring passed, including new camera preload. |
| `python tools/validate_ux_contract.py` | UX structure and behavior contract passed. |
| `python tools/validate_sdlc.py` | 20 requirement mappings passed. |
| `python tools/validate_body_constants.py` | Physical constants and source-pinned named ring bands passed. |
| `python tools/validate_body_motion.py` | Ten bodies, 21 catalogue moon periods and motion-rate cap passed. |
| `python tools/validate_docs.py` | Markdown links and repository documentation passed. |
| `git diff --check` | No whitespace errors. |

The browser gate measured Sun G/R 0.980 and B/R 0.940, with an independent brightness
floor; a dark gray sphere cannot satisfy the assertion simply by having white ratios.
Earth's camera round trip has mean pixel difference 0.000. Submitted spin advances
0.1885 radians across four high-rate draws. Io's shadow depth is 0.0504 versus 0.0505
predicted, with 0.5-pixel center offset and an 8.4-pixel width; the no-transit control
ratio is 0.966. The Io eclipse/control gates also pass. These are renderer/contract
regressions, not new astronomical calibration.

The eleven prepared moon assets were reproduced byte-for-byte with the final
offline CLI in fresh ignored output directories. All four original Galilean TIFFs
were decoded independently and checked against 24 projected-coordinate anchors.
Their exact source and output identities, mask counts and replay commands are in
MOON_SOURCES.md. Local Pillow-dependent tests ran; runners without the explicitly
pinned image environment skip image-preparation tests rather than installing it.

## Reproduced defects and failure history

The visual review detected a thin intermittent bright line on Iapetus that
constant-coordinate GPU probes did not catch. An 8-by-4 spatial patch with continuous
source edges failed before the shared sampling fix: 75/77 checks passed in
`coverage/system-polish-spatial-seam-red-01`. The corrected local-longitude gradients
pass 77/77 in `coverage/system-polish-spatial-seam-green-01` and the exact staged GPU gate.
No image smoothing, source replacement or threshold weakening was used to pass it.

Ring silhouette/shadow, source dispatch, inspector coverage and camera fit also have
regressions that failed against the earlier implementation. Initial static validation
caught the missing new-module preload; it was added. Constant validation caught the
Neptune band-edge/source-pin mismatch; the explicit published intervals and negative
pin tests were updated together. One full-browser invocation could not locate Chrome
because CHROME_BIN was unset; the configured invocation passed. These attempts are
retained separately and are not presented as successful runs.

## Application screenshots and invariants

`coverage/system-polish-captures-final` contains 42 unedited browser captures:
all 31 supported bodies (the Sun in Observe), ten additional opposite-hemisphere
views, and mobile Mimas at 390 by 844. Desktop captures are 1440 by 1000. The camera
uses the actual focus action and default fit; no capture-specific enlargement was
applied. The fixed model time is 2026-09-12T15:00:00Z. Archive image epochs stay separate.
The full browser gate separately captures and checks the 3-D Sun.

`capture-evidence.json` records each selected body, anchor, camera radius, source
summary and model time. All 24 mapped references reached ready. The full physical
body state and model clock remained byte-for-byte identical across camera/selection
interactions; no page/engine errors or horizontal document overflow were recorded.
Screenshots retain real occultation/projection context and do not move physical bodies.
An independent review inspected 34 final images directly; the remaining eight neutral
moon images are SHA-256 identical to their already inspected counterparts. The prior
Iapetus bright wrap strip and Uranus dotted artifact are absent. Both hemispheres of
all four new Galilean maps, ring fit and mobile framing passed that review. A separate
source-tool review passed 121 recipe/registry/document/actual-byte comparisons across
all eleven new maps and found no P0, P1 or P2 blocker.

## Scope and remaining qualification

Every supported body receives the shared selection, focus, source-status and rendering
review. Twelve of 22 moons have registered imagery. Titan has source-informed illustrative
visible haze; nine other moons retain simplified surfaces. The new eleven PNGs total
16,349,640 bytes. Missing imagery remains absent, with no invented terrain. Historical
monochrome mosaics do not establish visible color, calibrated albedo or moon attitude.

No Rust/WASM calculation, state-estimation model, physical radius, ephemeris, orbital
element or schema changed. Existing clearance tests guard exaggerated display geometry;
real projected crossings and occultations are preserved. Camera precision limits and
unqualified mutual events remain explicit. The separate frozen weather, night-light
and ice source dates remain unchanged.

Local Rust tests, other browser engines, physical GPU/device certification, formal
assistive-technology testing, live weather accuracy, time-dependent mapped moon
orientation, calibrated radiance and production deployment were not qualified by this
pass. Hosted checks on the final pushed commit are separate evidence and must be
reported from their actual run status. Source preparation is optional and offline.
Rollback reverts this follow-up's renderer, asset registry, prepared files and docs
together; no scientific-state migration is needed.

## Exact changed-file inventory

```text
.github/workflows/coverage.yml
apps/web/index.html
apps/web/js/bodyData.js
apps/web/js/config.js
apps/web/js/destinationCards.js
apps/web/js/explorer.js
apps/web/js/moonAppearance.js
apps/web/js/orbitCamera.js
apps/web/js/orrery.js
apps/web/js/orreryMath.js
apps/web/js/orreryShaders.js
apps/web/js/planetAppearance.js
apps/web/js/render.js
apps/web/js/visualAssetManifest.js
apps/web/styles.css
apps/web/textures/ATTRIBUTION.txt
apps/web/textures/reference/callisto-voyager-galileo-reference-2k.png
apps/web/textures/reference/dione-cassini-reference-2k.png
apps/web/textures/reference/enceladus-cassini-reference-2k.png
apps/web/textures/reference/europa-voyager-galileo-reference-2k.png
apps/web/textures/reference/ganymede-voyager-galileo-reference-2k.png
apps/web/textures/reference/iapetus-cassini-reference-2k.png
apps/web/textures/reference/io-voyager-galileo-reference-2k.png
apps/web/textures/reference/mimas-cassini-reference-2k.png
apps/web/textures/reference/phobos-viking-reference-1k.png
apps/web/textures/reference/rhea-cassini-reference-2k.png
apps/web/textures/reference/tethys-cassini-reference-2k.png
apps/web/visual-assets.v1.json
docs/OPERATIONS.md
docs/plans/2026-09-13-system-polish/FOCUS_CAMERA.md
docs/plans/2026-09-13-system-polish/MOON_SOURCES.md
docs/plans/2026-09-13-system-polish/RENDERING_CONTRACT.md
docs/plans/2026-09-13-system-polish/RING_SOURCES.md
docs/plans/2026-09-13-system-polish/SUN_SOURCES.md
docs/plans/2026-09-13-system-polish/TITAN_SOURCES.md
docs/plans/2026-09-13-system-polish/VALIDATION.md
docs/requirements.json
docs/rfcs/0004-registered-planetary-appearance.md
tests/python/test_moon_reference.py
tests/python/test_ring_constants.py
tests/web/appearance.test.mjs
tests/web/destinationCards.test.mjs
tests/web/explorer.test.mjs
tests/web/orbitCamera.test.mjs
tests/web/orreryCoverage.test.mjs
tests/web/orrery_review_regressions.test.mjs
tests/web/planetAppearance.test.mjs
tests/web/planetAppearanceRuntime.test.mjs
tests/web/rings.test.mjs
tests/web/titanAppearance.test.mjs
tests/web/visualAssertions.test.mjs
tests/web/wavelength_review_regressions.test.mjs
tools/build_web.py
tools/fetch_textures.py
tools/planet_appearance_validation.mjs
tools/prepare_moon_reference.py
tools/ring_appearance_validation.mjs
tools/validate_body_constants.py
tools/visual_assertions.mjs
```
