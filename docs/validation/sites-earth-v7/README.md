# Sites Earth v7 integration - validation and Pages handoff

## Source and delivered behavior

The owner requested the latest ChatGPT Sites SOL Earth render on 2026-09-25.
Sites reported version 7 as successfully published, and its source checkout was
recovered at `12f633b27e435479f4b2322b613f8dd204847d2e`. That checkout remains clean.
See [source.json](source.json) for source-file hashes and full NASA attribution.

The local SOL candidate uses the July 2004 surface, 1.6 display exposure,
conservative dark-ocean grading, the latest 1-12 km illustrative cloud volume,
Sun-directed ground shadows, local cloud texture shading and 35-percent relative
display drift. Cloud/night maps are the existing SOL files: their hashes exactly
match the Site's assets. Only the original July JPEG was added.

Earth uses this appearance in the already-approved default Illustrative look.
Source-qualified restores the original Earth. Daily satellite swaths, sea ice
and HDR retain their original path, while cloud, night-light and atmosphere
controls remain usable. SOL still owns physical positions, IAU rotation, scene
time, display scale and camera geometry. The lab's orthographic spherical recipe
is adapted to SOL's perspective/oblate geometry, not asserted pixel-identical at
unrelated poses. Scientific optical shaders were not changed.

## Local implementation evidence

- JavaScript full suite: **1,346 passed**, including the final coverage run.
- Web typecheck: **118 files passed**, TypeScript 5.9.3.
- Release-artifact Python suite: **26 passed** with unittest discovery.
- SDLC, documentation, UX and static web validation: passed.
- Staged build and release-manifest validation: passed, using unchanged WASM
  engines built during the seven-planet work.
- Native browser validation: passed on Qualcomm Adreno X1-85 / ANGLE Direct3D 11.
  Existing Sun/Sky/System, Earth reference, rotation, orbit and moon-shadow gates
  passed, followed by the new Sites Earth probe.
- The actual Earth shader reported exposure `1.600000023841858` in both passes
  (Float32 representation of 1.6), with clouds enabled and zero GL errors.
  Cloud-off cleared the uniform in both passes and changed the rendered pixels.
  Camera, time and physical positions were identical across that comparison.
- Combined Node/browser line coverage: **97.38%**, above the unchanged 90% floor.
- Regression evidence includes initially failing tests for fresh Earth loading,
  capped-speed cloud drift, hidden late decodes, shader retry and limb blending.
  All pass after correction. Exact texture/mask handles are checked on context loss.

The Python package-style command encountered a local `tests.python` import
resolution error. The repository's discovery form below ran all 26 target tests.
No product code was changed to work around that environment issue.

Final artifact: `local-earth-v7-20260925-3`.
Manifest SHA-256:
`a8fbc356d72d84a4a7847e223eabb8a95c7ad801e48e42839896b58c60fc770d`.
The embedded source SHA `07eb75583a632aa9b5d6bd45a0b63de37701c371` identifies PR
lineage only; that artifact was built before commit and is not a commit attestation.

Local outputs, deliberately outside Git:

- `build/planet-evidence/earth-v7-review.html`: self-contained three-frame review.
- `build/planet-evidence/browser-earth-final-native/visual/earth-sites-v7.png`
- `build/planet-evidence/browser-earth-final-native/visual/earth-sites-v7-clouds-off.png`
- `build/planet-evidence/browser-earth-final-native/visual/earth-source-qualified.png`
- `build/planet-evidence/browser-earth-final-native/visual/earth-sites-v7.json`
- `build/planet-evidence/earth-final-combined-coverage/coverage-summary.json`

## Reproduction commands

```powershell
npm test
python tools/typecheck_web.py
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_ux_contract.py
python tools/validate_web_static.py
$env:PYTHONPATH = 'tools'
python -m unittest discover -s tests/python -p test_release_artifact.py
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tools/browser_validation.mjs --web-root=build/site-earth-v7-final --output-dir=build/planet-evidence/browser-earth-final-native --backend=native
node tools/collect_node_coverage.mjs --web-root=build/site-earth-v7-final --output-dir=build/planet-evidence/earth-final-node-coverage
node tools/merge_web_coverage.mjs --web-root=build/site-earth-v7-final --node-input=build/planet-evidence/earth-final-node-coverage/coverage-final.json --browser-input=build/planet-evidence/browser-earth-final-native/coverage-final.json --output-dir=build/planet-evidence/earth-final-combined-coverage
git diff --check
```

## Files added or changed for this follow-up

