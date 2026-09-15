# Constant-datum optical-coordinate qualification

The unchanged 12-node distance quadrature underresolved seven retained terrain
queries when a lit segment crossed thousands of kilometres of the renderer's
constant-below-datum density convention. This is the existing mathematical
extension through an actual mesh endpoint, not a model of underground atmosphere.
The new coordinate resolves those queries without changing density, extinction,
solar visibility, phase functions, endpoint support or analytic cuts.

For a complete datum-bounded interval `[a,b]`, let `L=b-a`,
`lambda=min(betaRayleigh+betaAerosolExtinction)` over RGB, `w=lambda*L`, and
`A=1-exp(-w)`. Each original Gauss point becomes

```text
u = (x12 + 1) / 2
t = a + L * [-log(1-u*A) / w]
dt/du = L*A / [w*((1-u) + u*exp(-w))]
```

The existing weight receives the exact Jacobian divided by `L`. The physical
integrand still evaluates the actual view column, actual solar ray and local
density at `t`. The whole interval must lie between valid datum roots; misses,
tangencies and intervals straddling the datum do not qualify. Zero extinction
retains the original points and weights. Minimum-channel extinction avoids a
negative residual attenuation rate in any channel; differing Earth density scale
heights do not change the constant density inside the datum.

Two short polynomial evaluations provide the small-argument equivalents of
`expm1` and `log1p`. Their truncation bounds at the `0.125` branch point are about
`9.46e-11` and `9.46e-10` absolute. Interior Gauss points keep the explicit positive
remainder away from zero. These evaluations do not clamp opacity or truncate the
integration domain. The 12-node loop and analytic 60-node maximum are unchanged.

## Independent CPU evidence

The [source-bound receipt](ATMOSPHERE_OPTICAL_COORDINATE_RECEIPT.json) retains all
1,600 supplemental reference scattering/transmission values and all 45 original
physical-ray fixtures, their 128-to-256 convergence deltas, uniform-distance and
candidate scattering values, source hashes and raw receipt identities. Raw
receipts remain under `build/optical-coordinate-experiment/` in the isolated
diagnostic worktree; no original case or failure was deleted.

The independent reference rounds uploaded inputs once to binary32, then evaluates
geometry and density integrals in binary64. It uses distance quadrature, separate
Rayleigh/aerosol columns and additional visibility-boundary cuts for convergence.
The candidate uses the original analytic cuts and 12 outer nodes, with converged
columns to isolate the coordinate's effect. This experiment does not emulate
every shader arithmetic operation or GPU field interpolation.

| Evidence | Result |
| --- | --- |
| Supplemental physical cases | 1,600/1,600 pass, including hidden/backside and exact-zero cases |
| Original physical-ray fixtures | 45/45 pass; the complete GPU gate has 1,280 assertions, including other source, geometry and color checks |
| Maximum supplemental 128-to-256 reference change | `4.408304823608211e-9` |
| Maximum original-fixture reference change | `6.13398221105399e-15` |
| Original uniform rule | Seven supplemental failures; maximum error/tolerance `4.14962421000239` |
| Candidate rule | No supplemental failures; maximum error/tolerance `0.22189741897273257` |
| Coordinate used | 343 supplemental rays |
| Observed outer-node maximum | 48 before and after; analytic limit remains 60 |

The physical threshold remains `1e-4 + .002*abs(reference)`, with `1e-7` for an
exact-zero reference. Original failures are near-top surface queries 270, 273,
278, 279, 286 and 287, and terminator surface query 286. For near-top query 287,
the original maximum error is about `3.072e-4`; the mapped error is `5.69e-7`.

An earlier diagnostic receipt reported two additional above-datum failures. Its
adapter misread raw closest roots after a sphere miss as a forward exit, omitting
the separate hit boolean. The production shader already returns `(1,-1)` on a
miss, and the existing midpoint reference already requires an actual intersection.
Only the new diagnostic adapter was corrected. The failed receipt and its hash
are retained; production visibility and the independent midpoint oracle were not
weakened.

## Shader and field validation

The isolated production core is
`bb6257583b79107576fd824ae525ae55963790cd64a196098f8a6a6f88a79d16`.
Six portable tests execute the actual scalar GLSL expressions as binary64
JavaScript and check independent elementary identities, the analytic integral,
zero extinction, ordered finite coordinates, whole-datum admission and retained
query 287. That physical regression independently computes 32-node density columns
and solar visibility: the original 48-node rule must fail and the mapped 48-node
rule must pass. Expression execution does not substitute for GLSL browser checks.

The original GPU physics command passed **1,280/1,280** on the changed source:

```text
node tools/atmosphere_validation.mjs --web-root=apps/web --out=build/optical-coordinate-physics-1280 --terrain-endpoints --near-ground-visibility
```

The existing harness requested SwiftShader and recorded Chrome, but did not record
an actual adapter identity. This establishes numerical GLSL qualification, not
native-device performance or complete application readiness.

Both offline generators ran on the changed source. All four payloads reproduced
byte-for-byte: Earth/Mars density columns and incident fields. Their manifests
changed only source/generator identity metadata; the receipt includes before/after
byte counts and SHA-256 values. Generation remains an explicit offline operation.

```text
node tools/prepare_atmosphere_columns.mjs
node tools/prepare_atmosphere_incident.mjs
node --test tests/web/atmosphereCoordinate.test.mjs
```

Actual native/software source outputs for all 1,600 supplemental points must still
be joined to these converged values using source and physical-input identity, not
query names alone. Full scattering-matrix runs assess interpolation separately;
improving the source integrator does not prove every atlas case passes. Reverting
the core and its two generated manifests restores the prior coordinate; the four
numerical payloads require no rollback change.

## Comparing full-matrix source readbacks

`tools/compare_scattering_physical_reference.py` performs that additional physical
comparison without a browser or external dependency. It verifies the actual
snapshot shader, retained CPU input hashes, complete fixture input objects,
sample geometry, all 1,600 unique query identities and finite RGBA source validity
before applying the fixed scattering/transmission limits. It includes the direct
source values of explicit-height negative controls; their deliberately invalid
atlas-admission result does not erase the finite physical ray. An atlas failure
is reported separately from the source comparison.

```text
python tools/compare_scattering_physical_reference.py --reference=docs/plans/2026-09-14-rendering-qualification/ATMOSPHERE_OPTICAL_COORDINATE_RECEIPT.json --cpu-source-root=PATH_TO_RETAINED_O_INPUTS --gpu-run=PATH_TO_COMPLETE_GPU_RUN --out=build/physical-source-comparison.json
```

The supplied CPU/GPU roots are read only. The tool writes the requested JSON
receipt, returns zero for a passing physical comparison and one for a measured
failure. Invalid source/input identity or malformed readback raises an error
without producing a passing receipt. Removing this diagnostic tool has no runtime
effect. Eight adversarial tests cover source/input mutation, omitted or duplicate
samples, nonfinite/invalid channels and the unchanged exact-zero threshold.
