# Local illustrative solar appearance recipes

These strict recipes select build-pinned quiet/active parameters and seed 42. They are not observations or calibrated magnetic/radiance data. `*-definition.json` contains canonical algorithm identity; its SHA-256 equals `RECIPE_HASHES` in the raw WASM/native packet. The CLI accepts only known IDs and illustrative authority.

## Prepare and validate

```powershell
cargo build --release -p solar-cli
python tools/prepare_solar_dynamic.py --recipe assets/solar/recipes/active-v1.json --web-root build/solar-dynamic-qualified
python tools/validate_solar_dynamic.py build/solar-dynamic-qualified/solar-dynamic/active-v1/manifest.json --web-root build/solar-dynamic-qualified
```

Repeat for quiet-v1. No network calls, external Python packages, engine-state mutation or live publishing occur. Destinations are immutable: identical bytes are a no-op, different existing bytes fail. Use a new output directory after source/recipe changes. Generated packs contain 25 L32 geometry samples over six hours and 64/96 cubic scalar fields. CLI prepare defaults to L32; `--lmax 1..64` is an offline research control. All rendering LOD values preserve the same 64 scaffold candidates and logical attachment anchors; geometry detail is independent of the disk budgets. Bounds reject rather than silently reducing the request.

```powershell
cargo run --release -p solar-cli -- appearance sample --recipe assets/solar/recipes/quiet-v1.json --time 1234 --out build/descriptor.json
cargo run --release -p solar-cli -- appearance prepare --recipe assets/solar/recipes/active-v1.json --time 0 --lod 1 --out build/native-packet
cargo run --release -p solar-cli -- appearance validate --packet build/native-packet/packet.json
cargo run --release -p solar-cli -- appearance raster --recipe assets/solar/recipes/active-v1.json --packet build/native-packet/packet.json --time 900 --out build/euv-reference.f32 --width 2048 --height 1024
```

CLI exit 0 success, 1 processing/validation failure, 2 argument errors. All commands are noninteractive and offline. Raw raster output has south at row zero, west-positive longitude, texel-center sampling, x-fastest float32 little-endian. Default size 2048x1024, maximum same. It evaluates the current shared hierarchy directly from admitted packet attachment groups, with absolute-time differential advection. It excludes palette, exposure and bloom. Do not rotate an already posed raster again.

## Fields and emission

Canonical radius is 695700 km, +Z north, +Y at west-positive longitude 90 degrees. Relative rotation uses the existing engine fit minus 14.1844 degrees/day. L32 real orthonormal spherical harmonics include the Condon-Shortley phase. Gauss-Legendre/longitude quadrature projects the synthetic bipolar boundary and records the removed monopole. Field-line integration uses RK4 step doubling, tolerance 1e-5 R, bounded step size 1e-4..0.02 R, 4096 accepted steps per direction. Surface/source-surface/weak-field/tolerance/budget terminations remain distinct. Budget is never open connectivity.

Emission is a dimensionless illustrative model. Fallback Gaussian strand reconstruction integrates the physical Gaussian over voxel cells using separable normal CDF differences, truncated at five sigma per axis. It adds no variance inflation and never renormalizes clipped cells. Target, retained, tail and shell/box-clipped mass counters accompany each volume. Shell clipping uses voxel-center membership and is not exact curved-boundary integration. Static scalar fields are a time-averaged background, not evolving plasma. Per-voxel pulse RGBA is `[arc_length_R,onset_s,duration_s,support_relative]` for the strongest contributing strand, using support-weighted arc length. For age=time-onset, pulse is zero outside `(0,duration)`; inside, add `support * 0.3 * sin(pi*age/duration)^2 * exp(-0.5*((arc-0.0002*age)/0.04)^2)`. Onset events do not repeat. Crossing-strand attribute filtering is an admitted approximation.

The photospheric cellular routine is separate from the high-resolution EUV hierarchy reference. The site algorithm blends two generations with C1 sin-squared lifetimes before nearest/second-nearest lookup. This deliberately avoids zero-weight newborn sites causing discontinuities. Photospheric cell size is 1000 km; the separate coronal morphology recipe uses 10000 km. Neither is a convection/MHD solver. No measured brightness-to-field inversion is performed.

## Remaining limits

The pinned six-hour quiet/active recipes use newly generated synthetic region anchors. Their geometry/ABI remain stable. Separate native optional products now support validated local scientific-snapshot sequences, stable field-weighted seeds, C1 region lifecycle and a six-day rotation scenario. They use separate derived schemas and are not automatically admitted by the browser ABI. Measured magnetogram intake and calibrated channel response remain unsupported. Six-hour region poses follow differential rotation; cellular morphology and finite strand brightenings evolve locally. PFSS cannot represent currents, reconnection, flares or CMEs. Numerical convergence is separate from observational, browser, Blender and physical-device qualification. Roll back by returning the consumer to the previous complete immutable bundle; never mix resource identities.


## Optional source sequence and six-day lifecycle scenario

```powershell
cargo run --release -p solar-cli -- appearance prepare-sequence --sequence local-input/sequence.json --out build/source-derived --lmax 32 --count 64
cargo run --release -p solar-cli -- appearance prepare-rotation --out build/rotation-v1 --seed 42 --lmax 32 --count 64
```

The strict input manifest is `{"schema_version":"solar-appearance-source-sequence.v1","field_authority":"normalized_model","snapshots":[{"path":"state-0.json","sha256":"<exact SHA-256>"}]}`. Paths are confined to the input manifest directory, including resolved symlinks. Each source is admitted through the existing scientific v3 schema and semantic validator. The adapter rejects observed/physical-field claims, wrong grid/coordinate identity, changed immutable region births, wrong digest, nonmonotonic times, more than 25 frames, a span over six days, source grids over 256x128, more than 128 regions, region IDs outside u32, individual sources over 16 MiB and total source bytes over 64 MiB. Source seed/grid/coordinate epoch must remain identical. Source fields are normalized model cell means, not calibrated observations; exact spherical areas weight the midpoint harmonic projection. Requested lmax must fit both longitude and latitude sampling. The optional `BoundaryGrid::resample` preserves the flux integral by exact overlap of source and destination spherical cells.

