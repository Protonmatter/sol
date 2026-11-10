# Orbit-curve rendering correction — 2026-11-05

The Solar System orbit guides now adapt to the current camera and viewport.
The prior fixed 160-segment ellipses could disappear entirely from a physical-scale
planet portrait while the underlying ellipse still crossed the visible scene.
This correction changes drawing geometry, not ephemeris positions or orbital
elements. Illustrative Earth and all appearance shaders remain unchanged.

## Reproduced defect and correction

The retained 32 actual WASM metadata snapshots supply eight planetary ellipses
each. Under the supported top-down, true-scale auto-fit camera at 732 × 612,
173 of these 256 cases had no original polygon segment intersecting the frustum,
although the ellipse itself intersected it. Their planes agree with the position
model at metadata rounding precision after accounting for Earth's elements
describing the Earth–Moon barycenter. No coordinate-frame correction is made.

`apps/web/js/orbitLines.js` represents each ellipse quadrant as a positive-weight
rational quadratic. Its control triangle permits conservative homogeneous
frustum rejection, including narrow viewport crossings. Subdivision uses a
0.35-pixel-equivalent control-distance bound in scaled xyz NDC; depth is included
so an edge-on curve cannot flatten with an incorrect depth. The six clipping
planes are applied before division by w.

Projection and clipping use JavaScript binary64. The resulting NDC vertices are
uploaded as Float32 and drawn through the existing line shader with an identity
matrix. This avoids large heliocentric Float32 coordinates losing precision at
close zoom. The original world-space VP is restored for subsequent line draws.
Colors, alpha, depth testing and the existing guide-element conventions remain.

`orrery.js` caches those vertices by metadata revision, all VP matrix entries and
viewport dimensions. Context initialization recreates the buffer and clears its
cache key. The reference grids retain their existing static path. The public
`ellipse3d()` helper and its 161-vertex return contract are unchanged.

Work is bounded by depth 24 and 65,536 visited subdivision nodes per ellipse.
The internal `orbitCurveStatus.capped` field reports saturation; capped output
does not carry the pixel bound. None of the retained 256 camera cases capped.
This tolerance describes display guides, not orbit-position accuracy, a GPU
pixel-exact promise, or an exhaustive bound for every camera and epoch.

## Verification

- Seven focused tests cover physical close zoom, overview, near/eye-plane
  crossings, absent geometry, invalid inputs, inclined high-eccentricity orbits
  and explicit bounded-work saturation. The missing-function assertions were
  observed failing before implementation.
- The complete web suite passes all 1,498 tests. All 125 application modules
  typecheck with the existing TypeScript 5.9.3 check.
- The complete retained camera replay has **zero missing guides** across 256
  cases and 22,713 visible samples. Its largest sampled xyz pixel-equivalent
  distance is 0.173609016, below 0.35, with zero capped cases.
- Independent read-only review finds no actionable P0–P3 issue. An additional
  deterministic 2,000-camera probe checks 78,767 interior points; its largest
  uncapped xyz pixel-equivalent error is 0.245906. Three extreme cases explicitly
  cap. This finite probe is not an exhaustive guarantee.
- The unchanged original `browser_validation.mjs` command passes on the observed
  Windows native Adreno backend and SwiftShader, both with physical-spin checks.
  Earth appearance, moon-shadow controls and the original application checks pass.
- The unchanged physical-rendering command passes all 19 checks on native
  Windows, including real context loss/restoration, replacement terrain draws,
  source maps, optical fields and the narrow mobile viewport. No page, console,
  shader or WebGL errors are reported. It does not independently assert every
  orbit pixel after restoration.
- Fresh Node plus native browser coverage is 97.57% lines, 97.50% functions and
  94.52% branches, above the unchanged 90% line gate. All runtime modules remain
  in the denominator, including the new helper. The separate existing Node-only
  gates also pass: 98.34% lines, 91.32% branches and 96.41% functions, each above
  its unchanged 90% floor. These gates have different scope and are not mixed.

