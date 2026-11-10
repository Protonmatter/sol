# Initial view presentation and activation ownership

This local change distinguishes a loaded module from a successfully entered view.
Before the first successful current entry and ready-status publication, scene
placeholders stay hidden while their canvas/card geometry remains reserved.
Positioned scene overlays are removed from painting. The existing loading message,
error status, retry control, navigation and focus control remain available.
Once a view has entered successfully, later loading or failure retains that entry's
visible scene. Observe is built in and needs no deferred import.

Initialization is a code-entry state. It does not establish an accepted model,
catalogue, reference texture or astronomical result; existing source/time/data
readiness disclosures remain authoritative. No display resolution, sampling,
Earth recipe, shader, numerical code or WASM identity changes.

The app publishes activation state before renderers measure or reveal a newly
selected view. Hidden entry pauses even when document.hidden changes before its
visibility listener runs. Pause detaches cancellation before publication, settles
only after publication succeeds and retains a current publication failure. Every
started attempt has a fresh generation, so an older pause cannot replace a newer
same-view resume failure after that newer attempt has already settled.

## Validation cohort

Evidence is retained in build/initial-view-presentation-20261108-01. The private
v3 source map has 1,787 files and exactly six application/test/graph deltas from
the 1,785-file MAIN baseline. Its manifest is
`603036ea3101d657f68ee0bd5af914f5f3d8db7d1572265c93e7eb9da8616c3e`. Main adoption adds this note and an appended
readiness entry; its separate build/validation receipt identifies the main cohort.

- 2,018 Node tests pass, including real-controller and extracted actual-app
  hidden/cancel/failure/retry/ordering cases. No tests fail, cancel or skip.
- Typecheck passes 138 files; static and startup checks pass with the same 19
  startup URL identities. Documentation and SDLC checks pass.
- All three full browser/touch gates pass with no runtime errors. They retain
  approved Earth/Sun looks, orbital rendering, shadow, source and UI assertions.
- Merged line coverage: native 18977/19419;
  software fallback 18975/19419;
  whole-driver SwiftShader 18975/19419; all exceed 90%.
- HTTP-boundary script-hold and one deliberate ready-publication exception prove
  actual loading/error/retry visibility and accepted re-entry in all three modes.
  Canvas geometry is positive and retained; the retry returns code-entry ready.
  A strengthened follow-up waits for a validated Sky snapshot, captures the
  selected/visible canvas during re-entry loading and compares every RGBA byte
  against the inactive prior canvas immediately before selection. A short FNV-1a signature is also retained for
  diagnostics; exact byte comparison establishes this bounded retention check.
  It does not establish independent astronomical acceptance.
  This test bypasses the service worker and uses a fast local server. It does not
  qualify model readiness, module-fetch recovery or input latency.
- Independent source reviews found two conditional ownership/error-reporting
  edges, reproduced and corrected with red/green tests. The final v3 review has
  no outstanding findings within its bounded scope. Two additional external
  cases confirm same-view retry recovery with/without an earlier accepted entry.

## Response remains held

The original six-action whole-driver diagnostic retains both original SwiftShader
flags, trusted input, CPU4, the paced shared response budget, native Event Timing
correlation and the maximum of the frame probe and native duration plus 4 ms.
It uses real candidate default CSS, with no external style injection or trace.
The following values are one cold/warm pair, not a 10-pair qualification:

| Action | Cold assessed ms | Warm assessed ms |
| --- | ---: | ---: |
| research | 60 | 55.2 |
| inspector | 228 | 244 |
| timeline | 148 | 73.5 |
| sky | 52 | 236 |
| system | 44 | 56.7 |
| focus | 156 | 140 |

The 200 ms target remains binding for native and both software configurations.
LCP remains 2,500 ms. A loading acknowledgement does not establish accepted model
readiness. No full all-mode response, physical-device, hosted CI, astronomical,
legal, deployment or release acceptance is granted by these checks.

## Retained failed attempts and rollback

V1 pause publication could settle cancellation before losing a current error.
V2 could let an older pause overwrite a newer same-view resumed failure. Their
source maps, review reports, reproductions and red logs remain separate from v3.
The initial browser harness used page-scoped CDP request interception and hit an
engine initialization deadline. The repository already documents that interception
can strand module-worker imports. That failed attempt remains retained; the new
HTTP-side hold completes the same lifecycle checks without interception.
An initial exact-pixel follow-up compared an early model snapshot with a later
re-entry while Sky could still add asynchronous trajectory drawing before leaving.
It retained nonzero pixels at the same dimensions but failed byte equality. The
final follow-up isolates re-entry by taking its comparison frame after the prior
view is inactive; the earlier failed attempt is preserved separately.

The adoption allowlist contains eight paths. main-backup holds every preexisting
file; new paths are recorded with null before hashes in main-apply-receipt.json.
For rollback, first require every affected file to match its adoption after hash,
then restore only backed-up paths and remove only the three newly added paths.
Do not reset the checkout or overwrite later/unrelated work. Rebuild the artifact
and rerun relevant checks after rollback. No commit, push or deployment is made.
