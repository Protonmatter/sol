# Illustrative appearance during pending-decode context recovery — 2026-11-06

The unchanged local application passes a native browser experiment that holds
decoded Earth and Mars images across graphics-context recovery. Each replacement
owner becomes ready and draws before the obsolete decoded result is released.
Both obsolete results close exactly once, never upload, and leave the current
body's resources and physical scene state unchanged. All seven planet maps then
draw correctly in the third graphics generation. This closes a bounded evidence
gap in the preceding [appearance resource study](APPEARANCE_RESOURCE_VALIDATION_20261106.md);
it does not establish complete release or all-device qualification.

## Artifact and experiment

The application remains `local-fractional-labels-20261106-01`, staged under
`build/fractional-labels-20261106-01/site`. The canonical manifest SHA-256 remains
`b5dc19f64e620eef6720a6cc489b767b70df60e572c2902160ddf2f7d5dcc879`.
Both manifest copies, all 228 assets, all 208 current source owners and the exact
230-file inventory match. No application, shader, texture, WASM, model default,
coefficient, clock, orbit or accuracy-contract bytes change in this work.
Illustrative Earth retains the Sites v7 appearance.

The owned native browser uses the fixed 2026-07-08 12:00 UTC epoch, paused
animation and reduced motion. Actual application WebGL renderer identity is
checked initially and after each restoration. The retained observer attributes
texture operations to the exact two cache-load function ranges in the staged
renderer and identifies native decoded images by their pinned sizes and SHA-256.

| Case | Held obsolete bitmap | Recovery | Result after releasing it |
|---|---|---|---|
| Earth July surface | ID 2 | Graphics generation 1 → 2; new Earth surface/mask draw first | Closed once, no upload, current Earth textures unchanged |
| Mars artistic map | ID 4 | Graphics generation 2 → 3; new Mars map draws first | Closed once, no upload, current Mars texture unchanged |

The test holds a successfully decoded native `ImageBitmap` before returning it
to the application's loader. It deliberately allows the old result to finish
*after* replacement resources are ready, rather than merely checking cancellation
before a new owner exists. Readiness, actual draws, image closure, texture IDs,
epoch, positions and corresponding camera are checked on both sides of release.
This is test-owned scheduling at the decode boundary, not a replacement decoder
or an application source patch.

The context losses occur with zero live monitored illustrative texture handles:
the old decodes have not uploaded. This complements the preceding active-texture
loss experiment; the two scenarios must not be conflated. Restoration is requested
in a new task after the application's loss handler permits it. The existing
ten-second event and 240-second work bounds are unchanged.

After both cases, Mercury, Venus, Mars, Jupiter, Saturn, Uranus and Neptune each
draw their own pinned image in generation 3. Analysis joins the actual sampled
texture to its decoded image identity and checks the submitted model translation
against the body's Float32 physical position. The native experiment retains
16 checkpoints and 60 resource events. All thirteen identified bitmaps close
exactly once. Both held IDs are absent from every upload request. Page/console
errors are empty and every checkpoint reports no GL error.

The nominal allocation ledger is **15 creations − 15 live deletions = 0** after
System exit. The two losses invalidate zero monitored illustrative handles in
this specific scenario. Peak monitored requests remain **100,257,240 bytes
(95.61 MiB)**, with at most one Earth surface/mask pair and two planet maps.
These are API-requested allocations and object lifetimes, not physical VRAM,
driver reclamation or whole-application memory measurements.

Raw evidence and source snapshots are in
`build/appearance-context-20261106-01/replay-01/`; the executable protocol,
independent `analyze.py` and `analysis.json` are in the parent audit directory.
The raw evidence SHA-256 is
`d4a9d4bbef1b7a7c19b1e9b01f1af1359c812612f22c5f47e25fb64ed9c14e2c`.
All fifteen local inputs, two package/lock inputs and two installed package
manifests are stable and frozen. External versions/locks do not attest a hostile
installation. The browser process and protocol handle were observed terminal.

## Permanent regression and negative control

`tests/web/earthLookLifecycle.test.mjs` now covers a pending old Earth image,
context loss, a ready replacement, and late completion of the old image. It
checks abort, exact closure count, absence of even a temporary obsolete upload,
survival of the current texture, readiness and unchanged physical state. The
test uses the existing production-module harness and its explicit image I/O
boundary. No lifecycle implementation is substituted.

The private `suppress-earth-guard.mjs` negative control modifies only the source
text returned by a test-owned Node loader for the exact Earth upload guard.
Repository and staged bytes remain unchanged. The new regression then fails
at **“an obsolete owner must not upload even temporarily”**, despite the generic
cache eventually rejecting/releasing that old value. This establishes sensitivity
to an early obsolete upload, beyond checking final cache state alone. The
unmodified seven-test Earth suite passes.

The full fresh Node collection passes **1,523 tests**, with zero failures,
skips or cancellations. Existing complete native/software browser receipts retain
their original source cohorts; they are not relabeled as new executions. Their
21 selected producer hashes and the application stage remain unchanged, so fresh
Node coverage can be merged with that retained matching native coverage.
The separate unchanged Node-only floors pass at 27,490/27,954 lines,
7,600/8,322 branches and 994/1,031 functions (each above 90%). Combined runtime
line coverage is 17,902/18,347, or 97.57%, above its unchanged 90% floor.
Documentation validates 238 Markdown files; governance validates 27 requirements;
UX structure, syntax and scoped diff checks pass. The unchanged complete browser,
Sky, experience, Rust and application typecheck commands were not rerun for this
test/documentation-only change.

## Limits and rollback

This work does not identify a new application defect or claim a historical focus,
export-timeout or performance-outlier cause. The existing guards pass the added
regression. It does not qualify every cancellation interleaving, all devices or
mobile memory, sustained cycling, decoder failure, graphics loss during compilation
or GPU execution, or all visual controls after restoration. No new astronomical
sample or sub-arcsecond accuracy claim follows.

Hosted/clean-source CI, manual/accessibility and platform acceptance, notice
clearance, served-release verification and retrieval of the existing Linux result
remain incomplete. Supported browser discovery still reports local browser use
disabled; no replacement VM job or policy workaround is started. No dependency,
licensing, workflow, network behavior, commit, push or deployment change occurs.
Rollback removes only the new test and documentation hunks; preserve unrelated
working changes and the retained experiments.
