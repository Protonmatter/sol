# Tour viewport and keyboard correction — 2026-11-06

The opt-in tour could place its card and all navigation actions below a phone's
landscape viewport. The card now clamps to the visible area, scrolls internally
when necessary, and keeps the current keyboard action and its focus outline
visible as step text changes. The correction changes presentation only;
Illustrative Earth, scientific state and orbital calculations are preserved.
This is a local correction and bounded accessibility evidence, not a WCAG
conformance or production-release declaration.

## Reproduced defects and correction

| Case | Retained failure | Correction |
|---|---|---|
| Step 2 at 844 × 390 | Card top 377.46875, bottom 601.328125; Skip/Back/Next outside the viewport | Clamp the final card position to the visible top and bottom edges |
| Longer text at 320 × 256 | Already-focused Next bottom 262.84375, scrolling card bottom 248 | Reveal the existing focused action after step reflow without changing focus |
| Keyboard outline at 320 × 256 | Solid 2 px outline plus 2 px offset extends to 250.84375; inner card clip ends at 247 | Reserve 4 px scroll padding and check the actual outline bounds |

`tour.js` previously chose below or above its highlighted target. When that
target was itself below the viewport, both placements remained offscreen. The
existing resize handler already recalculates tour layout; no new listener is
needed. The vertical clamp corrects the position after that calculation.

The card's viewport-relative maximum height and overflow preserve access on short
screens. A focused button can remain focused while new copy increases the content
height, so calling `focus()` again does not necessarily reveal it. Step rendering
now uses immediate nearest scrolling for an already-focused button inside the card.
Background controls are not scrolled. Scroll padding keeps the normal keyboard
outline within the scrolling card's clip. Native Tab wrapping, modal background
isolation, Escape and focus restoration remain in place.

Two focused unit regressions fail against the preceding implementation: one
positions a target below a short viewport, and one requires the current action
to be revealed after positioning without moving focus. Both pass with the
correction. A test-spy comparison initially failed on an options object's VM
prototype despite identical values; its retained fixture now copies that object
into the test's realm. The complete panel suite passes all 19 tests.

## Permanent browser regression

`assertTourViewport` in `tools/review_ui_contract.mjs` runs through all seven steps
at **390 × 844, 844 × 390 and 320 × 256**. The normal complete browser command calls
it after the existing disclosure checks. It requires:

- actual card bounds within the viewport;
- an inert modal background;
- a visible and hit-testable current action reached through keyboard activation;
- active `:focus-visible`, a nonzero outline, and unclipped outline bounds;
- real card overflow in the short viewport;
- forward/reverse Tab wrapping and Escape returning focus to Learn.

The helper restores the viewport, prior visible focus and the owned session's
tour-seen preference in `finally`. It adds no production control or network call.
Both changed validation tools remain in the existing 21-producer receipt inventory.
Original gates, numerical budgets and coverage populations are preserved.
Outline bounds use the card's inner client clip with the existing focus check's
0.5 px allowance for integer client dimensions; card and button bounds retain
their separate checks.

The private landscape baseline, focused-action failure and outline failure remain
separate from successful cohorts. The first correction passed 28 geometric steps
across four viewports, but that did not prove focused-action or outline visibility.
Those stronger checks exposed the later defects; the earlier passes are not
substituted for the final browser result.

## Browser accessibility-tree inspection

An owned Chromium inspection also records native accessibility trees for the
observed Sun, research view, expanded tools, Sky, System and Earth at desktop and
mobile sizes. The inspected exposed controls have accessible names. This is
browser-tree evidence, without speech output or screen-reader acceptance.

The first diagnostic incorrectly treated descendants of closed native disclosures
as visible based on rectangle presence. The corrected diagnostic checks actual
visibility and the containing disclosure's state. Opening Sources exposes its
named preview action, providing a positive check for that exclusion. The initial
warnings are retained as diagnostic false positives, not product findings.

## Final candidate and evidence

The final local stage is `build/accessibility-20261106-01/site-final-ink`, release
`local-tour-viewport-20261106-03`, mounted at `/sol/`. Manifest SHA-256:

`d1c0f598b898abd0587ce5b5c0384f6a9833a90cf38eeb0eb905441d5626d518`

Only the tour module and stylesheet source owners differ from the preceding
fractional-label candidate. The science component remains
`484cc52a1543517512da267f4742adeac17a90c463b6671b509f681371135514`.
Both WASM binaries, coefficients, data and textures remain identical. Changed
release tokens and the UI fingerprint identify the fresh staged candidate;
its base Git SHA is lineage for a dirty local preview, not clean-source proof.

| Final local validation | Result |
|---|---|
| Complete native and SwiftShader browser commands | Both pass original gates and all 21 new tour steps, including actual focused-action/outline visibility. |
| Original experience workflow | All 24 groups pass, including reflow, label geometry, workers, focus and export; raw-position p95 is 8.4 ms under the unchanged 16 ms cap. |
| Original Sky workflow | Nine groups pass, no errors, one mock request and zero redirect-target requests. |
| Browser accessibility-tree inspection | Eleven states, 899 repeated exposed-control observations, no missing-name or visible-control exposure findings; open Sources positive check passes. |
| Full Node suite | 1,525 pass, zero failures/skips/cancellations; all 19 panel/tour groups pass. |
| Typecheck and static web checks | All 125 application files typecheck; static checks pass. |

The accessibility count includes the same controls in multiple states; it is not
a unique-control count or manual assistive-technology acceptance. Node-only
coverage is 27,496/27,960 lines, 7,605/8,327 branches and 994/1,031 functions;
each unchanged 90% floor passes. Fresh combined runtime line coverage is
17,908/18,353, or 97.57%, above its unchanged 90% floor. Module populations are
preserved, with the added implementation lines counted. Frozen numerical input checks retain all 52 System,
45 Sky collection and 12 Sky analysis identities.

Inputs, stage comparisons, red/green logs, failed and passed cohorts, native tree
snapshots and screenshots are retained under `build/accessibility-20261106-01/`.
Use fresh output paths when rerunning the complete browser command:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tools/browser_validation.mjs --backend=native --physical-spin=true --web-root=build/accessibility-20261106-01/site-final-ink --output-dir=build/tour-native-new
node tools/browser_validation.mjs --backend=swiftshader --physical-spin=true --web-root=build/accessibility-20261106-01/site-final-ink --output-dir=build/tour-software-new
```

## Limits and rollback

This work does not qualify every viewport, zoom level, browser, input device,
screen reader, language or tour-content length. It does not explain historical
focus/export timeout or performance-outlier causes, or add astronomical samples.
Manual accessibility/platform acceptance, hosted/clean-source CI, notice clearance,
served-release verification and retrieval of the existing Linux result remain held.
No dependency, workflow, licensing, publication, commit, push or deployment changes.

Rollback is limited to the tour-position/focus hunks, tour-card CSS, two new unit
cases and browser regression call/helper. Preserve the earlier reduced-motion
correction, all unrelated working changes and the retained failure evidence.
