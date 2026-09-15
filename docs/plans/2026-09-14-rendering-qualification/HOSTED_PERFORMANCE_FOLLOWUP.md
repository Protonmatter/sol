# Hosted default-path performance follow-up

Status: performance P1 open. The finite current-host passes in the
[final application record](RUNTIME_FINAL_QUALIFICATION.md) remain valid for their
recorded configurations; they do not qualify the failing hosted backend.

## Published source and retained failures

PR head `89e1e28b226fa7346eaa53ecfa0d404dcbc37124` was tested through GitHub's
merge commit `a9dfadc36fd0afa14f494b1be5e4028fab072df9`, whose other parent is
master `841ba94eabe588f745625a995d20bf6c79ac97f3`. The complete production tree,
browser validator, Earth probe, release builder and coverage workflow are identical
between the head and merge commit. The merge provenance is not a rendering change.

Both [Coverage](https://github.com/Protonmatter/sol/actions/runs/34833369781) and
[CI's coverage job](https://github.com/Protonmatter/sol/actions/runs/34833369932)
fail the original Earth submission gate with one accepted final draw instead of
the required three in five seconds. The dependent Release gate also fails.
[Raw artifact identities and compact observations](HOSTED_PERFORMANCE_FAILURE.json)
retain each failed result, file hashes, launch source, backend and timing.

The observed backend is Chrome 152.0.7977.82, ANGLE Vulkan SwiftShader Subzero,
with a 732 by 612 antialiased default framebuffer. Earth optics and every program
are ready; animation, context and page visibility are healthy. HDR is disabled.
Each run records three complete frames, approximately 3.25 seconds apart, with
108 submitted indexed draws and 60 array draws. The probe correctly rejects the
later draws after its five-second deadline; no GPU mismatch, late readback,
physical rejection or frozen epoch explains the failure. A delayed JavaScript
timer does not extend the admission window.

## Diagnostic boundary

The passing local captures used Chrome 151.0.7922.174 and SwiftShader LLVM 10.0.0
or native Adreno. Local and hosted validator/probe sources are semantically
identical; both run precise page and worker coverage. Their configurations,
browser backends and host resources must still be qualified separately.

A matched local default-SDR replay also passes the original application gate:
four final Earth draws in 1,494.8 ms and four additional physically verified draws
in 1,411.1 ms. This isolates SDR as insufficient by itself to explain the hosted
slowdown. The replay is an additional finite observation; it does not override
either hosted failure or establish stable performance distributions.

An exact Chrome 152.0.7977.82 local replay observes Subzero and accepts four
original draws in 3,865.8 ms, but fails the additional preparation budget. The
additional observer begins at 136,775.8 ms against the original absolute deadline
of 108,954.8 ms and immediately rejects it without inspecting a physical draw.
This is late proof preparation, not an observed physical compilation failure.
The downloaded test browser is AMD64 on ARM64 Windows; architecture/emulation and
host resources prevent treating its timing as hosted throughput parity.

The [backend comparison](BACKEND_RENDERING_COMPARISON.json) records these runs,
source/tool reconciliation, PE architectures and original evidence identities.
Its immutable local capture SHA-256 is
`fb6b20c53549a3d6da80b0e8bb32120bf47be2d9a9d7278e1fa44ad3da63d173`;
the published copy is canonical UTF-8 JSON, SHA-256
`afd73eaf507ccb3224f3aa82c501ba8e30322920f7405ae1f402b55c5ffc1bcb`,
with identical parsed values. No local
attempt was overwritten or promoted from failed to passed.

## Completed diagnostic checkpoint

Head `02cd6c63e0cc842eaca7bc518992156cd380c7e3` completed with 17 checks passing
and three failing: both Chromium coverage jobs and the dependent Release gate.
Its tested merge is `2b0d945e0df78f5ac066aa7e23557853ecc51353`. The production
tree, validator, Earth probe, diagnostic helper, builder and coverage workflow
match that head exactly. The original application failures remain authoritative.

The [Coverage run](https://github.com/Protonmatter/sol/actions/runs/34836083732)
accepted two Earth draws, at 2,322.7 and 4,673.6 ms, against the unchanged
three-draw, five-second gate. Its later diagnostic captured two frames with all
112 timer queries completed, none pending, no disjoint event and no errors.
The observed Chrome 152/Subzero backend retained enabled physical optics,
128 by 193 by 1 surface fields, 128 by 64 limb fields and a 732 by 612 default
SDR framebuffer. The linked physical fragment hashes match the prior capture.

| Measured pass | First frame, ms | Second frame, ms | Mean, ms |
| --- | ---: | ---: | ---: |
| Surface field generator | 79.540 | 76.430 | 77.985 |
| Limb field generator | 19.696 | 19.554 | 19.625 |
| Physical surface consumer | 1,905.017 | 1,897.563 | 1,901.290 |
| Physical atmosphere shell | 235.284 | 222.317 | 228.800 |

These software-renderer timer observations identify the surface consumer as the
largest measured pass. They cover two diagnostic frames, not a stable latency
distribution or the exact earlier gate samples. CPU `getParameter` elapsed time
was 4,604.8 ms across 48 calls; synchronization can overlap timed rendering, so
those waits must not be added to GPU timer durations.

The [CI coverage run](https://github.com/Protonmatter/sol/actions/runs/34836083381)
accepted one original Earth draw. Its separate diagnostic exhausted the bounded
25-second outer budget and produced no pass timings. That timeout is retained;
the successful diagnostic from the other job does not replace it.

The [compact checkpoint](HOSTED_FRAME_COST_CHECKPOINT.json) records both failures,
raw file hashes, GitHub artifact identities, exact limits and measured draw groups.
No tolerance, timeout, source image, terrain detail or resource gate was weakened.

## Isolated next candidate

Commit `64cbce58a7bbf02ca3a56847dc8da64de923514f` remains only in the local
`codex/sol-single-layer-candidate-20260914` branch. It is not admitted into PR 107.
For the depth-one surface field, the candidate reuses the first interpolated
height plane rather than fetching four identical clamped planes. The proposed
change reduces 64 reads to 16 in that case while retaining the final interpolation
arithmetic, alpha/nonpositive fallback and original multi-height paths.

Seven focused source-execution tests pass, and independent source review found
no blocker. Those checks do not prove GPU compiler equivalence or measured speed.
No candidate GPU run was started during the final checkpoint.

Before admission, qualify the complete 7,192-query corpus on both native and
software backends, including the independent 1,600-query physical-source joins.
Then run the original application, material/composition and held-field controls,
terrain/animation/HDR configurations, actual native observations and exact-head
hosted checks. Retain the 30-second program owner, 75-second System readiness,
three-draw/five-second Earth and 240-second Mars application limits. The current
60-node integration bound remains unchanged. Temporal reconstruction and the
separate reflection, ring and moon-photometry source holds remain in effect.

## Bit-identical physical surface candidate (2026-09-15)

A local candidate on top of `063c354` reduces work in the physical Earth surface
consumer without changing its output. It is not yet admitted or pushed. It keeps
three source changes; the pinned solver sources are unchanged:

1. `scatteringResidual` records the first invalid or zero-source knot and calls
   `scatteringResidualLinear` once after the stencil loops. The first-event order
   of the former early returns is unchanged.
2. The physical consumer folds `u_atmosphereEnabled` in its decode, fallback-shade
   and surface-transfer branches (`physicalEnabledSource` in `orreryShaders.js`).
   The discard guard still reads the flag. Refraction and the display-limb block
   stay live, so every uniform the physical draw probes read remains active.
3. `referenceGrid(p)` computes the registered source-grid coordinate and latitude
   once per fragment for every layer lookup and coverage test.

| Local qualification | Baseline `063c354` | Candidate |
| --- | --- | --- |
| Scattering corpus, SwiftShader and native Adreno | 7,192 samples each | Bit-identical measured values |
| Atmosphere gate, SwiftShader | 1,280/1,280 | Every check value identical |
| Physical material validation, SwiftShader | 266/266 | Every check value identical |
| Physical rendering captures | 19 checks, 20 captures | 19/19, all canvas hashes identical |
| Terrain close detail and Mars optical animation | 22 checks | 22/22, all canvas hashes identical |
| Browser gate with `--physical-spin=true` | Passed | Passed |
| Planet appearance GPU gate | 110/110 | 110/110 |
| Node suite with coverage | Passed | 1,278/1,278 |

Local SwiftShader LLVM timer queries attribute the physical surface consumer at
52.8 to 68.0 ms per frame across eight baseline runs (mean 58.7 ms) and 43.6 and
45.1 ms across the final candidate runs (mean 44.4 ms). These are local software
timings, not hosted Subzero timings, and they do not show that the hosted
three-draw, five-second Earth gate now passes. Only an exact-head hosted run can.

Three variants were rejected:

- Folding `u_atmosphereRefractionEnabled` as well changed 127 of 266 physical
  material checks. Material qualification deliberately runs the consumer with
  refraction off.
- Folding the display-limb block removed the only uses of `u_cam`, `u_atmo` and
  `u_atmoStr`. The compiler stripped them, so the physical spin probe rejected
  every draw and the Mars optical animation gate recorded no final draws.
- Sharing one cached column ray between the scattering weight and the view
  transmission changed 97 native corpus samples, with a maximum relative
  difference of 1.5e-3 in scattering, and gave no measurable saving.

Some checks could not be compared. The native atmosphere gate reached its
protocol timeout, and native physical material validation exceeded its 30-second
shader limit, on baseline and candidate alike, before any checks ran. The
1,600-query physical-source comparison stops at input admission on both, and the
candidate supplies identical corpus inputs. None of those limits was changed.

## Review fixes at round close

The final application checkpoint adds three independently reviewed lifecycle
corrections: [explicit failed-preview recovery](DETAIL_PREVIEW_RECOVERY.md),
[preserved anchor atmosphere demand](OPTICAL_SELECTION_RECOVERY.md), and
[retained HDR presentation failure status](HDR_PRESENTATION_FAILURE_STATUS.md).
They do not alter the integrator, interpolation shader, imagery or engine state.
The prior exact-source GPU records remain scoped to their recorded builds; they
are not new final-checkpoint GPU runs.

Combined local validation passes 1,246 Node tests with 98.12% line, 91.16% branch
and 95.47% function coverage, preserving every original 90% floor. The 110-file
typecheck, UX contract, 23-requirement SDLC check, 138 Markdown files and diff
checks pass. No full GPU qualification was rerun for these final lifecycle fixes.
The completed 17-pass/three-failure hosted results above belong to `02cd6c6`;
publication of later fixes requires separately identified hosted results.
