# Native and software scattering node diagnosis

The retained L qualification source produces a discontinuity in its conditioning
weight near a Mars ground-tangent knot. A small backend difference in computed
shadow support selects either one whole-interval centroid or two separate lit
interval centroids. The resulting denominator difference explains the large
native/software residual mismatch. The original scattering integral also differs
slightly; this diagnosis does not erase or recalibrate that difference.

## Pinned evidence

The [compact receipt](SCATTERING_NODE_DIAGNOSTIC_RECEIPT.json) records source,
generated shader, tool, raw evidence and manifest hashes. Both runs use the
unchanged L snapshot module SHA-256
`b9b104ebfaab1cc03407e7cb3593c2876137569f8e8fd4b78dcbb1a869cb2df5`.
This was an uncommitted numerical candidate captured by the earlier immutable
`scattering-l-native` and `scattering-l-runtime-module` receipts; a repository
commit alone is not its source identity. The diagnostic worktree started at
`bbe2662e1f19ce75c7d86ea4fa21086688990573`.

Two serialized diagnostic browsers established actual Adreno X1-85 D3D11 and
SwiftShader backends. Each evaluated 64 Mars nodes: x=15..18, y=26..29, z=11..14.
The original generator ran unchanged first. A second program retained every
original formula byte and added multiple render-target readback outputs. A
source-derived copy of the conditioning-center expressions exposed the centers;
it did not replace the generator's weight calculation.

The diagnostic residual matched the unmodified generator exactly at all 64 nodes
in all seven diagnostic modes on both backends. Each backend also reproduced all
eight overlapping historical corner readbacks exactly. All captured channels were
finite. This agreement supports attribution of the added diagnostic outputs to
the observed original computation for this bounded run.

## Observed failing node

At x=16, y=28, z=12, the RGB values were:

| Quantity | Native Adreno | SwiftShader |
| --- | --- | --- |
| Original scattering S | 0.03355455, 0.03465008, 0.03709120 | 0.03360662, 0.03470209, 0.03714212 |
| Actual conditioning W | 0.02877317, 0.02943050, 0.03068958 | 0.02386398, 0.02424499, 0.02483858 |
| Residual S/W | 1.16617489, 1.17735302, 1.20859253 | 1.40825701, 1.43130970, 1.49534011 |
| Shadow interval relative to atmospheric entry, km | 827.441895 to 828.758057 | Absent: sentinel 1, -1 |
| Selected conditioning | Two centroids at 672.855408 and 898.882019 km | One centroid at 753.598511 km |

Native S differs by -0.155%, -0.150%, and -0.137%, while native W is greater by
20.572%, 21.388%, and 23.556%. Evaluating the native whole-interval conditioning
term gives `0.02386287, 0.02424379, 0.02483717`, within 0.0057% of the actual
SwiftShader denominator. Thus the large residual change is dominated by the
one-versus-two centroid branch. These are observed differences, not revised
acceptance tolerances.

The actual computed metric impact is 3396.189941 km on native and 3396.190430 km
on software, with the ground-intersection discriminant respectively 0 and
-3.979764. Both report the same planned impact, 3396.190186 km. The captured
direction, maximum distance, grid mu/height, shadow roots, centers, solar optical
depths and transmission masses remain in the raw evidence.

At adjacent z=13 both backends select a whole interval; the maximum RGB residual
difference is 0.0000474453. Across this selected 64-node neighborhood, five nodes
change the split classification, maximum direct-S difference is 0.0001534894, and
maximum residual difference is 0.3849704. This local probe does not qualify the
complete field or any proposed repair.

## Reproduction and limits

The [diagnostic tool](../../../tools/scattering_node_diagnostic.mjs) accepts an
existing source-bound qualification receipt and creates a fresh immutable output
directory. It copies and verifies the receipt's allowlisted source/data hashes,
serves those copies on loopback, blocks external browser requests, records actual
backend identity, and closes its owned browser. For example:

```powershell
node tools/scattering_node_diagnostic.mjs --backend=native --receipt-root=build/pr107-production-20260914/scattering-l-native --out=build/mars-node-native-new
node tools/scattering_node_diagnostic.mjs --backend=swiftshader --receipt-root=build/pr107-production-20260914/scattering-l-native --out=build/mars-node-software-new
node --test tests/web/scatteringNodeDiagnostic.test.mjs
```

The source-integrity tests verify exact recovery of the original shader after
removing diagnostic additions and reject changed or ambiguous insertion points.
The tool performs synchronous setup only in this isolated numerical diagnostic;
its compiler intervals are not application startup performance measurements.

Raw captures are preserved under the three `build/mars-l-node-*` directories in
the diagnostic worktree and remain ignored by Git. Their complete manifest has
SHA-256 `584820b7dbb1ddf5bfb21abb5d33e09aa915d51caf19334e548ded058204238b`.
No solver, runtime, corpus, deadline, tolerance, driver setting or GPU policy was
changed. Any normalization repair still needs independent numerical tests and
full native/software qualification against the original gates.
