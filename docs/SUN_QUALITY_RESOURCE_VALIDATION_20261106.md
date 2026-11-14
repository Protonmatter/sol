# Native Sun quality and resource validation — 2026-11-06

The standard native browser qualification now exercises the approved Sun at
1K, 2K and 4K. Software validation retains its existing default 1K workload.
The application still defaults to 1K; this changes validation routing only.
Illustrative Earth, application rendering code, numerical models and both WASM
binaries are unchanged.

The existing design calls for all three qualities in native qualification, but
the normal browser command previously invoked the probe's 1K default. The backend
policy now declares the requested list, passes it to the existing Sun probe and
checks the measured resolution keys. Each Sun capture also observes and validates
the actual application renderer. A new offline policy regression fails before
implementation and passes afterward. No original gate, timeout or coverage floor
is removed or relaxed.

## Native quality and lifecycle evidence

The separate resource protocol executes the actual staged application, the
existing `verifySunLook` function and the original canvas-capture function. It
records two complete 1K/2K/4K sweeps, including optional-prominence pixel changes
and foreground/background depth checks. Both sweeps pass with no captured page
or console errors and no graphics errors in the existing draw/depth assertions.

Between sweeps, the protocol re-enables the illustrative 4K Sun and establishes
an actual submitted scene with `u_res` and viewport both 4096×4096, using a live
Sun-owned program and framebuffer. It then loses that context while its three
target textures and framebuffers are still active. After restoration, a new
owner renders all three qualities again on the observed native backend.

| Sun target quality | Nominal intermediate color-target bytes | MiB | Target textures / framebuffers |
|---|---:|---:|---:|
| 1K | 9,437,184 | 9 | 3 / 3 |
| 2K | 37,748,736 | 36 | 3 / 3 |
| 4K | 150,994,944 | 144 | 3 / 3 |

These are requested RGBA16F allocations: one full-size target and two quarter-size
targets, totaling `9 × size²` bytes. API interception attributes allocations to
the current Sun renderer's call sites on the actual application context. Counts
and peaks are recorded on creation, allocation and deletion, not just sampled
after a stage completes.

The final protocol retains 13 checkpoints and 203 events. Peak live Sun-owned
objects are three textures, three framebuffers, three programs, six temporary
shaders and one vertex array. After compilation, live shader count is zero.
Switching to Visible mode and leaving the System view release all Sun target
textures and framebuffers, reducing their nominal bytes to zero. Three programs
and one vertex array remain intentionally cached per live context.

Context loss invalidates ten active handles: three textures, three framebuffers,
three programs and one vertex array. Those invalidations are recorded separately
from API deletion calls. Subsequent cleanup calls on already-invalid handles are
not counted as additional releases. This is **logical API lifetime evidence**,
not a measurement of driver deallocation, physical residency, total VRAM or
whole-application memory.

Model epoch, body positions and camera match across quality changes and between
the corresponding illustrative inspection states before and after restoration.
The paused procedural display uses time zero and a pinned model epoch of
2026-07-08T12:00:00Z. These are illustrative surface features, not an observation
of that date. Switching between Illustrative and Visible modes may deliberately
reframe the camera; no all-mode camera-invariance claim is made.

Captured PNGs are the fixed application viewport, approximately 891×712 pixels.
Actual 1K/2K/4K targets are established by GPU uniform readback and allocation
requests. These captures are not 4096-square image exports.

## Candidate and validation results

Both protocols use the unchanged application stage
`build/fractional-labels-20261106-01/site`, release
`local-fractional-labels-20261106-01`, with manifest SHA-256:

`b5dc19f64e620eef6720a6cc489b767b70df60e572c2902160ddf2f7d5dcc879`

All 228 assets and 208 source owners validate. The resource protocol records its
local static-module graph, selected capture source, package/lock inputs and actual
package versions before execution and verifies them afterward. Browser dynamic
imports are bound by the complete immutable stage. External package versions and
lock inputs are recorded; this is not a hostile-install attestation.

| Current validation | Result |
|---|---|
| Standard native browser command | All original gates pass; declared and measured Sun qualities are 1024/2048/4096, with native renderer observations at every Sun capture. |
| Standard SwiftShader browser command | All original gates pass; declared and measured Sun quality remains 1024, with software renderer observations. |
| Active-target resource protocol | Two quality sweeps, one active-4K loss/restoration, 13 checkpoints; nominal targets stay within 144 MiB and target counts within three. |
| Complete Node suite | **1,516 pass**, zero failures, skips or cancellations. |
| Independent Node coverage | **98.34% lines, 91.32% branches, 96.41% functions**; all unchanged 90% floors pass. |
| Fresh Node/native-browser coverage | **97.57% runtime lines** (17,902/18,347), above the unchanged 90% floor, with the complete runtime denominator retained. |

The six backend-policy tests cover native, software, default and invalid selection.
The native profile requires all three targets to be ready on the qualification
device. This does not imply that every native device supports 4K; the application's
existing unsupported-quality handling remains unchanged.

Run the existing commands with an installed Chromium executable in `CHROME_BIN`
and new output directories:

```powershell
node tools/browser_validation.mjs --backend=native --physical-spin=true --web-root=build/fractional-labels-20261106-01/site --output-dir=build/sun-native-review-new
node tools/browser_validation.mjs --backend=swiftshader --physical-spin=true --web-root=build/fractional-labels-20261106-01/site --output-dir=build/sun-software-review-new
```

Raw resource data, protocol source, images and process exits are retained under
`build/sun-resource-20261106-01/`, with the final active-loss case in `replay-06/`.
Standard command, unit and coverage evidence is under
`build/native-sun-profile-20261106-01/`. The private resource protocol is a retained
experiment; the public browser commands above are the permanent qualification path.

## Failed attempts and scope limits

Initial private attempts remain preserved. One stopped before launching a browser
because its function extractor assumed LF line endings. Two requested restoration
before the native loss event had completed and timed out. A later task boundary
corrected the diagnostic without extending its ten-second restoration deadline.
The [Khronos extension specification](https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/)
requires event completion before restoration. Earlier successful protocols lost
the context after target release; they are not substituted for the final active
4K case. The resource work retains its separate 240-second work deadline.

The first expanded standard native run also stopped on a missing assertion-module
import after recording the three qualities. That failed source/run remains
separate; the corrected command completes all gates. No failed run is relabeled
as a successful qualification.

This work does not qualify every state, device, browser, mobile frame rate,
allocation failure, loss during GPU execution or compilation, Earth/planet cache
memory, or physical VRAM. The original Sky and experience tools and their staged
inputs are unchanged and were not rerun for this validation-only edit. No new
astrometric sample or accuracy guarantee is added.

Hosted CI, cross-platform/manual/accessibility acceptance, notice clearance,
served-release verification and the existing Linux-result retrieval remain held.
No application file, dependency, workflow, licensing declaration, deployment,
commit or push changes. Rollback of the validation routing is limited to its
backend policy, browser call/assertion and test hunks; preserve the resource
evidence and unrelated working changes.