The actual native orbit-only capture uses the same model JD2415019.5, Neptune
position, camera, 795 × 612 canvas and display settings in both artifacts.
Textures, sky, moons and optional labels are disabled through their controls for
this isolated pair. The old stage changes **zero pixels** when guides are toggled;
the corrected stage changes **1,309 pixels** by at least 8 channel levels, with a
maximum channel delta 63. The application reports GL error 0 and uncapped output.
Both captures were inspected. This isolated display setting is not a change to
product defaults or an appearance qualification.

Private before/after images, logs, replay outputs, coverage and the independent
review are retained under `build/orbit-curve-consistency-20261105-01/`.
The stage has 208 source owners compared with 207 in the prior baseline: one changed
owner, `orrery.js`, and one added owner, `orbitLines.js`. No owners are removed.
Both WASM binaries and all other existing source owners retain their hashes.
Stage manifest SHA-256:
`1283b98ea07ab58f65ad9773ab10aff492021adb796435992db735de218fa273`.

## Scientific fingerprint correction

A follow-up P2 in `tools/build_web.py` omitted the new `orbitLines.js` from
`SCIENCE_MODULES`. The complete asset manifest already covered its bytes, but
a subsequent helper-only change could leave the scientific component hash
unchanged and be classified as UI-only. The helper now joins `orreryMath.js`
and `orbitCamera.js` in that list. No runtime code or appearance is changed.

The existing staged-fingerprint regression now includes this helper. Before
the correction, its new subtest fails because changing only the helper leaves
the scientific fingerprint unchanged. After the one-name classification fix,
all 31 release-artifact tests and all 74 release-suite tests pass. The test
also requires scientific change classification, unchanged WASM/data identity,
and continued separation of stylesheet-only changes.

The new diagnostic stage, `local-orbit-fingerprint-20261105-01`, has manifest
SHA-256 `f5c1686476ea1d5456ee64034ebe0dd30a2a7f22a81d58334fed075d4e60365e`.
All 208 application source owners, both WASM identities, data bundle and UI
component match the browser-tested stage above. Only the scientific component
inventory changes. Every staged asset and source hash is verified. At the initial
fingerprint audit this stage had only hash validation. The subsequent permanent
browser regression below executes it on both native graphics and SwiftShader;
the earlier captures remain bound to their original stage.

Private exact-diff checks, retained red/green logs, source hashes, staged proof
and a reverse-checked rollback patch are under
`build/orbit-fingerprint-20261105-01/`. It is a local correction, not publication.
Independent review finds no actionable issue, reproduces the original failure
with only the legacy classifier injected in memory, passes all 31 artifact tests,
rehashes all 228 new-stage assets and 208 current source owners, and recomputes
both scientific/UI fingerprints. Its separate `fingerprint-review.json` has
SHA-256 `a2ffbcf956899471e50aa6b109d5fddfb27a15963a59cadbd4fc8031a52326be`.

## Permanent browser regression

The original normal browser command checked guide toggles and a camera round-trip,
but did not assert that a guide was actually visible beside a physical-scale globe.
The earlier private capture proved the fix without protecting that integration
against a future missing draw call. `browser_validation.mjs` now invokes
`verifyOrbitGuide` after its existing visual assertions. The normal CI browser
command automatically runs it; no workflow, dependency or application change is
needed. All prior assertions, thresholds and budgets remain intact.

The fixture uses the retained model JD2415019.5, true-scale top-down Neptune,
and guide-off/on captures at identical model time, metadata epoch, camera and
viewport. Textures, sky and moons are temporarily hidden through their existing
controls for this isolated guide check. The test then restores the original
controls, epoch, nine-body model and camera. Product defaults remain unchanged.

Its independent geometry oracle evaluates the existing `ellipse3d()` element
rotation; it does not call the new adaptive line renderer. The pixel assertion
requires a visible thin change along at least 80% of unobscured expected curve
samples, a nonblank planet core, zero significant core changes and no broad scene
change. Tests reject absent or misplaced guides, planet/frame changes, a missing
planet, invalid sample geometry and mismatched captures. An independent circular
orbit test checks the oracle against its radius equation.

