# Additive terrain and explicit-height qualification

`tools/scattering_validation_supplement.mjs` supplies an independent Cartesian
extension to the existing scattering harness. It returns eight new datasets and
1,600 queries without modifying the original thirteen datasets or 5,592 queries.
The original fixture constructor and interpolation assessor remain unchanged.
This document specifies the small harness integration separately because the
generator resource adapter is being extracted by another implementation slice.

The supplement contains three explicit-height Earth scenes (day, distant forward,
and near top), plus five Mars terrain scenes (day, night, terminator, forward,
and near top). Mars uses the actual catalogue flattening `3376.2/3396.2` in both
the generated physical camera and the source-mesh coordinates. The five original
camera metric distances, latitudes and solar phases are retained. The original
synthetic datasets, including their rounded polar ratios, are untouched.

The source is `mars-radial-height-v2`, SHA-256
`eeee507f80b9d093b5b9327571e1256a74e9380f839233e545f54fa6a3e33dba`.
The admitted radial bounds `[3372.941,3417.272] km` imply the conservative optical
height envelope `[-23.24900000000025,41.32530312185281] km` under that flattening.
This is a coverage envelope, not a claim that a real terrain vertex reaches both
extrema at every latitude. The actual level4 object mesh has 131,841 vertices and
783,360 indices; its explicit-height extrema are approximately -7.069048495 and
22.786325733 km. Eighteen source-mesh samples include both height extrema, poles,
the duplicated seam, quarter longitudes, and seven actual triangle centroids.
Triangle positions and radial scales are interpolated separately, retaining the
material's correction for tessellation chord sag.

Each Mars dataset also contains a joint angular/height envelope grid and 54
samples straddling true ground tangency, with prescribed impact heights
`[-0.0005,0,0.0005] km`, endpoint heights `[0.001,3.37,10] km`, both signs about
closest approach, and azimuths on either side of the quarter-axis seam. Twelve
limb cases per scene preserve visible-shell domain checks. Four extra day-side
invalid-height controls deliberately give a valid Cartesian point a supplied
height one kilometre outside the plan. They require invalid field alpha and the
unchanged opaque pre-transfer color; they fail if the explicit-height overload
is silently replaced with the old reconstructed-height overload.

## Harness integration contract

Add an opt-in `--terrain-v2-explicit-height` flag. With the flag absent, leave
the original shader strings, query texture layout, datasets and predicates
unchanged. With it present:

1. Snapshot `terrain-assets.v1.json`, `js/terrainAssets.js`,
   `js/terrainGeometry.js` and their local imports, and the referenced v2 Mars
   binary through the existing immutable-copy function. Validate the manifest
   record against the runtime `terrainReference('Mars')`, verify asset bytes and
   SHA-256, decode with `decodeTerrain`, and build the existing level4 mesh using
   catalogue equatorial/polar radii. These are preparation operations outside
   any animation timing window.
2. Build the existing datasets once, retain their serialized hash, then call:

   ```javascript
   const supplemental = scatteringSupplementalCases(original, {
     terrainReference: reference,
     terrainMesh: mesh,
     bodyCatalogue: BODY,
   });
   const datasets = [...original, ...supplemental];
   ```

   Apply any existing diagnostic case filter afterward. Record the supplemental
   module hash, source identities, explicit-height flag, original count, new
   count and negative-control count in the receipt. A filtered subset still
   cannot be declared a complete matrix.
3. Compile a separate optional actual-consumer probe. Keep the direct reference
   program unchanged: it integrates the actual Cartesian ray to the original
   finite endpoint. In the optional program, read a third query texture row:

   ```glsl
   vec4 h = texelFetch(u_queries, ivec2(x, 2), 0);
   vec4 s = limb ? atmosphereLimbScattering(ray)
     : atmosphereSurfaceScattering(a.xyz, h.x);
   vec3 t = atmosphereViewTransmission(u_atmosphereCameraKm, ray, maximum);
   outS = s;
   outT = vec4(t, 1);
   outColor = vec4(limb ? vec3(.18)*t+s.rgb
     : atmosphereSurfaceColor(vec3(.18), a.xyz, h.x), 1);
   ```

   Both the two-argument scattering overload and three-argument color overload
   must be exercised. Do not substitute a standalone test implementation of the
   runtime mapper or treat input state as evidence that the overload executed.
4. Only supplemental datasets use the third row and optional probe. Allocate
   `new Float32Array(n * 3 * 4)` for those query textures, retaining the first two
   rows verbatim and writing `[query.explicitHeightKm ?? 0, 0, 0, 0]` at
   `(2*n+i)*4`. This explicitly preserves scalar height as an independently
   uploaded binary32 value. Original datasets still use their original two-row
   textures and actual-consumer probe. Preserve actual shell rendering and
   readback for both groups.
5. For every valid original or supplemental query call the existing
   `assessScatteringQuery` with its unchanged limits. Only the four deliberate
   `expectedHeightRejection` controls call `assessExplicitHeightRejection`;
   keep their raw direct reference and actual results in the receipt and label
   them `invalid-explicit-height-control`. They are additional input-admission
   tests, not exclusions from either valid corpus. Wrong overload, valid alpha,
   nonfinite output or changed fallback color must fail those controls.
6. Retain complete atlas validity checks, all original nonzero visible-shell
   requirements, the evaluation and allocation budgets, and every failed receipt.
   No out-of-domain endpoint may be admitted by enlarging the arithmetic residue.

## CPU verification and limits

Five committed test groups pass using the actual hash-verified v2 binary and
level4 mesh. They verify input immutability, exact catalogue/profile datum,
source identity and bounds, mesh extrema and triangle interpolation, physical
closest-approach reconstruction, both endpoint signs, and negative-control
rejection of the old overload's valid-alpha result. The actual original fixture
constructor was also invoked read-only: it produced 13 datasets and 5,592 queries
whose serialized hash stayed
`20cef31efdf06deb16196fcb73dabf638600e6edc52a79bdf92ad2d1019c3e4f`
before and after extension. The resulting eight supplemental datasets contain
1,600 queries (1,596 valid and four intentional invalid-height controls).

```text
node --test tests/web/scatteringSupplement.test.mjs
```

The supplement has not yet been integrated into the GPU harness or replayed on a
GPU. CPU construction does not qualify a scattering candidate or a production
material. Both native and software backends must retain separate complete
receipts, including failures. The new corpus is bounded additional coverage; it
does not prove correctness at every possible terrain point, camera or solar
direction. Remove only the opt-in flag to return to the original qualification
surface; no runtime formula or original fixture file is changed by this slice.
