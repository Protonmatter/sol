# RFC 0009: Recovered Sites Earth appearance in SOL

- Status: Draft
- Authors: Protonmatter and Codex
- Created: 2026-09-25
- Target: Earth appearance review
- Requirements: `SOL-VIS-010`

## Summary

Use the latest published SOL Planet Look Lab Earth in SOL's default Illustrative
look. The owner requested this source on 2026-09-25. Sites identifies version 7,
source `12f633b27e435479f4b2322b613f8dd204847d2e`, as successfully published.
The recovered source contains the July surface, 1.6 exposure and latest textured
cloud-volume treatment. This supersedes the missing-source limitation for that
appearance; it does not merge the older Enhanced Earth PR or qualify a release.

## Context

The prior seven-planet candidate left Earth unchanged. The older Earth PR is not
the requested Sites appearance. The authoritative source and asset hashes are
recorded in [the provenance record](../validation/sites-earth-v7/source.json).
The Sites README contains obsolete January/3-percent descriptions; current code,
the asset manifest and the later cloud documents identify July and 35 percent.

## Requirements

`SOL-VIS-010`: SOL MUST use the recovered v7 July 2004 surface and display recipe
when Illustrative look is selected with the historical composite layers. It MUST
retain the 1.6 exposure, conservative dark-ocean grading, thin cloud volume,
shared cloud/shadow density, local cloud lighting and visible relative drift.
It MUST preserve SOL's positions, physical/display scales, IAU orientation and
simulation epoch. It MUST keep Source-qualified, daily swaths, sea-ice analysis,
HDR, night-light and texture controls available and disclose which path is active.
Resource cancellation and context loss MUST reject stale uploads.

## Design

The original July JPEG is copied byte-for-byte. Existing SOL cloud/night assets
have the exact hashes used by Sites v7 and are reused. The Natural Earth ocean
mask and cloud-density/lighting functions are recovered from the same source.
The cloud recipe is transpiled to native JavaScript without a runtime dependency.

An isolated shader program ports the lab's display lighting and tone curve to
SOL's perspective rays and oblate Earth. Source-qualified optical shaders are
unchanged. SOL's north axis is positive z, so the lab's positive-y coverage pole
is explicitly mapped. Cloud view rays use separate near/far intervals with 12
samples each, and sunlight uses the original four samples. The ground pass writes
its actual surface depth; the transparent limb pass does not write depth.

The 1-12 km density profile and relief inferred from cloud coverage are artistic,
not retrieved atmospheric fields. Cloud drift is 35 percent of SOL's displayed
Earth spin, including its existing high-speed rotation cap. Pause, reduced motion,
hidden/inactive views and disabled clouds freeze drift. It never changes engine time.

The additional cache contains at most one July texture and one 512 by 256 R8
ocean mask. Both release on appearance change, loss of demand, view exit and
context loss. Source bytes and dimensions are verified before upload. The existing
reference cache still owns cloud/night layers. An optional-program failure does
not invalidate mandatory scene programs; switching appearance retries it.

## UX and accessibility

Illustrative look is already the owner-approved default. Earth joins that mode
with an explicit July/2002/2016 disclosure. The native selector restores the
existing Source-qualified Earth. Daily satellite swaths, sea-ice analysis and HDR
select the original Earth path so those controls keep their existing meaning.
The atmosphere checkbox controls the selected path, and its label identifies
reference versus illustrative treatment. No new interaction or automatic animation
is added; existing motion controls retain ownership.

## Security and privacy

No new runtime dependency or external transport is added. Textures are local,
same-origin files. Source URLs are attribution, not runtime fetch destinations.
The Sites source checkout was opened read-only; no Site publication was performed.
Authentication material is not part of this repository or provenance record.

## Alternatives

Merging the older Earth PR would miss the July surface, exposure and later cloud
treatment. Embedding the entire Sites application would duplicate the scene,
camera and input stack. The selected implementation retains SOL's renderer and
ports the recovered material recipe into an isolated program.

## Risks

The lab uses a spherical orthographic view and arbitrary lighting; SOL uses a
perspective camera, oblate geometry and Sun-directed lighting. Appearance is not
claimed pixel-identical at unrelated poses. Dense cloud integration adds GPU work.
The July texture uses about 74 MiB with RGBA mipmaps before device-size reduction;
the cache is bounded, but physical-mobile performance remains unmeasured.
The previous reference map may remain in the existing bounded warm cache.

## Acceptance criteria

1. The recovered JPEG and reused layer hashes match v7; ocean-mask pixels match
   the recovered identity (unit tests).
2. Fresh Illustrative Earth uses the July texture and 1.6 GPU exposure without
   changing positions/time (unit and native-browser tests).
3. Cloud density, shadows, pole/grazing behavior and texture lighting retain the
   recovered bounded behavior (ported recipe tests).
4. Cloud-off changes rendered pixels and clears the cloud uniform in both passes;
   camera/time/positions remain unchanged (native-browser probe).
5. Source-qualified, daily swaths, sea ice and HDR retain their prior paths.
   Hidden late decodes, context loss and failed-program retry behave correctly
   (lifecycle tests and existing browser gates).

## Validation

Run the Earth recipe/lifecycle tests, full Node suite, typecheck, source/UX/SDLC
validators, release-artifact Python tests, staged build and native browser suite.
`tools/earth_look_probe.mjs` retains actual GPU uniform readbacks and paired
screenshots after the existing scientific scene gates. Run combined Node/browser
coverage with the same staged artifact. Desktop checks do not qualify mobile,
Safari, manual accessibility, hosted CI or production delivery.

## Rollout and rollback

The owner authorized Git publication on 2026-09-25. Submit the combined Earth and
seven-planet rollout through canonical draft PR #115. Its tracked modules and
textures are included in the immutable `/sol/` build. After an approved merge,
successful master CI and the existing Pages identity checks publish that artifact;
the PR itself does not update the live site. See the
[delivery contract](../RELEASE_DELIVERY.md). Existing CI, review, merge and release
controls remain. Select Source-qualified
for immediate visual rollback. The Earth integration is separable from the
seven-planet asset work; no data migration or persisted preference is introduced.

## Documentation

Update README, SPEC, requirement traceability, the seven-planet scope note and
the recovered-source provenance record. Preserve the older Earth history as
historical context rather than claiming it delivers this version.
