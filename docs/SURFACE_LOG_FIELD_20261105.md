# Surface-log field investigation — 2026-11-05

The private surface-log prototype has a measured consumer benefit in one Linux
helper cohort, but remains unqualified for application use. Its strict native
comparison fails. Application sources, models, coefficients and staged files
retain their original bytes. This follows the
[earlier surface-consumer controls](SURFACE_CONSUMER_CONTROLS_20261105.md).

## Representation and controls

The prototype stores precomputed residual logarithms in the same-size RGBA32F
surface field. Alpha tags distinguish invalid `0`, all-nonpositive `2`, partial
`3` and positive `4`. Raw alpha `1` and noncanonical tags are rejected by the consumer.
Positive cubic logs stay unfloored; normalized linear fallback keeps its original
floor. First-invalid/first-zero stencil precedence, cubic arithmetic, texture
read order, grid sizes and the raw limb path are retained in source.

An encoder guard using `isnan`/`isinf` did not reject uploaded RGB NaNs in the
tested native Adreno path. A failure-only probe retained the supplied, encoded
and predicate bits. A highp `floatBitsToUint` exponent mask detected those values;
the settled encoder uses that mask and exact raw-alpha bit identity. The
[GLSL ES 3.00 specification](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf)
defines highp bit representation preservation. This observation is not a general
driver-conformance claim or proof of a current production NaN-admission defect:
the production generator has additional nonnegative-residual validity checks.

Ten CPU tests and 4,113 independent bit-pattern controls pass. The private adapter
models the two exact masks and sign-clearing bit operation, not general GLSL uint
semantics. Earlier red tests, source snapshots and failed GPU runs remain saved.

## Actual GPU observations

The GPU control first uploads and stores a raw RGBA32F field, then runs a GPU
encoder into a second field and compares the actual old/new interpolation helpers.
Ten field types at depths 1/9/17 and three configured altitude positions produce
90 comparisons of 16,384 scalar pairs each: 1,474,560 paired scalar observations.
There are 80 distinct settings because depth 1 repeats `z=0`. Separate controls
reject 18 malformed encoder inputs and a raw texture supplied to the new consumer.

| Backend | Strict bitwise comparison | Guard/domain outcome |
| --- | --- | --- |
| Windows Chrome156 / SwiftShader LLVM | 90/90 pass | malformed/raw-format rejection passes; no nonfinite/domain violations |
| Windows Chrome156 / native Adreno D3D11 | **27/90 fail** | malformed/raw-format rejection passes; no nonfinite/domain violations |
| Linux Chrome157 / SwiftShader Subzero | 90/90 pass | malformed/raw-format rejection passes; no nonfinite/domain violations |

The native failures affect partial-zero and mixed zero/invalid fields: 27,672
scalar mismatches, maximum absolute difference 1.71661376953125e-5, maximum
reported relative metric 1.5798496942285553e-5. This is an unresolved P2 in the
candidate. A dynamic-floor uniform trial changed the mismatch pattern but did
not resolve it or establish its cause. The strict failed gate and exit 1 remain;
characterization continues only to retain the complete matrix and timings.
No threshold is relaxed and no passing result is substituted for that failure.

Subnormal cases include common GPU flush-to-zero behavior: matching outputs do
not prove retention of subnormal residuals. Raw output arrays are not retained;
independent review checks executed source, fixtures, counters and paired output
digests rather than independently replaying each GPU value.

## Linux timing cohort and provenance

Eight consumer queries use two current/candidate/candidate/current blocks.
Four additional queries time the encoder. Disjoint, finite-positive result and
context checks stay active.

| Linux query cohort | Four retained durations (ms) | Median (ms) |
| --- | --- | ---: |
| Current consumer | 109.858699, 108.156324, 102.777917, 102.081935 | 105.4671205 |
| Log-field consumer | 97.165118, 98.838910, 93.639504, 98.727332 | 97.946225 |
| Encoder | 0.125390, 0.141356, 0.262789, 0.141187 | 0.1412715 |

The consumer median is 7.5208955ms lower in this single cohort. Consumer draws
use 256×256 output; encoder draws concern one 8×5 field. The observations do not
establish statistical significance, net pipeline cost or application speedup.

The existing private Cloud Shell runtime and pinned Node24.22.1/Chrome157 are
reused. Node exits 0; the group is reaped/absent, browser cleanup is empty/passed,
and all 604 frozen input postchecks pass. The actual downloaded archive is
16,429 bytes, SHA-256
`0538544ff6c3a65d3d7e441a50f32e64de9f06c1aabdbe4202990855d0d1eea9`.
Six ordinary members contain 82,227 payload bytes. Source and receipt joins are
independently reviewed. Controller receipt:
`d13140f170374121f9c02fbc9540f7ac39de4ff00830feafea3f6e2b752c70f9`.
GPU result:
`3552bca65f6b7845a72b1fe996d8c9010fb3f76e0c7960f5f1ec4f3d87b7cefc`.
Parent observations confirm controller 13420, Node 13423 and transfer 13591 absent,
port 8081 refusing connection and preview 40 closed after actual saved download.

Artifacts and reproduction scripts remain under
`build/surface-log-field-20261105/`. Source review is `4d877a7e…`, controller
review `3bf11329…`, saved-result review `825ea07d…` and return-helper review
`ef444132…`. All are scoped observations; qualification remains false.

## Outstanding work and decision

The actual full generator has not been executed with the new encoding. The
current GPU baker operates after the old framebuffer rounding boundary; it does
not prove moving logarithms before that boundary is equivalent. Pass1/limb data,
full original physical-reference gates, explicit producer/consumer format
ownership and whole-application behavior still require qualification.

Keep the format private. Before paying its integration cost, locate the dominant
cost within the real physical material using matched, bounded controls. The
7% helper observation alone does not establish its contribution to the slow full
Earth draw. Preserve existing quality, physical tolerances, memory limits,
original gates and the generic raw-field oracle throughout that work.

The full Linux rendering gate and overall production readiness remain open.
Orbit accuracy retains the approved 1900–2200 target and approximate exploration
outside it; this work changes no astronomical quantity or tolerance.
