# Texture pipeline measurement and admission

Status: local qualification tooling; derived-format migration remains held.
Date: 2026-09-14.

This work measures the retained texture path before choosing a different encoding,
decode mechanism, upload layout, or mip recipe. It does not change source imagery,
the renderer, display transfer, source grids, cache policy, or release activation.
It implements the evidence boundary in [RFC 0004](../../rfcs/0004-registered-planetary-appearance.md),
[RFC 0005](../../rfcs/0005-physical-rendering.md), and the existing
[reference demand contract](../2026-09-13-system-polish/REFERENCE_DEMAND.md).

## Existing path and inventory

`apps/web/js/orrery.js::requestReferenceTextures` admits at most two concurrently
owned `Image` requests and keeps eight ready mapped-reference textures. Source
dimensions must match the registered inventory before upload. Ready entries lose
their `Image` reference; failure and cancellation clear callbacks and source URLs.
The application deletes the least recently needed ready texture outside the current
demand before admitting a ninth. Leaving the System view cancels pending work and
retains the bounded ready cache. Existing runtime tests cover stale completion,
failed uploads, cancellation, retry, eviction and context restoration.

`makeTexture` uses the actual `MAX_TEXTURE_SIZE`, an RGBA unsigned-byte upload,
`UNPACK_FLIP_Y_WEBGL=false`, and an explicitly selected alpha interpretation.
Photographs use linear magnification and trilinear mip minification. Masked photographs
upload premultiplied color so no-data RGB does not contaminate valid coverage.
Scientific sea-ice palette pixels use nearest sampling and no generated mip chain.
The function does not explicitly set `UNPACK_COLORSPACE_CONVERSION_WEBGL`; the harness
records the observed state rather than inferring no browser color processing.

Images larger than the device limit are resized with Canvas while retaining their
full extent and aspect ratio. Palette maps fail rather than resize. **4096 is a
device-limit scenario, not a universal renderer cap.** The retained Earth land image
is 5400 by 2700; it would become 4096 by 2048 on a 4096-limit device. Larger supported
devices receive its original dimensions. Canvas smoothing and color-space attributes
are part of the recorded evidence.

The current 24 mapped references contain 36,656,019 encoded bytes. At original
dimensions, the largest eight RGBA8 payloads including each photographic mip chain
sum to 179,424,636 bytes (171.11 MiB). The largest two decoded RGBA pixel arrays would
contain 84,240,000 bytes (80.34 MiB). These independently reproduced inventory totals
agree with the existing demand document. They describe payload accounting only.
Browser decoder working memory, retained HTTP cache entries, driver allocations,
GPU tiling/compression, Canvas intermediates, other scene resources and process
overhead are not included. The browser has no portable per-texture VRAM meter here.

## Reproducible local command

The new tool uses the repository's existing `puppeteer-core`, `pngjs`, and staged
preview server. It launches its own bounded Chromium process and serves only the
selected local stage and synthetic fixtures. The isolated replay additionally uses
same-origin Fetch interception. The application uses the existing browser-validation
host-resolver/CDP policy because page-scoped Fetch interception can strand module
worker imports. Both install network restrictions before navigation. Service-worker bypass keeps this
measurement independent of installation and update workflows.

```powershell
node --check tools/texture_pipeline_validation.mjs
node --test tests/web/texturePipelineValidation.test.mjs
node tools/texture_pipeline_validation.mjs --web-root=build/pr107-review-p2-final --out=build/rendering-qualification-20260914/texture-baseline-a
```

`--web-root` defaults to `build/site-review`, the README's staged preview location;
there is no implicit source-tree fallback. `--out` defaults to
`coverage/texture-pipeline`. Use a new output directory for each retained attempt.
The tool reserves `evidence.json` exclusively, refuses to overwrite an earlier
receipt, writes its own receipt incrementally, and exits 1 on a failed gate. The
default browser is `CHROME_BIN` or the same platform Chrome location used by existing
qualification tools; `--browser=PATH` selects an existing executable. It installs
no dependencies or browser binaries. The run deadline is 240 seconds, followed by
bounded cleanup of its own process and local HTTP server.

