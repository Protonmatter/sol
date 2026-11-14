# Extended rendering checks — 2026-11-03

Status: seven additional local rendering validators passed. Requirements:
`SOL-VIS-001`, `SOL-TEST-001`. This adds evidence to the
[native optical correction](NATIVE_OPTICS_20261103.md) and
[initial readiness investigation](PRODUCTION_READINESS_20261103.md).

## Tested artifact

All seven commands used the same immutable local artifact:
`build/production-20261103-profiled-identity-site`, release
`local-production-profiled-identity-20261103`, manifest SHA-256
`72a1accc264eb88e0eac8bb72837334f3f8aac28774d43667e2fcb1358fc3e08`.
The validators verify their consumed staged source/assets. This is the final
artifact already exercised by the expanded native physical check and Chromium
browser/coverage suite in the optical correction report. The subsequent
astronomy work rebuilt both WASM engines byte-identically and added no renderer
runtime changes.

Commands ran serially to avoid overlapping GPU qualification load, with separate
output directories. No rendering code, deadline, tolerance or expected value was
changed to make these checks pass. Chrome was 156.0.8078.48 on the observed
Windows ARM64 host. These are the configured local software-browser checks;
the atmosphere and planet-appearance receipts explicitly identify SwiftShader.
Some other drivers record only generic WebGL identity, so they do not establish
physical GPU execution. Native Adreno qualification remains the separate
expanded physical-rendering and specialized scattering evidence.

## Results

| Validator | Result | Evidence scope |
| --- | --- | --- |
| Planet appearance | 110/110 checks passed | staged planetary imagery and disabled-material shader parity |
| Ring appearance | 11/11 checks passed | illumination, transmission, gaps, planet/ring shadows and GL errors |
| Atmosphere | 1,172/1,172 checks passed | shipped optical shader against independent float64 integration, default fixture matrix |
| Incident lookup | passed at both admitted mesh extremes | 4,753 and 74,305 vertices; 4,753 shared points had zero output difference; direction norm error < 3.38e-9 |
| Terrain shadows | 32/32 checks passed | R32F ray visibility against double-precision reference using synthetic ridges and real terrain assets |
| Solar appearance | 28/28 checks passed | deterministic fragment-shader rays, independent reference and registered volume controls |
| Historical observations | 8/8 checks passed | verified image bytes, same-origin requests, mobile card fit and unsupported-body refusal |

These successful checks supplement the previously retained browser/coverage and
expanded physical runs. They do not measure artistic preference, certify every
device or establish empirical calibration of an atmosphere or solar model.
Optional experimental terrain/visibility matrices were not enabled by the
default atmosphere command. Incident timing/readback values describe this
software run and are not a physical-device performance guarantee.

## Reproduction and retained evidence

From the repository root, choose new output directories to preserve receipts:

```text
node tools/planet_appearance_validation.mjs --web-root=build/production-20261103-profiled-identity-site --out=coverage/NEW-planet-appearance
node tools/ring_appearance_validation.mjs --web-root=build/production-20261103-profiled-identity-site --out=coverage/NEW-ring-appearance
node tools/atmosphere_validation.mjs --web-root=build/production-20261103-profiled-identity-site --out=coverage/NEW-atmosphere
node tools/incident_budget_validation.mjs --web-root=build/production-20261103-profiled-identity-site --out=coverage/NEW-incident-budget
node tools/terrain_shadow_validation.mjs --web-root=build/production-20261103-profiled-identity-site --out=coverage/NEW-terrain-shadows
node tools/solar_appearance_validation.mjs --web-root=build/production-20261103-profiled-identity-site --out=coverage/NEW-solar-appearance
node tools/planet_phenomena_validation.mjs --web-root=build/production-20261103-profiled-identity-site --out=coverage/NEW-planet-phenomena
```

Ignored local receipts are under
`coverage/production-20261103-extended-*/evidence.json`. The command/exit/timing
index is `coverage/production-20261103-extended-results.json`; logs are in the
parent workspace as `sol-extended-*-20261103.log`. The index records seven zero
exit codes and each distinct output directory. This report changes documentation
only, so no production rollback is required.

## Remaining qualification

Cross-platform performance, physical mobile interaction, manual accessibility,
accepted scientific evidence, source provenance and protected release/served-byte
and rollback checks remain open in [status](STATUS.md). No hosted workflow,
deployment or release publication ran. A passed local rendering matrix does not
clear those gates or establish absence of all rendering defects.
