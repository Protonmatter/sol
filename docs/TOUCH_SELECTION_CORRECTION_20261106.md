# Multi-contact selection correction — 2026-11-06

Two fingers placed and lifted without movement could emit an unintended Sun
selection, then clear the selection again. A final-state assertion would miss
that transient intent. The pointer-down handler now classifies multiple contacts
as a gesture immediately, keeping object selection reserved for a fresh single
tap. This is an input-handling correction; the orbit model, physical coordinates
and Illustrative Earth appearance remain unchanged.

## Reproduction and cause

The baseline used the actual staged app under Chromium mobile emulation at
390 × 844 CSS pixels, DPR 2 and five available touch points. DevTools touch input
produced native trusted pointer events. Two pointer-downs and two pointer-ups
reached `orreryCanvas`, with no intervening pointer movement. Selection was null
before and after, but a `sol:object-selected` event identified the Sun in between.
One-finger orbit, pinch zoom, cancellation and view exit/re-entry passed their
physical-state checks. The initial surviving-finger check was insufficient and
was corrected after review, as recorded below.

The handler reset `moved = false` on every new contact. A second or third contact
could therefore rearm tap selection, even during a drag or pinch. It now initializes
that flag from `pointers.size > 1`. The first contact still begins a normal tap;
additional contacts suppress selection until the gesture ends. Camera sensitivity,
zoom bounds, pointer capture and picking geometry are preserved.

Two unit regressions fail against the preceding handler and pass with the fix:

- stationary contacts suppress transient intents in both release orders, while
  a later single-finger tap still selects the projected Sun;
- a second finger after a drag and a third finger after a pinch cannot rearm
  object selection.

The complete `orreryCoverage.test.mjs` file passes all 32 groups. The fixed private
replay removes the transient intent and preserves epoch/body positions. Its early
survivor assurance is superseded by the corrected proof below. The failed baseline
trace is retained separately.

## Permanent browser coverage

`tools/touch_gesture_probe.mjs` runs seven scenarios in an owned browser context:

1. Single-finger orbit with no page scroll or selection.
2. Stationary two-finger contact with no transient selection intent.
3. Pinch zoom followed by a surviving finger without a camera jump.
4. Added contacts during a drag/pinch without selection.
5. Cancellation followed by a fresh drag.
6. Leaving System during contact, releasing elsewhere and returning to a fresh drag.
7. A real single-finger Sun tap, proving the selection observer is live.

Every case preserves the model epoch and physical body positions. The probe checks
actual touch-event dispatch and actual application WebGL renderer identity, uses
the normal owned-browser DNS guard and records unexpected off-origin requests.
It requires a visible, positive-size, hit-testable canvas and rejects an engine
startup error before sending input. Its work bound is 120 seconds; owned-context
closure is separately bounded at ten seconds and recorded in the receipt.

The main browser command runs this after the unchanged original gates and coverage
collection. A follow-up failure still fails the complete command. The new producer
is included in its selected source-hash inventory, now 22 files. The main page's
camera, selection and emulation settings are isolated from these deliberate inputs.

Review found a P2 false positive in the first surviving-finger check. Omitting a
contact from `touchMove` did not release it, and a 0.01-radian tolerance accepted
zero motion against an expected 0.008-radian change. The same protocol assumption
left an extra contact in the added-contact case. Earlier passing receipts retain
that source cohort and do not qualify those two claims.

The corrected probe selectively ends the intended contact, requires its trusted
pointer-up event and reconstructs the active-contact set before continuing. A
20-pixel surviving-finger move must produce a -0.16-radian azimuth change within
0.001 radian and leave radius unchanged. The added-contact case must establish a
real two-contact pinch before adding the third contact. Three predicate regressions
reject zero/opposite motion and continued zoom. A strict intermediate one-pixel
attempt produced no observed native move and remains a separate failed probe;
the final check waits for a real movement event rather than accepting zero motion.

The finalizer also rechecks child-page errors and off-origin observations after
the owned context closes. A controlled execution of the actual preceding finalizer
showed a passed receipt containing a late child error. Red/green tests now require
late child errors or requests to fail acceptance while preserving successful
context-closure status and any earlier work error. The existing main-caller late
error fixture retains all original assertions and adds the touch host boundary;
new cases keep original gate acceptance separate from a failed follow-up. Earlier
failed full-Node fixture runs and pre-finalizer producer cohorts remain preserved.

## Retained startup failure