For inventory admission without launching a browser:

```powershell
node tools/texture_pipeline_validation.mjs --web-root=build/pr107-review-p2-final --out=build/rendering-qualification-20260914/texture-inventory --inventory-only
```

For a separately scheduled native-device run, add `--gpu=native` and use a new
output directory. The default `--gpu=software` requests SwiftShader. The reported
renderer determines what actually ran; requesting native rendering does not prove
a hardware backend. `--iterations=1` is the bounded default; values 1 through 5
retain every sample and support repetitions after a useful baseline exists.
Do not run rendering profiles concurrently when using their timings for comparison.

The tool validates the size and SHA-256 of every staged release file before browser
launch, then separately binds the visual inventory, renderer, extracted upload
function and demand policy. Each decoded input is rehashed in the browser and its
natural dimensions checked. Manifest base revision is lineage; per-file hashes
identify the tested artifact even if an earlier metadata revision names the stage.

## Separate measurements

| Evidence field / phase | What it observes | What it does not establish |
|---|---|---|
| Encoded bytes and SHA-256 | Exact retained JPEG/PNG bytes from the stage | Decoder memory or reflectance calibration |
| `local_fetch_body_ms` | Local fetch through complete compressed response body | Internet/provider latency |
| `hash_api_ms` | Browser SHA-256 wall time | Decode time |
| `decode_api_ms` | Blob `Image.decode()` promise wall time after bytes are available | Isolated decoder CPU cycles; excludes neither scheduling nor browser color work |
| `resize_api_ms` and Canvas attributes | Actual `drawImage` call wall time when the upload function resizes | GPU-only resampling duration or a new resolution policy |
| `upload_api_ms` | `texImage2D` CPU-call wall time | Completed upload, GPU-only time, or resident VRAM |
| `mipmap_api_ms` | `generateMipmap` CPU-call wall time | Completed mip generation or a linear-light mip recipe |
| `get_error_api_ms` | Existing upload error-query call wall time | A pure cost of error detection independent of driver synchronization |
| `factory_api_ms` | Exact `makeTexture` invocation including instrumentation | An uninstrumented frame-time benchmark |
| `preceding_finish_wall_ms` | Completion of work preceding the isolated replay | Application frame behavior; this barrier is only in the harness |
| `completion.wait_wall_ms` | Fence/flush plus nonblocking polls until signaled | GPU execution time; polling and scheduling are included |
| `gpu_elapsed` | Optional non-disjoint driver timer query bracketing the complete `makeTexture` call, including any resize delays and its error query | Isolated upload/mip execution time, decode time, first sample, or a portable hardware timing guarantee |
| `first_sample` | First sampling draw and separate `readPixels` completion wall time | Whole-app rendering or present-to-screen latency |
| Application image `load_decode_wall_ms` | Real `Image.src` assignment to load event | Pure decode time: transfer, scheduling and decode overlap |
| Application texture ledger | Actual create/upload/mip/delete events and mapped-source attribution | Physical deallocation, browser collection or driver memory reclamation |

Cold and warm are recorded separately for every source and iteration. Cold clears
the browser HTTP cache before the first fetch; it does not flush the OS filesystem
cache, driver, process state or decoder code. The immediately following warm fetch
uses the same URL and enabled browser cache. The local server supplies explicit
cache headers. Resource Timing transfer/encoded/decoded body sizes are retained;
`decodedBodySize` refers to HTTP content decoding, not decoded image pixels. A warm
label alone is not evidence that a response was delivered from a cache.
The application tour starts with a new page and new GPU resources, while browser HTTP
entries are already warm from the replay. Its reentry check concerns retained application
texture handles. It must not be described as a cold-start application benchmark.

