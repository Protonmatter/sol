# Rendering qualification results

Historical receipt for the tooling-only `34937f1` slice. Current runtime progress
and admission decisions are tracked in [PRODUCTION_EXECUTION.md](PRODUCTION_EXECUTION.md).

Status at that slice: local qualification and specifications completed; runtime promotion remains
open. Recorded 2026-09-14 UTC against starting revision
`bd7f5b45798a754c409e4b265e15703dad018f84` on
`codex/sol-observation-workspace`, PR 107.

## Scope and artifact identity

This slice adds reference/qualification tools, behavioral tests and implementation
contracts. It changes no production renderer, shader, source image, numerical
profile, terrain product, manifest, engine state or orbital geometry. The segmented
shader is generated in memory by qualification tooling; no application module
imports that candidate.

The actual-GPU runs use `build/pr107-review-p2-final`. Its release-manifest SHA-256
is `1ffe4d1b5e3b2c6fb7626a9d4ea76fb2ae2aaf4baac864afc427660e0b2113ac`.
The manifest's older `069d0ba` base-revision metadata describes build lineage;
verified per-file hashes bind the staged runtime bytes tested here. This slice
does not claim that metadata is a newly built HEAD identifier.

Receipts and logs are retained under `build/rendering-qualification-20260914/`.
They are local ignored artifacts, not committed release evidence. Use a new output
directory for every run. Failed receipts remain alongside the passing attempts.

## Atmospheric terrain endpoints and integration

The float64 Python reference preserves its existing ground-clipped behavior by
default. Explicit `terrain_endpoint=True` requires a finite, nonnegative endpoint
and retains that endpoint through the renderer's constant-below-datum density
convention. This is a reference convention, not observed underground atmosphere.
Tests independently cover analytic radial transmission/scattering, vacuum and
empty intervals, night shadow, oblate shadow normals and invalid inputs. An
independent review also compared eight default-mode cases with the previous
reference and found identical results.

The opt-in GPU extension adds 16 synthetic terrain/ground/shadow fixtures with two
comparisons each and 29 diagnostic work-bound checks. It retains all original
1,171 assertions and their tolerances.

| Retained run | Result | Interpretation |
| --- | --- | --- |
| `atmosphere-terrain-baseline-a/evidence.json` | 1,229 / 1,232 passed | All original assertions pass; three new scattering comparisons reproduce ground-crossing integration errors. |
| `atmosphere-terrain-segmented-a/evidence.json` | 1,232 / 1,232 passed | Splitting at analytic ground roots and closest approach corrects those tested errors. |

The candidate retains the monotonic quadrature integrand, column fields, phase,
density, exposure, Sun visibility and endpoint equations. Independent review
verified the exact transformation boundary and receipt shader hashes. The largest
scattering-channel absolute errors in the three previously failing fixtures were:

| Synthetic fixture | Baseline error | Segmented candidate error |
| --- | ---: | ---: |
| Earth polar endpoint at height -22.37 km | 8.0800e-4 | 3.0127e-6 |
| Retained Mars subdatum ray 135 | 7.5618e-3 | 1.2644e-6 |
| Retained Mars subdatum ray 137 | 7.5597e-3 | 1.4340e-6 |

Acceptance still uses the original per-channel rule `1e-4 + 0.002 * abs(reference)`
for these transfer comparisons. Other original thresholds remain unchanged.
The candidate has an analytic maximum of 60 quadrature nodes: at most two lit
intervals plus three distinct internal geometric cuts yield five nonempty
segments, each using 12 nodes. The tested maximum was 36, compared with 24 in
the baseline. This counter measures work, not GPU execution time or an improvement
in application performance.

The evaluated candidate helper SHA-256 is
`34759aae67a12e8277dcc32dc0b553cecb6bf6cb656809082e1c7f8b53a7e430`;
the Python reference SHA-256 is
`cf5187becfd29d8e2eb908fc15991c5e0655f62c2ef0fcffb6f3bc8eec25d597`.
Receipts additionally bind the evaluated transfer, material and shell shaders.

These 1,232 checks are **not** the complete 5,592-point interpolation qualification.
The previous bounded-field candidate's 368 failures remain unresolved evidence.
Its frozen worktree is preserved. No segmentation or field candidate is promoted
by this result, and the original three final Earth draws within five seconds gate
is unchanged.

## Color contracts and texture measurements

The [color contract](COLOR_PIPELINE.md) records the actual decode, upload, filter,
shade, emission, composition and output behavior for surfaces, clouds, Earth night
lights, palette overlays, moon recipes and fallbacks. New renderer-harness tests
exercise all 20 registered mapped surfaces, ten unmapped catalogue moons, all four
Earth auxiliary roles and pending/disabled/ready routes. They observe the real
uniform/upload routing; they do not turn source display imagery into calibrated
reflectance or establish monitor colorimetry.

The [texture qualification](TEXTURE_PIPELINE.md) includes independent actual-GPU
controls for encoded interpolation, mip filtering, premultiplied coverage,
nearest scientific palettes, resize and malformed-image behavior. The successful
`texture-baseline-c/evidence.json` records:

- 48 successful source samples: all 24 registered sources, once with cold and
  once with warm browser HTTP cache.
- Nine passing filtering, resize, palette and error controls; all 48 completion
  fences signaled.
- Fourteen real application snapshots. Warm reentry retained five mapped uploads
  without new uploads. The tour observed 20 mapped uploads, 12 deletions and eight
  remaining handles; peak live mapped handles was eight.
- No application page or GL errors in this diagnostic.
- Chrome 151.0.7922.174, ANGLE/SwiftShader, `MAX_TEXTURE_SIZE=8192`. Every retained
  source grid uploaded unchanged, including Earth's 5400 by 2700 image.

The uploader uses the actual device maximum; the earlier suggestion of a universal
4096 cap is incorrect. The largest-eight RGBA8/mip payload estimate is 179,424,636
bytes. The greatest observed tour snapshot corresponds to 176,879,044 estimated
payload bytes. Neither quantity is observed VRAM or total browser memory.

Fetch, hashing, image decode, resize, upload API, mip API, completion-fence
observation and first-sampling readback are recorded separately. The optional
driver timer brackets the complete `makeTexture` call. CPU/API/fence observations
cannot be summed into a GPU execution-time claim. One sample per source/cache
phase is a diagnostic baseline, not a stable latency distribution or a target
hardware optimization comparison. The profiler SHA-256 matches its passing
receipt: `3226b55c10469672471f7256cdde2a474a77a6a13a93b7813bcb08a9843f27e8`.

Failed attempts `texture-baseline-a` and `texture-baseline-b` are preserved. Their
source replays and pixel controls passed, but page-scoped Fetch interception in
the new profiler stranded application module-worker startup before texture
allocation. Aligning the profiler with the existing browser harness's host/CDP
policy produced the passing counterfactual without changing application bytes or
deadlines. The texture document retains this diagnosis and the corrected timer
label. Independent review confirmed receipt overwrite protection, passing tests
and the current tool/receipt hash.

No derived texture format is selected. A migration needs repeated target-device
measurements, a declared color/alpha/mip transform, source and derivative identities,
error limits, capability fallback and lifecycle tests.

## Validation and reproduction

Run these commands from the repository root. Node 22.23.2 was used for the full
web suite/coverage; the repository's existing Node 22 runtime was placed first in
`PATH` for spawned test processes.

```powershell
node --experimental-vm-modules --test tests/web/*.test.mjs
node tools/check_node_coverage.mjs --output-dir=build/rendering-qualification-20260914/node-coverage
python -m unittest discover -s tests/python -p 'test_*.py'
python tools/typecheck_web.py
python tools/validate_ux_contract.py
python tools/validate_sdlc.py
python tools/validate_docs.py
git diff --check
```

The coverage run includes **1,000 / 1,000 passing web tests**, no skips. Application
source coverage is 98.04% lines, 91.45% branches and 95.32% functions, above the
unchanged 90% floors. The full Python suite passes **373 / 373 tests**. Web type,
UX, SDLC, documentation and diff checks pass. The independent reviewer also passed
the candidate adapter tests, syntax checks and receipt/source-integrity review.

Actual-GPU commands, using unique new output directories on reproduction:

```powershell
node tools/atmosphere_validation.mjs --web-root=build/pr107-review-p2-final --out=build/rendering-qualification-20260914/atmosphere-terrain-baseline-a --terrain-endpoints
node tools/atmosphere_validation.mjs --web-root=build/pr107-review-p2-final --out=build/rendering-qualification-20260914/atmosphere-terrain-segmented-a --terrain-endpoints --ground-crossing-candidate
node tools/texture_pipeline_validation.mjs --web-root=build/pr107-review-p2-final --out=build/rendering-qualification-20260914/texture-baseline-c
```

The first command intentionally records the three diagnosed failures. Browser/GPU
runs were serialized. Host idleness was not measured. The passing texture replay
ran while the parent avoided heavy CPU tests. All owned browser processes closed.

## Remaining admission gates

1. Qualify the complete bounded-scattering domain, then original actual-raster,
   whole-application, animation and hosted CI gates. Accurate segmentation alone
   does not resolve the open performance P1.
2. Implement a separately reviewed color migration only after the documented
   route-specific GPU and composition tests are in place.
3. Repeat texture measurements on target native GPUs and comparable candidates
   before admitting a derived representation. Measure actual memory separately
   if a claim about residency or a memory bottleneck is needed.
4. Use the [separate advanced slice specifications](ADVANCED_RENDERING_SLICES.md) for HDR, reflection, richer
   terrain, ring transmission and moon photometry. Missing independent source
   products keep the corresponding physical claim unadmitted.

This work does not freshly qualify the full application with terrain, optics and
animation enabled, native GPUs, deployed behavior or a release. The texture tour
disables those costly effects to isolate image/cache behavior. Existing fault
injection tests, not that tour, cover context loss and stale callbacks. No new
runtime feature or visual before/after screenshot is claimed by this tooling slice.
