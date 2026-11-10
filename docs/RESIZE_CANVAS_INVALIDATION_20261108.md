# Resize-only procedural Sun invalidation — 2026-11-08

The delayed resize callback previously performed every procedural Sun Canvas2D
operation even when the successful pixels and their immutable inputs were unchanged.
In a retained continuous trace, substantial browser GPU-process presentation work
was already running when later Timeline and Sky inputs arrived. Those client wall
spans are not physical GPU execution measurements.

The installed change keeps the original 120 ms coalescing and the complete
`renderAll()` preparation, source/freshness assessment, panels and headers. A resize
intent permits only the procedural Sun draw to retain its existing canvas pixels.
Ordinary renders and the Butterfly draw remain unconditional. There is no offscreen
bitmap, pixel copy, resampling, new provider, external dependency or quality setting.
The original Sun drawing body and its geometry equations remain unchanged.

## Invalidation and recovery

Reuse requires a successful previous draw, the same deeply immutable plain-data
snapshot and primitive source/control/selection inputs, the same live context,
matching desired/backing dimensions, unchanged projection/source metadata and a
matching saved nondefault stroke state. Mutable data, unsupported prototypes,
accessors, repeated/cyclic object references or an exceeded inspection budget
conservatively retain the complete draw path. Observed images always redraw.

The procedural rim sets `lineWidth` to at least 1.5; later region strokes use 2 or
3.5. An ordinary native width/height or `ctx.reset()` reset restores the default
line width of 1. The retained nondefault state therefore detects those resets even
when dimensions and context identity are unchanged. Context-loss/restoration
events and failed draws invalidate previous success. This follows the
[HTML canvas reset and drawing-state rules](https://html.spec.whatwg.org/multipage/canvas.html)
and is tested with actual native APIs.

This signature is not a bitmap checksum. The renderer owns the canvas pixels;
arbitrary external clears or writes that preserve/restore its state must use the
unchanged ordinary `renderAll()`/full-draw recovery path. No second production Sun
canvas writer was found in the bounded source review. Cache keys and snapshots are
weakly owned; the current canvas retains only its latest successful frame metadata.

## Preserved correctness

Every resize still runs clock-dependent feed freshness, overdue/disclosure and
panel/header preparation. Preparation exceptions remain visible and the next resize
retries preparation; module namespace presence is not used as a readiness gate.
Normal source, image, control, selection, timeline and model publications still
render completely. Native-event arguments and ordinary no-argument callers retain
that full path.

Illustrative Earth, planetary rendering, source recipes, numerical crates and both
WASM binaries are unchanged. The 1900-2200 accuracy target and explicitly approximate
outside-range exploration remain separate requirements.

## Validation cohort

The exact application/test bytes installed here were validated in the isolated
`local-resize-canvas-invalidation-v3-20261108` artifact, mounted at `/sol/`.
Its manifest is
`7f3e36e3c43de925ef4c651f9c2815e4825a1ae39f0f486226382a75a7c2687c`:
251 assets, 228 declared source-owner bindings and the source-bound existing WASMs.
The retained code and evidence reviews found no new actionable source defect after
the prototype/reset corrections. They do not grant overall production readiness.

- All 1,999 Node tests pass, with zero failures, cancellations or skips; 21 targeted
  cases exercise reuse, invalidation, failed draws, native reset state, clock refresh
  and preparation-failure recovery. The intended failures were observed before fixes.
- All 138 web files typecheck; static checks and the unchanged 19-identity startup
  graph pass. Only existing app/view source digests change in that startup record.
- The three complete browser gate sets pass, each with seven trusted-touch cases
  under mobile emulation and verified owned cleanup. These are automated local
  checks, not physical-device acceptance.
- Merged coverage retains all 130 hand-written runtime files and 19,393 lines,
  including zero-execution modules. Native covers 18,951 lines (97.72%); each software
  mode covers 18,949 (97.71%), above the unchanged 90% floor.
- The isolated compositor matrix has 126 procedural cases across all three modes
  and DPR 1/2. Baseline, invalidated, reused and unconditional outputs have zero
  recorded RGBA difference, with unchanged model/projection/source-kind/label facts.
  Per-draw clear counts are 1/1/1/0/1. It does not qualify observed-image pixels.
- Eighteen native reset cases use width=same, height=same or `ctx.reset()` in the
  six base-square configurations. The raster changes, a complete draw is forced,
  and the exact prior pixels recover. The driver also checks that reuse resumes.
  These checks do not separately assert uniform blank raw RGBA after reset.

Evidence, complete commands, source maps, logs, receipts, native reset records and
the independent reviews are retained under
`build/resize-canvas-invalidation-20261108-01/`. The isolated pixel probe uses the
current source-bound main-stage dependencies plus the exact candidate renderer and
explicit store/image/caption host boundaries. Main verification/build receipts have
their own source cohort; the isolated results must not be relabelled as a hosted run.

## Response and release holds

The unchanged requirement is 200 ms in hardware and both software configurations,
using all six actions and the maximum of the frame probe and matched native timing
plus its rounding allowance. No threshold, percentile, transport or launch mode is
waived. One cold/warm diagnostic is not the required full campaign.

With the separate unadopted pending-UI CSS, the candidate sampled Timeline/Sky at
140/148 ms cold, but Inspector still took 220 ms. With its actual default UI,
Research/Inspector/Focus took 596/252/204 ms cold, and Sky took 284 ms warm. The
original unoptimized source also has retained warm Sky failures. These are separate
small cohorts, not qualified percentiles or a causal performance guarantee.

The loading-UI, cached-activation/presentation and first-panel response work remains
open. This change installs neither the pending-UI CSS nor a backdrop/appearance
modifier. The original response, scientific, manual/platform, legal/delivery,
hosted and served/rollback qualification holds remain. No commit, push or deployment
is part of this local source change.

## Rollback

The guarded apply receipt records every before/after digest and exact backed-up
byte stream under the same build evidence directory. Restore only the five changed
existing application files and the readiness document from those backups; remove
only the newly added regression test and this document if their current digests
still equal the applied versions. Preserve all unrelated dirty work and immutable
historical artifacts. A later source build must use its own new release identity.
