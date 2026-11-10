# Canvas backing-size correction - 2026-11-08

The Solar System canvas now assigns only a changed backing width or height.
A width-only layout change previously reassigned the unchanged height as well;
a height-only change likewise reassigned width. Canvas dimension setters can
clear the drawing buffer, and sequential setters can incur intermediate work.
See the [Khronos WebGL drawing-buffer specification](https://registry.khronos.org/webgl/specs/latest/1.0/#2.2).

The cold instrumented Focus capture observes width 956 to 1289 pixels and height
612 to 612. This establishes the redundant setter, not its share of latency.
No Sun look generation is submitted in that captured default overview frame;
a speculative Sun texture-cache change is not supported by that observation.

The implementation preserves the DPR cap of two, rounding, minimum backing size,
final dimensions, redraw, camera/physical snapshot/epoch, rendering controls and
shader/image inputs. When both dimensions change, their assignment order remains
width then height. No observer callback, freshness preparation, image publication
or accepted Illustrative Earth material is removed.

## Evidence and limits

Eight new whole-module cases cover width-only, height-only, both, unchanged,
fractional rounding, capped DPI, positive subpixel and zero/inactive canvases.
After correcting a test-host setup error, the original code fails exactly the
two single-dimension cases. The guarded code passes all eight. The isolated
candidate passes all 1,938 Node tests and the configured 138-file type check.
Independent review reruns eight cases and 37 resize/recovery/HDR/scattering/time
cases, and checks 6,272 dimension/DPR combinations without a finding.

The guarded private ERFA stage has manifest SHA-256
`000d08572241a49bada4b19f2ce754ba59aeffc43f2e8511e9bf2193d9c2630d`.
Its complete software-fallback, native replay and whole-driver software browser
checks, including touch follow-ups, pass. These validate that named private stage;
main's existing four-term astronomy binary is separate and unchanged.

Failures remain visible. The first native full run times out in Sky before the
changed Orrery path executes; its diagnostic reports the 10-second engine compute
deadline. The earlier passive attribution also fails during warm Sky readiness
after 90 seconds and contains only three completed task captures. Cleanup and
source/artifact checks pass. A later instrumented native Sun/Sky prefix completes
with two returned snapshots around 3.22 seconds; this does not establish a cause
or close the intermittent Sky deadline issue. A small separate Node engine check
takes roughly 2.0-2.2 seconds per snapshot; its first fixture assertion incorrectly
expected nine entries and was corrected to the actual 117, including stars.

The original full timing result remains native pass / software fallback fail:
Inspector cold/warm p95 231.5/256.2 ms and Focus 228.7/244.0 ms on fallback.
The response requirement remains 200 ms for hardware and software modes, as
confirmed by the user. No gate, sample, resolution, visual quality or deadline
is weakened. This narrow setter correction does not establish a speedup or
qualify the target; a fresh full campaign is required for a changed artifact.

All named evidence, failed attempts, exact source inventories, staged inputs,
review and application backups are retained under
`build/resize-attribution-20261108-01/`. Restore only the backed-up original
orrery.js and readiness document, and remove the two newly added files to undo
this application; preserve unrelated work. No ERFA adoption, mathematical,
dependency, licensing, network, commit, push or deployment change follows.
The production-readiness goal remains active.
