# Profiled Optical Programs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Review the implementation independently before claiming completion. Do not commit or push.

**Goal:** Make native Earth/Mars optical program startup reliable while preserving the qualified formulas, source identity and resource limits.

**Architecture:** Compile immutable Earth/Mars variants of the existing three physical programs by resolving only the known equal-scale-height predicate. Keep the original generic shaders as numerical references. Cache at most six physical programs with body-specific identities, and retain two independent one-target scattering owners under the existing total two-target budget.

**Tech Stack:** Native ES modules, WebGL2, existing shader manager and validation tooling. No new dependencies or external requests.

**Spec:** `docs/rfcs/0005-physical-rendering.md`, `docs/VALIDATION_PLAN.md`, `docs/ACCURACY_CONTRACT.md`; requirements `SOL-VIS-006`, `SOL-TEST-001`, `SOL-COV-001`, `SOL-UX-003`.

## Evidence motivating the change

The unchanged staged native app kept polling with a maximum 237 ms gap while visible. Its physical sphere completed after 39.6 s; the generator remained incomplete after 45 s, exceeding the unchanged 30 s production deadline. A dynamic 12-node loop bound did not help (40.6 s versus 36.5 s original); removing unreachable helpers alone gave 27.3 s.

Compile-only full-app overrides resolving the profile predicate retained all numerical formulas and made every program ready within its existing deadline. Earth sphere/shell/generator took 2.7/1.3/10.5 s; Mars took 12.6/5.3/27.7 s in the observed runs. These experiments motivate implementation but do not qualify numerical equivalence or repeatability.

## Global Constraints

- Retain every quadrature node, grid dimension, physical coefficient, acceptance tolerance and existing deadline.
- Resolve the predicate from the actual admitted immutable profile, with binary32 comparison matching uploaded uniform values.
- Unsupported profiles/keys fail before requesting or binding a shader.
- No shader compiled for one profile may generate or consume another profile's field.
- Keep total scattering ownership at two groups and 65,536 evaluations / 1,048,576 bytes per group; each body owner has capacity one.
- Keep source-bound stale-frame, generation, program, uniform, texture and context-loss checks.
- Preserve last-valid engine epoch/positions, fallback, explicit retry and cancellation behavior.
- Generic source exports remain unchanged as independent implementation references.
- No commit, push, dependency addition, external request or deployment.

## Review Focus

1. Earth/Mars focus changes while either program set is still compiling.
2. Both body sets ready and drawn in the same frame, including queued atmosphere draws.
3. Context loss, cancellation, retry and re-entry without reusing invalid resources.
4. A mutated or unsupported profile reaching a specialized source or target owner.
5. Optimized-out uniforms and exact source matching in the real draw evidence probes.

## Task 1: Source specialization and bounded ownership

Files: create `apps/web/js/physicalProgramSources.js`, `apps/web/js/profiledScatteringTargets.js`, and their `tests/web/*.test.mjs` tests.

- [x] Write failing tests for exact predicate-only substitutions, binary32 mode selection, immutable per-body keys, unsupported inputs and unchanged generic reference source.
- [x] Write failing tests for body dispatch, two one-target owners, frame invalidation, missing owners, retry, cancellation and disposal.
- [x] Implement the smallest pure source/key helper and bounded owner adapter.
- [x] Run focused tests and type checks.

## Task 2: Integrate the renderer and source evidence

Files: modify `apps/web/js/orrery.js`, `tools/physical_spin_probe.mjs`, `tools/scattering_producer_probe.mjs`, and affected renderer lifecycle tests.

- [x] Add regression coverage for switching from pending Earth to Mars and back, both ready sets, wrong-body rejection, context restoration and explicit retry.
- [x] Request role/body-specific program keys under a bounded manager capacity of 13 (six base, six physical, one Earth-look program; context ledger limit remains 32).
- [x] Bind local per-body program/uniform records so queued draws cannot read a later body's aliases.
- [x] Give each body one existing `createScatteringTargets` instance; keep its current owner proof unchanged.
- [x] Keep presentation status keyed to the actual optical subject, and update per-body linear-output uniforms explicitly.
- [x] Update actual draw probes to require the matching specialized source and profile, without relaxing source/texture/uniform gates.
- [x] Run focused renderer and probe tests, then the full Node suite and typecheck.

## Task 3: Numerical and native qualification

Files: extend the existing scattering validation/fixture tooling with an explicit profile-specialized mode; update readiness evidence and status docs.

- [x] Compare specialized source outputs with the unchanged generic numerical references using the original acceptance thresholds and complete Earth/Mars case population.
- [x] Stage fresh WASM/web bytes and run the existing browser suite.
- [x] Complete repeated native physical runs including context loss, Moon/Mars level-4 terrain, Mars optical animation and HDR final draws.
- [x] Run coverage, governance, documentation and diff checks appropriate to the final source tree.
- [x] Obtain independent review of source/profile ownership and resource limits; fix actionable findings.
- [x] Record exact artifact hashes, commands, outcomes and remaining limits. Keep readiness held if native or numerical qualification fails.

## Rollback

Reverse only the reviewed source-specialization/renderer/tooling hunks and their tests/docs. Preserve the earlier moon-time and framing fixes and all generated reference assets. No production release is changed by this local work.

## Execution rulings

- Ruling: retain two existing program-bound target owners at capacity one each — this preserves the underlying program identity proof and the total two-target resource budget without broadening that API.
- Ruling: isolate profile failures instead of cancelling all physical jobs — an older Earth timeout must neither cancel Mars nor renew its original deadline; the timed lifecycle regression passes.
- Ruling: repair the stale numerical fixture's missing packed optical companion and unit budget — the failed GL run could not qualify the new source, and the fix retains the original science formulas and tolerances.
- Ruling: use `Object.is` for same-serial epoch identity — this matches the existing owner, including signed zero. A failing-then-passing regression and independent follow-up review cover the correction. Restage the final adapter bytes and retain earlier artifact results separately.
