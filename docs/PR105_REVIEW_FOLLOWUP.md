# PR 105 review verification and corrections

Scope: seven review comments on [PR 105](https://github.com/Protonmatter/sol/pull/105),
verified against `cd79ab07efec4d7fae26614d26ada87750a22c11` on September 11, 2026.
All seven were actionable. This record describes local correction evidence, not
release qualification. Hosted results are recorded in the PR after publication.

## Contract and change boundaries

These corrections implement existing [RFC 0002](rfcs/0002-correctness-delivery-and-experience.md)
and [SPEC](SPEC.md) behavior: current v3 model anchors, attributable immutable inputs,
truthful failed/retained states, bounded request ownership, captured location/time
disclosure and usable recovery. Applicable requirements are `SOL-SCI-001`,
`SOL-DATA-001`, `SOL-UX-002`, `SOL-PRIV-001`, `SOL-TEST-001` and `SOL-REL-001`.
No schema, numerical model, dependency, coverage floor, production recipient or
deployment setting changed. RFC 0002 remains Accepted, not fully qualified.

## Comment-to-regression traceability

| Comment | Confirmed cause and correction | Regression |
| --- | --- | --- |
| [3993977000, P1](https://github.com/Protonmatter/sol/pull/105#discussion_r3993977000) | Both butterfly modes read a removed latitude field and placed all regions at zero. Both now use `regionAnchor`, including hemisphere colour and snapshot hit targets. | [Solar review tests](../tests/web/solar_review_regressions.test.mjs): schema-valid positive, negative and zero latitude; sparse series timing; no snapshot mutation. |
| [3993977005, P1](https://github.com/Protonmatter/sol/pull/105#discussion_r3993977005) | CLI discarded validated manifest attribution before source-less F10.7 selection. An attributed entry point carries it through while retaining the legacy API and rejecting explicit invalid sources. | [Ingest tests](../crates/solar-ingest/src/lib.rs), [CLI integration](../crates/solar-cli/tests/cli.rs) and [immutable fixture](../tests/fixtures/manifest-f107/current.json): actual ingest to assimilation, raw preservation and source precedence. |
| [3993977009, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3993977009) | A local simulation cleared the independent bundle error. Only successful bundle publication now clears it. | [Solar review tests](../tests/web/solar_review_regressions.test.mjs): initial/refresh failure, local solve, Latest, visible Retry and successful reload. |
| [3993977013, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3993977013) | Geolocation shared the render generation. Dedicated location ownership survives time refreshes and rejects obsolete success/error callbacks after new requests, manual input or leaving Sky. | [Sky review tests](../tests/web/sky_review_regressions.test.mjs): minute refresh, new request, manual coordinates, leave/re-entry. |
| [3994105523, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994105523) | Missing/rejected clipboard access had no recovery. Confirmed sharing now offers a labelled, selected, read-only manual-copy field, with cancellation and late-result ownership. | [Sky review tests](../tests/web/sky_review_regressions.test.mjs) and [browser flow](../tools/sky_validation.mjs): missing/rejected clipboard, precise captured values, 390px bounds, focus/selection and cancellation. |
| [3994105526, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994105526) | Retained GL/bodies caused metadata-only Retry after a hidden-canvas re-entry failure. Hidden fallback takes full entry; an entering guard coalesces reentrant handler calls before cancellation. | [Orrery review tests](../tests/web/orrery_review_regressions.test.mjs): repeated failure, visible repaint/single loop, paused recovery and metadata-only epoch preservation. |
| [3994105528, P1](https://github.com/Protonmatter/sol/pull/105#discussion_r3994105528) | Shares used expiring release URLs; additionally Chromium's root meta refresh discarded fragments. Shares now use the stamped stable base and the generated bootstrap explicitly forwards the fragment. | [Sky review tests](../tests/web/sky_review_regressions.test.mjs), [builder tests](../tests/python/test_release_artifact.py) and [browser flow](../tools/sky_validation.mjs): three deployment bases, actual generated script, current immutable namespace and observer/time roundtrip. |

## Red/green and independent review

Each reported root cause was reproduced before its production correction. The Sun
cases failed on equatorial coordinates or erased bundle errors. Sky cases failed on
discarded location results, missing copy recovery or expiring paths. The native CLI
case successfully ingested but omitted activity analysis; after correction it retains
the declared source and reaches actual `Assimilation` with expected activity 0.58.
The System case failed on a still-hidden canvas; corrected recovery repaints and
restarts one loop. The generated bootstrap failed for all three deployment bases,
and actual local Chromium independently demonstrated fragment loss before correction.

Independent read-only reviews covered ingestion, Sun/System lifecycle, and Sky/bootstrap
changes. A direct-handler System reentrancy probe was additionally guarded. Its normal
user reachability was not established because the first handler hides Retry; it is
boundary-injected robustness evidence, not a newly claimed user-visible P2.

## Local validation

The staged diagnostic artifact has release ID `pr105-comments-local`, base `/` and
manifest SHA-256 `79dadceea44fe2501411dbb3bd6d4097b4a30f0b39faccbeeddcb7ad6c060edd`.
Its source SHA identifies pre-change lineage only; this dirty-tree preview is not an
exact committed-source attestation. Existing installed tools and loopback fixtures
were used; no public data was acquired.

| Check | Observed result |
| --- | --- |
| `npm test` | 324 passed, including 21 new JS regressions. |
| `cargo test --workspace --locked --offline` | 148 passed, including four new ingestion/CLI regressions. |
| `cargo fmt --all -- --check` and workspace Clippy with `-D warnings` | Passed. |
| Python provider/tool coverage commands from `coverage.yml` | 28 provider and 157 tool tests passed; 92% combined branch-enabled coverage over the unchanged 18-file scope; XML emitted. |
| `python tools/typecheck_web.py` | 67 files clean. |
| SDLC, UX and static web validators | Passed; 16 requirements retained. |
| Fresh locked WASM and staged web builds | Passed. |
| `python tools/browser_smoke.py --web-root build/pr105-review-site` | Sun, Sky and interactive System passed. |
| `node tools/experience_validation.mjs --web-root=build/pr105-review-site --out=coverage/pr105-review-experience` | Passed real workers, functional/reflow, retained-state and System checks. |
| `node tools/sky_validation.mjs --web-root=build/pr105-review-site --out=coverage/pr105-review-sky` | Passed precise share capture, clipboard recovery, narrow layout and actual stable-root fragment/observer/time roundtrip. |
| Unchanged Node 90/90/90 gate | Failed: 79.34% lines, 79.44% branches, 70.42% functions. Functional tests pass; coverage qualification remains held. |

Browser screenshots and JSON diagnostics remain ignored local evidence under `coverage/`.
The manual-copy screenshot was inspected; selected text and controls fit at 390px.
Browser tests substitute clipboard permission outcomes and synthetic coordinates;
they do not qualify native OS prompts, physical devices or assistive technology.

## Publication and remaining holds

Commit and push only this correction set, then verify the exact PR head and hosted
jobs. Reply to each originating thread with the correction and evidence; do not treat
thread resolution as reviewer approval or a CI waiver. No merge or deployment is
authorized by these fixes. To undo a correction, use a reviewed revert commit rather
than rewriting branch history; reverting can reintroduce its documented defect.

The JavaScript coverage gate and broader manual/scientific/platform/release holds
remain open. Local browser navigation does not demonstrate a future production
deployment transition or service-worker/cache qualification on every device.
