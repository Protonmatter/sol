# D1 linear scene target and SDR presentation candidate

Status: implemented, opt-in only. Current runtime `daa1fbe` passes 66 final HDR
fixtures, 266 material cases per native/software backend, 110 appearance cases
and the complete 7,192-case Earth/Mars numerical corpus. The
[production ledger](PRODUCTION_EXECUTION.md) records current whole-application,
memory and published-head hosted gates separately. The isolated candidate
receipts below are retained historical evidence, not qualification of later code.
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

The additional physical Earth gate runs after that original acceptance. Before
application startup, `installProgramSourceEvidence` observes shader sources and
completed native link calls, retaining immutable source strings after the renderer
detaches its shader companions. `installPhysicalTextureEvidence` separately records
and hashes tightly packed numerical uploads before the timed window. Preparation
compares the expected profile with both immutable field manifests. At each actual
Earth draw, the physical probe requires the exact production sphere sources,
atmosphere/refraction/incident-ready GPU uniforms, profile/catalogue parameters,
current solar-flux and exposure values, and the currently bound incident/column
texture objects matching those observed upload bytes. Readiness state by itself
cannot pass. The original independent model/normal readback and final HDR texture,
linear-output, serial, generation and epoch join still apply to every sample.
The strengthened helper also derives optical camera/Sun geometry from actual
`u_model` and `u_cam` readbacks. It propagates their binary32 rounding intervals
through column normalization, inverse rotation and physical-radius conversion,
then checks the separately rounded optical vectors against those intervals.
This rejects stale geometry without adding an arbitrary optical tolerance.

This records native upload inputs and current bindings; it does not substitute for
the independent numerical pixel fixtures or claim a full GPU texture readback.
Framebuffer-generated scattering fields require their own generating-pass and
current camera/Sun/profile identity evidence. A static allocation or upload hash
cannot establish that dynamic field contract. The collector also supports a
separate `body:'Mars'` gate with an actual-draw terrain evidence callback; that
extension does not change the default Earth acceptance or qualify terrain here.

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
| `coverage/physical-spin-final-cpu.log` | 55/55 focused manager, lifecycle, color, Earth/Mars collector and physical-source tests. Relinking a previously accepted program to a fallback was red before source-cache invalidation. Wrong physical flags, profile/flux/exposure, source hashes, formats, dimensions and invalidated uploads are rejected. |
| `coverage/physical-spin-geometry-red.log` and `coverage/physical-spin-geometry-final-cpu.log` | Stale optical camera/Sun/model controls reproduced a false pass, then all 57 focused tests passed with the GPU geometry consistency join. Independently rounded geometry at enlarged and physical display scales remains accepted. |
| `coverage/hdr-physical-browser-b0c5438.log` and `coverage/hdr-physical-browser-b0c5438/visual/earth-physical-spin.json` | Full original staged HDR browser gate and additional actual physical Earth acceptance passed. Four physical draws reached matching final presentations by 1184.0 ms, with no physical rejection, GPU mismatch, presentation mismatch or late readback. |

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

The additional physical replay used the same immutable runtime release. Each of
its four accepted draws read `u_atmosphereEnabled=1`,
`u_atmosphereRefractionEnabled=1`, `u_incidentFieldReady=1` and exposure one from
the actual current program. The observed fragment source hash was
`b36592b126f393613cb5020d692751ed0f39ad28dcea1459600144b3e90174c0`.
Its bound incident upload matched
`4762cc9e49c98c292b412555c75867fce235aaa5f8f8165c78fd593020f06639`
and its bound RG32F columns matched
`85605fa0d75feb5186e5b812054bef730726668c3690a2b0cecc592dd50c4893`.
The receipt retains every actual profile/geometry uniform, source-upload sequence,
unpack state, model/normal matrix, final presentation identity and exact validation
helper source hash. Hashing and source preparation preceded the five-second window;
all draw readbacks and final-completion confirmation occurred inside it. This
separate replay establishes the physical path for these frames; the earlier
1193.8 ms receipt alone did not record enough evidence to make that claim.
The geometry-consistency join was added after this replay. Its actual-browser
replay is still pending; the saved receipt records finite optical geometry but
does not independently establish that additional current-model consistency check.

