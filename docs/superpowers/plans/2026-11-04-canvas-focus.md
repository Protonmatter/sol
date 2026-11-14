# Preserve visible keyboard focus in the Solar System scene

Primary task: orbit and zoom the selected planetary system with the keyboard,
while retaining a visible focus indicator and textual selection/status controls.
Requirements: `SOL-UX-002` and `SOL-TEST-001`. The current rendering and numerical
budgets, interaction keys, disclosure defaults and public interfaces stay unchanged.

The narrow native manual audit observes keyboard entry/skip navigation, Sun
Observe/Research activation, tour forward/reverse focus containment and Escape
restoration, Sky object search and Mars selection retention, inspector-close
restoration, Date & time disclosure focus, UTC selection and the approximate-range
notice at2201-01-01. These are bounded manual observations, not WCAG conformance.
The browser viewport override did not alter the observed580x412 CSS viewport, so
no wide manual result is inferred from that attempt.

In Solar System, the actual focused canvas matches `:focus-visible` but its outward
outline is clipped by the viewport's `overflow:hidden`. Only this canvas is made
keyboard-focusable by the runtime. Sun and Sky retain their list alternatives.

1. Add an assertion in the existing browser contract helper, measuring the actual
   focused/pseudo state, outline ink and ancestor clipping rectangles. Save a
   screenshot and metrics, and bind the helper's hash in browser evidence.
2. Reproduce failure against the immutable prior artifact, without weakening the
   existing source-to-artifact guard. Retain all failed and refused runs.
3. Inset only `#orreryCanvas:focus-visible` in `apps/web/styles.css`. Preserve
   other controls' focus styling and the canvas's keyboard handling/rendering.
4. Rebuild/stage current source with the unchanged qualification compiler and
   WASM bytes. Run the complete browser scenario, static UX and Node suites.
5. Inspect visible wide/narrow focus and rendering; obtain read-only review,
   document exact manifests/commands/results/limits and retain rollback evidence.

The first candidate's screenshot displays the inset blue ring while the earlier
same-task metrics still report the preceding outline. Correct the harness to wait
for two animation-frame callbacks and capture the painted state before measuring;
there is no fixed sleep or deadline increase. Repeat original/candidate controls
sequentially under that exact assertion. An original-artifact replay initially
refuses because the checkout contains the candidate CSS; preserve that guard.
For the red replay only, snapshot both exact byte sets, temporarily restore the
original CSS and restore the candidate in `finally` if the source remains the
expected original. Abort rather than overwrite an unexpected concurrent edit.

Risk is low: one CSS rule and browser-only assertions. No dependency, coefficient,
scientific model, provider, licensing, cloud project, production or release-policy
change. Rollback removes only the new canvas rule and its assertion/call while
preserving prior fixes and all raw evidence. No commit, push or deployment.

## Completed local verification

The final settled original fails exactly the clipping check; the candidate passes
the complete browser scenario with a2px blue ring inset4px and no rectangular
ancestor clipping. The exact staged candidate also passes22 native Adreno checks,
all1,428 Node tests, static UX and97.54% whole-web line coverage. Its128 UI source
identities differ from the earlier artifact only in the stylesheet; rebuilt
Windows WASM bytes remain identical. Native580x330 actual Tab navigation reaches
the canvas and shows visible inset focus during Left/Right input. Read-only review
finds no actionable production defect and records assertion proof limits.
The [focus report](../../CANVAS_FOCUS_20261104.md) preserves manifests, commands,
failed intermediate runs, source restoration and remaining qualification limits.
