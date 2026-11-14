# Inspector layout and resize diagnostics

Status: the local DOM-write guard is installed. The named stage05 native and
normal software-fallback campaigns separately pass their lab feedback, image
and layout checks. The earlier stage04 Inspector failure of 206.7 ms remains
retained. Whole-driver emulation timing and broader production acceptance
remain open. The original experiments changed no application source; the later guard
is described separately. Shader/image/orbital assets and qualification-tool
source remain unchanged. The accepted Illustrative Earth remains intact.

## Observed work

The original full campaign retains its original receipt and separate stricter
assessment. The exact slow 4x sample has no rendering trace. Later instrumented
4x Inspector samples measure about 65 to 70 ms of layout, about 1 to 3 ms of
paint and about 1 to 2 ms of click dispatch. Their faster results do not clear
the saved overrun.

With unchanged CSS at an explicitly diagnostic 8x CPU slowdown, initial layout
takes 182.4 ms cold and 166.4 ms warm. The app's 120-ms resize callback then
runs a full refresh for another 34.1 and 21.8 ms respectively. Each callback
triggers two more layouts. This verifies an additional-work path after slow
initial layout; it does not establish the exact cause of the earlier 4x event.

A separate instrumented attribution records 162 textContent writes in each
Research resize callback. Of these, 104 retain the same aggregate text; four
targets contain element children. The remaining 58 writes include new subtree
construction. Instrumentation adds cost, so its durations are not performance
qualification. Equal aggregate text alone is insufficient to skip assignment.

## Rejected changes

- Panel layout containment preserves the sampled screenshot and geometry but
  supplies no reliable timing gain.
- Inline-size containment also preserves those sampled outputs, with timings
  overlapping the baseline. Full size containment changes panel geometry.
- Temporarily hiding regions or wavelength controls is attribution only and
  is not a candidate implementation.
- A block layout reduces cost in one experiment but changes spacing. A later
  grid alternative preserves all measured descendant positions and still
  supplies no timing gain. The flow alternative changes 71 descendant boxes.
- Resize-only canvas drawing would omit freshness and image/presentation
  preparation. That shortcut is not adopted.

The first broader containment control finishes its measurements but fails
closing checks on two cancelled planet-image requests. That failure is retained.
The corrected attribution explicitly limits its task sequence to Research and
Inspector; it does not claim full Solar System acceptance.

## Review constraints for an implementation

Keep renderAll preparation, source-freshness evaluation and image publication.
A cached image can become complete before its onload publication, and feed
freshness can cross its grace boundary without a model change. Canvas, caption
and header/source facts must stay coherent across both cases.

Avoid adding the lazy dom.js module to the eager view.js import graph merely
to share a writer. Any changed graph must be explicitly measured and rebound.

An unchanged-string optimization must distinguish zero or one plain Text node
from comments, multiple Text nodes and rich descendants. Nonstring values must
retain the original setter's conversion or rejection. An absent title attribute
and an explicit empty title are different: the latter suppresses an inherited
tooltip. Existing simplified DOM hosts do not prove these browser semantics.

Required next evidence is a small, source-bound implementation with accurate
DOM-shape/setter tests and freshness/image/recovery consumer checks, followed
by rendering comparison and the unchanged full timing protocol. None of the
CSS experiments or faster diagnostic samples qualifies the production target.

## Evidence

Retained under build/startup-demand-20261107-01/:

- inspector-render-trace-3b7a0a60c6f34549956c5e9479f1107b: original fourfold-CPU
  rendering traces and rendering-summary.json.
- inspector-containment-diagnostic-b6f24bba86cd4a3aabd4ff30fcb6fec1: retained
  failed wider control.
- inspector-layout-only-b5d3ad571bef4b68b199b75b4b918d91: corrected containment
  comparison, geometry, pixel differences and analysis.
- inspector-layout-attribution-be317e31f22540e1b8098ce5edddb845: component and
  nested-layout attribution.
- inspector-stack-layout-614e5450d5e841e4873bbfb7374e2a04: gap-preserving
  alternatives and complete descendant geometry.
- inspector-resize-stress-4133be2299cc4cf5b6ecb88fb364502b: unchanged-CSS
  eightfold-CPU stress and resize-overlap-analysis.json.
- inspector-resize-dom-writes-9d2ebe8686494168bcac3b5f039d9d0b: instrumented
  text-write attribution and dom-write-summary.json.

