# D1 linear scene target and SDR presentation candidate

Status: implemented and qualified on the isolated immutable candidate below,
opt-in only. Combined atmosphere-domain, native-device, merged runtime coverage
and hosted enablement gates remain pending.
This adds no image/terrain assets, dependencies, network providers or telemetry.
It does not claim HDR-monitor output, absolute radiometry or calibrated imagery.

## Runtime boundary

`hdrPresentation.js:createHdrPresentation` owns one full-canvas RGBA16F color
texture, DEPTH_COMPONENT24 renderbuffer, framebuffer, presentation program and
vertex array. It has no mipmaps, temporal history, float filtering or multisample
target. The allocation estimate is 12 bytes per pixel, limited to 64 MiB and a
2048-pixel maximum edge. Canvas, texture and terrain resolution are not reduced
to meet the budget. Resize releases the prior complete group before replacement.

Admission requires EXT_color_buffer_float, framebuffer completeness, and actual
RGBA16F write/read values 0, 0.18, 1, 4 and 16 within binary16 rounding bounds.
Partial allocation/compile/link/probe failure releases all companions. A failed
size is not retried on every paint; a changed size or an explicitly recreated owner
can try again. Empty views, departure and context loss release the group. Reentry
creates a new owner in the live context generation.

`beginFrame` binds a finite epoch, context generation and increasing submission
serial. `present` accepts only that exact current identity once. Exposure is finite
and nonnegative, with a conservative initial uniform limit of 65504. The runtime
uses exactly one. The presentation shader reads `texelFetch`, applies the declared
componentwise `x/(1+x)` operator and one sRGB output transfer. Invalid source RGB
produces an explicit magenta rejection signal; it is not silently tone-mapped into
a valid black observation. This is pixel rejection, not an additional global
per-frame nonfinite-target scan or a new scientific-data admission claim.

All scene passes select the B2 linear-output route together, including backgrounds,
rings, solar emission, points and guides. Earth/Mars reference optics retain
`1/distanceAu^2` physical incident flux and use exposure one on this route. The
legacy SDR fallback restores its existing distance-squared display compensation.
Moon and other display recipes remain declared relative display signals; HDR does
not make their physical brightness scales comparable.

The visible-light Sun approximation uses a fixed HDR display emission scale of two
after decoding its existing warm-white recipe. This is a declared relative display
normalization, not measured solar radiance or incident flux. Exposure remains one;
the scale does not depend on camera or distance. The SDR Sun and source EUV paths
retain their recipes. The first full staged HDR run revealed that unit emission
produced median Sun luminance 183.1, below the unchanged 190 emissive-white gate;
that failed receipt is retained in `coverage/hdr-browser-571040d/failure.json`.

Selecting sea ice forces the whole frame onto the preserved SDR path, including
while that optional source is pending. The scientific palette/legend, original
nearest sampling and straight alpha remain unchanged. Capability/allocation
fallback reasons appear in the existing appearance disclosure. Failed presentation
disposes its owner and redraws the existing SDR route once, without a retry loop.

`store.orrery.hdrEnabled` defaults to false. This is a qualification candidate, not
a newly enabled product feature. The browser gate accepts
`--hdr-candidate=true` to explicitly exercise the candidate in an immutable staged
application. No default, camera, source or scientific-control setting is changed
by the normal command without that option.

## Submission evidence and controls

The final shader exposes its real scene sampler, generation, serial and a split
binary32 epoch. The Earth probe preserves its existing GPU model/normal readback
and five-second deadline. An offscreen Earth draw is held as a producer; acceptance
additionally requires an observed default-framebuffer presentation whose sampled
texture and identity match that producer. Metadata alone cannot pass the gate.
The observed draw must also be the full-viewport presentation triangle, with color
writes enabled and no rasterizer discard, scissor, depth or stencil rejection.
An additional microtask confirms the renderer's own successful GL error check and
matching published completion; it remains inside the original five-second deadline.
The probe never consumes the renderer's GL error, and matching stale producer and
consumer metadata cannot legitimize a different actual draw epoch.

New tests reject offscreen-only producers, a stale scene texture, serial, epoch or
context generation, and held final draws while producers advance. The browser
gate runs the held-presentation negative control when HDR samples are present.
The original frozen-transform control and minimum three accepted draws in five
seconds remain unchanged.

## Local verification and remaining gates

