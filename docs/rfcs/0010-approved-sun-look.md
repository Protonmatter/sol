# RFC 0010: Approved Sun Surface Lab v2 in the Solar System

- Status: Draft
- Authors: Protonmatter
- Created: 2026-09-26
- Target: Solar System Sun appearance
- Requirements: `SOL-VIS-011`

## Summary

The owner accepted Sun Surface Lab v2 and requested integration with a 1K default,
2K/4K controls and a 4K README screenshot. A focused PR from current master avoids
importing unrelated research/playback changes from the older Sun PR stack.

## Context

The accepted standalone look corrects the older lab's spiky radial corona and adds
finer surface texture. Earlier unmerged Sun PRs include broader research work and
a different recipe. This integration targets the merged planet/Earth master without
substituting those older candidates for the approved appearance.

## Requirements

`SOL-VIS-011`: Fresh Solar System sessions MUST show the approved illustrative Sun
at a default requested resolution of 1024, with 2048 and 4096 selectable. Rendering
MUST retain the approved boiling network, bright points, textured dark regions,
dipole fans, hot cores and feathery wisps. Optional moving prominences MUST start
off. Quality changes MUST NOT alter camera, physical positions or orbital time.
The existing AIA reference and visible-light modes MUST remain selectable. The
separate Sun observation/research workspace MUST retain its current behavior.

## Design

The approved standalone file's SHA-256 is
`7cc33aae070dd48ad26efdd166be91c8e6b75d59b085399e7d9a693610e33a18`.
`tools/extract_sun_look.py` admits only that source and extracts its scalar scene
and blur recipes. Embedded reference images, page controls, background stars and
its private animation loop are not runtime dependencies.

A small shader adapter replaces the orthographic lab hemisphere with perspective
ray/sphere intersections. The lab's positive-Y north maps to SOL's positive-Z IAU
body frame through a proper rotation. Surface fields therefore remain attached to
the body during camera movement. The Sun remains self-emissive; the display color
never becomes the physical illumination supplied to planets.

The renderer owns three asynchronous shader programs and three texture/framebuffer
pairs: one square RGBA16F scalar-intensity target and two quarter-size bloom targets.
1K, 2K and 4K are target dimensions, not map geography or observation resolution.
Maximum intermediate allocation is 144 MiB at 4K, 36 MiB at 2K, and 9 MiB at 1K,
exclusive of the scene and other renderers. Hardware texture/viewport limits and
framebuffer completeness are checked. Old targets are released before replacement;
partial allocation failures release all newly allocated resources.

The palette is applied once after bloom. An opaque composition pass writes actual
Sun surface depth; a later additive off-limb pass is depth-tested against foreground
objects. The off-limb recipe is an illustrative thin layer at closest approach to
the Sun. Wisps and optional arches do not claim volumetric transport, magnetic
geometry, or calibrated emission. SOL's camera, scene depth, transparent ordering,
IAU transform, display radii, epoch and existing animation owner remain authoritative.

No new animation loop is added. The Sun display clock evolves while the Sun is the
subject, the look is ready, motion is enabled and the view is visible. Reduced
motion holds the display at time zero. Pause Sun holds evolution independently of
orbital animation. Unchanged inputs reuse the populated target. Hidden views, mode changes and view exit withdraw draw demand and release targets.
One bounded shader set stays cached per context across mode/resolution changes.
Pending compilation completes before program deletion, avoiding a reproduced
ANGLE/D3D11 delayed graphics error after cancellation. Context loss disposes the
owner; context restoration creates a new one. Late callbacks check
owner and context identity before affecting the scene.

Review follow-up also applies safe retirement to the shared planet shader manager.
Cancellation and timeout settle the request immediately and stop its polling, while
unfinished GPU allocations remain reusable. Disposed owners return those jobs to a
context-owned pool; a source-identical request can claim them, and completed unused
jobs are deleted before new allocation. Active and retired managed programs share
a 32-program ceiling per context. Context loss invalidates the entire pool. The
30-second readiness deadline and explicit retry requirement remain unchanged.

