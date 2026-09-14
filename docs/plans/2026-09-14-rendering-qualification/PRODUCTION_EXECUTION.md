# PR 107 runtime admission ledger

This ledger continues the accepted implementation plan from published revision
`34937f1bcf0a7fb91d4580e790769b623421da80`. A row is not release approval.
The original numerical limits, 5,592-query interpolation domain, three final
Earth draws in five seconds, startup deadline, texture detail and scientific
state remain controlling. Failed experiments and their receipts are retained.

## Current work and evidence boundaries

| Slice | Implementation / qualification | Remaining admission |
| --- | --- | --- |
| Ground boundaries | Production Earth/Mars integrator now uses the qualified ground/closest-point segmentation. Fresh production-source float64/GPU gate passed 1,232/1,232; 30 focused unit tests passed. The analytic bound remains 60 nodes (observed maximum 36); no node or tolerance reduction. | Integrated renderer checks and final-head publication. |
| Bounded scattering | New isolated experiment interpolates a normalized attenuation residual and evaluates actual endpoint, lit support, phase and columns at the consumer. First full run rejects 144/5,592 queries; the previous experiment rejected 368. Neither is admitted. | Correct the remaining interpolation error, then entire retained domain, source-bound production integration, animation, terrain, context restoration and original performance gates. |
| Color | Separate actual shader qualification covers per-material linear composition and explicitly scoped opaque-map decoding before filtering. Masked, moon and scientific-display recipes retain their declared filtering semantics. | Integrate the independently reviewed change and qualify full frame composition and fallback. |
| HDR | Fixed-exposure linear target, bounded allocation and observed final presentation are being implemented separately. | Full application/native qualification; an offscreen Earth draw alone cannot satisfy the final-frame performance probe. |
| Texture/device | Matched native Adreno and SwiftShader runs completed five cold/warm pairs for each of 24 sources. Native process memory was observed through Windows counters. | Repeat final-renderer startup and application gates. Five observations support sample medians/ranges, not stable tail distributions. |
| Finer terrain | Independently sourced whole-globe LOLA/MOLA numeric radius derivatives and matching complete shadow fields are in an isolated implementation. Original assets remain retained. | Source/derivative identity, actual terrain/shadow/context tests, full application and native resource/performance checks. This slice does not claim tiled terrain. |
| Reflection / rings / moons | Independent reflectance, coverage transport and disk-photometry definitions are being qualified separately. | Each runtime path requires its own source semantics and acceptance evidence; synthetic oracle agreement cannot establish measured planetary calibration. |
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
