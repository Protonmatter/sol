# PR 107 runtime admission ledger

This ledger continues the accepted implementation plan from published revision
`34937f1bcf0a7fb91d4580e790769b623421da80`. A row is not release approval.
The original numerical limits, 5,592-query interpolation domain, three final
Earth draws in five seconds, startup deadline, texture detail and scientific
state remain controlling. Failed experiments and their receipts are retained.

## Current work and evidence boundaries

| Slice | Implementation / qualification | Remaining admission |
| --- | --- | --- |
| Ground boundaries | Production Earth/Mars integrator now uses the qualified ground/closest-point segmentation. The expanded source-bound float64/GPU gate passed 1,280/1,280, including actual near-ground solar intersections; all four numerical field payloads reproduced unchanged. The analytic bound remains 60 nodes (observed maximum 36); no node or tolerance reduction. | Integrated renderer checks and final-head publication. |
| Bounded scattering | New isolated experiment interpolates a normalized attenuation residual and evaluates actual endpoint, lit support, phase and columns at the consumer. Candidate L passed all 5,592 software-GPU queries after the ground-visibility correction and pure-math extraction. Native Adreno rejected two queries; its accuracy admission remains open. All failed experiments, including the prior 368-failure candidate, remain retained. Ground/closest geometry and normalization are qualified independently of interpolation. | Resolve native interpolation differences, then retain the complete original domain plus additive v2 terrain/explicit-height coverage; qualify runtime composition, animation, context restoration and original performance gates. |
| Color | Runtime migration is integrated with scoped opaque-map decoding before filtering; masked, moon and scientific-display recipes retain their declared semantics. Actual appearance GPU checks passed 110/110 and expanded physical HDR composition passed 66/66 in isolated qualification. | Repeat full combined-stage/native composition and fallback gates after all runtime changes. |
| HDR | Fixed-exposure bounded linear target is integrated as an opt-in candidate. The immutable combined software stage passed four actual physical Earth draws with matching HDR presentations within 1.247 seconds, including exact linked programs, static fields and current optical geometry. | Native physical compilation still fails the unchanged 30-second limit. A dynamic scattering field additionally requires current producer/consumer proof; an offscreen Earth draw alone cannot satisfy final-frame performance. Default enablement remains held. |
| Texture/device | Matched native Adreno and SwiftShader runs completed five cold/warm pairs for each of 24 sources. Native process memory was observed through Windows counters. | Repeat final-renderer startup and application gates. Five observations support sample medians/ranges, not stable tail distributions. |
| Finer terrain | Source-derived LOLA/MOLA v2 whole-globe radius data and matching shadow fields are integrated. All 8,294,400 output cells reproduced independently, and isolated real Moon/Mars level-4 draws used 131,841 vertices and 783,360 indices. Original assets remain retained. | Combined Mars source-bound physical terrain/optics/animation passed 22 checks, including five final HDR presentations within 1.841 seconds. Native physical performance remains open. This slice does not claim tiled terrain or camera-visible detail beyond source resolution. |
| Reflection / rings / moons | Reference helpers and independent synthetic oracles are integrated, with explicit acquisition receipts and held inputs. Existing runtime display recipes remain active. | D2 needs admitted masks/roughness/index data; D4 needs visible-band coverage/depth/phase data; D5 needs disk/phase/geometry/exposure calibration and holdouts. Synthetic oracle agreement cannot establish measured planetary calibration. |
| Temporal reconstruction | Deferred by the accepted specification. | Not a dependency for these slices; no history-based rendering is admitted. |

## Measured native bottleneck and format decision

Ground-boundary production receipt:
`build/pr107-production-20260914/atmosphere-ground-runtime-a/evidence.json`,
SHA-256 `d7e043bbe7d26bc8b275e220919f3b0ff860ef33af91538d223d3cab3248317f`.
This evaluated `apps/web` directly with no candidate substitution. Its recorded
source hashes bind the production integrator and every evaluated shader.

```powershell
node tools/atmosphere_validation.mjs --web-root=apps/web --terrain-endpoints --out=build/pr107-production-20260914/atmosphere-ground-runtime-a
node --test tests/web/atmosphere*.test.mjs
```

The current native run uses ANGLE/D3D11 on the Qualcomm Adreno X1-85. Its original
30-second startup gate failed. A separately labelled diagnostic continuation
completed the texture/cache tour without GL or page errors. Timed shader links
include approximately 4.65 seconds for the base sphere and 26.34 seconds for the
physical sphere. `KHR_parallel_shader_compile` is available on this device.
This establishes a shader initialization problem to address; it does not turn
the failed startup into a pass.

Seven native checkpoints include process-level shared, dedicated and committed
GPU memory observations. These are not per-texture VRAM measurements. The matched
SwiftShader process has no corresponding Windows GPU Process Memory instance;
its counter values are unavailable, not zero. The cache tour ends with eight
live mapped images after 21 uploads and 13 deletions.

The measured evidence does not yet demonstrate texture memory pressure or justify
lossy derived imagery. Keep the admitted sources and formats. Revisit a derived
format when repeated native measurements identify an upload, resident allocation
or filtering bottleneck, and only after source/color/mask comparisons pass.
Detailed tool identities, samples and counter scope belong in the device receipt
and texture qualification documentation, not in an inferred GPU-memory total.

## Publication and release gates

At the starting revision, 18 hosted checks succeeded and two failed: the combined
CI JavaScript coverage job accepted only one Earth draw inside five seconds;
its dependent release gate also failed. Successful independent jobs do not
override that failure. Re-run hosted checks on the actual published runtime head.

