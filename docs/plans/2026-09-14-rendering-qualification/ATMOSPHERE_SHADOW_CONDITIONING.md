# Coherent shadow support and stable column coordinates

Source commit `f44b68088280ba425c17061e12d195a3e07c5ee7` passed the complete numerical qualification on the recorded native and software backends. The [final numerical receipt](ATMOSPHERE_SHADOW_CONDITIONING_QUALIFICATION.json) binds the exact runtime, tools, fixture inputs, payloads and results. The earlier [proposal receipt](ATMOSPHERE_SHADOW_CONDITIONING_RECEIPT.json) preserves the diagnosis, intermediate failures, independent reviews and bounded compiler measurement. Its pending statements describe that earlier proposal freeze; the final numerical receipt records the subsequent complete runs.

| Gate | Recorded result | Scope |
| --- | --- | --- |
| Native production program owner, 30 seconds per program | Sphere 8,708.0 ms; shell 4,040.7 ms; generator 11,656.9 ms; all ready | One isolated context; exact production shader sources |
| Narrow unchanged regressions | 18/18 native; 18/18 SwiftShader | Includes the ten prior grazing regressions, two original physical cases and Mars case 500 |
| Complete atlas matrix | 7,192/7,192 native; 7,192/7,192 SwiftShader | All 21 original and supplementary datasets; unchanged tolerances |
| Independent direct-source physical comparison | 1,600/1,600 on each backend | Converged binary64 physics on once-uploaded binary32 inputs |
| Original physical GPU gate | 1,280/1,280 SwiftShader | Original reference, terrain endpoints and near-ground visibility cases |
| Four optical field payloads | All byte-identical after regeneration | Source metadata regenerated for this exact core |

The native context reported Qualcomm Adreno X1-85 through ANGLE D3D11, with `KHR_parallel_shader_compile`; the compiler receipt records Chrome 151.0.7922.174. Requested launch flags alone are not the backend evidence. The isolated compile result is one bounded observation, not a stable or tail-latency guarantee. Final combined application startup, physical/HDR presentation, interaction and memory qualification remain separate.

## Two independently reproduced numerical errors

The previous prepared-path native matrix rejected `Mars-forward-terrain/surface/500`. At atlas node `(31, 23, 12)`, the recorded native path ended at 948.149658203125 km. Its old shadow exit was 948.1290283203125 km, while binary64 geometry on that exact recorded entry, direction and Sun gave 948.133856813353 km. The old boundary therefore admitted 4.828 metres of shadowed support. Of the first five actual native Gauss points rejected by the local solar test, four were true ground hits and the fifth was a false tangent. An earlier CPU reconstruction had different rounded coordinates; its five-false-hit result was retained as a separate model, not transferred to the native path.

The compensated shadow exit measured on the native GPU is 948.13385009765625 km, within 6.716 millimetres of that exact-path binary64 result. Source, conditioning and zero-support tests now share the same prepared, entry-relative shadow interval. Inside its analytically lit complement, a private source kernel evaluates solar optical attenuation without reclassifying rounded sample positions against a different line. The public `atmosphereSunTransmission` function and its local ground-visibility behavior remain unchanged.

A separate error enlarged the density column of this short lit suffix. Its independently converged physical mass was 0.013056918926594031 km, while the GPU obtained 0.01507568359375 km. The cumulative field itself, evaluated with binary64 coordinates, differed from the physical integral by only about 0.0394%. Rounding each body-sized radius before subtracting the datum converted the actual 0.559808-metre radial increment into approximately 0.732422 metres and reproduced most of the excess.

The tail lookup now calculates the same altitude through

```text
h = ((impact - R) * (impact + R) + x * x)
    / (length(vec2(impact, x)) + R)
```

This is the rationalized identity for `sqrt(impact² + x²) - R`. It retains signed below-datum heights and tiny positive altitudes without adding a cutoff or fitted correction. The native suffix column became 0.0130615234375 km, about 0.0353% above the independently integrated mass. The approximate conditioning centroid and radial moment were not changed. The full atlas and physical gates, rather than this one-node improvement, determine the recorded numerical result.

## Shared geometry and bounded compilation

For raw physical observer origin `o`, direction `d`, Sun vector `l` and polar ratio `q`, the shadow cylinder uses `co = o × l`, `cd = d × l`, and `K(v,w) = vx*wx + vy*wy + q²*vz*wz`. Its quadratic coefficients are `a = K(cd,cd)`, `b = K(co,cd)`, and `c = K(co,co) - R²*(q²*(lx² + ly²) + lz²)`. High/low arithmetic carries the cross products, discriminant and root divisions. A stable paired-root construction and the antisolar plane complete the interval. Original tangent inclusion and algebraically equivalent parallel thresholds are retained.

