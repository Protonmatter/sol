# D1 linear scene target and SDR presentation candidate

Status: implemented locally, opt-in only. Whole-application, physical-shell,
native-device, runtime coverage and hosted enablement gates remain pending.
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

| Local receipt | Result |
| --- | --- |
| `coverage/hdr-d1-red-20260914/evidence.json` | 17/27; prior encoded shader output failed all five linear-material/alpha routes. |
| `coverage/hdr-d1-green-20260914/evidence.json` | 27/27 on Chrome/SwiftShader; source module hashes are recorded. |
| `coverage/color-b2-green-20260914/evidence.json` | 109/109 actual sphere/filter/material checks at unchanged tolerances. |
| `coverage/color-hdr-all-node.log` | 1009/1009 Node 22 tests, including the original 1000 and nine new HDR/probe tests. |

Web typecheck, docs, SDLC and UX validators passed locally. The receipts are
retained ignored local evidence. They are not a full immutable staged application
run, current-host native result, accepted cross-device performance qualification,
runtime coverage result or hosted CI result. In particular, the complete physical
surface/shell material matrix, additive/flux extensions, native target admission,
and staged HDR Earth deadline must pass before default enablement.

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
