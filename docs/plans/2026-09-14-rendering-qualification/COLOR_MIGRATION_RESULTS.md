# B2 material color migration

Status: implemented local material routes; integrated runtime, native-device and
hosted qualification remain separate. Source lineage is `34937f1` on the isolated
`codex/sol-color-hdr-20260914` branch. Original image bytes, map registration, data
palettes, physical geometry, ephemerides and atmospheric numerical tolerances are
unchanged.

## Explicit filtering and composition

`materialColor.js:linearFilterReference` admits decode-before-filter only for the
opaque Earth and Moon primary surface display maps. Their uploads use
`SRGB8_ALPHA8`; `u_textureLinear` prevents a second shader decode. The existing
browser decode and possible whole-extent canvas downsampling still precede upload;
this does not qualify source ICC, browser resampling or monitor color management.
The original RGBA upload route remains available to qualification comparisons.

All masked references retain encoded premultiplication, filtering and covered-color
normalization before their material decode. Catalogue moons retain their original
display-luma contrast, source RGB compression and power-2.2 albedo/eclipse gain.
Night lights retain their explicit shader decode and emission placement after
direct illumination, before view transport. Cloud/composite, scientific sea-ice,
solar intensity and numerical-field uploads retain their existing formats.

Every contributing fragment program now has an explicit `u_linearOutput` route:

- Registered surfaces, reference optical surfaces and ring reflected terms emit
  their existing linear result directly.
- Historical moon/fallback lighting, assigned solar colors, point stars, guides,
  glows and illustrative shells retain their display recipe and convert its result
  once to linear display light. This does not reinterpret a moon gain as albedo.
- The illustrative limb added to a registered surface converts separately before
  linear addition. It remains illustrative emission.
- The physical shell emits linear scattering with the existing scalar opacity.
  This improves the composition space but does not establish spectral extinction
  of background stars: scalar-alpha extinction remains an approximation.
- Scientific palettes require the preserved SDR frame route; they are not inputs
  to material fitting or tone mapping.

With `u_linearOutput=0`, the prior material output recipes remain available. The
opaque-map filtering migration is independent of that output selector. Hardware
sRGB filtering changes high-contrast image averages intentionally; it does not add
source resolution or make a display mosaic calibrated reflectance.

## Local evidence

The extended `tools/planet_appearance_validation.mjs` uses actual production
shaders and the actual `makeTexture` function. Its new float readbacks cover
registered maps, valid black, coverage edges, night emission, moon contrast, Io,
fallback, Titan, Sun and illustrative shells. Opaque black/white and saturated
red/green pairs distinguish decode-before-filter from the prior encoded filter.
The original registration, seam, pole, mip, coverage, palette and material tests
retain their thresholds.

Local receipts are retained in ignored `coverage/` directories:

| Receipt | Result |
| --- | --- |
| `color-b2-red-20260914/evidence.json` | 99/109; ten expected linear-output/filter controls failed against the prior shaders. |
| `color-b2-green-20260914/evidence.json` | 109/109; all original and new checks passed on Chrome/SwiftShader. |

Receipts contain source/compiled-shader and fixture SHA-256 values, browser/GPU
identity, actual values, tolerances and failure detail. Their renderer-file hash
includes concurrent uncommitted D1 plumbing in the isolated worktree; the tested
extracted uploader and compiled B2 shader bytes are identical to this slice. This
is local shader evidence, not an immutable whole-application or native-device run.

The renderer route tests independently enumerate all admitted sources and all
unmapped moon fallbacks. Node tests validate dispatch and lifecycles; they do not
replace pixel readback. D1 target/presentation qualification and the original final
Earth draw deadline remain required before enabling scene-wide HDR composition.

Rollback reverts this material slice, restoring RGBA primary-map upload and the
prior output programs together. It does not replace image bytes, source choices,
physical state or numerical assets. No dependencies or runtime providers were added.