Required integrating commands include the existing atmosphere, planet, ring,
solar/physical rendering, context-loss and browser tools against one immutable
candidate, followed by the unchanged coverage and hosted gates. Use fresh receipt
directories. For the new candidate:

```powershell
node tools/hdr_presentation_validation.mjs --web-root=build/qualified-candidate --out=coverage/hdr-candidate
node tools/browser_validation.mjs --web-root=build/qualified-candidate --hdr-candidate=true
```

`tools/browser_validation.mjs` also accepts `--backend=native` (or
`--backend native`). The default remains `swiftshader` with the original GPU
launch flags. Native mode selects ANGLE D3D11 on Windows and the platform ANGLE
backend elsewhere, then requires a recognized hardware renderer from the actual
application context. A software fallback or unknown renderer fails this requested
native gate. The observed renderer string is an execution qualification signal,
not device attestation or a claim about total GPU memory.

`browser-evidence.json` records the requested backend, exact launch flags,
browser version, immutable release/source/manifest identity, validation-tool
hashes and actual-context capabilities. It observes that same canvas after
startup and immediately before the separate physical spin window; the latter
observation is also attached to `earth-physical-spin.json`. Failed runs retain
their status and context evidence. Existing page/console diagnostics remain in
`failure.json`; owned-browser cleanup also runs if worker coverage cleanup fails.
No deadline, viewport, material detail, numerical threshold or negative control
changes with backend selection. Use separate fresh output directories:

```powershell
node tools/browser_validation.mjs --web-root=build/qualified-candidate --output-dir=coverage/hdr-swiftshader --hdr-candidate=true --backend=swiftshader
node tools/browser_validation.mjs --web-root=build/qualified-candidate --output-dir=coverage/hdr-native --hdr-candidate=true --backend=native
```

The new backend option and capability collection passed 49 focused CPU tests,
including the existing physical/final-presentation collector checks. That result
does not establish an actual native browser pass; combined geometry and native
results require the separately recorded backend replays below.

The first combined native run identified Adreno X1-85/D3D11 but rejected all 266
Earth draws in the additional physical window: they still used the illustrative
fallback while optical preparation was loading. This failed receipt is retained
at `coverage/hdr-combined-11508ce-native-qualified/visual/earth-physical-spin.json`.
The original rotation acceptance had passed; that does not establish physical
readiness or native physical rendering performance.

The additional physical performance gate now has a separately recorded preparation
step inside the **existing absolute 75-second System budget**, anchored immediately
before System entry. Earlier setup, original rotation tests and negative controls
consume that same budget; it is never restarted for physical preparation. A ready
status alone cannot pass. The preparation observer must see a submitted physical
draw whose actual sources, profile, bound fields, camera and Sun pass the existing
capture. Unavailable fields/programs or deadline expiry fail preparation. The
renderer retains its existing 30-second per-request program compilation timeout.
`earth-physical-readiness.json` records first observed physical readiness elapsed
from System entry, program diagnostics, field status, rejection counts and the
accepted draw evidence. Only then does the additional, unchanged three-in-five-
seconds collector measure physical rendering and final presentation. The original
Earth collector and frozen/held controls still run independently before this step.
Focused readiness/backend/collector CPU tests passed 53/53 before the
reduced-overhead follow-up and its separate immutable browser replay.

The first preparation replay retained a native `physicalSphere` completion failure
at the existing 30-second limit, while the atmosphere and six base programs were
ready. Its initial observer saw 44,472 submitted draws and rejected 44,399 after
per-draw current-program queries. This is retained as an instrumented observation, not a clean native
compile-performance attribution. The observer now filters draws using CPU-observed
program binding and current linked-source history before querying GL. A matching
hint still requires independent actual `CURRENT_PROGRAM` identity and every prior
uniform/source/field/geometry check. The receipt records filtered draws, candidate
draws, actual program queries and GPU/hint mismatches. Wrong hints, stale source
history and conflicting GPU programs are rejected by the 55 passing focused tests.
No System, compile or frame deadline changed.

