# Reduced-motion coordinate correction — 2026-11-06

Reduced-motion mode now applies scene-label coordinates immediately. The prior
universal `transition-duration: 0.01ms !important` rule unintentionally activated
transitions on normally immediate coordinates. It could leave measured label
boxes at earlier positions after the renderer published a correctly packed layout.
The correction sets that duration to `0s`. Other animation declarations, normal
motion rules, application JavaScript, Illustrative Earth, physical positions and
both WASM binaries are unchanged.

The new candidate passes complete native-GPU and SwiftShader browser validation,
Sky, two isolated full experience runs and the existing JavaScript coverage gates.
These are local bounded results. Notice clearance, exact-source hosted CI,
cross-platform/manual acceptance and served-release qualification remain separate
holds. No production readiness or new astrometric qualification is declared.

## Cause and controlled verification

The [earlier audit](READINESS_AUDIT_20261106.md) retains focus, spacing and timing
failures. Further diagnostics first exercised the unchanged packing algorithm in
5,000 deterministic cases: 85,726 placements met its spacing and bounds rules.
That result alone does not validate DOM placement.

A diagnostic wrapper then recorded the actual function's inputs and outputs
without changing its algorithm. The replay failed on Ganymede/Callisto after
three attempted states. Callisto's allocated and inline position was approximately
`left: 528.172px; top: 285.048px`, while its computed position remained
`left: 571.969px; top: 302.711px`. The measured box consequently overlapped another
label even though the returned allocations were separated.

The universal positive duration matters because `transition-property` initially
applies to all properties. While a transition runs, its intermediate value enters
the cascade. Zero duration restores immediate changes in this rule. The
[CSS Transitions specification](https://www.w3.org/TR/css-transitions/) defines
these defaults and transition behavior.

A permanent browser regression uses a temporary real `.orrery-label` with the
actual stylesheet and reduced-motion preference. It reads an initial box, writes
new coordinates and checks the new box **in the same task**. Waiting for another
frame would conceal the stale-coordinate defect. The fixture is removed in
`finally`, has no focusable controls and is hidden from assistive technology.

The identical helper fails before the CSS change and passes afterward:

| Observation | Original stylesheet | Corrected stylesheet |
|---|---|---|
| Requested displacement | 160px right, 40px down | 160px right, 40px down |
| Immediate measured displacement | 0px, 0px | 160px, 40px |
| Computed transition duration | 0.00001s | 0s |
| Active CSS transitions | 2 | 0 |

The normal browser command now runs this assertion before its existing disclosure
and rendering gates and retains `reduced-motion-placement.json`. Its existing
19-file validation inventory includes both modified tool files; no input or
coverage denominator is removed.

The same allocation replay then completes all 81 declared attempts with no spacing
errors or inline/computed coordinate lag. Its 1,305 measured label boxes are
diagnostic samples, not a continuous visibility or celestial-position guarantee.

## Candidate identity and validation

The stage is `build/reduced-motion-20261106-01/site`, release
`local-reduced-motion-20261106-01`, mounted at `/sol/`. Manifest SHA-256:

`ef28c5d2e76c7042d10aaddf9854f5a6f1973fa49ff2f84a232282d1f89bb30a`

All 208 source owners remain. Only `apps/web/styles.css` changes from the preceding
`local-readiness-preview-20261106-02` stage. The science fingerprint, JavaScript
sources, textures, numerical data and WASM identities remain equal. The dirty
working candidate is not a clean correspondence claim to the manifest's base Git
commit. Local staging labels do not establish hosted or served acceptance.

| Validation | Result |
|---|---|
| Complete native and SwiftShader browser runs | Both pass the new placement regression and all original gates, including physical spin, Earth/Sun semantic visuals, moon shadows, camera continuity and orbit-guide pixels. |
| Original full experience workflow | Two independent isolated runs pass all 24 check groups with empty browser-error lists. Each verifies 17/24 desktop and 12/14 mobile labels with unchanged bounds/clearance checks. |
| Raw-position microprofile | 300 pairs per run, original 4x throttle and dates: p95 **6.3ms** then **6.1ms**, below the unchanged **16ms p95** cap. Maxima are 16.8ms and 17.6ms; this is not an every-call 16ms claim. |
| Sky workflow | Nine check groups pass, with one deliberate mock request and zero redirect-target requests. |
| Complete Node suite | All **1,514 tests** pass. |
| Independent Node coverage | **98.34% lines, 91.32% branches, 96.41% functions**, above each unchanged 90% floor. |
| Fresh combined Node/native-browser coverage | **97.57% runtime lines**, above the unchanged 90% floor, with all hand-written modules retained. |

Retained execution and review evidence is under
`build/experience-rootcause-20261106-01/`. Original failed cohorts and the preceding
audit are preserved. No timeout, numerical threshold, label cap or performance
budget was relaxed.

## Diagnostic provenance correction

Independent review found that two initial diagnostic hash fields described
LF-normalized in-memory text, while Windows had written the retained copies with
CRLF endings. The original `allocation-probe-source.json` and raw files remain
unchanged. A separate `allocation-probe-source-correction.json` records raw
retained/served hashes, normalized-text hashes, sizes and CRLF counts explicitly.

The actually served diagnostic wrapper's raw SHA-256 is
`3dae9679b257b50451adaa2c56516230764c7a39e54f0c949d2f0ec8d5b07d3b`.
The original function text is unchanged apart from its declaration name; the
wrapper adds logging. Both before/after diagnostic cohorts use that retained
wrapper. It is not shipped and grants no release qualification. Production gate
results above execute the ordinary staged application without this override.

## Limits and rollback

The CSS cause is directly established for stale label coordinates. Passing
post-change focus and timing checks does not establish a unique cause for the
earlier focus failure or 22.1ms diagnostic outlier. Those measurements remain
retained. The current two passing timing samples do not establish device-wide,
field or whole-application performance guarantees. Actual screen readers, touch
devices and all GPU/browser combinations remain outside these local checks.

The approved 1900–2200 precision target and approximate exploration outside it
remain unchanged. This change adds no numerical ephemeris or physical-rotation
evidence. The existing Google Cloud Linux result is still not retrieved; no new
VM job, licensing change, commit, push or deployment occurs in this correction.

Before-file copies retain the three modified source files. Rollback is the single
CSS duration hunk and the corresponding browser assertion/call, reviewed separately
from unrelated working changes. Restoring the old duration restores the reproduced
defect; do not label that state as passing the new regression. No deployed-state
rollback is required.
