# Bounded scattering interpolation qualification

Status: the prepared-path candidate at `256e935` passes 7,192/7,192 software
queries and 7,191/7,192 native Adreno queries. The remaining native failure is
`Mars-forward-terrain/surface/500`. Both independent supplemental physical-source
comparisons pass 1,600/1,600; these do not qualify every generated atlas node or
override the interpolation failure. Earlier Q2 and `adb4560` attempts remain
retained with their own source identities and limitations.
See [the current combined-source ledger](PRODUCTION_EXECUTION.md) and
[all retained interpolation attempts](SCATTERING_INTERPOLATION_RECEIPT.json).

This continues A3 under [RFC 0006](../../rfcs/0006-rendering-qualification-and-color.md).
The direct Earth/Mars reference integrator, optical profiles, physical endpoints,
source fields and scientific state remain authoritative. A field approximates the
reference's scattering term; it does not fit new atmospheric parameters or infer
weather. Transmittance still uses the original column evaluator at the actual ray.

## Representation and finite work

Each current-camera field has a surface atlas and a limb atlas. Each texel runs
the retained direct integrator once. Its 12-node rule and ground, closest-point
and shadow segmentation retain the 60-node analytic bound. Fully datum-bounded
pieces now use the independently tested constant-extinction coordinate described
in [the source integration record](ATMOSPHERE_OPTICAL_COORDINATE.md).
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
monotone rational quintic surface transform and cubic limb transform. Local
quadrant coordinates retain exact cardinal axes and periodic seam behavior.
The Earth volume uses 128 by 49 by 9 nodes; the Mars volume uses 80 by 41 by 17.
Together with each 128 by 64 limb atlas, these require 64,640 and 63,952 texels,
respectively, below the unchanged 65,536 limit. Smooth surfaces retain their
128 by 193 single-height atlas. Packed generator rows use integer division and
remainder before conversion to physical coordinates.
Duplicated knots at zero or maximum critical height represent identical geometry;
inverse coordinates there need not be unique. No physical query is excluded.

The atlas stores scattering divided by a positive conditioning weight. That
weight uses analytically delimited lit intervals and view-attenuated column mass.
The Mars weight additionally uses its common source/extinction ratio and Sun
transmission at density centroids in at most four fixed pieces bounded by ground
entry, closest approach and ground exit. Each piece combines its complete lit
support before choosing one centroid, preserving continuity when a shadow gap
opens or closes. It is a normalization, not a substitute
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
Mars-terminator-terrain/499. Later P passed the original native domain but failed
one added Mars terrain query. Q's proposed 41-row grid exposed floating-point
packed-row division selecting the previous layer at exact layer boundaries:
108 original queries failed while all 1,600 supplemental queries passed.
Q2 corrects that address decoding with integer arithmetic and passes all 7,192
queries on both native Adreno and SwiftShader, including all 5,592 original
queries, 1,596 additional physical/terrain queries and four invalid-height controls.
All 42 generated atlases per backend have finite, nonnegative values and valid
alpha. Source hashes,
limits, case summaries and full local receipt hashes are retained in the
[interpolation receipt](SCATTERING_INTERPOLATION_RECEIPT.json).

The earlier retained experiments include 144, 105, 51, eight, four and two rejected
queries; three shader-compilation mistakes were also retained. None was admitted
by relaxing a limit. The older 368-failure experiment remains untouched in its
separate worktree. No failed receipt was overwritten or removed.

Interpolation agreement is not an independent physical reference. A separate
join of the actual GPU direct-source values to the converged supplemental corpus
passes all 1,600 native scattering comparisons but currently rejects one native
transmission channel: Earth-forward-oblique-explicit-height/surface/13. Its red
transmission is 0.1191005334 against 0.1194608801, exceeding the unchanged
`1e-4 + .002 * abs(reference)` bound. The same value predates Q2. Physical
admission remains open until the cause is corrected and both backends replayed.
The software comparison also flags this transmission query and a near-tangent
Mars outer-boundary source query. Their exact uploaded geometry and physical
reference semantics require independent review; interpolation agreement alone
does not settle either discrepancy.

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
node tools/scattering_validation.mjs --web-root=apps/web --backend=swiftshader --terrain-v2-explicit-height --out=build/scattering-software-unique
node tools/scattering_validation.mjs --web-root=apps/web --backend=native --terrain-v2-explicit-height --out=build/scattering-native-unique
```

Output directories must not exist. Each run snapshots its inputs, verifies source
and numerical-field hashes, records the actual GPU backend, and closes its owned
browser. A failed run is evidence and must not be overwritten.
