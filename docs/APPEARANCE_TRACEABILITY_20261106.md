# Appearance implementation traceability — 2026-11-06

The seven illustrative planet looks, recovered Sites v7 Earth and approved Sun
have local implementations and automated verification. Their three registry
declarations now say `implemented`, following the explicit local definition in
[REQUIREMENTS](REQUIREMENTS.md). All 27 current requirements have that status.
The normative statements are unchanged. This corrects stale planning metadata;
it grants no production, scientific, device, hosted or served acceptance.
Illustrative Earth and every application, shader, texture and numerical input
remain unchanged in this pass.

RFCs [0007](rfcs/0007-illustrative-planet-looks.md),
[0009](rfcs/0009-sites-earth-v7.md) and
[0010](rfcs/0010-approved-sun-look.md) retain Draft decision states. The
[RFC process](rfcs/README.md) distinguishes decision and merged acceptance from
local implementation progress. No RFC approval or completion is inferred from
this registry correction.

## Statement-to-evidence audit

| Requirement and behavior | Implementation and automated proof | Retained rendering evidence and limits |
|---|---|---|
| `SOL-VIS-008`: fresh default; exactly seven supported maps; selectable Source-qualified; truthful attribution; separate physical and registered paths; bounded resources | `illustrativeAppearance.js` selects only the seven allowlisted bodies, checks byte/hash/dimension identity, and limits anchor-prioritized visible demand to two maps. `orrery.js` defaults to Illustrative and draws Venus's artistic shell separately from registered Magellan ground. `illustrativeAppearance`, `destinationCards` and `orreryIllustrativeLifecycle` tests cover exclusions, source disclosure, asset pins, malformed input, stale work, mode withdrawal, context-loss rejection, fallback and unchanged physical snapshots. The sampler-identity regression rejects cross-body texture reuse. | Current-source Linux browser capture submits Mercury's map and Venus's distinct shell/ground samplers with zero GL errors, pixel changes and unchanged Venus epoch/positions/camera. Earlier native resource and pending-decode studies independently join all seven actual samplers to pinned images, confirm the two-map bound and close stale bitmaps. Those studies retain their older stage identities. |
| `SOL-VIS-010`: Sites v7 July/display recipe; truthful layer dates; bounded resources; unchanged physical state; source/scientific options retained | `earthLook.js` pins the July 2004 map and exposure 1.6; cloud/shader modules retain artistic depth and 35% display drift. `earthLook`, `earthLookLifecycle`, `earthLookShaders`, `sites-earth-geometry` and `sites-cloud-volume` tests cover exact source bytes, registration/mask identity, density/lighting bounds, pause/suspension behavior, cloud controls, registered fallback, daily/ice/HDR selection, isolated shader failure/retry, context recovery and unchanged physical state. | Current-source Linux browser capture observes both Earth passes at exposure 1.6, cloud-off uniforms and changed pixels, unchanged epoch/positions/camera, and deletion of the two actually sampled surface/mask handles after Source-qualified. Native studies establish one surface plus one mask, active-context recovery and no obsolete upload after pending-decode restoration. These are artistic clouds and historical layers, not current weather or measured heights. |
| `SOL-VIS-011`: approved surface/wisps; 1K default and 2K/4K choices; optional prominences; preserved state/reference modes; bounded resources | `sunLook.js`, `sunLookRecipe.js`, `sunLookShaders.js`, `sunLookRenderer.js` and `orrery.js` retain the approved recipe, default 1024 target and disabled prominences. `sunLook` tests exercise all three target sizes, physical/camera/time invariance during quality changes, visible-mode behavior, allocation/device failures, explicit retry, partial cleanup, suspended demand and bounded pending programs. The mapped `sunContextMode` tests exercise retained AIA/visible selection and actual corresponding submissions. Three Python source checks reproduce the approved recipe, reject changed source and verify the recorded 4K README image. | Current-source Linux software browser establishes real 1K uniforms, pixels, optional prominence changes and Visible-mode withdrawal. The earlier native quality/resource cohort establishes actual 1024/2048/4096 targets, two sweeps and active-4K context recovery, with at most three target textures/framebuffers and 144 MiB nominal requested color storage. It does not qualify physical VRAM, all native devices or sustained mobile performance. |

