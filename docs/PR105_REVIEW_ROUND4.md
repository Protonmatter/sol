# PR 105 fourth review correction evidence

Scope: three new comments on [PR 105](https://github.com/Protonmatter/sol/pull/105),
reviewed at `de42dfc41f56576739f0c5cdb43b715bb8cf70ac` on September 12, 2026 UTC.
All three were verified actionable. This supplements the
[third correction record](PR105_REVIEW_ROUND3.md); it does not supersede release holds.

## Existing contract and corrections

These are bounded corrections to existing SPEC/RFC 0002 requirements: render the
validated v3 observer, enforce current solar-anchor semantics, and admit attributable
coherent bundles. No new model, dependency, schema, transport operator, coverage floor,
production recipient or operational capability is introduced. RFC 0002 remains Accepted.

| Comment | Verified cause and correction | Regression evidence |
| --- | --- | --- |
| [3994886921, P1](https://github.com/Protonmatter/sol/pull/105#discussion_r3994886921) | Sky drawing used removed `observer.lat_deg`, producing nonfinite constellation and fixed-star path coordinates. It now uses the displayed v3 snapshot's `terrestrial_lat_deg`. | Actual controller/contract/worker client/catalogue projection tests record Canvas commands for finite constellation strokes and Sirius past/future paths, overlay toggles and retained-observer binding. |
| [3994886929, P1](https://github.com/Protonmatter/sol/pull/105#discussion_r3994886929) | All three snapshot validators admitted arbitrary in-range current longitudes. They now compare the anchor to the existing fixed differential-rotation law using circular distance and bounded precision. | Shared literal rotation/mutation cases and rehashed-bundle rejection; browser previous-publication retention, Python previous-pointer retention and native replay output preservation. |
| [3994886934, P2](https://github.com/Protonmatter/sol/pull/105#discussion_r3994886934) | Browser product attribution used ECMAScript trim rather than the frame rule. Native products also differed on control whitespace and Unicode lowercase. Each runtime now reuses its explicit attribution predicate for products and frames. | Hash-valid U+FEFF sources remain accepted without altering bytes; control-only and case-insensitive unknown sources reject. Local-pointer, release-bound and source/derived readers are covered. |

## Red/green evidence

Both new Sky rendering tests failed before the one-field correction with nonfinite
Canvas coordinates, then passed. They run the real drawing/projection/controller code
with a recorder at the Canvas host boundary, not a scientific-reference oracle.

Attribution tests reproduced two browser failures (rejection of U+FEFF attribution and
admission of U+001C-only attribution) and native admission of U+001C-only attribution.
The Python source/derived regression characterized the already-correct behavior before
the product check was consolidated onto the existing explicit predicate. All input
source text remains unchanged; the predicate is only an admission comparison.

Before longitude validation, a rehashed 30-degree mutation passed browser, Python and
native intake. The browser actually replaced its retained valid snapshot. Shared
contract tests likewise failed to reject inconsistent anchors. Corrected intake rejects
these candidates before replacing a display, pointer or replay output. The shared
18-case longitude corpus passes all three readers, as does actual native transport
and serialization at day 14 with seven nonintegral f32 birth coordinates. A fresh
native CLI day-14 snapshot with 25 regions also passes Python and browser intake.
The fixed tolerance and precision boundary are documented in
[solar v3 semantics](SOLAR_V3_MIGRATION.md).

Independent read-only review of the final code and tests found no actionable P0--P3
issues. The reviewer ran the relevant Node/Python suites and inspected native code;
the parent separately ran the complete Rust workspace tests.

## Local verification

Windows ARM64; Node 24.18.0, Python 3.14.3, Cargo 1.96.0, coverage.py 7.13.5;
existing locked tooling only. Hosted workflow/runtime results are recorded separately
in the PR and are not inferred from these local results.

| Command/check | Result |
| --- | --- |
| `npm test` | 360 passed. |
| `cargo test --workspace --locked --offline` | 171 unit/integration tests passed. |
| `cargo fmt --all -- --check` | Passed. |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings` | Passed. |
| Python provider/tool coverage commands from `coverage.yml` | 28 provider + 173 tool tests passed; 92% combined branch-enabled coverage over the unchanged 18-file scope. |
| `python tools/typecheck_web.py` | 67 files clean. |
| `python tools/validate_sdlc.py` | 16 requirements and RFC/workflow contracts pass. |
| `python tools/validate_ux_contract.py` and `python tools/validate_web_static.py` | Passed. |
| `python -m compileall -q` on changed Python modules/tests | Passed. |
| Unchanged Node 90/90/90 coverage gate | Failed: 79.91% lines / 80.78% branches / 71.18% functions, despite 360 passing tests. |

Both WASM engines were staged offline into `build/pr105-round4-wasm`; the staged
diagnostic release is `pr105-round4` under `build/pr105-round4-site`. Its manifest
SHA-256 is `29e82d280cda59d75a0428b32df1058c923ecb4d567905b409e0b4fbb25f5891`.
The recorded source SHA is pre-change lineage: this dirty-tree preview is not an
exact committed-source attestation. No production source changed after staging.

`python tools/browser_smoke.py --web-root build/pr105-round4-site` passed Sun, Sky
and interactive System. `node tools/experience_validation.mjs
--web-root=build/pr105-round4-site --out=coverage/pr105-round4-qa/run-1/experience`
passed on installed headless Chrome 151.0.7922.174 with SwiftShader and blocked
external requests. Diagnostics and screenshots remain ignored local evidence.
`node tools/sky_validation.mjs --web-root=build/pr105-round4-site
--out=coverage/pr105-round4-qa/run-1/sky` also passed actual worker, keyed focus,
privacy, explicit recovery, cancellation, share/reload and 1440/390/320-pixel reflow
checks with no uncaught page errors. Screenshot inspection confirmed visible
constellation geometry and readable selected facts in the sampled desktop/narrow
views. These are bounded sampled checks, not full accessibility conformance.
These checks do not establish deployed or scientific qualification.

## Remaining holds and rollback

The existing 90% JavaScript coverage floors remain unchanged. Full accessibility,
physical-device/browser scheduling, independent astronomical/solar accuracy, production
service-worker population transitions and release qualification are not claimed.
No live acquisition, merge or deployment was performed. Original immutable input bytes
are not repaired. Rollback is a reviewed revert commit; reverting reintroduces the
documented defects and does not authorize mutation of historical or selected bundles.
