# Illustrative Earth and planet texture resources — 2026-11-06

The current local candidate preserves Illustrative Earth and all seven artistic
planet maps. A native browser experiment establishes bounded texture requests,
late Earth decode cancellation, and Earth recovery after active graphics-context
loss. Permanent Earth and planet browser probes now verify that Source-qualified
deletes the exact illustrative texture handles sampled by their real draws.
This is local validation; it grants no release or all-device qualification.

## Candidate and scope

The application is the unchanged `local-fractional-labels-20261106-01` stage at
`build/fractional-labels-20261106-01/site`. Its manifest SHA-256 is
`b5dc19f64e620eef6720a6cc489b767b70df60e572c2902160ddf2f7d5dcc879`.
Both canonical manifest copies, all 228 assets, all 208 current source owners,
and the exact 230-file staged inventory were checked. The fixed model epoch is
2026-07-08 12:00 UTC, with animation paused and reduced motion enabled. Native
execution is established from the actual application WebGL renderer before and
after restoration, rather than from launch flags alone.

Earth retains the Sites v7 July 2004 surface, 1.6 display exposure, dark oceans,
and illustrative cloud lighting/depth. No renderer, shader, texture, ephemeris,
model default, scientific layer option or WASM bytes changed in this work.
Source-qualified remains the visual rollback. The previous
[Sun resource evidence](SUN_QUALITY_RESOURCE_VALIDATION_20261106.md) is separate.

## Native resource experiment

The test-owned observer records actual texture creation, uploads, mipmap
requests, deletion and context invalidation. Ownership comes from the two exact
asynchronous cache-load function ranges in the staged `orrery.js`, located by
the TypeScript parser. It does not classify every texture in that module as an
illustrative resource. Images are separately identified by their pinned byte
size and SHA-256, and native bitmap closure is observed.

| Resource | Nominal requested bytes | Observed bound |
|---|---:|---|
| Earth 5400 × 2700 RGBA surface, full mip chain | 77,756,544 | One surface |
| Earth 512 × 256 R8 ocean mask, no mip chain | 131,072 | One mask |
| Each 2048 × 1024 planet RGBA map, full mip chain | 11,184,812 | At most two maps |
| Combined Earth plus two planet maps | 100,257,240 | 95.61 MiB observed peak |

These values count API-requested texels and formats. They do not measure physical
VRAM residency, driver overhead, memory compression, reclamation latency,
whole-application memory, or image decoder memory. A texture object being
deleted or invalidated does not prove immediate physical memory reclamation.

The retained experiment includes fifteen checkpoints and 58 resource events:

- Earth draws with its live surface and mask. Source-qualified releases both
  without changing the model epoch, positions or camera.
- The test browser holds one *already decoded* hash-identified Earth bitmap,
  switches to Source-qualified, and then releases the held result. Production
  cancellation closes the bitmap exactly once and performs no Earth upload.
  Selecting Illustrative again loads and draws Earth normally.
- Mercury, Venus, Mars, Jupiter, Saturn, Uranus and Neptune each draw their own
  hash-identified map. Independent analysis joins the submitted sampler handle
  to that bitmap and checks the model translation against the selected body's
  Float32 position. The shared planet cache never exceeds two live maps.
- Context loss occurs while Earth has two live textures and the planet cache
  has two live maps. Restoration rebuilds Earth's live resources and real draw
  while preserving its epoch, physical positions and camera. Restoration is
  requested in a new task after the application's loss handler permits it.
- Leaving System releases all monitored Earth and planet textures. The ledger
  balances: **15 creations − 11 live deletions − 4 context invalidations = 0**.
  Four later delete calls address already invalidated handles and are not
  counted as additional releases. All twelve decoded identified bitmaps close
  exactly once. Recorded page/console errors and checkpoint GL errors are empty.

Raw evidence, captures, source snapshots and the terminal exit are retained under
`build/appearance-resource-20261106-01/replay-01/`. The executable protocol is
`build/appearance-resource-20261106-01/run.mjs`; independent byte accounting,
draw identity, stage inventory and model checks are in `analyze.py` and
`resource-analysis.json` in the same audit root. The raw evidence SHA-256 is
`ed050b0716e0c2437e5003f11488f8d6406b3fa14d1a021c6c3e53f17d267817`.
The fifteen local inputs, two package/lock inputs and two installed package
manifests are frozen. This is not a hostile-install attestation.