- `apps/web/js/earthLook.js`: selection, manifest, disclosure, drift and mask upload.
- `apps/web/js/earthLookClouds.js`: recovered density, lighting and geometry recipe.
- `apps/web/js/earthLookShaders.js`: isolated perspective/oblate rendering program.
- `apps/web/js/earthOceanMask.js`: recovered conservative Natural Earth mask.
- `apps/web/textures/earth-look/earth-land-2004-july.jpg`: unchanged source JPEG.
- `apps/web/js/orrery.js`: resources, shader lifecycle, clock and draw integration.
- `apps/web/js/planetAppearance.js`: accurate selected-mode source description/demand.
- `apps/web/js/destinationCards.js`: overview disclosure.
- `apps/web/index.html`: module preloads, atmosphere label and appearance help.
- `tests/web/earthLook.test.mjs`: asset identity, selection and SOL clock mapping.
- `tests/web/earthLookLifecycle.test.mjs`: actual renderer lifecycle and compatibility.
- `tests/web/sites-earth-geometry.test.mjs`: recovered geometry/grade regressions.
- `tests/web/sites-cloud-volume.test.mjs`: recovered volume/light regressions.
- `tests/web/fullFeatureMemory.test.mjs`: real Earth module in the module fixture.
- `tests/web/illustrativeAppearance.test.mjs`: revised Earth mode expectations.
- `tools/earth_look_probe.mjs`: native GPU uniforms and rendered-pixel comparisons.
- `tools/browser_validation.mjs`: invokes the new probe after existing scene gates.
- `tools/build_web.py`: includes Earth modules in the science component fingerprint.
- `README.md`, `docs/SPEC.md`, `docs/REQUIREMENTS.md`, `docs/requirements.json`,
  `docs/rfcs/0007-illustrative-planet-looks.md`,
  `docs/rfcs/0009-sites-earth-v7.md`,
  `docs/PLANET_ROLLOUT_REVIEW_20260925.md`, and this directory: current scope,
  provenance, contracts and evidence.

## GitHub Pages handoff

The owner authorized publication to GitHub on 2026-09-25. Canonical draft PR #115
contains the seven-planet defaults and recovered Earth together. The existing
builder copies the four Earth modules and July texture into the release namespace;
all textures and modules are recorded by byte count and SHA-256 in the final
manifest. The Earth modules also affect the scientific component fingerprint.
The release-artifact regression changes each module and checks that identity.

Pages uses `/sol/`. The candidate was staged with that exact base path, and the
physical-reference probe now explicitly selects Source-qualified before its
existing optical, terrain and context-restoration assertions. Its prior default
assumption was reproduced as an Earth readiness timeout. The main browser probe
separately checks the owner-approved Illustrative default and Sites Earth.

PR CI builds a review artifact. Following an approved merge, successful master CI
produces the artifact used by `.github/workflows/deploy-pages.yml`. That workflow
verifies the run, source SHA, current master, manifest and rich release evidence,
deploys the same bytes, then reads back the served manifest and critical assets.
No deployment workflow or protection is relaxed for this visual change. See
[the release delivery contract](../../RELEASE_DELIVERY.md). Publication to the PR
does not deploy either GitHub Pages or the separate ChatGPT Site. Record the live
head, hosted checks and artifact identity in the PR; local evidence is not hosted
CI or production verification.

Pre-publication checks on `pages-pr115-20260925-1` passed manifest validation and
byte/hash checks for all eight appearance textures and four Earth modules. Native
`physical_rendering_validation.mjs --context-loss` passed on that `/sol/` artifact,
including source-qualified Earth optics, Moon/Mars terrain, context restoration,
mission imagery and the 390-pixel viewport. The full software-rendered Chromium
validation also passed on that `/sol/` artifact, including the default-mode check,
Sites Earth GPU/pixel probe and existing scene assertions. Node-only coverage passed its
independent 90-percent gates: 98.23 percent lines, 90.93 percent branches and
95.87 percent functions. The extended release-artifact suite passed all 26 tests.

## Boundaries and rollback

The Site's browser view requested a passkey. No credential was handled; the
deployed source was recovered through Sites and validated locally. The Site
itself was not edited or republished. Physical-mobile performance, Safari,
manual accessibility remain unvalidated. Hosted CI status belongs to the exact
published PR head. Merge and GitHub Pages deployment require their own evidence;
neither follows from the local validation results above.

Select Source-qualified for immediate visual rollback. The July cache is bounded
to one texture and one small mask; the original reference warm cache remains
separately bounded. Cloud depth/shading are illustrative and do not establish
weather, measured cloud heights, calibrated reflectance or release qualification.