Derived sequence schema is `solar-appearance-derived-sequence.v1`; each packet is `solar-derived-render-packet.v1`. Original source hashes and absolute source epoch remain explicit. Scenario time is source time minus first source time. Snapshot boundary fields are never multiplied by the appearance lifecycle a second time. The source's original birth positions/IDs drive appearance poses; the declared 14-day engine lifetime uses a six-hour C1 rise and three-day decay for the illustrative masks. These masks do not assert a measured temperature or area evolution.

`rotation-v1` is a separate six-day synthetic scenario with 25 geometry keys at six-hour spacing, ten deterministically scheduled finite-lifetime regions and L32 PFSS. It does not extend or silently alter the six-hour WASM validity range. Equal-area candidate seeds are sampled without replacement using an exponential race weighted by absolute radial field. Candidate IDs, rather than selection ranks, stay stable. Source sequences select the first nonzero field as the reference, and transport those same reference candidates through the engine differential law. All-zero sequences legitimately produce no field lines. The optional products require explicit consumer support and do not replace current browser bundles.


## Revision 3 EUV morphology and shared admission

Revision 3 leaves photospheric cellular granulation unchanged. The EUV surface uses a separate dimensionless correlated field: apply the existing quintic vector domain warp to `q = p * (695700/10000) * 0.35`; evaluate scalar quintic-trilinear value noise at frequencies 1, 2, 4 with weights 0.55, 0.30, 0.15. Octave seed is `seed XOR wrapping_u32(0x9e3779b9*(octave+1))`. Corner values are `2*unit(cell_hash(octave_seed,corner,generation))-1`. Quintic interpolation between generation floor(time/1200) and the next generation creates smooth local evolution at absolute scenario time. The display modulation remains `exp(0.65*(field-0.2))`. This is an illustrative EUV morphology proxy, not convection, observed structure, calibrated radiance or a plasma solution. See `euv-r3-reference.json` for independent Rust CPU golden samples.

All packets now pass the shared `solar_core::appearance::validate_packet_json` before native/WASM publication. The CLI's `appearance validate --packet` and Python validator use this same full nested semantic gate. Python-to-native admission explicitly encodes UTF-8, including source snapshots containing non-ASCII scientific metadata. Derived manifests require captured input-sequence and source-snapshot receipts; their hashes, schema, epochs, intervals, units and source modes must correspond.

Preparation builds a producer in a fresh isolated Cargo target directory using `--locked --offline`, captures the relevant transitive Rust/Cargo/include/generator input digests before and after compilation, and records the exact executed binary SHA-256, compiler metadata and build profile. `producer-receipt.json` is part of each scenario. The generator rechecks source and binary identities before publishing its manifest. It never labels an unverified preexisting `target/release/solar-cli` executable with a hash of current source. These are local build receipts, not a hosted release or signed deployment attestation.


## Revision 4 attachment hierarchy and sampling limits

Revision 4 retains the R3 correlated noise primitives and leaves visible photospheric granulation unchanged. Its active disk emission is exclusively attached to two fixed cores per logical PFSS endpoint group: core budget 1.4 and structured-support budget 0.22 per group, split equally. Kernel widths are fixed at 0.0035 R and 0.015 R respectively. Region envelopes are placement/diagnostic masks and contribute no emitted intensity. Core positions are exact normalized endpoints of stable central/neighbor seed members 0 and 2, independently of rendering subdivisions. Per-point strand emissivity gains vary along actual neighboring PFSS traces. A new physical coronal emitter may change coronal light, but subdivision or additional rendering representation does not alter the logical disk budgets.

`appearance components --recipe <recipe> --packet <t0 packet> --out <directory>` writes eight unsigned linear float32 component rasters with an immutable source-packet receipt. Panels are macro, macro+meso, +micro, complete disk, diagnostic AR placement mask, internal attachment structure, diagnostic cores/dark lanes, and final AR. Diagnostic masks are never added to emission. No per-panel display normalization is baked.

`appearance background --recipe <recipe> --packet <t0 packet> --width 64 --out <file>` exports the same Rust diffuse-only shell field in x-fastest order. Supported edges are 32,64,96. Time must be zero. The analytic-strand production path uses this background only; the separately exported total fallback volume must not be added on top of analytic strands.

The base surface artifact now reuses the exact 2048x1024 Rust t0 reference raster. The browser instead evaluates the shared analytic packet recipe at display pixels; it does not upload the reference raster as its surface texture. The reference resolution test uses exact spherical cell areas and the analytic chord-Gaussian integral. At nominal latitudes 0/45/75 degrees, 2048-grid phase tests have relative integral errors below 4e-7; the actual prototype cores lie within approximately -23.27 to +21.67 degrees. The 512 grid fails phase independence (integral ratios about 0.362 to 1.973). Near-polar core integrals remain unqualified (up to 3.44 percent error in tested polar cases). This is a scoped integral test, not a peak-value, pixel-filter, instrument or observational calibration claim.

The CDF deposition helper is included in the producer receipt's transitive input inventory. Interior fallback kernel mass ratios are approximately 0.99999828009 at both64 and96, matching the declared five-sigma omitted tail. Curved inner-shell center-mask losses remain resolution-dependent and are explicitly reported rather than renormalized. Revision 4 visual morphology is still under review; immutable R2/R3 bundles remain available for comparison and rollback.