The first native attempt exposed a P2 in the new test: it assumed a 732-pixel GPU
buffer and the composited PNG had equal width. The unchanged capture method
correctly rounds a 731.609375-pixel CSS rectangle into a 731-pixel page crop.
The failed run, restored scene, geometry and all 19 exact producer-source files
are retained. The correction projects with the actual backing-buffer aspect,
then maps points through the recorded CSS extent and rounded crop origin.
Off/on geometry must match exactly. DOM-overlay filtering uses the inverse crop
mapping. It retains all original pixel thresholds and changes no canvas style.
The new fractional-geometry test was observed failing before that mapping existed.

Both corrected complete browser commands execute the latest fingerprinted stage,
manifest `f5c1686476ea1d5456ee64034ebe0dd30a2a7f22a81d58334fed075d4e60365e`,
with physical-spin checks and observed application-context backend identity:

| Backend | Significant guide pixels | Protected-core changes | Expected curve samples |
| --- | ---: | ---: | ---: |
| Native Adreno / D3D11 |1,295 |0 |34/34 |
| SwiftShader |1,075 |0 |34/34 |

The original Earth appearance, spin, shadows and application checks also pass.
The actual old missing-guide PNG pair is rejected by the detector, and the
retained corrected pair passes. Fresh off/off negative controls also reject a
missing guide. Both backend cohorts preserve exact state restoration and bind
the complete 19-entry reported validation-tool inventory. The original failed
cohort remains failed and is not substituted into successful acceptance.

All **1,504 Node tests** pass. The six focused groups include the fractional-crop
regression. The existing Node-only coverage gates pass at 98.34% lines, 91.32%
branches and 96.41% functions; fresh Node plus native browser coverage is 97.57%
lines. The existing 90% floors and runtime populations are unchanged. All 125 app
files typecheck. Independent source/native/software review finds no remaining
actionable P0–P3 issue and independently verifies the PNG arithmetic, sample
membership, geometry, restoration and all 19 producer hashes.

Private evidence is under `build/orbit-browser-gate-20261105-01/`:

- Parent admission summary SHA-256:
  `db8c6f073783efebd3824773fce5bc7510a7ee443b430ddbc0e126b42027d119`.
- Native/source review:
  `f53ef9cc107bd80a0019afe7d1a54027d0acec795814b961388489cd32a29471`.
- Software saved-result review:
  `4c9428669d54cc44b66f471c8f587f3e344c5c3816103110ff3e666f21bc85a9`.

The narrow rollback patch against the preserved pre-change tool passes reverse
application checking without being applied. These results qualify this fixed
rendering regression on the observed backends. They do not establish every view,
body, epoch or device, post-context-loss orbit pixels, astronomical accuracy,
hosted CI, publication or full release qualification. The original guarded-shader
Linux packet and earlier tool hashes remain separate immutable evidence.

## Qualification and rollback

The [actual WASM geometric replay](SYSTEM_WASM_PRECISION_20261105.md) remains a
separate numerical result. This drawing correction does not improve its 6.418396
arcsec-equivalent sampled maximum or establish a continuous 1900–2200 error bound.
Years 1–9999 retain the agreed approximate exploration boundary outside that
precision window. No integration model, coefficient, time reduction or reference
source is changed.

No commit, push, hosted CI run, publication or deployment is performed. The
existing guarded-shader Linux application job has not been retrieved; its result
and closure remain unknown while the supported browser connection reports local
browser use disabled. That is a separate candidate and is not promoted by these
Windows tests. Distribution/notice clearance and other release gates remain open.

Rollback is limited to this change's integration patch and added helper/test;
the reviewed pre-change `orrery.js` is retained in the existing guarded source
snapshot. Verify exact current hashes and reverse only the saved
`implementation.patch`, preserving unrelated dirty work. Do not reset the whole
file or checkout to HEAD. Restore matching code before rebuilding a new staged
artifact; never overwrite either recorded stage.
