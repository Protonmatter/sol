# Earth image-pair state correction — 2026-11-04

The Earth camera-image gate now waits for settled recorded rendering state and
binds that state around both screenshots before using its unchanged pixel
comparison. A material/pipeline transition can no longer silently satisfy the
state precondition for a camera-only comparison. Application, shader, field,
model, coefficient and staged artifact bytes are unchanged.

## Verified problem and change

The preceding Linux control produced a mean image difference of 13.20395053
despite zero sampled pixels exceeding the individual threshold of 32. Independent
replay reproduced the original failure. Similar geography and broad darkening
did not prove its cause. Source controls established that the old image-map waiter
could return while optical programs/fields were loading or unavailable. It did
not record equal camera, clock or pipeline state across the pair.

`tools/render_pair_state.mjs` is separate from the existing general map waiter.
It reads JavaScript/DOM state without GL queries or renderer mutation. It records
the paused Earth camera, epoch, quality, geometry, Earth position, demanded maps,
base/physical program state, optical state, terrain state and current scattering
submission/context/program identities. Scene serial may advance; each submission
must belong to its corresponding current scene and epoch.

The physical-spin/HDR modes require the settled physical path. The legacy visual
mode can record a terminal degraded path explicitly, without granting optical
qualification. Loading state waits within the original remaining System budget;
unavailable required state fails. The original 75-second deadline is not extended.
Serialized sampling checks the absolute deadline before and after asynchronous
imports. Initial/terminal readiness records survive failures when available, and
the remote wait handle is released without replacing a primary failure.

The caller saves five states and four comparisons in `earth-orbit-state.json`,
including failure state. Finite azimuth comparison uses a fixed binary64 gesture
allowance; large-angle movement and overflow cannot expand it into a false pass.
The exact synthetic 2π pointer gesture, Blue Earth assertion, image thresholds
of 6 mean / 0.04 changed fraction / 32 per-pixel, and spin requirements remain.
An evidence-write failure preserves an existing primary error and fails an
otherwise successful gate.

Final sources:

- Validator: `640c4bb2114553744125008c8cb368616a1591f9cad6d8bc4d42fbe882a73497`.
- Helper: `09dec5fae404e67bf52dffe5d6f3913e17cdb58d71b99bb29d142df01e56edc6`.
- Exact prior validator `40566300…` is preserved at
  `build/render-pair-state-20261104/browser_validation.before.mjs`.

Source review receipt is
`bc274a2f070e6d06fdbc6f461cefc8de837873e09d8192bb5c8b3a08c31752d9`.
It passes 26 supplied cases, 11 serialized helper controls and eight caller
controls, including delayed admission, state changes, large-angle/overflow,
absolute-deadline fences and simultaneous primary/persistence failures.

## Actual validation

The complete current Windows Chrome 156 / SwiftShader command passes on unchanged
stage `9dd2d12c…`, with physical spin, held-producer rejection/recovery, shadows,
appearance, mobile and coverage checks. Browser receipt:
`7c092e2565f8648cd7afcc020c3276b949809c83e1f54c7d1544b9b2ee1fea0b`.
All five saved image states are on the settled physical path at epoch
1783512000. The four comparisons pass, the expected camera wrap is retained, and
the unchanged pixel comparison returns zero mean difference.

All 1,491 web tests pass. Fresh Node plus browser coverage remains
17,802 / 18,249 lines (97.55%); current branch counts are 8,095 / 8,563 (94.53%).
The runtime population and 90% floor are unchanged. These results qualify the
tested Windows software-browser run, not Linux, other hardware, continuous
scientific accuracy or release eligibility.

Independent saved-result review is
`35469c3e729ddca22d2e4e42add4d31a074cec24ee0a377e6a687d44cdb3d307`;
its separate bounded coverage reconstruction is
`91fce1dd9865ea654c8d85d3d39159e51b155af0cf06a6a0977b435758dee79b`.
The 124-file TypeScript check passes. Browser/Node/merge command exits are parent
observations; reviewers independently bind the saved results and source flow.

```text
npm test
node tools/collect_node_coverage.mjs --web-root=build/production-20261104-canvas-focus-site --output-dir=coverage/render-pair-state-node-20261104
node tools/browser_validation.mjs --web-root=build/production-20261104-canvas-focus-site --output-dir=coverage/render-pair-state-browser-20261104 --backend=swiftshader --physical-spin=true
```

Use a verified `CHROME_BIN` on Windows and fresh output directories. The recorded
Linux [phase-ledger control](GPU_PHASE_LEDGER_20261104.md) deliberately retains
the old validator and cannot be relabelled as using this correction. Its 604-input
closure was admitted before promotion; a later replay must use the exact retained
405 validator snapshot as an additional historical alias. No commit or deployment
occurred. Rollback restores only that exact prior validator and removes the new
helper/test; preserve unrelated work and original evidence.
