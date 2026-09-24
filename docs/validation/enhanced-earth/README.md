# Enhanced Earth validation record

Date: 2026-09-23. Scope: local review candidate for RFC 0008 / SOL-VIS-009.
This record does not claim merge, deployment or native-device qualification.

## Behavior

Earth layers → Enhanced Earth is off by default. It reuses NASA surface/cloud
maps, protects coarse land/ice with a conservative offshore mask, and darkens
only dark blue water colors in linear light. A homothetic cloud shell is nominally
8 km above the equator. Ground shadows intersect that shell toward the Sun and
use the same drifting UV phase. The cloud pass uses illustrative haze, while the
ground retains reference optical transfer. Night-side coverage falls off so
Black Marble remains on the ground pass, and a close view with the physical
atmosphere shell does not also add illustrative cloud haze. No source image,
observation epoch, ephemeris or other body's appearance is modified.

Cloud drift follows 3% of displayed Earth rotation, capped at 0.002 turns per real
second. Pause, hidden/inactive scenes and reduced motion freeze the phase; camera
movement never advances it. MODIS ground-containing swaths and the scientific
sea-ice palette suspend enhancement. Missing/off clouds have no shell or shadow.
Failed mask upload leaves the cloud view usable and reports ocean grading as
unavailable; switching Enhanced Earth off/on retries once.

## Automated evidence

- `tests/web/enhancedEarth.test.mjs` executes production renderer lifecycle and
  shader geometry/color helpers. Cases cover defaults, scientific-state identity,
  shell elevation, shared phase, transparent draw state, non-Earth reset, missing
  maps, swath/sea-ice suspension, drift and rate caps, pause/reduced motion, active
  hidden/inactive suspension, context loss and explicit upload retry.
- `tests/python/test_earth_ocean_mask.py` verifies exact offline regeneration and
  rejects changed source data. The generator is standard-library-only; its
  Natural Earth source hashes and the decoded pixel hash are committed.
- `tools/render_enhanced_earth_probe.py` compiles and links the actual base and
  physical shaders on Linux EGL/Mesa. It renders a controlled base-haze comparison
  with original NASA maps. Metamorphic checks require visible changes when
  enhancement, drift or shadows change. A black-ground test verifies that cloud
  shadows do not attenuate atmospheric path radiance.

The probe initially exposed the existing GLSL local name `packed`, rejected as
a reserved token by Mesa. Renaming that local to `columnValues` changes no
formula. `node tools/prepare_atmosphere_columns.mjs` regenerated the pinned
manifest from the actual source; both 2 MiB numerical field files reproduced
byte-for-byte. No source-identity check was bypassed or weakened.

Final candidate checks on 2026-09-23:

| Command | Observed result |
| --- | --- |
| `npm test` | 1,323 tests passed; no failures or skips. |
| `PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py' -v` | 390 tests ran; 5 errors from missing `cargo`/`rustc`, 3 skips, no assertion failures. |
| `python tools/typecheck_web.py` | 114 files clean. |
| `python tools/validate_web_static.py` | Passed. |
| `python tools/validate_sdlc.py` | 24 requirements and workflow/traceability checks passed. |
| `python tools/validate_docs.py` | 140 Markdown files passed. |
| `python tools/validate_ux_contract.py` | Structure checks passed. |
| `python tools/prepare_earth_ocean_mask.py --check` | Exact reproduction passed. |
| `python tools/render_enhanced_earth_probe.py` | Both production programs compiled/linked; image, drift, shadow and haze-isolation assertions passed. |
| `git diff --check` | Passed. |

The five Python errors are three native snapshot subcases, the native hybrid-time
case, and local Rust toolchain evidence capture. An earlier broad rerun ended
without a summary; the complete confirmation run above finished in 46.666 seconds.
Release-artifact and ocean-mask cases passed in that full run. The new module
classification regression was also observed failing before the classifier update
and passing afterward. The release builder requires source/run metadata and valid
WASM inputs; no qualified release build was produced without the Rust/WASM toolchain.
Independent review found two minor issues (haze shadowing and an insufficiently
active suspension test); both were fixed and confirmed in focused follow-up review.

## Reproduction

```sh
python tools/prepare_earth_ocean_mask.py --check
node --experimental-vm-modules --test tests/web/enhancedEarth.test.mjs
PYTHONPATH=tools python -m unittest tests.python.test_earth_ocean_mask -v
python tools/render_enhanced_earth_probe.py
```

The optional EGL probe requires Linux libEGL, Node, NumPy, Pillow and DejaVu Sans.
It is a diagnostic, not the repository's browser/native graphics gate. The
[comparison](comparison.jpg) holds maps, camera and Sun direction constant.
[Probe metadata](gl-probe.json) records renderer, shader/source hashes and changed
pixel counts. Those counts prove an effect, not its perceptual quality or accuracy.

## Remaining qualification

Native WebGL2/ANGLE, Safari/iOS/mobile appearance, physical-path visual quality,
whole-web/Rust coverage and frame-time measurements require the normal CI/device
gates. CPU lifecycle tests and Mesa images do not substitute for those gates.
The cloud layer has no measured heights, evolving meteorology, multiple
scattering or volumetric structure. The offshore mask is deliberately coarse and
omits small islands; it is not qualified for glint, coastlines or ocean analysis.
