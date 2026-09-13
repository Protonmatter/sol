# Planetary appearance implementation and validation

Date: 2026-09-13. This implements the accepted user direction in
[RFC 0004](../../rfcs/0004-registered-planetary-appearance.md) and `SOL-VIS-004`.
It extends the observation workspace in RFC 0003. Local acceptance, hosted CI,
manual scientific qualification and production activation remain separate evidence.

## Result and source scope

Earth now has registered continents and land ice, geometrically night-side city
lights, satellite clouds and surface, and an optional sea-ice concentration overlay.
The original provider legend is displayed on a white backing so its black labels
remain legible in the dark interface. Active layer dates appear below the canvas.
Source details and native layer controls remain available through compact disclosures.

All eight planets and the Moon load mission reference maps. Missing coverage retains
a disclosed simplified surface. Background labels are conservatively hidden behind
opaque body interiors; this changes neither positions nor picking. Ellipsoid lighting
uses inverse-transpose normals. Masked image filtering excludes transparent no-data
RGB from the covered source color, preventing dark fringes at coverage edges.

| Earth layer | Bound source date and interpretation |
| --- | --- |
| Land and land ice | NASA Blue Marble, January 2004; composited display imagery |
| Night lights | NASA Black Marble, 2016; published grayscale annual composite |
| Weather | NASA MODIS Terra and Aqua, 12 September 2026; clouds and surface from different overpasses |
| Sea ice | NASA/JPL MUR, 7 September 2026; scientific concentration palette with original legend |

The weather derivative retains 1,848,641 Terra pixels, adds 60,613 Aqua pixels where
Terra has no data, and leaves 187,898 pixels transparent. All 2,097,152 output pixels
were compared independently with the four original images and masks. No synthetic
swath filling, cloud drift, latitude-painted ice or city placement is introduced.

The complete sources, byte identities, coordinate evidence, processing and bounds are
in [Earth sources](EARTH_SOURCES.md), [planet sources](PLANET_SOURCES.md) and the
[rendering contract](RENDERING_CONTRACT.md). Their interpretation is part of acceptance:
Venus is radar beneath clouds, Mars is colorized, and Hubble maps are contrast enhanced.
Old legacy global-sphere holds are preserved independently of these display references.

## Candidate identities

Work occurred in the isolated `sol-review-20260911` checkout on
`codex/sol-observation-workspace`, extending parent
`899d69cc9b0acff93a2eefee02123d42ba6dc8fb`. The other checkout was not modified.
PR 107 targets `master`, verified at `841ba94eabe588f745625a995d20bf6c79ac97f3`
before publication. No merge or deployment is part of this change.

The local build manifests record the pre-commit parent plus exact source-file hashes
for the working candidate; they are not presented as builds of that parent alone.
The commit containing this ledger supplies the subsequent Git identity. Hosted checks
must be read on that pushed head rather than inferred from the previous green head.

| Artifact | Manifest SHA-256 |
| --- | --- |
| `appearance-final-a` | `11d1879d5776fa7917ec6f363b6024b015ed06e0b5f3d094df85139306cc90ef` |
| `appearance-final-b` | `33f12c8a328004a1f170c2590e306d9d7d464cc84e243de5ed2917502977e69e` |
| `appearance-final-c` | `9f0dbab30b8870b3a566788af9bc6475a2e49b72528d25ea7d80bf03184fe4ff` |
| Final `appearance-final-d` | `464209f61a7372b0d7dd4f19fd29f589fa73508ca464ef6e0f37e9090f270b9e` |

The final D artifact adds only a white CSS backing for the original transparent
legend to C. Actual browser, GPU, source-bound coverage, screenshots, smoke and
release-cache checks were refreshed against D. The broader experience and Sky
acceptance runs used C; their JavaScript and DOM sources are unchanged in D.

## Executed validation

Local environment: Windows, installed Chrome 151.0.7922.174 with SwiftShader,
Node 24.18.0, existing Python runtime and pinned coverage.py 7.15.2. No dependency
or runtime provider was added. Raw local evidence remains ignored under `coverage/`
and original acquisition evidence under `build/`.