The two-map planet budget is separate from Earth's one surface/one mask budget
and the Sun's target budget. API deletion or context invalidation is not proof of
immediate driver memory reclamation. Appearance controls preserve physical state
within the documented comparisons; mode-dependent Sun camera reframing remains
intentional. Arbitrary laboratory and application poses are not pixel-identical.

Detailed original studies are preserved in
[Earth/planet resources](APPEARANCE_RESOURCE_VALIDATION_20261106.md),
[pending-decode recovery](APPEARANCE_CONTEXT_VALIDATION_20261106.md),
[native Sun qualities/resources](SUN_QUALITY_RESOURCE_VALIDATION_20261106.md),
and [the Linux browser campaign](LINUX_BROWSER_VALIDATION_20261106.md).
They retain their individual source cohorts and failed attempts. This audit does
not relabel older experiments as new current-source executions.

## Current correspondence and focused checks

The existing `local-lgpl-20261106-02` stage at
`build/lgpl-component-20261106-01/site-final` retains manifest SHA-256
`4bbebdd5324bae5886933efb5cd09d4f4387e3d4afea0d4ae512f7f7ee41b41a`.
All 236 manifest assets match their recorded sizes and hashes, all 214 source
owners match current source bytes, and all 22 selected validation producers in
the retained Linux browser receipt match current tools. The retained browser
receipt binds that exact manifest; its Earth and planet results pass. Its Sun
capture contains the software profile's actual 1K target. A baseline Git SHA in
the manifest does not attest a clean or published working tree.

The fresh focused run passes **74 Node tests**, with zero failures, cancellations
or skips, across eleven appearance test files (72 in the first run and two additional Sun reference-mode tests). The approved-Sun Python source
suite passes **three tests**. The first Python invocation omitted the repository's
required `PYTHONPATH=tools` and failed to import the extractor; the corrected
child-only environment passes. Both logs remain retained, and no product source
was changed to accommodate the invocation mistake. All inventoried repository
source bytes remain identical across the initial focused tests; the additional Sun reference-mode run changes no source. Governance and documentation validators pass, as do 19 governance and five documentation regressions.

CI routing was checked from the current workflow files. The CI web job runs the
Node collection and Python discovery. The Coverage workflow's **JavaScript
coverage (Node + Chromium, >= 90%)** job runs `browser_validation.mjs`, which
invokes the Earth, planet and Sun probes against the staged artifact. That job is
now added to these three requirement records; workflows and gates are unchanged.
Its default software profile tests 1K Sun. Native 2K/4K evidence remains separately
identified. Standalone resource protocols are retained local experiments.

Raw source inventories, before-file snapshots, exact commands/logs, source and
asset joins, remote responses and final checks are retained under
`build/appearance-traceability-20261106-01/`. Public paths use their registry
mapping; the private audit scripts are evidence collectors, not product code.

## Remote readback and remaining acceptance

Read-only GitHub metadata confirms that [PR 115](https://github.com/Protonmatter/sol/pull/115)
was merged on September 26. The remote master is still
`3a55a795767f3043112673ea561cdaf6dc7e2d0f`, matching local HEAD. Its October 23
[CI](https://github.com/Protonmatter/sol/actions/runs/39911966685),
[Coverage](https://github.com/Protonmatter/sol/actions/runs/39911966592) and
[Docs](https://github.com/Protonmatter/sol/actions/runs/39911966581) push runs
completed successfully. Their green status applies to that base revision, not
the current dirty candidate. The PR body's older progress prose does not override
the current merged metadata or grant authority for new publication.

Current-source hosted CI and served readback, physical-device/browser coverage,
manual accessibility, broader operational/scientific acceptance and retrieval
of the separate existing Google Cloud result remain open. This audit changes
four documentation/traceability files only. No application, accuracy contract,
license, dependency, workflow, commit, push or deployment changes. Rollback is
limited to the three status/gate/date edits, the catalogue/status explanations
and this report; preserve all unrelated working changes and retained evidence.
