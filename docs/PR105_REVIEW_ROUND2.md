# PR 105 second review correction evidence

Scope: five new comments on [PR 105](https://github.com/Protonmatter/sol/pull/105),
reviewed at `50d9f48989fe4b3ff0cb39c5bcb5e4d40b23f0fd` on September 11--12, 2026.
All five were actionable. This supplements, rather than replaces, the
[first correction record](PR105_REVIEW_FOLLOWUP.md).

## Contract and scope

These changes implement existing RFC 0002 and SPEC requirements for attributable
immutable evidence, coherent bundle publication, truthful source captions, stable
captured Sky links and session-only recipient consent. No schema, numerical model,
dependency, coverage floor or production recipient changes. RFC 0002 remains Accepted;
comment resolution, a successful local build and hosted CI are not release qualification.

| Comment | Verified cause and correction | Regression evidence |
| --- | --- | --- |
| [3994374226, P1](https://github.com/Protonmatter/sol/pull/105#discussion_r3994374226) | Python bundle candidates lost manifest source, so a source-less F10.7 row affected activity but was absent from embedded evidence. Manifest provenance now fills only an absent row source; raw rows remain unchanged. | [Daily derivation tests](../tests/python/test_bundle_observation_provenance.py): actual immutable source and derived bundles, activity 0.5, three attached frames, explicit row precedence and invalid attribution. |
| [3994374228, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994374228) | Accepted offline updates navigated to the base without the current fragment. Activation now carries the activation-time hash through the stable root. | [Release client tests](../tests/web/releaseClient.test.mjs): actual client and service-worker code, root/project/nested paths, hash changes while activation is pending, no navigation on unsolicited controller changes. |
| [3994374230, P1](https://github.com/Protonmatter/sol/pull/105#discussion_r3994374230) | Valid component hashes did not establish snapshot/report agreement. Python, browser and CLI now reconcile the entire embedded report projection and top-level context before acceptance. | [Python bundles](../tests/python/test_data_bundles.py), [browser bundle/publication](../tests/web/dataBundle.test.mjs) and [native intake](../crates/solar-cli/src/bundle_intake.rs): rehashed frame, ordering, source, mode, metadata, context and type mismatches; retained pointer/store/CLI output; valid current fixtures. |
| [3994374231, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994374231) | Latest reused a ready observed image without refreshing its synthetic caption. The existing caption updater now runs after actual disk rendering. | [Wavelength tests](../tests/web/wavelength_review_regressions.test.mjs): real image cache, timeline, renderer and caption with canvas/image/worker boundaries controlled; cycle/local transitions, delayed image completion, reselection, pending and failed images. |
| [3994374233, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994374233) | Provider preference was written but not restored. Only exact local/server preferences are restored independently of observer parsing. | [Sky regressions](../tests/web/sky_review_regressions.test.mjs): zero pre-consent transmissions, one request after Allow, fresh permission after reload, Deny persists local, malformed observer and invalid preference. |

## Red/green and independent review

Before correction, Python lost the manifest source and attached four classes of invalid
source values. The three activation paths lost their fragments, two preference cases
reverted to local, and six of eight caption tests failed. Python admitted all six
rehashed mismatched reports plus an independent top-context mismatch. The actual
browser reader accepted conflicting evidence; native replay also wrote that mixed
bundle to output. These cases pass with the corrections.

Independent reviews covered the UI changes and all three bundle-reader paths. They
found two additional parity defects, both reproduced and corrected before publication:
runtime-specific whitespace trimming and oversized integer rounding. The shared
projection/admission policy is explicit in [transactional feed](TRANSACTIONAL_FEED.md).
Ten independent serialized-input probes each passed through the Python and browser
readers, including safe numeric bounds, equivalent numeric spellings, strict booleans,
oversized numeric rejection and preservation of large numeric strings.

## Local verification

Final source tests were run after the production corrections:

| Command/check | Result |
| --- | --- |
| `npm test` | 343 passed, including 19 new JavaScript tests in this round. |
| `cargo test --workspace --locked --offline` | 165 passed across all unit and integration targets, including 9 new native bundle tests. |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | Passed. |
| `cargo fmt --all -- --check` | Passed. |
| Python provider/tool coverage commands from `coverage.yml` | 28 provider and 166 tool tests passed; 92% combined branch-enabled coverage over the unchanged 18-file scope. |
| `python tools/typecheck_web.py` | 67 files clean. |
| `python tools/validate_sdlc.py` | 16 requirements and RFC/workflow contracts pass. |
| `python tools/validate_ux_contract.py` and `python tools/validate_web_static.py` | Passed. |
| `python -m compileall -q` on changed Python modules/tests | Passed. |
| Unchanged Node 90/90/90 coverage gate | Failed: 79.81% lines, 79.87% branches, 70.81% functions, despite 343 passing tests. |

The final staged diagnostic release is `pr105-new-comments-final`; manifest SHA-256
`91efe9bfcf28b91b31e9a26d06efaf1fa706b0bf478a39ccc20cbacd9883b90d`.
Its source SHA records pre-change lineage only: this dirty-tree preview is not an exact
committed-source attestation. WASM was built offline with the locked toolchain.
Browser diagnostics remain ignored under `coverage/pr105-new-comments-qa/`.

The first parallel browser smoke attempt timed out during navigation with a local
connection-abort diagnostic. An isolated rerun against exactly the same staged bytes
passed Sun, Sky and interactive System. The first experience run reported a System
moon-label clearance failure; it is retained as failed evidence, not erased by retries.
Unchanged experience harness runs then passed separately against the prior baseline
and current final artifact. The current Sky harness also passed with zero page errors,
one intentional loopback mock-provider request and zero redirect-destination requests.
No System/label/CSS code changed. The harness advances time through real animation
frames and compares fractional DOM rectangles against integer layout measurements;
this is a plausible existing instability, not a reconstruction of the unsaved failed
pair. Passing reruns do not establish deterministic label clearance. Current hosted
checks are recorded in the PR after publication.

## Remaining holds and rollback

JavaScript coverage remains below the unchanged required floors. Full assistive-
technology, native permission-dialog, physical-device, production service-worker
transition and scientific/platform qualification remain unclaimed. Controlled Node
service-worker tests establish client navigation behavior, not a deployed update.

Previously hash-valid but semantically mixed bundles and compared oversized numeric
metadata are now intentionally rejected. Raw source evidence is retained without
coercion. To roll back, use a reviewed revert commit; do not rewrite branch history
or mutate immutable bundles to make their hashes pass. Reverting can reintroduce the
documented defects. No merge or deployment is part of this correction round.