## Permanent checks and sensitivity

`tools/earth_look_probe.mjs` observes the actual Earth surface and ocean-mask
samplers in both draw passes. Their two distinct texture handles must be live
at the illustrative capture and invalid after Source-qualified selection.
The probe restores the active texture unit and removes its instrumentation in
`finally`. `tools/illustrative_look_probe.mjs` applies the corresponding check
to sampled Mercury and Venus textures. Their qualifying submitted sampler sets
must be live in their respective captures and disjoint. Mercury may already have been evicted
before the final comparison; the check requires its absence after switching,
without imposing a new retention policy.

`tools/browser_validation.mjs` now adds these two changed producers to its
selected source inventory, expanding that receipt from nineteen to twenty-one
inputs. This list is a selected producer inventory, not a claim to cover the
complete transitive installed dependency tree. Earlier passing native/software
runs retain their original nineteen-input receipts. The final commands use
separate output directories. The final identity predicate uses
`native-identity/` and `swiftshader-identity/`; the preceding bound receipts are
preserved as their own source cohort.

The private `sensitivity.mjs` protocol suppresses texture deletion only inside
the owned test browser, after the real illustrative captures. The Earth probe
rejects with `Source-qualified retained an Earth look texture`; the planet
probe rejects with `Source-qualified must delete the sampled Mercury and Venus
maps`. Both are intended checker failures. The protocol verifies that the
suppressed handles remain live, restores deletion, cleans them up and exits
successfully after both expected rejections. No staged source is modified.
`sensitivity-v2.mjs` repeats both intended failures with the final corrected
sampler predicate; its separate result also passes.

The resource experiment predates the browser receipt's two-entry inventory
addition. Its original selected capture producer is frozen separately; the raw
capture function bytes and application stage remain identical. No old receipt
is rewritten to claim the newer producer inventory. `analyze-v2.py` and
`resource-analysis-v2.json` verify the frozen inputs and the exact selected
capture-function equality against the current producer; the first analyzer and
its original result remain preserved.

Independent review found a P2 checker false positive in the first predicate:
counting two historical texture handles could accept Venus reusing Mercury's
sampler while another handle supplied the count. The captured application runs
used distinct maps. The corrected predicate compares the actual qualifying
sampler sets and checks every sampled handle's liveness in its own capture.
Six regression cases cover cross-body reuse, mixed reused/distinct Venus
draws, dead qualifying handles hidden by unrelated live ones, incomplete draws,
and legitimate eviction of Mercury before the later Venus capture. The first
predicate and its completed receipts remain preserved.

Both final complete browser commands pass, including the original gates and
the texture-release checks, with twenty-one current selected producer hashes
in each receipt. All 1,522 Node tests pass, including the six new identity
regressions; the focused lifecycle suite also passes its 29 tests. The existing
TypeScript gate passes all 125 application files. Documentation, 27-requirement
governance and UX structure checks pass. Fresh Node plus native browser runtime
line coverage is 97.57%, above the unchanged 90% floor. The original Sky and
experience commands were not rerun for this validation-only edit.

Use fresh output paths for the existing complete commands:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tools/browser_validation.mjs --backend=native --physical-spin=true --web-root=build/fractional-labels-20261106-01/site --output-dir=build/appearance-native-new
node tools/browser_validation.mjs --backend=swiftshader --physical-spin=true --web-root=build/fractional-labels-20261106-01/site --output-dir=build/appearance-software-new
```

## Limits and rollback

This single bounded sweep does not qualify sustained cycling, mobile memory,
all browsers or devices, allocation failure, loss during a pending decode or
GPU execution, or every planet's post-context-restoration appearance. Earth's
late decode case uses mode withdrawal; other cancellation paths retain their
separate unit and browser evidence. Native resource instrumentation and extra
hashing are outside the original performance gates. No new orbital accuracy
claim follows from this resource work.

Hosted/clean-source CI, cross-platform/manual/accessibility acceptance, notice
clearance, served-release verification and retrieval of the existing Linux
result remain incomplete. Requirements are not relabeled accepted or released.
No dependencies, product network calls, licensing, workflow, commit, push or
deployment changes. Rollback consists of the texture-observer/assertion hunks
in the two probes and their two added receipt entries; preserve older unrelated
changes and all retained evidence.
