# PR 107: scattering performance review remains open

Baseline: `069d0ba459b68b5f25815532e50997f7b029f0d1`.
Review comments: `4000658095` and `4001090421`.

The P1 finding is valid: cached density columns do not remove the remaining
scattering quadrature from every final surface and atmosphere-shell fragment.
This follow-up does not close that finding or change the production optical
implementation. The terrain-demand and star-selection corrections are separate.

## Experiment and decision

An unpublished candidate evaluated the original integrator in bounded,
camera-specific surface and limb fields while retaining full-resolution source
textures, terrain, incident refraction, shadows and column-based view transmission.
Its proposed limit was 65,536 integration evaluations per body per submission,
independent of framebuffer resolution, with at most two resident targets.

The candidate improved local submission timing but failed its independent
interpolation qualification. It is preserved in a detached local worktree at
`../sol-scattering-candidate-20260913`, with a hash-verified
23-file preservation receipt at
`build/pr107-review-069d0ba/scattering-candidate-preservation.json`.
It has not been committed, pushed, merged, or enabled by this follow-up.

The last staged candidate has manifest SHA-256
`b69f427b1e28234472273edac49771265fb398af613a7118252a85c876404ee0`.
The baseline revision identifies its starting point; this manifest and its asset
hashes identify the experimental bytes, which are not the published baseline.

## What the local evidence establishes

- The candidate-12 core gate retained all 1,171 original assertions and added 18
  actual-field material assertions: 1,189 passed. The original material oracle
  was reconstructed and verified byte-identical. This result does not qualify
  every point in the new scattering field.
- Candidate 13 passed six actual-globe raster admission checks: fit, close and
  oblique Earth views at DPR 1 and 2, with zero rejected or antialiased-invalid
  pixels. Corrections addressed the three-metre catalogue/profile radius offset,
  GPU ray construction and the distinction between a smooth radius and DEM relief.
  These were instrumented validity readbacks, not performance measurements.
- Candidate 13 still failed **368 of 5,592** domain-qualified queries. Remaining
  failures were Earth terminator 3, Earth elevated 61, Mars day 67, Mars terminator
  76, Mars forward scattering 71, Mars near-top camera 89, and Mars spherical 1.
  Every generated texel was finite and valid; that alone did not establish
  sufficiently accurate interpolation. Complete shell output was also compared.
- The interpolation limits were declared before measurement: per-channel linear
  scattering error at most `0.0002 + 0.01 * abs(reference)`, zero-reference leakage
  at most `1e-7`, and neutral-surface display error at most `2/255`. Original
  transmission and material tolerances were retained. These limits were not
  relaxed after failures.

The local receipts are retained under
`build/pr107-review-069d0ba/candidate12-core-a`,
`build/pr107-review-069d0ba/candidate13-raster-a`, and
`build/pr107-review-f50a575/candidate13-scattering-domain-full-a`.
They are local evidence, not hosted CI or native-device qualification.

## Required next work

A separate float64 diagnostic exposed approximately 4.49% error in the retained
12-node quadrature for two synthetic Mars endpoints 22.37 km below the optical
reference datum. This uses the shader's constant-below-datum density convention;
it is not a claim about observed underground atmospheric conditions or all
rendered Mars terrain. Adding analytical reference-ground crossings as integration
boundaries reduced the CPU discrepancy below `3.94e-7` in those two cases without
changing phase functions, density parameters or column fields. The production
integrator was not changed, and this correction has not passed a GPU gate.

Before another scattering-field implementation is admitted:

1. Specify and independently qualify signed terrain-endpoint integration,
   including ground crossings, shadow boundaries, convergence and a finite node
   bound. Preserve the existing reference assertions and add the missing cases.
2. Define interpolation coordinates that retain those integration boundaries.
   Larger tensor grids and a naive fixed-impact prototype did not resolve the
   measured errors; neither approach is approved by the current evidence.
3. Re-run the full interpolation, material and actual-raster gates against one
   immutable candidate, followed by the unchanged full application deadlines,
   context recovery, coverage and hosted checks. Offscreen prepasses or fallback
   rendering must not count as final physical Earth submissions.

The P1 remains unresolved. No release-readiness claim follows from this experiment.

## Status update, 2026-09-16

This assessment was written at baseline `069d0ba4` and its "Required next work" list is
now partly stale. Items 1 and 2 have been addressed for the production integrator, each
against the unchanged 5,592-query domain and with its own receipt: `2dfa790` splits the
integration at actual ground crossings, `d53272a` resolves the constant-below-datum
quadrature through an optical coordinate rather than more nodes, and `0ac2f6d` preserves
observer geometry near tangent endpoints. Item 3, one immutable candidate carried through
the full interpolation, material, raster and application gates, has not been done for any
scattering-field implementation.

The hosted deadline that the P1 predicted would fail no longer fails: `301821cf` and
`60cd859f` each completed all 20 hosted checks. That is recorded with its limits in the
[hosted follow-up](../2026-09-14-rendering-qualification/HOSTED_PERFORMANCE_FOLLOWUP.md).

The bounded-field candidate remains disqualified on its own evidence. The corrections above
are much narrower than its failure set — `d53272a` records seven underresolved terrain
queries against the candidate's 368 — so they do not explain those failures and do not
justify re-running it unchanged. The P1's underlying claim, that per-fragment scattering
cost scales with framebuffer resolution, is still true of the shipped renderer.