PR review thread `PRRT_kwDOTIyRyM6h9g-H` concerns the ground-crossing P2. The two
performance P1 threads remain open until bounded accuracy and unchanged
application gates pass. RFC 0006 remains Draft while required admission is open.

## Combined-source optical reproduction

After combining the ground-boundary and color changes, both offline generators
were rerun explicitly. The incident generator evaluated 75,075 rays per body;
all four numerical field files reproduced their prior bytes exactly. Only source
and expanded-generator identity metadata changed. The physical asset validator
passed for two terrains, one solar reference, two incident fields and two column
fields. This reproduction does not substitute for final-frame performance tests.

```powershell
node tools/prepare_atmosphere_incident.mjs
node tools/prepare_atmosphere_columns.mjs
python tools/validate_physical_assets.py
```

The before/after comparison is retained at
`build/pr107-production-20260914/optical-reproduction/comparison.json`.
The incident payload hashes remain `4762cc9e49c98c292b412555c75867fce235aaa5f8f8165c78fd593020f06639`
(Earth) and `bd22c2568cac1dfcc970501e7c92af734eb089c6a9b52700cc70de46b1d31311`
(Mars); the column hashes remain `85605fa0d75feb5186e5b812054bef730726668c3690a2b0cecc592dd50c4893`
and `12ca78aa470ecb4191c450fa3c1981a48a0f9a049be628473929dfd2f7d8d895`.

## Nonblocking shader startup

The bounded context-owned program manager is integrated. It defers the physical
sphere/shell pair until optical demand and uses `KHR_parallel_shader_compile`
without premature compile/link status queries. The combined-source native replay
passed the unchanged 30,000 ms startup gate in 5,083 ms; the matched software
replay passed in 459 ms. Both completed 240 samples, nine controls and seven
memory checkpoints. The texture tour intentionally disables optical transport;
this is base-program readiness evidence, not native physical-frame performance.
Both runs and all failed predecessors remain preserved. See
[program lifecycle](SHADER_PROGRAM_LIFECYCLE.md) and
[native texture qualification](NATIVE_TEXTURE_QUALIFICATION.md).

At combined revision `833a40f`, all 1,061 web tests passed. The earlier combined
source passed 385 Python tests and 107-file type checking. These local checks are
not hosted CI, deployed qualification, or evidence for later untested changes.

## Native physical admission remains open

The combined native HDR run identified a separate physical-program readiness
failure: the optional physical sphere exceeded its unchanged 30,000 ms completion
deadline while all six base programs and the atmosphere shell were ready. The
additional physical spin gate rejected every fallback draw. A bounded readiness
preparation phase, anchored to the original System-entry deadline, reproduced
the timeout rather than extending either deadline. A separate filtered replay rejected 45,212 unrelated draws without issuing any
physical-candidate current-program queries and reproduced the same timeout.
That failed native receipt remains controlling; both preparation and the
subsequent three-in-five-second gate retained their original deadlines. Successful base startup and software
physical-frame evidence do not override this native failure.

The visible-ring source search acquired exact, visible-sensitive HST/FOS
observation metadata and a bounded science-file prefix. It does not establish
radial geometry, normalized transmission or independent coverage/material-depth
parameters. See [the source candidate assessment](VISIBLE_RING_SOURCE_CANDIDATE.md).

The pure scattering math and dedicated target lifecycle are now wired into the
current-frame physical material. See [runtime integration](SCATTERING_RUNTIME_INTEGRATION.md),
[interpolation qualification](SCATTERING_INTERPOLATION.md) and
[additive terrain cases](SCATTERING_SUPPLEMENT_CONTRACT.md). The integration at
`191818a` passed all 1,139 web tests. The later producer-observation changes at
`2ba2911` passed 110-file type checking; its final combined test suite remains a
separate requirement.

An immutable software-GPU application replay at `2ba2911` used manifest
`4459d0979ae4059e2bbb494ef195d82b1ac29577b848cc782bdaf7d449925bd7`.
The original Earth spin gate observed four current final draws in 926.1 ms, with
the frozen-transform and held-presentation negative controls retained. All nine
runtime programs were ready. The additional physical gate failed: its observer
required `u_scatteringLimbSize` from a surface-only consumer where that uniform
was optimized out. All 91 physical candidates were rejected, so this run does
not qualify physical performance. The failed receipt is retained at
`build/pr107-production-20260914/runtime-2ba2911-swiftshader/visual/earth-physical-readiness.json`.
Correcting the observer must preserve actual producer/frame/source checks and
rerun the complete gate; the earlier original spin pass does not substitute.

Native accuracy and final application admission remain open. The published
`6083b5c` checks completed with 17 successes and three failures: the two browser
coverage jobs rejected zero Earth draws and the dependent release gate failed.
Those results belong to that earlier direct-integrator runtime, not the new
unpublished consumer integration. Required hosted checks must complete on the
actual final published head.

## Rendering changes invalidate scientific qualification

PR review thread `PRRT_kwDOTIyRyM6h_pAi` identified missing rendering dependencies
in the shared science inventory. The inventory now covers the renderer entry,
moon/material color, reflection/ring formulas, HDR presentation, shader ownership,
reference demand and terrain resource preparation. Both `release_changes.category`
and the staged `components.science` digest use that same inventory. A change to
these modules must not reuse qualification for different rendering inputs.

The regression changes twelve module fixtures individually and builds a real
immutable artifact after each change. It failed for all twelve before the fix;
afterward every mutation changes the science digest and is classified scientific,
while unchanged WASM/data retain their identities. A stylesheet-only control
changes the UI digest without changing science. The 26-test artifact suite and
30-test focused classifier/policy run pass, including that mutation regression.
An independent review checked the changed-module inventory and direct rendering
dependencies. This release-control correction does not qualify the renderer's
numerical or device behavior.