Private geometry preparation reports an explicit completion flag. Public compatibility wrappers still return complete paths, including the original early-return and miss-sentinel behavior. The generator selects its surface or observer geometry first, then completes the shadow once. Source, conditioning and zero-support consumers use that same stored interval.

The direct integrator also selects its original one or two lit intervals before one textual segment-kernel call. It assigns the first result directly and adds the second in the original order. This removes duplicated compiler expansion without changing the kernel, 12 nodes per nonempty segment, or the original maximum of 60 analytic integration nodes. The retained source-control proof checks 6,000 combinations, including signed zero and nonfinite controls, and rejects deliberate first-addition, dropped-segment and interval-order mutations. It records control and kernel arguments; numerical correctness comes from the separate GPU/reference gates.

The intermediate robust-shadow and geometry-only factoring candidates both exceeded the unchanged native generator deadline. Their exact sources and failed receipts remain retained. The final one-callsite candidate passed all three actual production programs. Final material and shell expansions still exclude the direct integration body, and cached source/generator expansions retain the guarded field-backed column paths.

## Reproduction and evidence boundaries

The recorded runtime hashes are:

| File | SHA-256 |
| --- | --- |
| `apps/web/js/atmosphereShaders.js` | `282d74036c31b418ca8e1e43f9fdb4f975cf3ec03e3217da801d54ec945aa635` |
| `apps/web/js/atmosphereColumnField.js` | `84177099c937c7c9b4fa859994e2be381bd5b20034298c6c370fa96e13eeb5da` |
| `apps/web/js/atmosphereScattering.js` | `4c43aaa434b7388e9f7b9185f845e3c508ce5a4db4d1e3d38ac0cf7bc293af6b` |

Use existing repository dependencies and serialize GPU runs. Each new output directory must be unused; do not overwrite retained attempts.

```powershell
node tools/scattering_validation.mjs --web-root=apps/web --out=build/shadow-replay-native --terrain-v2-explicit-height --backend=native
node tools/scattering_validation.mjs --web-root=apps/web --out=build/shadow-replay-swiftshader --terrain-v2-explicit-height --backend=swiftshader
node tools/atmosphere_validation.mjs --web-root=apps/web --out=build/shadow-replay-physical --terrain-endpoints --near-ground-visibility --backend=swiftshader
```

The original 1,280-check validator uses the separately reviewed public-function extraction fix, which preserves the exact public Sun reference independently of helper ordering. Its tool and imported helper hashes are in the final receipt. The historical native 1,280 aggregate timeout remains inconclusive; this document does not report a native 1,280 pass or attribute that attempt to application behavior.

For the independent 1,600-case comparisons, the final receipt includes a reproducible binding to the existing [physical reference](ATMOSPHERE_OPTICAL_COORDINATE_RECEIPT.json). All 1,645 original case records, convergence results, input hashes and limits remain unchanged; the binding identifies the current source being measured. Historical `candidateS` and `uniformS` values remain old CPU experiment outputs and are not current GPU observations. The comparator verifies every retained input record and actual source shader hash before comparing GPU `S/T` against the independent reference.

The binding can be reconstructed without copying a second full physical corpus into Git:

```python
import hashlib
import json
from pathlib import Path

docs = Path("docs/plans/2026-09-14-rendering-qualification")
receipt = json.loads((docs / "ATMOSPHERE_SHADOW_CONDITIONING_QUALIFICATION.json").read_text())
binding = receipt["physical_reference_binding"]
reference = json.loads(Path(binding["original_tracked_reference"]).read_text())
reference["candidate_solver_sha256"] = binding["candidate_solver_sha256"]
reference["source_binding"] = binding["source_binding"]
payload = (json.dumps(reference, indent=2) + "\n").encode("utf-8")
assert hashlib.sha256(payload).hexdigest() == binding["sha256"]
Path("build/shadow-reference-replay.json").write_bytes(payload)
```

Then use `tools/compare_scattering_physical_reference.py` with that binding, the chosen complete GPU output directory, and the retained CPU input directory whose file hashes are listed in the reference. The raw CPU inputs and raw GPU runs remain ignored local evidence; their hashes and source identities are tracked. The independent limits remain `1e-4 + 0.002*abs(reference)` per nonzero channel and `1e-7` for exact zero. Maximum error divided by tolerance was 0.419357 for native scattering and 0.220525 for native transmission; SwiftShader maxima were 0.296139 and 0.274321 respectively.

No query, profile, corpus, physical equation, resource bound, numerical tolerance, or application deadline was relaxed. No driver setting, power policy, dependency, texture format, or binary asset changed.