All corrected runs retain source/artifact stability and cleanup receipts.
Fast-loopback and eightfold-CPU cases are labelled diagnostics. They do not
replace the qualified bandwidth/CPU protocol, native timing, physical/manual
acceptance, numerical accuracy evidence, hosted CI or deployed acceptance.


## First applied DOM-write guard

A later local implementation changes only the lazy dom.js helpers. It skips an
unchanged primitive string when the target has zero children or one Text child.
Rich descendants, comments and multiple Text nodes still reach the native
setter and flatten. Non-string inputs retain native conversion or rejection.
Missing/incomplete structural hosts fall back to the original setter without
consulting their text getter. Title guards compare the actual attribute, so an
absent title is still assigned an explicit empty value when requested. Pill
class conversion retains its original order after text publication.

No prepare, header, image-publication, workspace, resize-timer or eager-import
path is removed or changed. The startup graph remains 19 URLs. This guard does
not address the remaining repeated rich-subtree or keyed-row writes.

Twenty new focused cases bring the complete Node suite to 1,930 passing cases.
A separate Chromium component comparison executes the exact old/new modules in
23 DOM cases and verifies equal outcome, markup, coercion, error and flattening
results, with the intended no-op setter reductions. Independent source/unit
review also checks the current-byte component receipt. Arbitrary overridden
native accessors are outside that equivalence claim.

Stage05 has manifest SHA-256
`6dc64e5da37e4a7dc9247b0cb4e8140dfbcaf906c26de48adeb142fcc9d168ac`.
It retains both numerical binaries and the accepted image/shader assets.
The full browser suite passes in native, normal software fallback and original
driver-emulation modes, including each seven-case trusted touch follow-up.
The configured 138-file typecheck and source static/startup-graph checks pass.

An exact-script repeat of the earlier eightfold-CPU attribution records 136
text writes per Research resize instead of 162, and 78 same-text writes instead
of 104. All four rich targets remain. The reduction of 26 writes occurs in both
sampled visits. These instrumented counts establish the integrated no-op change;
they do not establish a latency improvement or qualify the 200-ms requirement.

Evidence lives under dom-write-pass-ab87929b3cca46a099ee4a8b27092417 and
dom-write-attribution-after-699828cb951e4abfa3ab577d2eaf8e4b in the same ignored
audit directory. The saved stage04 Inspector failure remains retained. Fresh
stage05 timing qualification is still required; no commit or publication follows.


## Stage05 normal-fallback timing result

The complete campaign dom-write-profile-fallback-10pairs-01 passes the current
strict assessor: ten cold and ten warm visits, 120 trusted and visible actions,
with both pooled and per-task feedback limits enforced. The browser is pinned
to Chrome/156.0.8078.80, page CPU slowdown is 4x, response bodies share the
200,000-byte/s budget and 150-ms minimum latency, and the original observation
image retains its 1,024-square source identity.

| Quantity | Cold | Warm |
| --- | ---: | ---: |
| Original observation IMG LCP p75 | 2,076 ms | 336 ms |
| Maximum recorded CLS | 0.032875 | 0.005534 |
| Pooled feedback p95 | 172.0 ms | 165.3 ms |
| Research feedback p95 | 68.8 ms | 68.0 ms |
| Inspector feedback p95 | 116.0 ms | 116.0 ms |
| Timeline feedback p95 | 76.0 ms | 70.1 ms |
| My Sky feedback p95 | 52.0 ms | 58.9 ms |
| Solar System feedback p95 | 49.2 ms | 52.0 ms |
| Focus feedback p95 | 197.0 ms | 195.6 ms |

The source inventory has 1,767 entries and the stage has exactly 252 files; both
remain unchanged throughout the campaign. All 51 observed worker targets reach
ready/destroyed status, final activity is idle, and global/run/context/cleanup
and unexpected-network errors are empty. The 114 retained ERR_ABORTED reports
all satisfy the narrow fully-consumed, validated-read classification. They are
not deleted from the evidence. The favicon 404 remains recorded.

Independent review recomputes all twelve action/group percentiles, native/frame
maxima and twenty CLS values, verifies the source and artifact pathsets and
bindings, and checks cleanup/error admission. Campaign-owned source inventories
are authoritative; an older global producer snapshot is not used. All 67
protected raster, shader, binary and WASM assets compared with stage04 retain
their exact bytes.

The immutable report SHA-256 is
`daecce76fb19000aad39f9e60647dcca8c2f08165c8d0b88a3cdfff85ae86882`.
The independent review is retained in
review-dom-fallback-profile-e9ccf0c6cbcc4f86a5cca15b1b7d4f80/review.json,
SHA-256 `713e7037727cfc376fcc1020f92f21e77551d4737aa1d182b65920c537ebb112`.