### Combined immutable backend replay

The reduced-overhead observer at `ab67ec8` was replayed with Chrome
`151.0.7922.174` against the combined immutable runtime
`11508ce228464a2489f512e9e8e093b37f584a49`, release `hdr-combined-11508ce`, whose
manifest SHA-256 is
`d0df1a00e840b303da30b4280fdf205e2f1055545042f4101263924b4639b916`.
The validator used a separate frozen source snapshot with matching application
bytes and six recorded tool hashes. Before/after checks matched every tool hash
and the unchanged runtime manifest on both backends. Browsers ran serially and
owned processes closed after each run.

| Actual application backend | Full application result | Physical readiness observation | Separate physical final-frame gate |
| --- | --- | --- | --- |
| SwiftShader Vulkan | Pass, exit 0 | First observed valid physical draw at System +43,614.6 ms, within the original 75,000 ms budget | Four physical Earth draws matched current HDR final presentation by 1,246.3 ms; collector completed at 1,248.2 ms |
| Adreno X1-85, ANGLE D3D11 | Fail, exit 1 | `physicalSphere` reported `Shader completion exceeded 30000 ms`; no valid physical draw was observed | Not entered because preparation failed |

The SwiftShader physical draws retained exact linked shader identities, admitted
Earth profile and static incident/column upload identities, actual current
sampler bindings, `u_atmosphereEnabled == 1`, and camera/Sun consistency with the
actual GPU model and camera. The final pass matched producer texture, serial,
context generation and epoch. All four positive physical samples had zero source,
GPU or presentation mismatches and zero late readbacks. Readiness made one actual
current-program query for one physical candidate. Its reported readiness latency
is the first valid draw observed by the preparation step, which starts after the
original controls; it is not an isolated shader compilation duration.

The original SwiftShader Earth rotation gate independently accepted four draws
by 925.6 ms. The frozen-rotation control was rejected, and the held-presentation
control observed 12 offscreen Earth draws with zero accepted final frames.
Unchanged Sun, Earth color, orbit and moon-shadow assertions passed. Browser-only
coverage was 86.31% lines, 75.73% branches and 81.78% functions; this is not a
claim that merged coverage thresholds or hosted gates passed.

The native preparation filtered all 45,212 observed unrelated draws, made zero
candidate GPU current-program queries and performed zero physical captures.
The six base programs and atmosphere shell were ready, but physicalSphere became
unavailable. The failure was observed at System +55,770.8 ms, before the original
75-second deadline. Thus the earlier preparation observer's per-draw GPU queries
do not explain this repeat failure. Original collector and coverage
instrumentation still remain in this full-application run; this is not an
uninstrumented compiler benchmark. Native physical readiness and final-frame
performance remain unqualified, and HDR remains opt-in.

Current receipts are under
`coverage/hdr-combined-11508ce-swiftshader-filtered` and
`coverage/hdr-combined-11508ce-native-filtered`. Each contains
`browser-evidence.json`, `visual/earth-physical-readiness.json` and an independent
`integrity-audit.json`; the successful backend also contains
`visual/earth-physical-spin.json`. Earlier receipts remain intact: the first
native fallback failure, the heavily instrumented native preparation failure,
and the separate SwiftShader preparation attempt that failed the original mobile
offline-update wait before reaching System. The preliminary software run whose
tool paths changed while active is explicitly excluded in
`coverage/hdr-combined-11508ce-swiftshader/qualification-excluded.json`; its later
frozen `swiftshader-qualified` replacement and the current `swiftshader-filtered`
run are distinct retained receipts.

Use the repository's existing output/coverage options for the second command and
the same original runtime budgets. A passing material swatch or advancing offscreen
producer does not satisfy final-presentation qualification. Source maps still carry
their original observation epochs, coverage and display-reference limitations.

Rollback sets `hdrEnabled=false` and releases the HDR owner, restoring the complete
SDR exposure/output route. Reverting D1 leaves the separately reviewed B2 material
routes intact. Engine state, physical geometry, source selections and image bytes
remain independent of either presentation choice.
