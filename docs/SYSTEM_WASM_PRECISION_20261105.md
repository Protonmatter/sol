# Actual System WASM geometric verification — 2026-11-05

The exact browser-tested ephemeris WASM passes all **39,250 geometric-vector
comparisons at 3,925 declared model epochs** in the retained padded 1900–2200
matrix. The unchanged limit is 10 arcsec-equivalent full-vector error. Independent
review reconstructs every comparison from original Horizons responses and finds
no actionable issue. This verifies the recorded samples of the actual binary;
it does not establish a continuous error bound or full release qualification.

Illustrative Earth, application algorithms, coefficients, fields, rendering
quality, resolution, budgets and staged bytes are unchanged.

## Artifact and original execution path

The module is the actual `solar_ephemeris.wasm` from
`local-guarded-sol-20261105`, not an instrumented or rebuilt replacement:

- Module:1,810,907 bytes, SHA-256 `2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2`.
- Stage manifest: `45e5ff86b94624b5af3b8318c74b7927999b726c1349a3c0ffbec1789ed89855`.
- Original reference manifest: `d3ea57a0eef1347dda375f0f66614a8d4235a0a179d08bbdba2184cec0e6cccb`.

Node instantiates the exact module with no host imports and calls the original
`system_positions`/`system_positions_len` exports. Every call copies all27 f64
coordinates immediately from the current memory buffer, after any possible
memory growth. All105,975 raw coordinate values are finite. The nine heliocentric
body vectors plus the geocentric Moon reconstructed from Moon−Earth supply all
ten reference cases at each epoch.

A small private Rust mapper depends on the existing workspace crate through a
local path. It copies no astronomical algorithm and changes no public interface.
It inverts the public native `AstroTime` to the declared model TT argument, checks
the Unix round trip and rejects a residual above1ms. The saved mapping residual
is zero at stored binary64 resolution. This uses the same retained millisecond
TDB/TT proxy as the original [precision sweep](PRECISION_WINDOW_20261104.md);
it is not independent historical UTC, future leap-second or UT1 qualification.

The original frontend `assertSystemSnapshot` and `projectSystemPositions` also
run at the existing frozen32 metadata epochs. Actual WASM JSON passes the reader;
serialized/raw coordinates agree within the predeclared eight-decimal rounding
allowance plus floating-point allowance. The largest observed difference is
4.9995561440807634e-9 AU. Projection preserves the raw coordinates and computes
the matching geocentric distances. The selection is unchanged, SHA-256
`9bb53a17f270dffe35228b690a692892f0316b523a815705b0187c9aad4d7583`.

## Complete sampled geometric result

The metric is `norm(WASM − reference) / norm(reference) × 206264.80624709636`.
It includes radial displacement, rather than measuring direction alone.
Reference origins, ecliptic-J2000 frame, AU units, DE441 source and model-time
identities are admitted by the existing strict reference loader. Mars–Neptune
retain the declared planetary-system barycenter target IDs; the Earth-center
and heliocentric/geocentric Moon identities remain explicit.

| Case | Maximum full-vector error, arcsec-equivalent |
| --- | ---: |
| Mercury |0.157106 |
| Venus |0.117668 |
| Earth center |0.114912 |
| Mars system |0.137827 |
| Jupiter system |3.619375 |
| Saturn system |4.440165 |
| Uranus system |6.418396 |
| Neptune system |3.584526 |
| Heliocentric Moon |0.114917 |
| Geocentric Moon |0.122031 |

The largest residual is Uranus at JD2473519.5:6.4183957853454165 arcsec-equivalent.
Every comparison is retained in the10,587,501-byte CSV; no date, body, radial
component or failure is filtered. Native/WASM component differences are retained
as diagnostics, with maximum1.617594946878853e-13 AU. Cross-target binary64 bit
identity is not required or claimed, and no JPL acceptance budget changes.

## Guard checks, provenance and independent review

Six Python groups cover matrix completeness/order, malformed numeric tokens,
nonfinite values, dimensions, model-time metadata and the full-vector metric,
including a radial-only failure with unchanged direction. Three Node groups
cover immediate owned copies, memory growth, bad pointers, bad lengths, invalid
epochs and nonfinite coordinates. All pass before the actual replay.

The closed input map contains52 source/artifact entries. Entry-point admission
requires equality with the independently owned filesystem set, so a caller cannot
omit inputs from its map. Source hashes are verified before and after execution.
All four native-build/mapping/WASM/comparison stages exit0. These are private
offline CPU checks using existing Rust/Node and the original reference files;
they add no dependency, network request or application code change.

The independent reviewer checks all190 original response hashes and10,686,539
raw response bytes, extracts all39,250 original geometric vectors, and recomputes
every residual and decision from those vectors and the actual WASM CSV. Maximum
arithmetic-expression difference is1.7763568394002505e-15 arcsec-equivalent.
It separately verifies all52 inputs, stage/module/native-executable identities,
complete order/count coverage and all32 metadata cases, with no model execution.

Retained ignored output is `build/wasm-system-precision-20261105-01/`, with review
under `build/wasm-system-precision-review-20261105-01/`. Key SHA-256 identities:

- Plan: `d58534759f876ac4a8769bd8721ce1ee4423fe5be5421e497c9b422ec5cf01d7`.
- Inputs: `3d2da0f3bda52861cd9ac2398132ae874de8fa8e13bf5c8424e160febb0f18a6`.
- Summary: `ab32995818c878ed33e2eb716bf63f572f82ca7d8a6597fc1bdcfb19aadeea8b`.
- Run receipt: `6e8f79346b2cf712e1a21c04f533b7ad494742d7640ef254aebad1395a4c92a8`.
- Actual WASM receipt: `179f69875171d230c6be0cfd4156473fee16c40b4a7215b1132c6dc2d525ab4c`.
- Every comparison: `4a1d985a82684b43d8ca4f688c8baab2be0ec9a71326ff14b57e2b3a6b14cc7f`.
- Independent review: `1c9edf3cbd77840ef00c36bc2731669918f0320e517909b9e057ba7890559b19`.

## Qualification boundary

This run tests System geometric positions and selected original frontend
reader/projection behavior. It does not rerun Sky apparent places, observed
Earth rotation, physical events, browser workers, GPU drawing or platform
performance. The existing Windows application checks retain their separate
evidence; the existing Linux job still requires retrieval. The continuous
accuracy, upstream distribution/notice, manual/platform and protected release
holds remain. No qualification flag, commit, push, deployment or license changes.
