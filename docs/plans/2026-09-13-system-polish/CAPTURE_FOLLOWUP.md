# Hosted canvas-capture follow-up

## Original candidate and failure

Appearance commit `aee271f7a896028b8137dcc7d47ebcef6295f652` passed the
local rendering and source gates recorded in [VALIDATION.md](VALIDATION.md).
All 20 hosted checks then reached terminal state: 17 succeeded, two JavaScript
coverage jobs failed before image assertions, and the dependent release gate failed.
The branch-required Rust lint/tests, WASM and web/provider/browser validation passed.

- Standalone Coverage run: [34752435137](https://github.com/Protonmatter/sol/actions/runs/34752435137).
- Reusable CI coverage run: [34752435252](https://github.com/Protonmatter/sol/actions/runs/34752435252).

Both JavaScript jobs reported the same final canvas rectangle at the first Sun
capture: `[125.796875,144.0625,731.609375,612.140625,0,69,732,612]`.
They timed out in the geometry-settling helper, before numerical or pixel assertions.
The release gate then lacked combined coverage evidence and correctly withheld
qualification. The failed attempts are retained; they are not passing evidence.

## Independently reproduced wait defect

The previous helper waited for its first animation frame before recording any
geometry. It reset its stability timer at that first callback. With a constant
rectangle and a first callback delayed to 9,900 ms, the helper could not collect its
required 200 ms interval within its intended 10-second polling budget. That produces
the same error even though the canvas has not moved.

A deterministic frame scheduler exercises that behavior separately from layout
oscillation. The original hosted logs did not record delivered-frame counts or
geometry history, so they cannot prove whether timing delay or actual movement
caused those particular failures.

A read-only diagnostic run on the same committed web artifact with 6x CPU
throttling passed the full browser contract. Its first Sun frame arrived after
2,297.9 ms; three frames established the unchanged geometry after 3,068.8 ms.
That confirms significant first-frame delay is possible, but does not establish
the unpublished timing of the hosted runs.

## Correction boundary

The capture helper records actual geometry immediately after fonts are ready,
then requires a matching delivered frame over the stability interval. Any changed
fingerprint restarts that interval. Bounded diagnostics identify initial geometry,
delivered-frame count, first-frame delay, elapsed time and recent geometry changes.
The new ten-second deadline starts after font readiness, cancels an undelivered
animation frame, and also rejects a late callback if a busy main thread delayed
the timer. It does not extend the interval in response to continuing movement.

Visibility, drawing-buffer alignment, exact before/after screenshot geometry,
PNG dimensions and all source/lighting/shadow/pixel assertions remain required.
This is validation-tooling behavior; application layout, camera, textures, physical
state and rendering source inputs remain unchanged.

## Local regression evidence

- The old serialized callback fails the stationary 9,900-ms first-frame case in
  `coverage/canvas-capture-red.log`.
- `node --test tests/web/canvasCapture.test.mjs tests/web/visualAssertions.test.mjs`
  passes 18/18: nine timing/geometry cases and nine existing pixel-assertion tests.
- `node tools/check_node_coverage.mjs --output-dir=coverage/system-polish-node-capture-final`
  passes 787/787 tests; production module coverage remains 97.85% lines, 91.76%
  branches and 95.22% functions.
- `node tools/collect_node_coverage.mjs --web-root=build/system-polish-aee271f --output-dir=coverage/system-polish-node-capture-all`
  passes 787/787 and retains every handwritten runtime module in the denominator.
- `python -m unittest discover -s tests/python -p test_browser_executable.py`
  passes 14/14 after the new driver import.
- The helper and driver pass `node --check`; an independent review reran all
  nine capture tests, checked the callback's serialization and timer cleanup,
  and found no blocker. Existing pre/post screenshot and PNG guards are unchanged.
- `node tools/browser_validation.mjs --web-root=build/system-polish-aee271f --output-dir=coverage/system-polish-browser-capture-final`
  passes the full Chromium runtime and actual WebGL pixel gates with the new helper.
  Earth round-trip difference remains 0.000, Sun G/R 0.980 and B/R 0.940, and the
  Io transit/eclipsing measurements match the original candidate's passing values.
- `node tools/merge_web_coverage.mjs --web-root=build/system-polish-aee271f --node-input=coverage/system-polish-node-capture-all/coverage-final.json --browser-input=coverage/system-polish-browser-capture-final/coverage-final.json --output-dir=coverage/system-polish-combined-capture-final`
  passes the unchanged 90% whole-web line gate at 96.50%.
- `python tools/validate_docs.py` and `git diff --check` pass.

The follow-up changes exactly `tools/browser_validation.mjs`,
`tools/canvas_capture.mjs`, `tests/web/canvasCapture.test.mjs` and this record.
The application captures under `SOL-System-Polish-20260913-aee271f` retain their
actual originating commit. A later tooling-only head can reuse them only with
the recorded full application source-input parity proof.

## Hosted frame-delivery evidence

The first correction, commit `5423701beb95f5a4dc76f25cd5a86fd46bf3fa81`,
again reached 17 passing hosted checks, two JavaScript coverage failures and a
dependent release-gate failure. Its new diagnostics distinguish this failure
from actual layout movement:

- [Standalone Coverage run 34753191258](https://github.com/Protonmatter/sol/actions/runs/34753191258):
  identical initial/last-sampled geometry, one delivered frame at 156.2 ms, no
  observed geometry changes, then no further frame before the deadline at 9,999.8 ms.
- [Reusable CI run 34753191301](https://github.com/Protonmatter/sol/actions/runs/34753191301):
  identical initial/last-sampled geometry, one delivered frame at 28.9 ms, no
  observed geometry changes, then no further frame before the deadline at 9,999.5 ms.

Thus these runs establish animation-frame delivery starvation that prevents
further geometry sampling. The last sample was taken at the sole delivered frame,
not freshly at timeout; it cannot prove the intervening layout stayed stationary.
The logs also do not establish whether GPU compilation,
headless compositor scheduling or another underlying cause stopped delivery.
Increasing a timeout or changing a pixel threshold would not address the
geometry-check scheduling dependency.

The follow-up retains one delivered-frame requirement and then samples actual
layout with bounded timer polling. The same exact fingerprint must remain
unchanged for 200 ms; movement, scrolling or drawing-buffer changes restart
stability. An absent initial frame still fails. The overall ten-second deadline,
visibility and alignment checks, exact screenshot pre/post equality and actual
image assertions remain in force. This check qualifies a stable capture rectangle,
not a frame-rate or responsiveness benchmark. It does not alter application
animation, drawing, layout, source imagery or scientific state.

## Timer-poll follow-up validation

- The one-frame-only case (first RAF at 150 ms, no subsequent RAF) fails before
  correction in `coverage/canvas-capture-one-frame-red.log` and passes at 200 ms
  afterward. Later geometry and scroll changes are independently scheduled in
  the tests; they are observed and restart stability without further RAF delivery.
- `node --test tests/web/canvasCapture.test.mjs tests/web/visualAssertions.test.mjs`
  passes 20/20: eleven capture cases and nine unchanged pixel-assertion cases.
  The independent review reran all eleven capture cases and found no code blocker.
- `node tools/check_node_coverage.mjs --output-dir=coverage/system-polish-node-poll-final`
  and `node tools/collect_node_coverage.mjs --web-root=build/system-polish-aee271f --output-dir=coverage/system-polish-node-poll-all`
  each pass 789/789 tests. Production-module coverage remains unchanged.
- `node tools/browser_validation.mjs --web-root=build/system-polish-aee271f --output-dir=coverage/system-polish-browser-poll-final`
  passes the complete runtime and actual WebGL image assertions. The Sun, Earth,
  camera-round-trip, submitted-spin, transit and eclipse values remain as recorded above.
- `node tools/merge_web_coverage.mjs --web-root=build/system-polish-aee271f --node-input=coverage/system-polish-node-poll-all/coverage-final.json --browser-input=coverage/system-polish-browser-poll-final/coverage-final.json --output-dir=coverage/system-polish-combined-poll-final`
  passes at 96.50% whole-web line coverage.
- Syntax, documentation and diff checks pass. This second follow-up changes only
  `tools/canvas_capture.mjs`, `tests/web/canvasCapture.test.mjs` and this record.
  Hosted results must still be verified on its newly pushed commit.

## Static capture must not require an animation callback

Commit `59348d071871fef388fb5f8f03aba6960fdb46c9` completed with 18 passing
hosted checks. The standalone JavaScript coverage run passed, but the reusable
JavaScript job and its dependent release gate failed. In the
[reusable job](https://github.com/Protonmatter/sol/actions/runs/34753656625/job/103714338507),
the diagnostic reported zero delivered frames, one initial geometry sample and
10,000.6 ms elapsed. No later layout sample was possible because the helper
still waited for an initial animation callback. This establishes the remaining
scheduling dependency; it does not establish that layout was stationary during
the unsampled interval or identify the cause of callback starvation.

The final helper measures layout with bounded timers from the initial sample
after font readiness. It requires 200 ms of identical observed geometry within
the same ten-second deadline and polls no slower than every 50 ms when the main
thread can run. Movement, scroll and drawing-buffer changes reset stability;
late timers cannot bypass the deadline. Visibility, backing-buffer alignment,
exact pre/post capture equality and PNG dimensions remain required.

An animation callback is not evidence that the captured pixels are correct.
The actual screenshot and the unchanged Sun/Earth, camera round-trip, submitted
spin, transit and eclipse assertions continue to establish rendered output.
Deterministic controls exercise blank and incorrect images through the actual
pixel assertions. This adjustment removes only the animation-callback prerequisite
from the geometry check; it adds no timeout, rendering fallback or weaker image
threshold.

## Final local validation

- The prior helper fails stable geometry with no delivered frame in
  `coverage/canvas-capture-no-raf-red.log`. The timer-only version passes the
  corresponding case at 200 ms without requesting an animation callback.
- `node --test tests/web/canvasCapture.test.mjs tests/web/visualAssertions.test.mjs`
  passes 19/19: ten capture checks and nine unchanged pixel-assertion tests.
  An independent review reran these tests, verified serialization and deadline
  enforcement, and found no blocker. Obsolete frame-scheduler tests were replaced
  with timer/mutation cases; blank and wrongly colored images fail actual assertions.
- `node tools/check_node_coverage.mjs --output-dir=coverage/system-polish-node-static-final`
  and `node tools/collect_node_coverage.mjs --web-root=build/system-polish-aee271f --output-dir=coverage/system-polish-node-static-all`
  each pass 788/788. Production coverage is unchanged: 97.85% lines, 91.76%
  branches and 95.22% functions.
- `node tools/browser_validation.mjs --web-root=build/system-polish-aee271f --output-dir=coverage/system-polish-browser-static-final`
  passes the full Chromium runtime and actual WebGL image gates. Sun G/R remains
  0.980 and B/R 0.940; Earth has 2,557 blue pixels and zero camera-round-trip mean
  difference. Submitted spin advances 0.1885 rad across four draws. Io transit
  depth is 0.0504 versus 0.0505 predicted, with 0.5-pixel center error; transit
  control and eclipse assertions pass.
- `node tools/merge_web_coverage.mjs --web-root=build/system-polish-aee271f --node-input=coverage/system-polish-node-static-all/coverage-final.json --browser-input=coverage/system-polish-browser-static-final/coverage-final.json --output-dir=coverage/system-polish-combined-static-final`
  passes the unchanged whole-web line gate at 96.50%.
- Syntax, documentation and diff checks pass. Application source bytes are
  unchanged; the previously recorded 304 Python tests, 77 mapping/lighting GPU
  probes, ten ring GPU probes and 42 reviewed captures retain their original
  provenance. This final follow-up changes only the helper, its tests and this
  record. Hosted checks are verified separately against the pushed head.

## Caption layout regression revealed by the retained capture guard

Head `90dab0bc648cede0bdbe55aa80966378bd43d235` reached 17 passing checks;
both JavaScript coverage jobs and the dependent release gate failed. The new
geometry wait completed, and the unchanged pre/post screenshot guard then
identified an actual canvas resize at the seven-days-per-second Earth capture:

- [Standalone job](https://github.com/Protonmatter/sol/actions/runs/34754281486/job/103715910540).
- [Reusable job](https://github.com/Protonmatter/sol/actions/runs/34754281610/job/103715976466).
- Both measured canvas height changing from 575.1875 to 559.109375 pixels;
  drawing-buffer height followed from 575 to 559. Position, width and page
  offsets stayed unchanged.

The warning caption shared a constrained-height grid with the canvas. At seven
simulated days per second, ordinary frame-interval differences cross the moon
sampling thresholds. Correctly updated warnings add or remove caption lines;
each added line took 16.078125 pixels from the canvas and triggered its resize
observer. The failure is a product layout defect, distinct from the earlier
animation-callback wait problem.

An independent browser reproduction uses the actual `renderDestinationOverview`
with presentation-only warning cases while the engine remains paused. It records
canvas/caption heights of 596.0625/61.9375, 579.984375/78.015625 and
563.90625/94.09375 pixels; returning to the original caption restores the first
pair. Epoch, body coordinates and animation state remain unchanged. Evidence is
`coverage/caption-reflow-90dab0b.json`.

The correction gives the non-Sun scene a definite viewport-based height and lets
the complete caption grow below it in normal document flow. It explicitly resets
legacy mobile flex/min-height rules and prevents taller adjacent cards from
stretching the scene. Warnings are neither suppressed nor placed over the canvas.
The Sun layout and all rendering/physics inputs other than the stylesheet remain
unchanged. New captures and build provenance are required because layout changed.

## Caption correction validation

- The actual browser regression in `tools/caption_layout.mjs` fails against the
  frozen `90dab0b` build at the first added warning line. The identical regression
  passes on `build/system-polish-caption-candidate`: 48 cases across normal/focus
  views at widths 1280, 881, 880 and 390 pixels. It checks exact scene geometry,
  complete warning text in normal flow, container bounds, no horizontal overflow,
  unchanged engine state, and restoration of the viewport and focus state.
- Red/green evidence: `coverage/caption-layout-red.log` and
  `coverage/caption-layout-green.json`. The driver saves the integrated matrix
  as `visual/caption-layout.json` alongside the actual screenshot gates.
- `node tools/collect_node_coverage.mjs --web-root=build/system-polish-caption-candidate --output-dir=coverage/system-polish-node-caption-final`
  passes 788/788 tests.
- `node tools/browser_validation.mjs --web-root=build/system-polish-caption-candidate --output-dir=coverage/system-polish-browser-caption-layout`
  passes all 48 caption cases and the full Sun, Sky and System runtime/pixel gates,
  including the previously failing seven-days-per-second capture. Earth has 2,755
  blue pixels after the layout change; its camera-round-trip mean difference stays
  zero. Sun G/R is 0.980 and B/R 0.940. Submitted spin advances 0.1885 rad over four
  draws. Io transit depth is 0.0504 versus 0.0505 predicted with 0.5-pixel center
  error; the no-transit control is 0.965 and eclipse ratio 0.2891 against the
  unchanged ramp prediction 0.2784.
- `node tools/merge_web_coverage.mjs --web-root=build/system-polish-caption-candidate --node-input=coverage/system-polish-node-caption-final/coverage-final.json --browser-input=coverage/system-polish-browser-caption-layout/coverage-final.json --output-dir=coverage/system-polish-combined-caption-final`
  passes at 96.50% whole-web line coverage.
- Static web, UX structure, 20 requirement mappings, 80-file TypeScript checking,
  documentation, module syntax and diff checks pass.
- All 42 actual browser captures were regenerated. They retain the model-clock
  and body-state invariants with no page/engine errors or horizontal overflow.
  Independent visual review of Earth, Saturn, Mimas desktop/mobile and the Sun
  finds no clipping; the Sun capture is byte-identical to the prior reviewed image.
- Of 137 application source inputs, only `apps/web/styles.css` differs from the
  original appearance candidate. The renderer, source pixels, WASM and schemas
  are unchanged; their previously recorded numerical/source qualifications remain
  applicable. The committed artifact is compared with this new layout candidate
  before publication, and hosted status is reported from its actual PR checks.

This layout follow-up changes `apps/web/styles.css`, `tools/caption_layout.mjs`,
`tools/browser_validation.mjs` and this record. It adds no dependency, provider,
physical-model change or scientific-state migration.