The first standalone permanent wrapper failed before its first gesture: it recorded
`EngineError: Engine exceeded its wall deadline`. Its readiness check accepted the
fallback's nine bodies even though the canvas had zero dimensions, so input landed
on an unrelated element near the page origin. This did not demonstrate a drag failure.

That failed source and receipt remain in `permanent-probe/` and
`probe-failed-inputs/`. The probe now checks the actual render target and keeps engine
errors fatal. Unnecessary page-wide request interception was removed in favor of
the existing launcher guard and request observation. The subsequent standalone run
passes seven cases and records successful context closure. These configuration and
readiness changes do not establish a unique cause for the initial engine deadline.
No production startup code or timeout was changed, and no failed run is relabeled.

## Candidate and evidence

The new local stage is `build/touch-20261106-01/site`, release
`local-touch-20261106-01`, mounted at `/sol/`. Manifest SHA-256:

`b999bb0b4289d5f6c752990c3ff2314a6d2a7a2c8cec8e108ecbbb82aa61d076`

Only the `orrery.js` source owner differs from the preceding tour candidate.
Its declared inventory membership changes both component fingerprints. Science
becomes `68219fca96bbac5f5d845f5548a34cfd20643c3d0919cf0665d8f482c8e9d7e4`;
this is a presentation/input footprint change, not a new ephemeris result.
Both WASM binaries, coefficients, numerical implementations, textures and the
Illustrative Earth display recipe remain identical. The local dirty candidate
does not claim clean-source or served-release correspondence to its base commit.

Raw protocols, source snapshots, unit red/green logs, failed and passed touch
receipts, stage comparison and final full-run receipts are retained under
`build/touch-20261106-01/`. Use fresh output directories for the standard commands:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tools/browser_validation.mjs --backend=native --physical-spin=true --web-root=build/touch-20261106-01/site --output-dir=build/touch-native-new
node tools/browser_validation.mjs --backend=swiftshader --physical-spin=true --web-root=build/touch-20261106-01/site --output-dir=build/touch-software-new
```

Final receipts use the `native-closed`, `software-closed`, `node-runtime-closed`,
`node-only-closed` and `combined-closed` directories. Both browser commands and
both full Node runs terminated with exit zero after the post-close correction.
Each browser receipt binds the same 22 current validation producers, records all
seven touch cases, one intentional Sun-selection event, no child-page errors or
unexpected off-origin requests, and successful owned-context closure. Native
execution is observed on the Qualcomm Adreno device; the software run is observed
on SwiftShader. The main page's original visual gates pass in both runs.

| Check | Final result |
|---|---|
| Complete Node suite, including the new input and finalizer regressions | 1,534 passed; zero failed, cancelled or skipped |
| Node-only lines / branches / functions | 27,497/27,961; 7,604/8,326; 994/1,031; each exceeds its unchanged 90% floor |
| Combined Node/native-browser runtime lines | 17,909/18,354, or 97.57%; unchanged 90% floor |
| Experience and Sky workflows on the same staged app | 24 and nine groups passed; their five retained producers remain current |
| Application typecheck and static web checks | 125 files typecheck clean; static checks passed |
| Exact stage inventory | 228 assets plus two equal release manifests; all 230 files and 208 raw source owners verified |
| Retained numerical input correspondence | System 52 inputs and Sky 45 collection plus 12 analysis inputs remain current |

The workflow runs preceded the final tool-only refinements; their application and
workflow producers did not change. Earlier failed full-Node runs retain their
original fixture failure; earlier browser cohorts do not acquire the corrected
surviving-contact or post-close acceptance claims. No failed receipt is replaced.

## Limits and rollback

Trusted Chromium touch dispatch is browser emulation, not a physical phone, tablet
or multi-input-device acceptance test. This work does not cover every gesture,
viewport, zoom level, browser or cancellation interleaving, or determine the cause
of the retained startup or earlier intermittent failures. No new astronomical
comparison or accuracy guarantee follows.

Licensing policy remains pending and unchanged; this input correction is independent
of that decision. Manual/platform accessibility, hosted clean-source CI, notice
clearance, served-release verification and existing Linux-result retrieval remain
held. No dependency, licensing declaration, commit, push or deployment change occurs.
Rollback reverses the pointer-down hunk, two new Orrery unit cases, the new
`touchGestureProbe.test.mjs` regression-test file, the touch probe and its browser
routing/inventory additions, and the related late-error fixture/test additions,
preserving unrelated work and all evidence.