`tools/hdr_presentation_validation.mjs` executes the real target manager and real
guide, point, glow, ring and solar fragment programs. It measures float storage,
single exposure/tone/output transfer, preserved display recipes, alpha and held
visible pixels. Independent formulas predict the expected float/byte values.
The expanded fixture also runs actual Earth/Mars physical surface and atmosphere
shell fragments using admitted column fields. Independent Python float64 integration
predicts scattering and transmission. These selected geometries retain the existing
`1e-4 + 0.002 * abs(reference)` optics tolerance, plus an explicit binary16 storage
rounding bound of `abs(reference)/1024`. They cover colored synthetic night emission,
one-AU/two-AU pre-exposure flux, final output transfer and distinct backgrounds.
Shell composition checks `S + background * (1-alpha)` with
`alpha = 1-dot(T,[0.2126,0.7152,0.0722])`. This preserves and labels the existing
scalar background-extinction approximation; it is not channel-wise transmission
of colored stars. Synthetic Mars emission tests admit no Mars night-light source.

| Local receipt | Result |
| --- | --- |
| `coverage/hdr-d1-red-20260914/evidence.json` | 17/27; prior encoded shader output failed all five linear-material/alpha routes. |
| `coverage/hdr-d1-green-20260914/evidence.json` | 27/27 on Chrome/SwiftShader; source module hashes are recorded. |
| `coverage/color-b2-green-20260914/evidence.json` | 109/109 actual sphere/filter/material checks at unchanged tolerances. |
| `coverage/color-hdr-all-node.log` | 1009/1009 Node 22 tests, including the original 1000 and nine new HDR/probe tests. |
| `coverage/hdr-d1-571040d-staged/evidence.json` | 27/27 against immutable release `hdr-candidate-571040d`. |
| `coverage/hdr-sun-scale-red-571040d/evidence.json` | 39/44; all five Sun emission/transfer/composition checks reject the previous unit scale. |
| `coverage/hdr-sun-scale-green-source/evidence.json` | 44/44, including distinct-background alpha and additive composition for all material fixtures. |
| `coverage/hdr-physical-expanded-source/evidence.json` | 66/66, including actual physical surface/shell, independent S/T, night and pre-exposure flux checks. |
| `coverage/planet-hdr-sun-green-source/evidence.json` | 110/110 actual sphere/filter/material checks, including colored night emission. |
| `coverage/hdr-followup-final-node-50.log` | 50/50 focused manager, lifecycle, color and Earth probe tests. Deliberate stale producer, suppressed draw and rejected completion controls were red before their respective guards. |
| `coverage/hdr-physical-b0c5438-staged/evidence.json` | 66/66 against immutable release `hdr-candidate-b0c5438`, including actual physical material and shell output. |
| `coverage/hdr-browser-b0c5438.log` and `coverage/hdr-browser-b0c5438/visual/earth-submitted-spin.json` | Full staged HDR browser gate passed, including original Sun/Earth/orbit/moon criteria, frozen rotation and held final-presentation controls. |

The final isolated runtime commit is
`b0c5438b6788c947a55b8b4c16aef1c47c2e1b4e`; its immutable release digest is
`10c0191712186ff36797a31e6ba7244053a58a74b43a57a0fa306579b0eaf93b`.
The browser used Chrome/SwiftShader, a 1280-by-900 viewport and the original
732-by-612 canvas, without reducing texture or terrain detail. Four observed
Earth producers reached matching final presentations in 1193.8 ms, with no
presentation mismatch or late accepted readback. The frozen-transform control
failed as required. Holding the final draw produced 15 offscreen Earth draws
and zero accepted presentations. Its timer callback ran after 5560.5 ms under
render load; the original 5000 ms acceptance deadline rejected all late evidence.

The full browser gate also retained the original Sun, Earth orbit and moon
transit/eclipse criteria. Browser-only coverage was 86.94% lines, 76.21% branches
and 82.80% functions. This is an observed browser coverage result, not a claim
that merged coverage thresholds passed. Web typecheck, docs, SDLC and UX validators
passed locally. Receipts remain ignored local evidence. These results are not
qualification of the subsequent integrated atmosphere/terrain/startup tree,
the native device, cross-device performance, or hosted CI. The selected physical
surface/shell matrix does not replace the full atmosphere-domain gate.

Required integrating commands include the existing atmosphere, planet, ring,
solar/physical rendering, context-loss and browser tools against one immutable
candidate, followed by the unchanged coverage and hosted gates. Use fresh receipt
directories. For the new candidate:

```powershell
node tools/hdr_presentation_validation.mjs --web-root=build/qualified-candidate --out=coverage/hdr-candidate
node tools/browser_validation.mjs --web-root=build/qualified-candidate --hdr-candidate=true
```

Use the repository's existing output/coverage options for the second command and
the same original runtime budgets. A passing material swatch or advancing offscreen
producer does not satisfy final-presentation qualification. Source maps still carry
their original observation epochs, coverage and display-reference limitations.

Rollback sets `hdrEnabled=false` and releases the HDR owner, restoring the complete
SDR exposure/output route. Reverting D1 leaves the separately reviewed B2 material
routes intact. Engine state, physical geometry, source selections and image bytes
remain independent of either presentation choice.