The illustrative Sun retains the existing depth-tested solar-wind particle layer.
Sun inspection frames its 2.1-radius visual envelope without changing physical
positions, display radii or the minimum camera distance.

Failure retains the existing simplified visible Sun with an explicit status. A mode
or resolution change, or Restart / retry Sun, retries. Existing AIA source playback
retains its own controls and source identity. It is never used as attribution for
the procedural appearance.

## UX and accessibility

Solar System -> select The Sun -> See the Sun in offers Illustrative Sun, AIA 171
and Visible-light approximation. The illustrative controls expose native 1K/2K/4K
selection, optional prominences, Pause Sun and Restart / retry Sun. The frame size
can make the difference subtle in a narrow panel; higher quality does not zoom the
camera. Body cards disclose the actual selected appearance and fallback state.

The README image is an unmodified 4096-square WebGL export from the approved lab,
not a screenshot claiming an already-deployed SOL release. Its camera/time and hash
are recorded in [the provenance record](../validation/sun-look-v2/source.json).

## Acceptance criteria

- Source extraction rejects any other SHA and preserves the approved shader text.
- Unit/lifecycle tests cover defaults, choices, invalid input, ray direction,
  body-axis mapping, memory bounds, old-source selection, source-clock independence,
  target/program disposal and asynchronous readiness of a paused scene.
- Staged browser checks read actual GPU target uniforms, capture changed pixels,
  exercise optional prominences and retained visible mode, and compare physical
  positions, epoch and camera before/after quality changes.
- Existing warm-white/AIA tests explicitly choose those retained modes. The whole
  web type/static/UX, Node/Python, browser and coverage gates remain required.
- Native 2K/4K captures are separate from the default 1K hosted browser check.
  Physical mobile and sustained cross-device performance remain unqualified.

## Rollout and rollback

This is a PR candidate. It does not merge the older Sun stack or alter the release
workflow. The existing immutable build copies the imported modules into its hashed
release namespace; GitHub Pages inherits them after an approved merge and successful
promotion. A PR itself does not replace the live Pages deployment.

Users can switch back to AIA or Visible-light approximation in the Sun selector.
Reverting this PR restores the prior default without changing the scientific assets
or engine contracts. No new dependency, network provider or stored preference is added.

## Security and privacy

No runtime dependency, new network provider, telemetry, location handling or stored
preference is added. The renderer consumes finite scene inputs. Shader/target
failure retains the existing scene. The source and reference screenshot are
committed artifacts with checked hashes, not executable remote downloads.

## Alternatives

Embedding the HTML would introduce a second camera, animation loop and background.
Merging the older Sun stack would import unrelated research/playback contracts and
a different appearance. A static Sun map would lose the approved surface evolution.
The chosen adapter retains the procedural recipe under the existing scene owner.

## Risks

4K costs 144 MiB of intermediate textures before other scene allocations. Hardware
limits and framebuffer failure can prevent that option from rendering; the control
and status disclose fallback and permit 1K retry. The screen-space off-limb model
is illustrative and does not simulate a volumetric corona. Small projected views
cannot resolve all microtexture. Physical-mobile and sustained GPU performance
remain unqualified.

## Validation

Run `npm test`, `python tools/typecheck_web.py`, the Python test suite, static/UX/doc
contracts and the staged browser validation. `tools/sun_look_probe.mjs` is invoked
by the existing browser gate. Native qualification invokes that same probe with
all three resolutions; hosted software rendering verifies the default 1K path.
Keep actual GPU uniforms, captures, artifact identity and test logs as evidence.
The [review follow-up](../validation/sun-look-v2/review-20260926.md) records the
native Mars-to-Jupiter cancellation regression and remaining qualification limits.

## Documentation

README adds the approved 4K reference and control description. SPEC, STATUS,
REQUIREMENTS, requirements.json, VALIDATION_PLAN and the RFC index track this
candidate. The source record binds the preserved lab and PNG to exact hashes.
