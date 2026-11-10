# Verified local fixes branch checkpoint

The owner authorized committing the verified readiness fixes to a new branch on
November 9, 2026, followed by continued investigation of software response delay.
This checkpoint does not authorize deployment or qualify a production release.
Illustrative Earth and the 200 ms response target for all three rendering modes
remain unchanged.

## Publication scope

Before staging, every one of the 1,014 changed or new paths matched the retained
1,799-file adopted source inventory byte for byte. The selected files include
application and numerical corrections, tests and immutable reference fixtures,
build and validation tools, approved component source/rebuild materials, and
supporting documentation. Private experiments and raw diagnostic outputs under
ignored build directories are excluded. This document is the only added source
document after that inventory comparison. Publication preflight also corrects
the UX validator's stale direct-attribute-call assumption and preserves the
historical clock fixture's hashed bytes during Git staging. Neither correction
changes application behavior or numerical inputs.

The baseline is `3a55a795767f3043112673ea561cdaf6dc7e2d0f`. The publication
branch is `precision/verified-readiness-20261109`. A baseline revision in an older
artifact remains lineage, not the identity of the later committed source.
Historical evidence retains its exact original source and artifact boundaries.

## Verified behavior and open holds

The [current readiness report](CURRENT_READINESS_20261107.md),
[accuracy contract](ACCURACY_CONTRACT.md),
[TOP2013 follow-up](TOP2013_PRECISION_20261106.md),
[dependency correction](DEPENDENCY_SECURITY_20261107.md),
[source binding correction](WASM_SOURCE_BINDING_20261108.md), and
[paired scattering report](PAIRED_SCATTERING_20261109.md) describe the implemented
fixes and their bounded validation. Fresh publication checks include the full
2,104-test Node suite and existing static, type, module-graph, startup, accuracy
evidence, governance and documentation validators. Detailed command logs remain
local under `build/verified-publication-20261109-01/`.

The retained 109,900 sampled astronomy comparisons pass their original budgets.
The worst System full-vector residual is 1.5650 arcseconds-equivalent for Uranus.
Neither that finite matrix nor this commit establishes a continuous or
sub-0.1-arcsecond guarantee. The approved precision target remains complete UTC
years 1900–2200; other supported dates within years 1–9999 remain approximate.

Software response remains unresolved. The adopted-source diagnostic recorded
cold Inspector at 396 ms; later untraced baseline observations reached 412 and
428 ms. A full accepted current-artifact response campaign in native hardware,
original whole-driver SwiftShader and standard software fallback is outstanding.
Private background and native-stack experiments are not adopted product fixes.

Current-source hosted/platform acceptance, physical-device and manual
accessibility acceptance, final distribution and recipient-delivery acceptance,
served-byte correspondence, returning-client transition and executed production
rollback remain separate release gates. The owner's instruction resumes
engineering work; it does not clear these holds or authorize deployment.
