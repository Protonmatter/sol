# Surface-consumer controls — 2026-11-05

Two small shader shortcuts were investigated privately after the
[Linux draw timings](GPU_PHASE_LEDGER_20261104.md) identified the Earth physical
consumer as the largest retained group. Neither is promoted to the application.
The measurements establish no application speedup; full Linux rendering
qualification remains open.

## Single-layer interpolation

The candidate returns `exp(planes[0])` at exactly one layer and `p.z == 0.0`,
after the existing invalid/zero-source stencil returns. Other depths and
fractional altitude queries execute the original helper. The scoped binary32
adapter executes actual GLSL declarations: 1,068 queries and 17,688 checked reads
retain output bits and read order, including seams, boundaries, zero/partial/
negative/invalid knots, multilayer queries and deterministic wide-exponent fields.
This finite-input, separate-operation control does not prove all binary32 inputs
or backend contraction/transcendental equivalence.

Seven 256×256 RGBA32F WebGL cases cover positive, zero, partial-zero, invalid,
zero-before-invalid, invalid-before-zero and wide-range fields: 1,835,008 float
values per variant. Original Windows Chrome156/SwiftShader LLVM and native
Adreno runs record zero mismatches and nonfinite values. Their exact driver
`5c441f73…` remains at `build/surface-interpolation-20261105/gpu-control.before.mjs`.

The final driver `faea292a…` also rejects blank positive/range/partial results
and checks exact zero/invalid domains. Its actual Chrome157/SwiftShader Subzero
Linux run passes all seven comparisons with zero mismatches, nonfinite values
and domain violations. The context remains live. Eight positive-field timing
queries use current/candidate/candidate/current twice; disjoint and finite-positive
checks surround each query.

| Linux helper | Four retained query durations (ms) | Median (ms) |
| --- | --- | ---: |
| Current | 104.454810, 103.933495, 104.572808, 102.263429 | 104.194153 |
| Shortcut | 107.562215, 104.633033, 106.888702, 104.306249 | 105.760867 |

This fixed helper workload does not show improvement and is not the complete
material/application. The shortcut is not accepted as a production optimization.

## Actual application prefixes

Three Windows SwiftShader prefixes retain stage `9dd2d12c…`, original image/spin
assertions, deadlines and quality. The source observer records the replacement
fragment, and the Node registry applies the same transformation.

The second shortcut replaces only the exact Earth physical fragment's terrain
visibility call with a discard guard for a nonzero terrain-enable uniform. Earth
has no admitted terrain reference; the renderer rejects an alien terrain texture
before physical rendering. This is a disabled-Earth diagnostic, not a replacement
for Mars or terrain-enabled rendering.

| Prefix | Earth surface query durations (ms) | Original spin draws |
| --- | --- | ---: |
| Baseline | 50.1306, 53.7286 | 5 |
| Single-layer shortcut | 55.4508, 52.9434 | 4 |
| Disabled-Earth terrain shortcut | 53.0588, 48.9045 | 4 |

Each original spin assertion passes. Each separate replay captures 112 finite
eligible queries, with no pending queries, disjoint indication, context-generation
change or recorded errors. All eight linked source pairs match. Recorded camera
and quality match across cohorts, but epochs differ. The unchanged family
recognizer classifies modified consumers as `other`, so their uniform snapshots
are absent. Two-query animated cohorts do not establish causal performance,
image equivalence or optical qualification. The commands intentionally exit1
after the prefix and are not full browser passes. An earlier missing-`CHROME_BIN`
setup failure is preserved separately.

## Evidence and failure handling

The Linux helper run reuses the existing private Cloud Shell runtime and pinned
Node24.22.1/Chrome157 binaries. It creates no cloud resources, credential grants,
dependencies or application network behavior. The controller admits bounded
source buffers before copying, verifies copied bytes, enforces a 150-second
deadline and cleans its created group even after the leader exits. Unrelated
protected processes remain. All 604 frozen input postchecks pass.

Private-tool review reproduced and corrected cleanup evidence loss, exited-leader
group cleanup, source admission/copy and packaging-failure receipts. Final CPU
controls pass seven GPU cleanup cases, 13 readback-domain cases and 13 controller
cases. Four controller controls reproduce earlier defects against preserved source.

The actual saved archive is 8,628 bytes, SHA-256
`3102dfa4af9a612b38d48f4c499662f7ec43e4aa1b9c4b355fd81edb4e41ad3e`.
Six ordinary members expand to 24,491 bytes and match final reviewed source bytes.
Controller receipt:
`ddf6763e4726ac703d6a1177f31b1ef2d465a7c897a6304b148db43d2ed75500`.
GPU result:
`a82450f9a45e657e3bf7b58aa3058350f8d3c785d8a439a1b1e0f7ccdfb91a98`.
Parent observations confirm controller12701, Node12704 and transfer12870 absent,
port8081 refusing connection and the preview closed after actual saved download.

Source/results and reproduction scripts remain under
`build/surface-interpolation-20261105/`. Source review is `93ee6814…`, controller
review `f8b243f5…`, and bounded return-helper review `6d7cf883…`.
Actual execution and independent offline correspondence review are distinct.
Saved-byte/source/arithmetic review is
`b6ab73525c03a93a4f079d4a2cecb0c18c815f5ffbeb1ccee8b7fa1269549dd8`.
Raw pixel arrays are not retained; that review checks source and recorded counters,
not an independent recomputation of every GPU pixel comparison.

## Next controlled change

Investigate storing surface residual logarithms in the existing generation pass
to avoid 16 repeated RGB logarithms per fragment. Preserve the generic raw-field
oracle and limb representation, first-invalid/first-zero fallback precedence,
zero/partial-zero semantics, linear log floor, every grid/sample/quality setting
and memory budget. Measure producer/consumer binary32 rounding and full numerical/
image equivalence before changing the runtime format or claiming a speedup.
Rebuild a fresh artifact if application bytes change, then run the full Linux gate.

Application shaders, orbit models, coefficients and thresholds are unchanged.
The approved 1900–2200 accuracy target and approximate exploration outside it
retain their existing limits. Production readiness remains open.