This is a named normal-fallback lab pass, not a causal A/B latency result or
production/field acceptance. The 200-ms metric measures visible feedback after
verified core installation. Accepted data readiness is separately measured:
cold Research takes about 6.77 to 6.88 seconds and cold System, including ready
star/Moon catalogues, about 26.78 to 26.91 seconds. Focus has only 3.0 ms cold
and 4.4 ms warm margin. Fresh stage05 native timing, the prior whole-driver
failures, physical/manual/P00/scientific/hosted and deployment boundaries remain
open. The earlier stage04 failure is preserved unchanged, without supplying a
waiver or being relabelled as a passing run.


## Stage05 native timing result

The current stage05 native campaign completes ten cold and ten warm visits,
with 120 trusted, visible records and all pooled/per-task limits enforced.
The exact Qualcomm Adreno D3D11 renderer is pinned and read back from the
actual application context in all twenty visits. Browser, CPU, bandwidth,
latency, image, visibility and percentile rules remain unchanged.

| Quantity | Cold | Warm |
| --- | ---: | ---: |
| Original observation IMG LCP p75 | 2,076 ms | 308 ms |
| Maximum recorded CLS | 0.032875 | 0.005534 |
| Pooled feedback p95 | 124.0 ms | 108.0 ms |
| Research feedback p95 | 132.0 ms | 92.0 ms |
| Inspector feedback p95 | 132.0 ms | 124.0 ms |
| Timeline feedback p95 | 84.0 ms | 84.0 ms |
| My Sky feedback p95 | 52.0 ms | 52.0 ms |
| Solar System feedback p95 | 47.7 ms | 60.9 ms |
| Focus feedback p95 | 76.0 ms | 76.0 ms |

Independent review reproduces every statistic and native correlation. All 1,767
source entries and the exact 252-file artifact match before/after/current
readback. All twenty renderer values match the pin. The 51 observed worker
targets reach ready/destroyed status, every final worker observation is idle,
and global/run/context/cleanup and unexpected-network arrays are empty. All
119 raw cancellation reports meet the existing validated-full-read rule; the
favicon 404 remains recorded.

The immutable native report is dom-write-profile-native-10pairs-01/evidence.json,
SHA-256 `9e27df5c07c9daf74acec89a5713fcd06ff7bcbe3d1e912ac9bbcadd1e79d7eb`.
The review is review-dom-native-profile-7e2549d2440340c78eaf0f4e0310e697/review.json,
SHA-256 `28dc37b977b6401b0072913610044fbb31af0467f48dfc9f3358a45769e11e72`.
The stage05 manifest remains
`6dc64e5da37e4a7dc9247b0cb4e8140dfbcaf906c26de48adeb142fcc9d168ac`.

This is one named native lab pass, without a causal latency, field INP, P00,
physical-device, scientific, hosted, deployment or production claim. Accepted
data readiness is separate; cold System readiness including catalogues reaches
about 37.94 seconds. The normal-fallback pass and its narrow Focus margin remain
separate evidence, and neither pass waives whole-driver timing failures.

## Retained whole-driver investigation

The follow-up driver cases change no public source files or staged assets.
Private browser context/prototype and CSS overrides intentionally change the
experimental runtime; they are diagnostic instrumentation, not production code.
Each variant is one cold/warm pair with a fixed-date fixture, not twenty-visit
qualification or a causal A/B estimate.

- One-pixel and 720-square offscreen preparation both finish before first input.
  Cold Research still measures 604/588/580 ms for no preparation/one pixel/720,
  and Inspector 860/860/852 ms. These cases do not demonstrate a solution.
- A readback-friendly context hint is reflected in the three 2D contexts seen
  by the instrumented main-page hooks. Cold Research remains 612 ms. The count
  does not establish the absence of worker, browser or other hidden contexts,
  and context attributes do not prove CPU/GPU execution.
- Cold Solar context construction in that trace occurs about 1.86 seconds after
  Research input, after its frame checkpoint and preceding 620-ms assessed
  interval. It cannot explain that preceding interval in this trace.
- The presentation trace records CrGpuMain RealSwapBuffers spans of about
  480.176 ms in Research and 534.181/285.714 ms around Inspector. These are thread
  trace spans, not GPU execution measurements or a shader diagnosis. Events
  nest; their durations must not be summed as disjoint work. The first listed
  Inspector span starts before input and can include prior-frame activity.
