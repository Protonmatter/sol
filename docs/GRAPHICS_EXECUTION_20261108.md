# Graphics execution readback - 2026-11-08

The startup profiler now records the browser compositor, rasterizer and Canvas2D
feature status after the measured actions in every requested rendering mode.
The actual application's WebGL context and exact native renderer pin remain
separate requirements. Requested flags or a SwiftShader WebGL renderer alone do
not identify the browser's complete graphics configuration.

The retained response investigation found the same SwiftShader WebGL renderer
with software compositor/rasterizer/Canvas2D status in normal fallback, and
enabled status in whole-driver emulation. These are separate cohorts. Browser
feature status reports configuration; it is not physical GPU occupancy, shader
timing or proof of a particular implementation's execution cost.

## Behavior and failure handling

The explicit readBrowserFeatureStatus helper reads SystemInfo.getInfo through
the launch-owned browser target. It copies the returned status and requires
nonempty string values for gpu_compositing, rasterization and 2d_canvas. Missing
or malformed status is a qualification evidence failure. The helper detaches
its CDP session, retains read failures, and preserves simultaneous read/detach
failures, including falsy rejection values.

The existing withBrowserFeatureStatus interface retains its no-I/O return for
native and legacy software callers. Its fallback path delegates to the explicit
reader. The startup profiler explicitly opts into the reader at its existing
post-task capability boundary, after feedback and accepted model/catalogue
readiness. It does not create a fixture WebGL context or read capabilities before
the measured actions. Other callers keep their existing mode policy.

Launch flags, all six actions, network pacing, CPU slowdown, readiness checks,
native event correlation and the maximum frame/native response metric remain
unchanged. Per-task and pooled p95 gates retain the 200ms requirement. The
additional post-task read means new runs form a new profiler-source cohort;
historical reports retain their original source, raw rows and failures.

## Validation and evidence

The four added regression groups reproduce the missing all-mode readback and
cover copied output, incomplete fields, combined read/detach failure and the
actual profiler readback statements in all three modes. The retained red
baseline passes twelve existing cases and fails four new groups. The focused
suite passes all sixteen after correction, including the old no-I/O contract.

Commands, exact before-file backups, source inventories, full-suite logs,
independent review and actual named-stage mode checks are retained under
build/graphics-readback-20261108-01. Short cold/warm checks establish receipt
plumbing and configuration only; they do not replace the full ten-cold/ten-warm
response campaign or resolve the historical service-worker cancellation.

## Scope and rollback

This changes QA tooling, tests and documentation. Application code, orbital
engines, staged numerical binaries, configured quality and Sites v7 Illustrative
Earth remain unchanged. It grants no timing waiver, scientific qualification,
cache adoption or release approval.

To roll back, restore only the four backed-up helper, profiler, test and readiness
files, and remove this note. Preserve unrelated dirty work and all historical
evidence. No dependency installation, application network call, license change,
commit, push or deployment is part of this correction.