Upload/mip completion failures remain failed samples. Unsupported or disjoint timer
queries are unavailable values, never zero-time successes. The first sampling draw
is deliberately separate because a driver can defer texture preparation until use.
These boundaries follow the [WebGL 2 synchronization specification](https://registry.khronos.org/webgl/specs/latest/2.0/)
and [WebGL performance guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

## Filtering and failure controls

The in-memory PNG fixtures have fixed byte hashes and independent expected pixels.
They execute the exact staged `makeTexture` through a simple sampling shader:

- A black/white gray step characterizes the encoded midpoint near 128. It does not
  present encoded-space interpolation as linear-light interpolation: the sRGB
  encoding of a 0.5 linear-light value is approximately 188. Any new linear storage
  or mip recipe must declare and qualify that difference.
- A two-by-two gray checker samples mip level 1 to exercise generated minification
  rather than only magnification or a single texel.
- An opaque colored pixel beside transparent magenta no-data exercises premultiplied
  coverage at level 0 and the coarse mip. Recovering covered color must preserve
  [64,128,224] with approximately half alpha; transparent magenta must not leak in.
- Two sea-ice-style discrete palette entries retain exact values on opposite sides
  of their nearest-sampling boundary. A simulated one-texel device limit must reject
  that palette without Canvas resizing or a GPU upload.
- A malformed local PNG must fail before upload. A small simulated-device photo
  exercises the real Canvas branch without allocating an oversized test image.

These synthetic checks characterize filtering and upload interpretation. The
existing `planet_appearance_validation.mjs` remains the integration gate for actual
material shaders, registration, source masks, source-rgb moons, and display behavior.
Synthetic success alone is not photographic or scientific color calibration.

## Retained local evidence

The complete software baseline **passed** in
`build/rendering-qualification-20260914/texture-baseline-c/evidence.json`:
48 source replays, nine filtering/resize/error controls and the actual application
cache tour. The exact harness SHA-256 is
`3226b55c10469672471f7256cdde2a474a77a6a13a93b7813bcb08a9843f27e8`.

Two earlier replay attempts remain in ignored local output directories:
`build/rendering-qualification-20260914/texture-baseline-a/evidence.json` and
`build/rendering-qualification-20260914/texture-baseline-b/evidence.json`.
Both overall results are **failed** because the subsequent real-application pass
did not initialize its ephemeris worker. The second receipt preserves that diagnostic:
zero computed bodies, zero WebGL texture handles and an existing engine wall-deadline
failure, including the attempted text fallback. No source image was requested by the
mapped loader. This is an earlier failure than texture readiness and does not establish
a texture-cache failure. The tool did not relax the engine deadline or substitute
a synthetic ephemeris.
Comparison with `tools/browser_validation.mjs` identified a concrete harness difference:
that tool explicitly avoids page-scoped Fetch interception because it can strand module
worker imports. The new harness has been aligned with that established application policy;
the two failed receipts are retained. The subsequent passing counterfactual run `c`
reached the real nine-body scene and completed the cache tour with the same staged
engine and application bytes. That validates the corrected harness sequence without
changing the application or its worker deadline.

All three attempts separately completed 48 successful source replays (24 cold and 24 warm)
and all nine filter/resize/error controls. The passing attempt ran Chrome 151.0.7922.174
with ANGLE/SwiftShader and `MAX_TEXTURE_SIZE=8192`. All 24 source grids uploaded unchanged.
Every cold sample reported a nonzero Resource Timing transfer size; every warm sample
reported zero. The optional timer extension returned available, non-disjoint results
for all 48 samples. That software timer is not a hardware GPU performance result.
The earlier receipts describe the timer bracket as upload/mip-only; independent
review found that the actual bracket is the complete `makeTexture` call. The current
tool and interpretation correct that label. No source sample in the earlier receipts
resized; hypothetical Canvas timing must still not be subtracted from the bracket.

The measured stage is bound by release manifest SHA-256
`1ffe4d1b5e3b2c6fb7626a9d4ea76fb2ae2aaf4baac864afc427660e0b2113ac`,
renderer SHA-256
`37cc7831751bd3dae032e1569a299c5fb2e1a6cffb50bf3093e9d927a2f77817`,
and exact replay function SHA-256
`f024387d47163064c23c3dd7dfadfb99e5b29f49606690f665ada4336a128add`.
The manifest's older `069d0ba` base revision does not replace those exact byte identities.

The passing attempt's 5400-by-2700 Earth image illustrates the measured boundaries:

| Earth land image boundary | Cold browser cache | Warm browser cache |
|---|---:|---:|
| Blob `Image.decode()` wall time | 28.7 ms | 28.5 ms |
| `texImage2D` call wall time | 83.0 ms | 67.8 ms |
| `generateMipmap` call wall time | 0.0 ms | 0.0 ms |
| Post-upload/mip fence observation | 35.9 ms | 34.2 ms |
| First sampling readback completion | 26.2 ms | 3.0 ms |

There is one sample per source and cache phase in each attempt; this is a diagnostic
baseline, not a stable latency distribution or an optimization comparison. A displayed
0.0 ms API duration means the browser timer did not resolve elapsed call time; it does
not mean mipmaps were free or absent. API, synchronization and first-use durations must
not be added into a purported GPU execution time. The results justify measuring upload
and first-use cost independently of encoded file size, but do not yet select a derived
format or justify changing the existing color pipeline.
The browser/GPU workload was serialized among the cooperating tasks, while modest CPU
validation, source inspection and document editing continued concurrently. Host CPU
idleness and background applications were not measured. These API wall timings are
diagnostic observations and do not constitute a product performance guarantee.

The gray midpoint and coarse gray mip both read [128,128,128,255]. Recovered masked
color read [64,128,224,128] at the coverage boundary and [64,128,223,128] at the coarse
mip, within the predefined three-byte tolerance. The two nearest palette entries
matched byte-for-byte. CPU validation passed all 39 cases across the new tool tests,
`referenceDemand.test.mjs`, and `planetAppearanceRuntime.test.mjs`; those existing
runtime tests exercise application lifecycle logic through their deterministic harness,
separately from the real-browser lifecycle pass.

The passing application pass recorded 14 snapshots. Earth first-demand completion,
departure and warm reentry each retained five mapped uploads and five live mapped
handles; reentry added none. The body tour then forced eviction: 20 mapped uploads,
12 deleted handles and eight remaining handles at completion. Peak live mapped
handles was eight. The initial Earth-demand snapshot observed two pending mapped
images. All completed snapshots had no pending mapped images, and the pass observed
no application page or GL errors. The greatest snapshot RGBA8/mip payload estimate
was 176,879,044 bytes (168.69 MiB); it is **not observed VRAM**. Native-device timings,
actual browser/GPU memory and whole-app performance with terrain/optics remain outside
this software diagnostic.

The subsequent application pass independently visits Earth, leaves and reenters
System, then tours enough bodies to force eviction. It observes the existing cache
and checks warm reentry does not upload already-ready maps, live mapped handles stay
within capacity, and old handles are deleted during the tour. Animation, terrain
and optical-transfer controls are disabled for this mapped-image diagnostic. The
tool does not treat that workload as whole-app performance. Context-loss recovery,
in-flight cancellation and stale callbacks continue to be covered by existing
renderer runtime tests; this tour does not replace those fault-injection cases.

## Decision gate for derived representations

No alternate encoding is introduced by this work. A proposed derived product needs
both a measured benefit and a complete data/appearance contract:

1. Identify which observed phase constrains the target device and workload. Repeat
   the baseline and candidate with the same sources, context settings, cache state,
   view, browser/backend and output identity. Software and native runs stay separate.
2. Preserve original source bytes and registration. Record derivation version,
   source/output hashes, dimensions, transform, color transfer and storage format.
3. Define alpha/no-data semantics for every mip and filter. Quantify edge contamination,
   gray-ramp differences and covered-color error; nearest palettes remain exact.
4. Compare decode, upload, completion, first-use and warm-cache behavior independently.
   A smaller download or faster CPU call alone is insufficient. Estimates must not
   become claims about observed browser/GPU memory.
5. Test supported format capabilities and bounded fallback on each target backend.
   Decoder unavailability, format rejection, context loss, cancellation and failed
   admission must retain the existing disclosed source/fallback state.
6. Run the source/material GPU gates and unchanged scientific/registration tests.
   Review performance and appearance evidence before proposing a renderer or
   manifest change. A speculative format conversion is not part of this baseline.