- The broad Research/Sky backdrop override leaves cold Inspector at 708 ms
  versus 820 ms in its corrected control. It is not adopted and establishes no
  visual equivalence or qualifying performance. The original empty-stylesheet
  fixture failed before target measurements and remains retained separately.

The eight completed diagnostic campaigns retain 16 visits with stable source,
artifact and private-producer identities, clean error/closure receipts and 52
observed/destroyed worker targets. The independent bounded interpretation
review is review-driver-diagnostics-f6883501b3ed46c4b3a08a5cc843946e/review.json,
SHA-256 `4931d35141273eabebdcc0e894d6fad399da926d3fa8cd837df161d4b07b4d5d`.
It pins the raw and derived records, including these folders in the same audit:

- driver-canvas-warm-1f5f7b27bd3d448893dbbaa7e51bcc93
- driver-context-hint-84174b8017a64756a14b0fcfc88ccc36
- driver-presentation-trace-5171744cc1084997a880192d8e5b9277
- driver-backdrop-corrected-d9f0bad4db204225baccfe3effcf9fae

No preparation worker, universal context override or backdrop removal was
installed in the application. All 200-ms requirements remain binding. The
whole-driver hold, physical/manual/P00/scientific/hosted/deployed acceptance
and the broader production-readiness goal remain open.

## Minimal-page and native-window controls

A subsequent private control uses the original frame/native input probes on a
minimal page, with no Sol canvases, workers, WASM, imagery or application CSS.
All twelve trusted inputs complete with matching native events; the four owned
browser processes are absent on readback and the server closes. The first
default whole-driver assessed input is 204 ms, including the rounded native
event's 200 ms plus its 4 ms upper bound, followed by 52 and 36.9 ms. With an
explicit native window it measures 124, 76 and 52 ms. These small, ordered and
partly traced samples lack the app and paced-network workload. They neither
qualify Sol nor establish a causal window-size improvement or explain its larger
delay. They demonstrate why a tiny-page result cannot clear the application hold.

Backend readback creates a separate 1 by 1 WebGL control after each minimal-page
sample. Three trials share a browser process; that post-measurement work may
affect later trials, so they are not independent cold replicates. Only the first
trial per variant is traced. The raw capability helper's inherited wording
about an existing application context describes this post-measurement control
incorrectly; the original receipt is retained with an interpretation addendum.

The retained presentation trace reports 728 by 554 swap-surface arguments. The
new actual-app control reads back a 780 by 580 outer browser window while its
page viewport remains 1440 by 900. A separate actual-app variant adds only an
explicit 1440 by 900 outer window; its page viewport remains the same. Both use
the original whole-driver flags, fourfold page CPU slowdown, paced responder,
fixed-date diagnostic fixture and unmodified stage05 bytes. Each is one cold/warm
pair, without CSS or prototype overrides. Captured Research/Inspector/Sky boxes
and text agree between the variants; this is not general pixel equivalence.

| Task feedback | Default cold | Default warm | Explicit-window cold | Explicit-window warm |
| --- | ---: | ---: | ---: | ---: |
| Research | 596 ms | 68 ms | 716 ms | 76 ms |
| Inspector | 820 ms | 196 ms | 876 ms | 596 ms |
| Timeline | 540 ms | 108 ms | 516 ms | 132 ms |
| My Sky | 140 ms | 188 ms | 92 ms | 124.2 ms |
| Solar System | 204 ms | 47.3 ms | 180 ms | 44 ms |
| Focus | 156 ms | 172 ms | 220 ms | 228 ms |

Every value retains the maximum of the original frame probe and correlated
native event duration plus its 4 ms rounding bound. Source inventories have
1,768 entries and match before/after both pairs and the minimal control. The
252-file stage and source-owner bindings remain unchanged. Both app pairs finish
their error, validated-read and owner-closure checks; raw cancellations remain
in the evidence. No window-size change is adopted. The native-window difference
is not demonstrated to be the cause or a solution, and the 200 ms hold remains.

Evidence is retained in the same ignored audit directory:

- `driver-minimal-presentation-34c18b1d67c241e88d94bba09608daca`: fixture, twelve
  inputs, first-trial traces, backend/window readbacks and process-closure proof.
- `driver-window-presentation-cfc8da28c35940dd84c024501feabc57`: copied producer,
  exact construction changes, both app pairs, complete reports and analysis.

This report update follows the runtime source freeze and has its own backup and
diff. No application, image, shader, numerical or public validation-tool source
changes in this pass. The production-readiness goal remains active.
