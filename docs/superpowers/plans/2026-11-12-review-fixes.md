# PR 137/138 review fixes implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Resolve the three reproduced P2 findings before release.
**Architecture:** Share butterfly plot geometry; keep recovery under loader cancellation/deadline ownership; generate static module dependencies for source and bundled releases and probe the requested closure before reload.
**Tech Stack:** Existing JavaScript, TypeScript parser, Node tests, Chromium.
**Spec:** The three review findings and user's instruction to resolve them and review again.

## Global constraints

Keep canonical module identities, no dependency additions, no merge or deployment.
Changes target the six-fix head of PR 138 so they also cover PR 137 when integrated.

## Review focus

- DPR 1/2 and backing-store width caps: click the plotted frame.
- Navigation, hidden page, timeout before timer delivery: stale recovery never reloads.
- Broken body transfer: headers alone do not prove reachability.
- Cyclic/reexported dependencies: probe once, exclude deferred catalogues.
- Missing or invalid inventory: retain current document, do not guess.

## Tasks

- [x] Chart: add renderer/click integration regression, observe failure, share plot geometry, verify.
- [x] Recovery ownership: add cancellation and deadline regressions, observe failure, pass AbortSignal and current-attempt predicate to recovery, verify.
- [x] Dependencies: add transitive-failure and graph-generation regressions, observe failure, emit source/bundle inventory and probe full static closure/body, verify.
- [x] Run full JS suite, relevant Python build tests, typecheck, graph/docs checks and Chromium recovery regression.
- [x] Fresh whole-change review; resolve important findings with regression tests; record limitations and deliver branch.

## Verification record

- Regression failures observed before implementation: DPR 2 click selected frame 2 instead of 0; recovery reloaded after cancellation and both timeout paths; missing shared chunk and failed response body still reloaded.
- Final JavaScript suite: 2,297 passed, zero failed.
- Python: 48 release-artifact, 6 web-bundling, 13 startup-contract tests passed.
- Typecheck: 152 files; source graphs, SDLC, docs, UX and static checks passed.
- Chromium compiled-bundle check: shared chunk HTTP 503 retains document; restoring chunk permits view import; fresh document import succeeds.
- Fresh independent review: no actionable findings; additional all-frame click checks covered DPR, capped widths, and fractional sizes.
- CI follow-up: fixed the visual driver's resolution selection. Auto legitimately reduced backing resolution under coverage overhead, violating the driver's full-resolution screenshot contract. Visual comparisons now select High explicitly; all 33 canvas-capture and render-quality unit/integration tests passed, including Auto adaptation and deterministic manual mode. The parallel CI browser run also passed the original visual gate, confirming the timing-dependent trigger.
- Limits: no physical-device/native-GPU checks, no local Rust toolchain, no full WASM release rebuild. The patch changes JavaScript and its bundle tooling only.
