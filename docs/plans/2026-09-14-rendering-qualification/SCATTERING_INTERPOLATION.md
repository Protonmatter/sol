# Bounded scattering interpolation qualification

Status: candidate; final runtime and native accuracy admission remain open.

This continues A3 under [RFC 0006](../../rfcs/0006-rendering-qualification-and-color.md).
The direct Earth/Mars reference integrator, optical profiles, physical endpoints,
source fields and scientific state remain authoritative. A field approximates the
reference's scattering term; it does not fit new atmospheric parameters or infer
weather. Transmittance still uses the original column evaluator at the actual ray.

## Representation and finite work

Each current-camera field has a surface atlas and a limb atlas. Each texel runs
the retained direct integrator once. Its 12-node rule and ground, closest-point
and shadow segmentation are unchanged; its analytic bound remains 60 nodes.
The two atlas passes have at most 65,536 texels in total, use RGBA32F, and occupy
at most 1,048,576 logical bytes per resident body. This byte count describes the
texture payload, not measured driver or process memory. At most two groups reside.

The surface coordinates are azimuth, signed endpoint direction cosine and optical
height. Signed direction cosine includes endpoints just beyond closest approach,
as actual normalized raster triangles require. Physical radial terrain bounds
produce a conservative optical-height envelope through the body's polar ratio.
The smooth body's catalogue datum remains explicit, including Earth's 3 m offset.

For Mars's common species scale height, the positive-height grid splits at
`h = R * (1 / sqrt(1 - mu * mu) - 1)`, clipped to the existing envelope. This is
the endpoint height whose ray impact is exactly the reference-body radius.
Sun-aligned azimuth coordinates place more points near the shadow plane through a
monotone rational cubic transform. The Earth profile retains its separate grid.
Duplicated knots at zero or maximum critical height represent identical geometry;
inverse coordinates there need not be unique. No physical query is excluded.

The atlas stores scattering divided by a positive conditioning weight. That
weight uses analytically delimited lit intervals and view-attenuated column mass.
The Mars weight additionally uses its common source/extinction ratio and Sun
transmission at a density centroid. It is a normalization, not a substitute
physical transport approximation: the separately evaluated residual restores the
reference result at field nodes. Earth includes a conservative source term for
density above the column table's 12-scale-height cutoff. The final consumer
evaluates the weight at its actual endpoint and interpolates the logarithmic
residual with a monotone cubic rule. Undefined zero-source knots use the declared
linear extension; invalid fields are rejected. Residual values are not capped.

The consumer performs at most 64 surface or 16 limb atlas fetches, plus bounded
column and analytic geometry operations. It contains no scattering quadrature.
These work counts do not establish frame time or native shader compilation time.

## Frozen acceptance and retained results

The original fixture module remains byte-identical, SHA-256
`0048544cc785009070e7eeb39946c65b28366c271c40e669980de439373e1271`.
All 13 scenes and 5,592 queries remain required. Admission retains:

| Quantity | Original interpolation limit |
| --- | --- |
| Scattering | `2e-4 + .01 * abs(reference)` per channel |
| Exactly zero reference | `1e-7` leakage |
| Transmittance | `1e-4 + .002 * abs(reference)` per channel |
| Encoded display | `2/255` |

The actual shell's solid-body and empty-ray predicates are evaluated on the same
uploaded binary32 rays by both shaders. Their raw comparisons are retained, and
their actual discarded shell output must remain zero. This is the original
material-domain contract, not a new removal of inconvenient limb samples.

Candidate L passed all 5,592 software-GPU queries before and after the independent
near-ground visibility correction. The imported math module passed again after
its synchronous validation adapter was moved out of production code. However,
the first native Adreno replay rejected two queries: Earth-elevated-10km/379 and
Mars-terminator-terrain/499. The native failure remains controlling. Source hashes,
limits, case summaries and full local receipt hashes are retained in the
[interpolation receipt](SCATTERING_INTERPOLATION_RECEIPT.json).

The earlier retained experiments include 144, 105, 51, eight, four and two rejected
queries; three shader-compilation mistakes were also retained. None was admitted
by relaxing a limit. The older 368-failure experiment remains untouched in its
separate worktree. Native differences are being diagnosed independently before
candidate admission.

## Separate runtime acceptance

The production math module never compiles or links a shader. The qualification
adapter may perform synchronous setup in a dedicated test context; runtime uses
the [bounded program owner and target lifecycle](SCATTERING_TARGET_LIFECYCLE.md).
Generation must restore the caller's HDR or default framebuffer and complete GL
state. Frame serial, epoch, context, camera, Sun, profile, grid and producer
identities must match each consuming draw. Submission alone does not prove GPU
completion, nonzero contents or final presentation.

Before enablement, retain the original corpus and add the actual v2 Mars terrain
envelope, source-derived vertex/triangle endpoints and the explicit-height
material overload. Then qualify complete material/raster composition, animation,
context restoration, native compilation and three actual final Earth draws in
five seconds. Native texture memory observations and hosted CI are separate gates.
HDR, reflection, finer terrain, ring transport and moon photometry keep their own
source and accuracy contracts; this field does not admit those features.

```powershell
node --test tests/web/scatteringGeometry.test.mjs tests/web/scatteringTargets.test.mjs
node tools/scattering_validation.mjs --web-root=apps/web --backend=swiftshader --out=build/scattering-software-unique
node tools/scattering_validation.mjs --web-root=apps/web --backend=native --out=build/scattering-native-unique
```

Output directories must not exist. Each run snapshots its inputs, verifies source
and numerical-field hashes, records the actual GPU backend, and closes its owned
browser. A failed run is evidence and must not be overwritten.
