# Near-ground solar visibility correction

The later [constant-datum optical-coordinate qualification](ATMOSPHERE_OPTICAL_COORDINATE.md)
preserves this visibility correction while resolving long lit-segment quadrature.

The direct atmospheric solver incorrectly declared some clear solar rays blocked
within two metres of the reference ellipsoid. A negative dot product with the
local normal means the ray initially moves inward; above a curved surface it does
not establish an intersection. The corrected guard also requires the existing
ray/ellipsoid calculation to report a forward exit greater than 0.001 km. Actual
forward ground hits and inward rays starting below the reference datum remain
blocked. The change preserves the density convention, endpoint, extinction,
phase functions, profiles, integration nodes and all admission tolerances.

The changed `atmosphereShaders.js` source has SHA-256
`d38b28d0da7168af2f529b45e7d764f6da3477600960f049b253b062bee7cbc0`.
The independent Python endpoint reference applies the same physical intersection
requirement while retaining its independent midpoint quadrature and default
ground-clipped behavior.

## Independent diagnosis

Four failed queries were retained from the frozen `normalized-domain-h-monotone-cubic`
experiment. Its shader, column and candidate hashes are included in the
[bounded numerical receipt](ATMOSPHERE_VISIBILITY_RECEIPT.json). Piecewise float64
integration splits density-datum, closest-approach, solar-shadow and historical
two-metre visibility boundaries; it never clips the supplied terrain endpoint.
The original GPU values, query IDs, candidate measurements and limits remain
unchanged. Neither the old reference nor the interpolation corpus was rewritten
to improve a candidate's result.

Three scopes are reported separately: intended binary64 inputs; inputs rounded
once to their uploaded binary32 values followed by float64 geometry; and a
separate non-FMA binary32 geometry replay followed by float64 integration. The
last scope is a conditioning diagnostic, not a bitwise GPU oracle.

| Frozen query | Maximum old GPU S error against converged float64 uploaded-input truth | Diagnosis |
| --- | ---: | --- |
| Mars-terminator-terrain/surface/499 | 3.57831e-7 | Direct solver agrees; candidate interpolation remains responsible. |
| Mars-terminator-terrain/limb/661 | 1.95795e-4 | False visibility discontinuity is missed by the old sparse quadrature. |
| Mars-terminator-terrain/surface/755 | 5.62445e-8 | Direct solver agrees for the retained subdatum endpoint. |
| Mars-near-top-terrain/surface/175 | 1.20231e-7 | Direct solver agrees; original candidate interpolation was responsible. |

The highest 64-to-128-node convergence difference for these uploaded-input cases
is 4.273e-13. A second outer quadrature rule, composite midpoint integration with
the same explicit boundaries, converges on query 661 to within 5.1161e-11 of the
piecewise Gauss result at 2,048 midpoint samples per interval. The independently
implemented existing whole-interval midpoint reference agrees for the other
three rays but converges poorly on the narrow false visibility interval.

For query 661, the intended minimum altitude is 0.001 km and the exact uploaded
geometry gives 0.00112419139714 km. Both paths miss the ellipsoid. Nevertheless,
the old extra guard removes a 4.86568871492 km lit segment. Its converged old-rule
scattering is `[0.03683513284317239, 0.03790252763431484, 0.04021556798600817]`.
The retained GPU reference is
`[0.03703092783689499, 0.03809806704521179, 0.040407005697488785]`.
The corresponding physical solver limits are
`[0.0001736702656863448, 0.0001758050552686297, 0.00018043113597201636]`;
all three channel errors exceed those limits. This is the fixed physical
`1e-4 + .002 * abs(reference)` gate, distinct from the looser atlas interpolation
gate. Removing the false occlusion gives
`[0.0370306955154017, 0.03809784016527049, 0.04040679042787216]`, close to the old GPU
samples because those samples skipped the false-occlusion interval. This does
not excuse any interpolation error in queries 499 or 755.

## Regression and qualification

A short synthetic ray supplies an analytic regression independent of query 661
and of the lookup-table candidate. For `R=3396.19 km`, a four-kilometre view ray
at one-metre minimum altitude stays below two metres. The slightly inward solar
direction has ellipsoid clearance greater than 0.98 metres. In a grey isotropic
reference with extinction `0.001/km`, scale height `11.1 km`, and unit scattering
albedo, density and finite-path bounds establish scattering greater than
`0.0004340123318241708`. The original reference returned exactly zero for both
spherical and `q=.9941` geometry, producing a deliberate red regression. The
corrected reference passes, and a more inward Sun that actually intersects the
planet still produces exact zero.

The additive GPU flag `--near-ground-visibility` requires `--terrain-endpoints`.
It adds sixteen Earth/Mars spherical/oblate cases: clear inward, real ground hit,
clear outward and subdatum inward. Their numeric profile and geometry inputs are
explicitly rounded once to binary32 before independent float64 evaluation. The
original sixteen terrain fixtures and every original optical case are retained.

```text
node tools/atmosphere_validation.mjs --web-root=apps/web --out=coverage/atmosphere-visibility-01 --terrain-endpoints --near-ground-visibility
```

The complete gate passed **1,280/1,280**: all 1,232 existing checks plus 48 additive
checks. The tolerance remains `1e-4 + .002 * abs(reference)`, or `1e-7` for an
exact-zero reference. Every instrumented ray remains within the existing
60-node bound. Actual clear-inward Mars scattering agrees with the independent
reference within 1.070e-8; true-hit and subdatum night cases remain dark. This is
a numerical WebGL2 run on Chrome 151.0.7922.174 requested with SwiftShader. The
tool did not capture an actual adapter identity, and this receipt establishes no
native performance or full-application result.

CPU qualification passed all eight terrain-reference tests, nine general optical
reference tests, 27 physical-asset tests and 32 atmosphere JavaScript tests,
including exact column reproduction, source-routing guards and rejection of stale
source identities. Python compilation, Node syntax checks and documentation
validation for 118 Markdown files passed. Removing the additive CLI flag
restores the prior qualification surface without changing the runtime solver.

## Source-bound optical fields

Both field manifests bind the entire solver source file. The incident generator
also embeds that GLSL into its assembled source, even though its reachable RK4
refraction functions never call the changed direct solar-visibility function.
The column generator's density calculations likewise do not depend on this guard.
The original four numerical files and two manifests were preserved before explicit
generator replay; source identities were not edited manually.

```text
node tools/prepare_atmosphere_columns.mjs
node tools/prepare_atmosphere_incident.mjs
python tools/validate_physical_assets.py --web-root apps/web
```

Both generators completed. All four numerical payloads are **byte-identical** to
their prior versions: 4,194,304 column bytes and 2,402,400 incident bytes. The
generated manifest changes contain only the solver hash and assembled incident
generator hash; dimensions, domains, profiles, browser version and payload hashes
remain unchanged. Physical source validation passed terrain=2, solar=1,
incident=2 and columns=2. The detailed pre/post hashes are retained in the receipt.
The numerical GPU gate predates manifest replay; its actual shader and field bytes
are exactly the bytes retained after replay.

This slice qualifies the narrow direct-solver correction. It does not admit any
later dynamic scattering field or reduce the original 5,592-query corpus, its
limits or the 65,536-evaluation prepass budget. A candidate that changes the direct
reference source needs a fresh full-corpus replay and separate v2-terrain domain
qualification. The direct fragment integrator's performance requirement remains
separate. Rollback must restore the shader, Python reference and both generated
manifests together; the numerical payloads do not change.
