# PR 107 runtime admission ledger

This ledger continues the accepted implementation plan from published revision
`34937f1bcf0a7fb91d4580e790769b623421da80`. A row is not release approval.
The original numerical limits, 5,592-query interpolation domain, three final
Earth draws in five seconds, startup deadline, texture detail and scientific
state remain controlling. Failed experiments and their receipts are retained.

## Current combined source

Runtime `daa1fbec5f6f13333731b0b279fd085926a483ff` combines coherent prepared
shadow support, cancellation-safe column-tail height and the shared segment
callsite with the material, HDR, terrain and memory-readiness changes. Its
immutable stage is `scattering-runtime-shadow-daa1fbe`, manifest SHA-256
`66bed0d35d930ba834017b6f948aada05c70b47767ab394130d310f54928adf4`.
The frozen capture source contains 836 tracked files; all 218 production files
match their committed raw bytes, with 205 staged assets and 185 source bindings.
The later numerical receipt changes documentation only. Final Mars captures use
the committed validator fixes through `7b588c18bdf4a7118e9c9a9c57fcefad2b25ff01`:
the 840-file snapshot overlays seven validator/test/document files and has no
production-file differences. Startup and restoration waits now respect the
actual asynchronous owners before freezing state or admitting resources; exact
invariants and the existing 40-second recovery and 240-second total limits remain.

| Gate | Current evidence |
| --- | --- |
| Original 5,592 queries plus 1,600 terrain/ground/shadow cases | 7,192/7,192 pass on native Adreno and SwiftShader, all 21 datasets and 42 valid atlases per backend. |
| Independent supplemental physical-source comparison | 1,600/1,600 pass per backend; all original CPU input records and tolerances retained. |
| Original physical atmosphere gate | 1,280/1,280 pass on SwiftShader. No native aggregate pass is inferred from the earlier timeout. |
| Native three-program readiness | Sphere 8,708.0 ms, shell 4,040.7 ms and generator 11,656.9 ms, within the unchanged 30,000 ms owner deadline. One observation does not establish a latency distribution. |
| Four numerical field products | Regenerated payloads are byte-identical; source-identity metadata updated. |
| Combined local code checks | 1,234 web tests, 395 Python tests, 110-file typechecking, static/UX/SDLC/asset checks pass. Node coverage: 98.10% lines, 91.12% branches and 95.45% functions, above every 90% floor. |
| Final application and composition | All eight gates pass: native/software Earth, native/software Mars (22 checks each), native/software material (266 each), appearance (110) and HDR (66). They include actual current physical producer/consumer/final-presentation joins, fine terrain, animation and context restoration. |
| Full-workload native memory | Earth and Mars each pass all five checkpoints after their original application gates. Active/restored shared GPU-process usage is 471,040,000/411,668,480 bytes for Earth and 486,653,952/324,415,488 bytes for Mars. These are owned-process/WDDM observations, not per-texture VRAM or continuous residency. |
| Final published-head hosted CI | Pending publication and fresh hosted results. The earlier `6083b5c` failures remain retained. |

The [numerical qualification](ATMOSPHERE_SHADOW_CONDITIONING.md) and
[source-bound receipt](ATMOSPHERE_SHADOW_CONDITIONING_QUALIFICATION.json)
record the complete matrix and independent reference joins. The
[proposal receipt](ATMOSPHERE_SHADOW_CONDITIONING_RECEIPT.json) preserves the
intermediate compiler failures, exact native diagnostics, independent reviews
and unchanged work/resource limits. The public point-Sun reference function is
byte-identical; its validator now extracts the function body independently of
where the shadow helper is declared.

The full-workload memory guard now waits for the exact selected registered
imagery and preserves that identity across sampling and context restoration.
The guard establishes source readiness, not measured VRAM by itself. Final local
application gates pass. Published-head CI remains required before closing the
performance P1 or claiming merge readiness; merge and deployment are separate.

The [final application record](RUNTIME_FINAL_QUALIFICATION.md) and
[machine-readable receipt](RUNTIME_FINAL_QUALIFICATION.json) retain all eight
capture results, exact executed sources, failed attempts and native memory
observations. Separate unedited Earth/Sun workspace screenshots retain their own
source and browser identity; they use the normal SDR UI, not the opt-in HDR test
configuration. Local receipt completion does not certify final published-head CI.

| Current physical final draws | Native Adreno | SwiftShader |
| --- | --- | --- |
| Earth with HDR presentation | 5 in 135.5 ms; first physical readiness 22,072.8 ms from System entry | 5 in 1,623.4 ms; first physical readiness 46,151.9 ms |
| Mars with level-4 terrain and HDR | 5 in 131.8 ms; restored terrain/optics ready 387.7 ms from request | 5 in 1,577.8 ms; restored terrain/optics ready 13,630.9 ms |

