# Planetary appearance implementation and validation

Date: 2026-09-13. This implements the accepted user direction in
[RFC 0004](../../rfcs/0004-registered-planetary-appearance.md) and `SOL-VIS-004`.
It extends the observation workspace in RFC 0003. Local acceptance, hosted CI,
manual scientific qualification and production activation remain separate evidence.

## Earth cloud-only layer (2026-09-15)

The default Earth cloud selection now draws NASA's Blue Marble 2002 cloud layer over the
land map instead of the land/ocean/ice/cloud composite, so continents and ocean come from
the land map and only clouds are layered on top. Opacity follows a curve fitted from
NASA's composite. See [the source record](EARTH_SOURCES.md#cloud-only-layer-over-the-land-map-2026-09-15).

| Cloud layer validation | Result |
| --- | --- |
| `python tools/prepare_earth_clouds.py --fit-opacity` | Pinned curve reproduced from both NASA originals; held-out mean error 11.48/255 over ocean, 13.69/255 over land and 17.35/255 in thin haze, against 14.64, 17.76 and 22.81 for alpha equal to grey |
| `python tools/prepare_earth_clouds.py --out` | 1,911,552-byte PNG reproduced, SHA-256 `82005bba2cec05b41137b766985d516eaf6b66ea045191d8869d45abd05f7995` |
| `node tools/check_node_coverage.mjs` | 1,277/1,277 tests; lines 98.13%, branches 91.30%, functions 95.51% |
| `PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py'` | 400/400 tests |
| Visual inventory, web types/static/UX, SDLC and Markdown validators | Passed |
| `node tools/planet_appearance_validation.mjs` | 110/110 GPU checks |
| `node tools/browser_validation.mjs` | Passed; Earth submitted spin recorded 4 draws within 1.03 s |
| `node tools/physical_rendering_validation.mjs --context-loss` | 19/19 checks. A run on the intermediate grey-as-alpha build hit a transient DevTools "Promise was collected" error and passed on rerun |

In the Earth optics capture, open ocean west of Africa measures RGB 45, 60, 82 with the
fitted layer, against 41, 57, 89 under the previous composite and 58, 69, 86 when alpha
equals grey.

## Earth swath-seam correction

