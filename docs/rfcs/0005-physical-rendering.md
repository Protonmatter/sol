# RFC 0005: Source-backed terrain and physical light transport

- Status: Accepted
- Authors: Min Kang, Codex
- Created: 2026-09-13
- Target: Local and PR candidate; per-product qualification
- Requirements: `SOL-VIS-005`, `SOL-VIS-006`, `SOL-VIS-007`, `SOL-VIS-004`, `SOL-ARCH-001`, `SOL-SCI-001`

## Summary

Implement the user-approved hybrid rendering design: registered numerical terrain,
bounded atmospheric light integration, distinct reflected/emitted light, and a layered
dynamic Sun. The user approved the preceding design with "implement" on 2026-09-13.
Acceptance of this direction does not qualify every dataset or constitute deployment.

## Context

The existing 48-by-96 shared sphere, illustrative atmosphere, and featureless 3-D Sun
do not meet the requested inspection experience. Source imagery, numerical terrain,
optical parameters and reconstructed geometry are separate inputs. A photo is not a
height map or calibrated reflectance. An observed bright solar arc is not a measured
3-D magnetic loop. Existing ephemeris and state-estimation contracts remain unchanged.

## Requirements

- `SOL-VIS-005`: Terrain MUST use registered numerical elevation/shape products with
  physical units, datum, coverage, source/derived hashes and bounded mesh/index counts.
  No-data MUST NOT form invented pits or mountains. Normal and silhouette detail MUST
  use the same terrain; physical scale is the default. Camera and display clearances
  MUST include displaced extents without changing physical orbits.
- `SOL-VIS-006`: Enabled optical effects MUST state their model and qualification
  envelope. Incident and view-path attenuation, scattering, reflection and emission
  MUST remain distinct. Physical distances MUST determine illumination. Reference
  models MUST NOT be labeled current weather or calibrated source reflectance.
- `SOL-VIS-007`: Dynamic solar/planetary features MUST retain source epoch, band,
  frame, coverage, geometry provenance and valid playback interval. Reconstruction
  MUST NOT be labeled directly observed 3-D geometry. Repeated times MUST reproduce
  the same frame; reduced motion and pause MUST work. Unavailable coverage stays held.
- `SOL-VIS-004`, `SOL-ARCH-001`, `SOL-SCI-001` remain in force. The new explicit,
  labeled reference-model modes extend RFC 0004's illustrative optical treatment;
  they do not relax its source image registration gates or authorize invented data.

## Design

Use focused geometry/optics/solar modules around the current WebGL2 draw orchestration.
The first admitted terrain products are numerical Moon LOLA and Mars MOLA radial data,
with bounded LOD meshes and same-origin hash-checked loading. More detailed source maps
can be demand-loaded within byte limits. Unsupported bodies retain qualified maps and
disclosed smooth geometry; irregular shapes require their own source qualification.

Use dimensioned Earth/Mars reference atmospheres, a deterministic double-precision
reference and bounded GLSL quadrature. Apply solar transmittance to reflected direct
light, then view transmittance and in-scattering in linear color. Night emission is
attenuated on its view path only. Dense-cloud multiple scattering and general refraction
require their own validated models before the UI can claim they are active.

Precomputed incident fields bind the complete optical profile with versioned,
deterministic binary32 identity, including semantic source and model metadata.
Numeric values MUST be finite before and after the specified `Math.fround`
conversion, and typed encoding MUST preserve signed zero and distinguish values
from metadata containers. Unsupported encoding versions and identity mismatches
MUST be rejected. This identity conversion leaves reference formulas and GPU uniform
uploads unchanged; it MUST NOT substitute decimal truncation or relax numerical
admission tolerances. Independent source/generator hashes, exact domain checks and
data hashes remain required. The exact encoding is documented in the
[optics source record](../plans/2026-09-13-physical-rendering/OPTICS_SOURCES.md).

The Sun has a visible photosphere mode and an identified reconstructed EUV mode.
Pinned NASA SDO source frames retain finite-distance WCS registration and source-facing
coverage. Modeled elevated plasma is a bounded educational geometry with explicit
provenance, not a reconstruction claimed from the state estimator. Integrate emission
with solar-disk occlusion; source playback is distinct from orbital time. White-light
corona requires a separately qualified electron-scattering source term.