These finite captures satisfy the original draw and readiness deadlines; they do
not establish a stable frame-rate or texture-latency distribution. Held producers
and presentations remain rejected. Initial Windows browser discovery, premature
startup-invariant capture and premature context-restoration admission failures
remain preserved separately from the corrected passing runs.

## Earlier prepared-path source

Candidate `256e935950f2820dcd695f55c6aeaba79a90f679` carries one prepared physical
path through source integration, conditioning, lookup and transmission. Its stage
is `scattering-runtime-prepared-full`, manifest SHA-256
`04ad2e94588e8860719e750cea50954e21be4ee22164fe97a0993ce5bc08c7aa`.
All four optical payloads again reproduced byte-identically. The ten earlier
grazing failures pass on both backends, but this candidate is still unqualified.

The complete software matrix passes 7,192/7,192; native Adreno passes 7,191/7,192.
All 42 atlases per backend are finite and valid. Native's sole failure is
`Mars-forward-terrain/surface/500`, with matching direct-source transmission but
an incorrect interpolated scattering contribution. Separate strict comparisons
of the 1,600 supplemental direct GPU values against the converged physical CPU
reference pass on both backends. Those source comparisons do not cover every
generated atlas node and do not override the interpolation failure. The
[interpolation receipt](SCATTERING_INTERPOLATION_RECEIPT.json) preserves both
attempts, their source identities and all eleven earlier run records.

The native three-program compiler diagnostic passes the unchanged 30,000 ms
deadline: physical sphere 6,027.1 ms, shell 2,526.6 ms and generator 29,792.6 ms.
The generator's 207.4 ms margin is one observation, not stable startup latency.
The [prepared-path receipt](ATMOSPHERE_PREPARED_PATH_RECEIPT.json) also retains
the focused 16-query replays and strict original physical regressions. Final
application and full-feature memory qualification remain pending. Combined local
checks pass 1,207 Node tests, 395 Python tests, 110-module typechecking, static web,
UX structure, 23-requirement SDLC and 130 tracked Markdown checks.

Independent non-FMA binary32 reconstruction located the discrepancy at atlas node
`x31/y23/z12` and reproduced five rejected Gauss points. Exact native readback then
corrected the attribution: its prepared segment and shadow arithmetic differ
from that CPU model. Native's illuminated suffix is 20.62988 metres, while a
binary64 intersection of the actual native segment gives 15.80139 metres. The
native shadow boundary starts illuminated support 4.82849 metres too early.
Four rejected native points are genuinely shadowed; the fifth is a false tangent
hit. Instrumented and original generator residuals agree exactly across the eight
captured nodes. The retained diagnostic is
`sol-scattering-backend-diagnostic-20260914/build/observer-prepared-path/node-native/evidence.json`.
The analytical boundary must become robust before a source kernel can trust its
clipped support. Bypassing local visibility alone would include genuinely
occluded samples. Public solar visibility, original node/allocation budgets and
the complete numerical gates remain controlling; no correction is admitted
merely from this diagnostic explanation.

The independent memory review also requires exact registered-source readiness
after context restoration, before accepting the declared imagery workload.
Enabling textures alone does not establish that their resources are ready. This
additional predicate must retain the existing preparation and application limits.

## Earlier observer geometry source

Candidate `adb456062e849d754247a658bd287aad7ad57bc4` combines the guarded physical
material consumer with compensated observer roots and endpoint-preserving surface
preparation. Its immutable stage is `scattering-runtime-adb4560-full`, manifest
SHA-256 `5aee4b4cc33159c7e7adb67dc72e2d317b82a73cab737d060b4af37f4833890c`.
All four optical payloads reproduced unchanged; only their solver/generator
identity metadata changed. This candidate remains unqualified.

The original software reference gate passed 1,280/1,280. The complete software
interpolation run passed 7,182/7,192 with all 42 atlases finite and valid. Its ten
failures concern grazing limb domain or lookup consistency. A separate comparison
of all 1,600 supplemental direct GPU results against the converged physical CPU
reference passed. That physical-source result does not override interpolation
failures. The original 5,592 queries and all supplemental inputs, tolerances and
allocation budgets remain unchanged. Both attempts and their exact sources are
retained in [the interpolation receipt](SCATTERING_INTERPOLATION_RECEIPT.json).

Native numerical attempts did not complete: the aggregate 1,280-case browser
call exceeded its 30-second protocol limit before returning results; the
7,192-query run exceeded its 120-second numerical call limit in the first
dataset. No completed numerical cases are inferred from either failure.
The separate actual production-program diagnostic then attributed a compiler
hold: the physical sphere and shell completed in 10,166.0 and 3,781.7 ms, while
the generator exceeded its unchanged 30,000 ms deadline. Its receipt is
`sol-color-hdr-20260914/build/compile-regression-649ab1c/compile-observer_adb4560.json`.
Diagnostic process success means evidence was captured, not that all programs
passed. Complete application and memory runs have not started for this stage.