The default Earth view now uses the original NASA Blue Marble 2002 complete
cloud/surface composite. The 2026-09-12 Terra/Aqua swaths remain an explicit source
choice with their seams and missing coverage preserved. Source selection is separate
from model time, and pending/failed selections cannot substitute another epoch.
See [the source diagnosis and original-byte evidence](EARTH_SOURCES.md#default-view-correction-complete-historical-cloudsurface-reference).

The corrected default and original swaths were rendered from the same camera at
2026-09-12 15:00 UTC, retaining identical body positions. The Africa view reproduces
the reported wedges with swaths selected; the default composite has continuous
surface/cloud features there. Native Home/End selection, source captions, mobile
reflow, both poles, night lights and the sea-ice legend were checked in Chromium.

| Correction validation | Result |
| --- | --- |
| New default-source and missing-source regressions | Failed before implementation; passed afterward. Both substitution directions, late callbacks, invalid selector input, and fixed model/imagery dates covered |
| `node tools/check_node_coverage.mjs --output-dir=coverage/earth-seams-node-final` | 753/753 tests; lines 97.84%, branches 91.54%, functions 95.14% |
| `PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py'` | 290/290 tests |
| Visual inventory, web types/static/UX, SDLC and Markdown validators | Passed; 13 mapped references, original 593,729-byte NASA JPEG, existing qualification holds retained |
| `node tools/planet_appearance_validation.mjs --web-root=build/earth-seams-final --out=coverage/earth-seams-gpu` | 67/67 actual GPU checks; shader source unchanged |
| `node tools/browser_validation.mjs --web-root=build/earth-seams-verified --output-dir=coverage/earth-seams-browser-stable` | Passed actual WebGL, orbit/rotation, Io transit and eclipse assertions |
| Node plus browser coverage with every handwritten runtime module retained | 96.45% line coverage; 90% floor passed |
| `python tools/browser_smoke.py --web-root build/earth-seams-final` | Sun, My Sky and interactive Solar System passed |

Final local candidate `earth-seams-verified` has manifest SHA-256
`a7b15972be617cf4119919a4364dece622f96e04e7b936fae5a3d5906477f70a`.
The earlier `earth-seams-final` candidate differs only in the two selector option
labels, shortened after visual inspection to keep dates visible on small screens.
Node all-module coverage is in `coverage/earth-seams-node-all`, merged coverage in
`coverage/earth-seams-combined-final`, and original comparison screenshots in
`coverage/earth-seams-capture`. These are retained local evidence, not tracked assets.

Rejected attempts remain recorded: source-hash checks rejected a build before its
final attribution update and one before its shortened labels. One animated browser
capture rejected a 16-pixel canvas-height change; the unchanged candidate passed the
complete rerun. No geometry or pixel assertion was weakened to obtain that result.
This does not qualify every hardware GPU or browser, current weather, or production
deployment. The rest of this document preserves the earlier implementation evidence.

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
| Preview/capture follow-up `appearance-capture-fix` | `febbe52e96904bf10d01e889d367ddd751fd49f323e9cfa29ceb579afffe1893` |
| Recovery follow-up `appearance-recovery-final` | `b4de55f186e73e33243c6d5af17e33031896e8d0773701bfa970205a64af6517` |

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
| Full Node tests | 749/749 passed after all recovery regressions |
| Imported production-module Node coverage | 97.84% lines, 91.52% branches, 95.13% functions; all three floors 90% |
| Provider and repository Python tests | 28 + 290 passed |
| Exact CI 20-file Python aggregate | 91.5483%, passing 90%; lines 93.3036%, branches 87.8838% |
| TypeScript check | 79 files passed |
| Actual reference-image GPU probes | 67/67 passed on D |
| Whole hand-written runtime Node + Chromium | 96.49% line coverage; 10,449/10,828 lines |
| Visual inventory | 12 mapped layers and original legend admitted; legacy holds preserved |
| SDLC, docs and UX structure | Passed |
| Static web module/preload contract | Passed after the hosted follow-up correction described below |
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
python tools/validate_web_static.py
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

- Later review of `7c2e621` identified two additional recovery issues. Failed
  mapped references now retry on deliberate view re-entry or an off/on texture
  toggle, with per-attempt and context-generation guards. Ready/pending resources
  are retained; repeated frames and obsolete callbacks cannot create requests or
  uploads. The two new tests failed at 12 versus 13 requests before the fix and
  pass afterward; the complete runtime appearance suite passes 14/14. Evidence:
  `coverage/appearance-retry-{red,green}.log`. The overview also hides and guards
  stale planetary details in the Milky Way while preserving selected-star details.
  Both UI regressions failed before the change; the destination/workspace suite
  passes 19/19 afterward (`coverage/pr107-galaxy-details-{red,green}.log`).
  Pushed `9204177` passed all 20 hosted checks before these follow-ups; that result
  is not used as hosted evidence for the subsequent commit.
  Independent lifecycle review also reproduced a stale mapped-image failure
  notice after successful recovery. That notice now follows current availability
  and preserves separate navigation/legacy hints; its red/green regression is in
  `coverage/appearance-retry-notice-{red,green}.log`. Final integration evidence is
  in `coverage/appearance-node-recovery-final/` and
  `coverage/appearance-browser-recovery-final/`: 749 Node tests, all coverage
  floors, and the original camera/spin/transit/eclipse browser gates pass.
- The `7c2e621` standalone hosted browser job retained an invalid camera-comparison
  crop: the after image included toolbar and caption pixels outside the canvas.
  Both images were 731 x 591, but they did not capture the same rendered rectangle.
  Independent review found no inspector mutation in the synthetic drag path.
  The retained evidence cannot distinguish a transient capture reflow from a late
  layout update, so it does not establish a camera or image-registration defect.
  The harness now explicitly scrolls, requires stable visible geometry and backing
  dimensions, reads bounds and scroll offsets together, and captures without
  beyond-viewport recomposition. It rejects changed geometry and wrong PNG sizes,
  and saves geometry evidence next to the screenshots. All registered reference
  uploads must also be ready before visual baselines begin. Pixel thresholds and
  the camera gesture are unchanged. The local full browser run reports orbit
  mean delta 0.000 and passes the original spin/transit/eclipse gates. Failed
  hosted artifacts remain under `build/hosted-camera-failure-7c2e621/`.
  An independent real-Chromium fixture executes the actual capture helper: stable
  geometry with a composited DOM overlay passes, a forced 37 px layout move fails,
  a real wrong-size crop fails, and restoring geometry yields byte-identical PNGs.
  Evidence is in `coverage/capture-helper-diagnostic-20260913-01/`.
- Archive preview failure previously persisted after switching to a destination
  without a preview and returning. A new regression failed before the fix and
  passes afterward. Retry now occurs only on a deliberate selection return;
  ordinary frames do not repeat requests, successful images stay cached, and stale
  callbacks cannot settle a newer same-URL attempt. Targeted tests pass 12/12;
  the full suite passes 745/745. Red/green/full evidence is retained in
  `coverage/pr107-preview-retry-{red,green,node}.log`. Follow-up runtime source
  hashes are bound by `appearance-capture-fix` (parent `7c2e621` plus exact file
  hashes), with browser evidence in `coverage/appearance-browser-capture-qualified/`
  and executed-source coverage in `coverage/appearance-node-followup/`.
- The first pushed appearance head `cb2c28e` failed the hosted static web gate:
  three newly added modules were missing from the HTML preload inventory. The
  standalone static command had been omitted from the initial local gate list.
  The follow-up adds exactly those three preload links and runs
  `python tools/validate_web_static.py`; the validator itself is unchanged.
  This changes request scheduling only, with no rendering, source, geometry or
  state calculation change. The failed job log is retained locally as
  `build/appearance-ci-web.log`. Prior screenshot and rendering evidence retains
  its stated artifact identity; hosted checks must be refreshed on the follow-up.

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
tests/web/workspace.test.mjs
tools/browser_validation.mjs
tools/build_web.py
tools/fetch_earth_reference.py
tools/planet_appearance_validation.mjs
tools/prepare_planet_reference.py
tools/validate_visual_assets.py
```