Giant-planet storms, wind advection and aurorae are independent atmospheric/emission
products, not solid terrain. Each enabled product needs magnetic/body frame, spectral
band, source time and validity. Saturn's north hexagon and observed south decagon must
not be conflated. Opaque atmospheres obscure visible terrain; geology/cutaway modes
are explicit. No unknown gas-giant solid surface is manufactured.

## UX and accessibility

Preserve the immersive canvas and compact inspector. Add supported appearance and
detail choices with concise source/mode/epoch text; keep numerical controls in Research.
Use native keyboard controls, pause and reduced-motion defaults. Loading, held, failed
and ready states must be distinguishable. Existing selection and camera controls remain.
Source playback pauses when its view or texture layer becomes unavailable and requires
an explicit restart. Restart retains ready/loading solar atlas entries and retries only
an unavailable entry. The two admitted incident fields are optional release assets:
installation does not fetch them; demand-time size and hash admission remains mandatory.
Leaving the workspace cancels pending physical-detail requests;
ready bounded cache entries may remain warm. Re-enabling terrain explicitly retries
the currently demanded failed detail without turning ordinary paints into retry loops.

## Security and privacy

Acquire approved public mission data only in preparation tools. Builds and default
tests are offline. Runtime uses only release-bound same-origin assets, bounded lengths,
hash checks, finite values, cancellation and GL context generations. No new telemetry,
credentials, framework dependency, external service or engine endpoint is introduced.

## Alternatives

Increasing texture dimensions alone cannot create relief. Empirical halos cannot
establish optical transport. Full scene path tracing has greater resource/convergence
cost and cannot recover missing scientific inputs; it is not required for this hybrid
baseline. WebGL2 mesh patches replace unavailable hardware tessellation stages.

## Risks

Main risks are coordinate/datum mismatch, baked-in illumination, numerical grazing-ray
error, index overflow, resource pressure, and presenting source interpolation as live
weather. Mitigate through explicit input contracts, numerical and visual references,
per-product admission, conservative extents and bounded caches. A realistic-looking
reconstruction is not empirical validation of 3-D plasma or atmospheric conditions.

## Acceptance criteria

1. Numerical terrain changes normals and silhouette at the correct location; flat
   zero radial heights reproduce the declared reference sphere, without double-counting
   the renderer's ellipsoid. Seam/pole/index/nodata tests pass.
2. Atmosphere passes vacuum, analytical attenuation, phase normalization, grazing
   convergence and CPU/GPU comparison. Only tested effects are reported as enabled.
3. Solar source coordinates and coverage pass numerical tests; source time remains
   separate from System time. Elevated emission has occlusion and deterministic motion.
4. Existing engine outputs, shadows, orientation and display-clearance tests retain
   their contracts. New bounds do not perturb ephemerides or physical orbit curves.
5. Missing sources/context loss retain explicit states, bounded resources and usable UI.
6. Each admitted body/product has source and staged-browser evidence. Coverage gaps
   and unimplemented optical/meteorological effects remain explicit in the ledger.
7. Incident-ray integration work must not multiply by terrain vertex count or run on
   every animation frame. Any precomputed approximation must retain the versioned
   binary32 profile identity and semantic metadata binding described above,
   explicit resource bounds and the existing independent direction/transmission gates.
   The complete application must pass the unchanged browser deadlines at its declared
   deployment base path, including hidden-view cancellation and context restoration.

## Validation

Run Node tests, Python numerical/source tests, web type checks, asset/governance/docs/UX
validators, Rust workspace tests where engine integration requires them, and the
existing planet/ring GPU harnesses against an immutable staged build. Add dedicated
terrain/optical/solar GPU readbacks, source-correspondence screenshots, resource and
camera tests. Existing material tests disable atmospheric strength and cannot validate
the new optical pass. Record exact commands, limits and source/artifact identities.

## Rollout and rollback

Enable per qualified product and expose explicit mode/source status. Restore prior
render/asset selection to roll back without changing physical state. Keep this RFC
Accepted until merged implementation, traceability and gates justify Implemented.
No production release or merge is authorized by a local screenshot or passing test.

## Documentation

Update SPEC, requirements, RFC alignment, operations and source qualification records
as behavior becomes implemented. The execution ledger records remaining scopes and
actual evidence, distinct from this accepted direction.