Independent binary32 replay identifies two limb defects: repeated normalization
can change an uploaded grazing ray enough to reverse its hit classification,
and the prior closest-point altitude calculation can reject a real hit through
metre-scale cancellation error. The next correction must carry one prepared ray
and precise impact geometry through source, conditioning, zero tests, transmission
and lookup. It must preserve original physical inputs and pass the complete
numerical, material and application gates; a consistent but changed test oracle
cannot establish that result.

## Earlier Q2 combined source

The earlier bounded-scattering implementation at `649ab1ca56402765fed601c4d1424e2bae1c82f6`
passes the complete 7,192-query interpolation matrix on native Adreno and
SwiftShader. The original 5,592 queries, all numerical thresholds and the 65,536
integration ceiling remain unchanged. The additive domain includes the admitted
v2 Mars mesh and explicit material heights. Q2 fixes native packed-atlas row
decoding and uses fixed density partitions across shadow changes. The atmosphere
shell's drawn radius now matches its optical endpoint radius for Earth and Mars.
See [the exact numerical receipts](SCATTERING_INTERPOLATION_RECEIPT.json).

Independent physical-source admission remains open. Actual GPU comparisons to the
converged supplemental corpus find an Earth grazing-ray transmission discrepancy
on both backends and a software-GPU Mars outer-boundary geometry discrepancy.
These are not interpolator failures and are not removed from the domain. Their
uploaded-coordinate geometry is being checked independently. The constant-datum
source-coordinate fix retains the 60-node analytic bound and reproduces the four
numerical field payloads unchanged; its [separate record](ATMOSPHERE_OPTICAL_COORDINATE.md)
does not waive these actual GPU checks.

The prior immutable bounded runtime at `2ba2911` passed the original final-frame
application gates with HDR and physical optics on both native Adreno and
SwiftShader. The latter also passed withheld-generator rejection and fresh
generation recovery. Those timings are retained in the
[application receipts](SCATTERING_APPLICATION_RECEIPTS.md); final-source replay
remains required. Optional [full-feature memory checkpoints](FULL_FEATURE_MEMORY.md)
now run only after all original timing gates have finished.

The first native replay of immutable stage `scattering-runtime-649ab1c-full`
(manifest SHA-256 `e9a93cde4d69d3a2dd624ee33dd49c5d5abc59d01044a6d0559ac27d270d5bbd`)
failed additional physical readiness. The original HDR Earth gate accepted four
matching final draws in 74.5 ms and rejected its frozen control, but both the
physical surface and scattering generator exceeded the unchanged 30-second
shader-completion deadline. No eligible physical candidate was accepted; memory
sampling did not start. The frozen 501-file tool/source snapshot and 205 staged
asset hashes reproduced unchanged after failure. This is a current performance
hold, retained at
`sol-color-hdr-20260914/coverage/scattering-runtime-649ab1c-native-memory`.

Combined local validation before the final four geometry regression additions:
1,172 Node tests and 395 Python tests passed; 110 JavaScript modules typechecked;
static web, physical assets and the 23-requirement SDLC contract passed. Individual
regressions additionally cover exact axes, periodic seams and 315 reconstructed
surface endpoints. Hosted CI and publication still refer to the previously pushed
head until a new push and completed checks are recorded below.

## Earlier checkpoints and evidence boundaries

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

## Historical native bottleneck and retained format decision

Ground-boundary production receipt:
`build/pr107-production-20260914/atmosphere-ground-runtime-a/evidence.json`,
SHA-256 `d7e043bbe7d26bc8b275e220919f3b0ff860ef33af91538d223d3cab3248317f`.
This evaluated `apps/web` directly with no candidate substitution. Its recorded
source hashes bind the production integrator and every evaluated shader.

```powershell
node tools/atmosphere_validation.mjs --web-root=apps/web --terrain-endpoints --out=build/pr107-production-20260914/atmosphere-ground-runtime-a
node --test tests/web/atmosphere*.test.mjs
```

The historical `34937f1` native run used ANGLE/D3D11 on the Qualcomm Adreno X1-85. Its original
30-second startup gate failed. A separately labelled diagnostic continuation
completed the texture/cache tour without GL or page errors. Timed shader links
include approximately 4.65 seconds for the base sphere and 26.34 seconds for the
physical sphere. `KHR_parallel_shader_compile` is available on this device.
This established the shader initialization problem addressed by the later
bounded program owner and qualified runtime above. The original failed startup
remains failed; later source-bound passes are separate evidence.

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
application gates pass. RFC 0006 is Accepted for its design and work sequence;
source-specific application and published-head hosted admission remain separate.

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