| Check | Result |
| --- | --- |
| Full Node tests | 743/743 passed |
| Imported production-module Node coverage | 98.70% lines, 92.23% branches, 95.62% functions; all three floors 90% |
| Provider and repository Python tests | 28 + 290 passed |
| Exact CI 20-file Python aggregate | 91.5483%, passing 90%; lines 93.3036%, branches 87.8838% |
| TypeScript check | 79 files passed |
| Actual reference-image GPU probes | 67/67 passed on D |
| Whole hand-written runtime Node + Chromium | 96.49% line coverage; 10,449/10,828 lines |
| Visual inventory | 12 mapped layers and original legend admitted; legacy holds preserved |
| SDLC, docs and UX structure | Passed |
| Full scientific browser assertions | Passed on D |
| Experience and Sky interaction suites | Passed on C |
| Three-view isolated browser smoke | Passed on D |
| Three-artifact/two-client release cache | A/B/D passed; corrupt candidate, retained clients and offline recovery checked |
| Agency derivative reproduction | All eight planetary outputs matched pinned byte hashes; complete Earth weather pixel comparison passed |
| Diff whitespace check | Passed |

The Python gate is an aggregate line/branch policy. It is not a claim that every file
or branch-only percentage exceeds 90%. Service-worker execution remains zero in the
merged application coverage denominator; its behavior has separate real-browser cache
tests. Synthetic GPU fiducials are test inputs, not NASA observations.

Commands used from repository root include:

```powershell
python tools/typecheck_web.py
python tools/validate_visual_assets.py
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_ux_contract.py
node tools/check_node_coverage.mjs --output-dir=coverage/appearance-node-executed
node tools/collect_node_coverage.mjs --web-root=build/appearance-final-d --output-dir=coverage/appearance-node-d
node tools/browser_validation.mjs --web-root=build/appearance-final-d --output-dir=coverage/appearance-browser-d
node tools/planet_appearance_validation.mjs --web-root=build/appearance-final-d --out=coverage/appearance-gpu-d
node tools/merge_web_coverage.mjs --web-root=build/appearance-final-d --node-input=coverage/appearance-node-d/coverage-final.json --browser-input=coverage/appearance-browser-d/coverage-final.json --output-dir=coverage/appearance-combined-d --minimum-lines=90
node tools/experience_validation.mjs --web-root=build/appearance-final-c --out=coverage/appearance-experience
node tools/sky_validation.mjs --web-root=build/appearance-final-c --out=coverage/appearance-sky
node tools/release_cache_validation.mjs --a=build/appearance-final-a --b=build/appearance-final-b --c=build/appearance-final-d --out=coverage/appearance-cache-d
python tools/browser_smoke.py --web-root build/appearance-final-d
git diff --check
```

Python coverage uses the exact provider/repository commands and 20-file include set
in `.github/workflows/coverage.yml`, with `PYTHONPATH=tools`. The final isolated
database, command logs and XML are in `coverage/appearance-python-complete/`.
Source preparation commands are recorded in the linked source documents.

## Regression evidence and corrections

- The new filtered-alpha probes initially failed: a half-covered white source
  produced RGB 92 for weather and 64 for a general map, instead of about 188.
  Premultiplied upload plus normalized covered-color composition produces 188.
  Red evidence is retained in `coverage/planet-appearance-alpha-edge-red/`.
- Existing extracted-label tests required the new production dependencies. The
  original assertions remain, with added occlusion/reappearance and coordinate
  preservation checks. The final full Node gate passes.
- The older submitted-spin assertion assumed unit normal columns. It now verifies
  the model inverse transpose explicitly and normalizes its columns only when
  recovering rotation. Independent valid oblate, frozen, sheared and old spherical
  normal fixtures confirm the new gate rejects the defects it is intended to catch.
- Existing quantitative transit/eclipse pixel gates retain their 0.05 legacy
  material and original thresholds, selected through the public imagery checkbox
  and restored afterward. Source composites cannot be an annular radiometric
  baseline for that legacy test. Their new linear-light shading is separately
  checked by actual GPU unshadowed/umbra/penumbra probes; day-side eclipse darkness
  cannot switch on city lights.
- Final browser Io transit depth was 0.0504 versus predicted 0.0505, at 0.5 px from
  the predicted location. The no-transit control remained clear. Io eclipse brightness
  was 0.2879 versus the shipped ramp's 0.2784. Existing thresholds were not widened.
- Earth auxiliary grid mismatch tests failed before admission enforcement and pass
  afterward. Auxiliaries must match the canonical full Earth grid and role masks.

