# RFC 0004: Registered planetary appearance and Earth layers

- Status: Accepted
- Authors: Min Kang, Codex
- Created: 2026-09-13
- Target: Local and PR candidate; production activation remains separate
- Requirements: `SOL-VIS-003`, `SOL-VIS-004`, `SOL-VIS-002`, `SOL-UX-004`, `SOL-SCI-001`

## Summary

Render documented NASA and mission-archive maps on the planets, and separate Earth's
land/ice reference, night lights, satellite clouds and surface, and sea-ice analysis.
The user explicitly requested these features while retaining scientific correctness.
This extends RFC 0003's appearance contract without upgrading unregistered legacy art.

## Context

The previous candidate preserved provenance by holding unregistered textures. Its
featureless globes did not meet the requested appearance. Official global and partial
maps now provide enough coordinate evidence for useful, bounded reference rendering.
Source identity, map registration, observed coverage, color processing and source date
are independent properties. A global raster does not imply every pixel was observed.

## Requirements

- `SOL-VIS-004`: Reference maps MUST bind source and rendered byte hashes, original
  dimensions, coordinate axes, latitude convention, covered latitude, no-data behavior,
  source date, color interpretation, derivation, limitations and source credits.
- Earth lights MUST appear only on the geometrical night side; their annual composite
  date MUST remain distinct from model time. They MUST NOT imply live outages or radiance.
- Weather MUST use the dated provider image and matching documented data/no-data mask.
  Missing swaths MUST NOT be filled with invented clouds, stretched edge pixels, or
  mirrored hemispheres. Satellite surface imagery MUST NOT be called a cloud-only mask.
- Land ice and sea ice MUST remain distinct. A sea-ice analysis palette MUST retain its
  legend and date; the renderer MUST NOT invent a white polar cap from latitude alone.
- All appearance changes MUST leave ephemerides, state estimation, uncertainty,
  collision-clearance geometry and supported input ranges unchanged.

## Design

Add a `mapped_references` collection to the existing versioned visual inventory. It
describes geographic display references separately from the legacy full-observation
`global-sphere` qualification. The original gate remains unchanged. Maps in the new
collection may contain documented provider interpolation or partial coverage; neither
is presented as current measured surface reflectance. Build validates all hashes and
the generated browser inventory before staging. Acquisition never happens during build.

The renderer uses source longitude direction and prime-meridian location. Its oblate
mesh latitude is parametric. With axis ratio `q = b/a`, source planetographic latitude
is `atan2(z/q, hypot(x,y))`; planetocentric latitude is
`atan2(q*z, hypot(x,y))`. Normals use the inverse transpose of the ellipsoid model.
Source pixel-center grids retain their explicit scale and offset. Missing caps remain
simplified. No weather/atmospheric pattern is generated procedurally.

Reference display RGB uses the standard sRGB transfer as a stated display convention,
linear illumination and encoded output; this does not calibrate source reflectance.
Masked photographic uploads use premultiplied alpha for filtering; the shader recovers
the covered source color before linear-light composition. No-data RGB cannot darken
valid image edges. Scientific palette pixels retain nearest sampling.
Earth's published grayscale night map supplies relative display emission. A smooth
solar-elevation fade from 0 to -6 degrees is a visual twilight convention. The emission
is zero on the day side. It is independent of scene ambient light and eclipse darkening.
Sea-ice palette colors composite after lighting so the color scale remains interpretable.
The atmospheric limb is explicitly an illustrative scattering effect, not air-quality,
temperature or pressure data. Existing moon albedo/eclipse behavior retains its contract.

Texture loads publish loading, ready or unavailable state; late callbacks from a lost
WebGL context cannot populate its replacement. Earth auxiliaries are reset for every
other body and moon. Switching textures off disables all reference layers.

## UX and accessibility

Keep the immersive canvas and compact inspector. Native Earth layer checkboxes group
night lights, satellite clouds/surface and sea ice. Their status includes source dates;
the source/coverage explanation is available beside the controls. Source facts do not
follow the model clock. The color scale is paired with text and its official source.
Controls work by keyboard and retain focus. Small-screen content follows the canvas.

## Security and privacy

Use same-origin committed reference imagery. No telemetry, browser location upload,
new dependency, credential, service or automatic external request is introduced.
An explicit acquisition tool uses fixed agency endpoints, bounded responses and dated
requests; candidates require review before entering the immutable release inventory.

## Alternatives

- Generic painted texture packs: rejected because visual detail lacks the required
  source chain and can invent geography, storms or coverage.
- Disabling every planet map: preserves a hold but does not satisfy the requested UI.
- Treating a daily global image as live complete weather: rejected because source
  mosaics combine observation times and contain swath and polar gaps.
- Updating model orientation to chase a gas-giant storm: rejected. Source storms retain
  their observation date and cannot predict later atmospheric drift.

## Risks

Display composites contain contrast processing, illumination and sometimes filled
pixels. Radar and enhanced-color maps differ from visible appearance. Gas-giant maps
may lack poles and have occultation artifacts; these require explicit coverage masks.
Low native resolution cannot be remedied by upscaling. Static weather ages after build.
The source inventory and view must expose these limits rather than infer fresh coverage.

## Acceptance criteria

1. Earth shows source-based continents, Antarctic/Greenland land ice, dated satellite
   cloud/surface structure, dark-side lights and an optional dated sea-ice overlay.
2. Every major planet uses an identified, registered source where coverage is available;
   missing areas remain marked by the documented simplified appearance.
3. Asymmetric GPU fixtures detect flipped longitude, incorrect latitude and prime-meridian
   offsets. Day/night tests verify emission gating and source registration.
4. Context loss, missing imagery and texture/layer toggles preserve truthful state.
5. Existing state, geometry, transit-shadow, eclipse, accessibility and release-cache
   gates pass. Screenshots are captured from the tested build.

## Validation

Run the repository's visual inventory, unit, Python, type, governance, browser/visual,
coverage and release-cache checks. The pure `surfaceMapping` tests use independent
latitude anchors and sRGB transfer cases. Actual shader fixtures test GPU sampling;
application captures prove that the same maps and controls appear in the final build.
Source evidence and candidate validation are recorded under
`docs/plans/2026-09-13-planetary-appearance/`.

## Rollout and rollback

Update the already-authorized PR after local acceptance checks. No merge or deployment
is authorized by this RFC. Revert the appearance change as one unit, including its
inventory, assets, runtime and docs. The prior source-qualified fallback remains usable.

## Documentation

Update SPEC, requirements, RFC alignment, source qualification records and operations.
Record exact source products, source/derived hashes, coverage and source dates in the
inventory. Document the explicit acquisition and review process separately from build.
