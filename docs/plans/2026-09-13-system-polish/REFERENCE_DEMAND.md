# Bounded reference imagery loading

Date: 2026-09-13. Addresses PR 107 review comment 3999301427 under RFC 0004
and SOL-VIS-003/SOL-VIS-004. Source pixels, registration, source epochs and
physical body state remain unchanged.

## Demand and lifecycle

The actual planet and moon draw passes report the projected usefulness of their
drawn spheres. Six sphere/frustum-plane tests reject only fully clipped spheres;
off-axis limbs and near/far-plane intersections remain eligible. A conservative
perspective extent bound uses eight CSS pixels as the minimum useful diameter.
This bound schedules display resources; it is not a scientific measurement.
Moons hidden by the existing visibility, validity or clock rules contribute no
texture demand. Source selection never moves a body or changes its model time.

The current useful focus is prioritized, then decreasing projected usefulness
with stable name ordering. At most eight admitted references form the current
demand. A useful Earth requests its surface plus only enabled night lights,
the selected cloud source, and enabled sea ice. Switching a source does not
substitute another date when an image is missing. Disabled layers and other
cloud sources are not prefetched. Galaxy mode and disabled reference imagery
produce no registered-surface demand.

At most two reference Image requests/decode operations are owned concurrently.
Higher-priority current demand replaces obsolete pending requests: ownership is
removed, callbacks are cleared and the image source is cancelled before a slot
is reused. A saved or already queued callback must still match its generation
and attempt before it can upload or publish a failure. Decoded dimensions must
match the pinned source grid before allocating a GPU texture. Existing device
size adaptation preserves the entire photographic extent; scientific palette
grids remain nearest sampled and fail closed when unsupported.
Failure retains the unavailable status but releases its Image ownership,
callbacks and source instead of retaining decoded pixels until explicit retry.

Successful textures remain in an eight-entry warm cache. Before admitting a
ninth GPU texture, the least recently needed ready map outside current demand
is deleted. Revisiting an evicted source requests the same pinned local asset.
Current pending requests and cached ready maps survive ordinary repaint and
view re-entry. Turning imagery off cancels pending requests; turning it on
requests current demand. Failed references retry only after deliberate view
re-entry, reference off/on, or restoration of a lost GPU context. Ordinary
frames and source selection do not automatically retry failed imagery.

Context loss clears pending Image callbacks and sources before discarding the
old cache. Saved old callbacks cannot affect the replacement context. Restoration
starts only current demand, rather than reloading the entire catalogue. A decode
that completes after leaving the view cannot upload into the inactive scene.

## Resource accounting and status

For the currently admitted grids, the eight largest full-resolution RGBA texture
payloads including each photographic mip chain total **179,424,636 bytes**
(171.11 MiB). The two largest decoded RGBA source images total **84,240,000 bytes**
(80.34 MiB). These are explicit payload accounting bounds, not claims about total
browser or GPU memory: browser caches, decoder working memory, temporary image
resampling, driver allocation overhead and other scene resources are separate.
The cache-count policy does not alter source resolution on devices that already
support it. A regression requires review if newly admitted grids raise the
documented texture payload bound.

The user-facing status distinguishes:

- `deferred`: not currently requested at useful visible scale, or evicted.
- `queued`: currently needed and waiting for an available request slot.
- `loading`: one of the two active image requests.
- `ready`: admitted image available in the current GPU cache.
- `unavailable`: a requested reference failed decoding, registration-size checks
  or upload; the simplified appearance remains disclosed.

## Verification

The old production loader failed the initial overview regression by requesting
all 24 registered references. The corrected 800-by-600 harness requests the two
usefully resolved giant planets. Earth focus then requests the surface and night
image first, queues the chosen cloud image, and leaves sea ice and the unselected
cloud source deferred. Actual submitted sampler uniforms remain independently
verified for all enabled layers and mapped catalogue moons.

Additional regressions cover source-switch cancellation and stale callbacks,
withdrawing a queued layer, explicit retry, cache eviction and later reload,
two-request bounds through repeated context restoration, incorrect decoded
dimensions, GPU failure and palette preservation. The off-axis sphere at
`[2, 0, -1]` with radius `0.8` retains its visible limb; center-only clipping
previously missed it. Tests also preserve accepted engine positions, epochs,
source coordinates, albedo/eclipses, and inherited Earth-uniform cleanup.

Focused command:

```powershell
node --experimental-vm-modules --test tests/web/referenceDemand.test.mjs tests/web/planetAppearance.test.mjs tests/web/planetAppearanceRuntime.test.mjs tests/web/orreryCoverage.test.mjs tests/web/orrery_review_regressions.test.mjs
```

The independent review reran the visible-limb and repeated-context-restoration
reproductions. Integrated browser and publication evidence is recorded in
[PR_REVIEW_FOLLOWUP.md](PR_REVIEW_FOLLOWUP.md).