## Screenshot evidence and remaining bounds

`coverage/appearance-output/` contains real screenshots of D at 1440x1000 and 390x844.
All 12 image states were ready, the engine reported no error, and the mobile page
had no horizontal overflow. Captures use a fixed model epoch of
2026-09-12T15:00:00Z and camera-only framing adjustments. Image dates stay independent.
The screenshots are not generated mockups or modified planetary positions.

The set includes night lights on/off, satellite weather, Earth controls, Arctic and
Antarctic sea ice, Antarctic land ice, the original legend, every other planet, the
Moon and mobile Earth. The source/appearance review checked those actual views.

No new state-estimation model, ephemeris coefficient, physical orbit or display-radius
algorithm is introduced. Physical overlaps in projection, occultations and real ring
geometry remain different from artificial 3-D body penetration. Existing clearance
and geometry tests remain part of the full passing suite.

The weather is a dated multi-overpass composite, not live weather or a forecast.
Historical night lights are not cloud-attenuated current emission. The atmospheric
rim is illustrative; temperature, pressure and air quality are not inferred from it.
Gas-giant features retain source dates and do not predict storm drift. Missing areas,
native source resolution, enhanced color and radar interpretation remain explicit.
Rings and unqualified minor-moon surfaces retain their existing schematic treatment.
Physical-device/GPU and assistive-technology certification were not performed.
Rust/WASM algorithms are unchanged; hosted cross-platform checks are separate evidence.

Rollback reverts this appearance change as a unit: source inventory and assets,
runtime/UI, acquisition/validation tooling, and documentation. It requires no
ephemeris or state-schema migration.

## Exact changed-file inventory

```text
.github/workflows/coverage.yml
apps/web/app.js
apps/web/index.html
apps/web/styles.css
apps/web/visual-assets.v1.json
apps/web/images/earth-sea-ice-legend.png
apps/web/js/bodyData.js
apps/web/js/destinationCards.js
apps/web/js/destinationOverview.js
apps/web/js/labelOcclusion.js
apps/web/js/orrery.js
apps/web/js/orreryShaders.js
apps/web/js/planetAppearance.js
apps/web/js/surfaceMapping.js
apps/web/js/visualAssetManifest.js
apps/web/textures/reference/earth-land-2004.jpg
apps/web/textures/reference/earth-lights-2016.jpg
apps/web/textures/reference/earth-sea-ice-20260907.png
apps/web/textures/reference/earth-weather-20260912.png
apps/web/textures/reference/jupiter-reference.png
apps/web/textures/reference/mars-reference.png
apps/web/textures/reference/mercury-reference.png
apps/web/textures/reference/moon-reference.jpg
apps/web/textures/reference/neptune-reference.png
apps/web/textures/reference/saturn-reference.png
apps/web/textures/reference/uranus-reference.png
apps/web/textures/reference/venus-reference.png
docs/OPERATIONS.md
docs/REQUIREMENTS.md
docs/RFC_ALIGNMENT.md
docs/SPEC.md
docs/requirements.json
docs/rfcs/0004-registered-planetary-appearance.md
docs/plans/2026-09-12-scientific-workspace/ASSET_QUALIFICATION.md
docs/plans/2026-09-13-planetary-appearance/EARTH_SOURCES.md
docs/plans/2026-09-13-planetary-appearance/PLANET_SOURCES.md
docs/plans/2026-09-13-planetary-appearance/RENDERING_CONTRACT.md
docs/plans/2026-09-13-planetary-appearance/VALIDATION.md
tests/python/test_fetch_earth_reference.py
tests/python/test_mapped_references.py
tests/python/test_planet_reference.py
tests/python/test_release_artifact.py
tests/web/destinationOverview.test.mjs
tests/web/helpers/orreryHarness.mjs
tests/web/labelOcclusion.test.mjs
tests/web/labelProjection.test.mjs
tests/web/orreryCoverage.test.mjs
tests/web/orrery_review_regressions.test.mjs
tests/web/planetAppearance.test.mjs
tests/web/planetAppearanceRuntime.test.mjs
tests/web/surfaceMapping.test.mjs
tools/browser_validation.mjs
tools/build_web.py
tools/fetch_earth_reference.py
tools/planet_appearance_validation.mjs
tools/prepare_planet_reference.py
tools/validate_visual_assets.py
```
