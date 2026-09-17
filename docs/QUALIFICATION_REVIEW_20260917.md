# Qualification review — 2026-09-17

Verdict: **HOLD**. This is an evidence review, not maintainer acceptance or deployment authorization.

Candidate: `9b262f1cf9b95b337de29f2a9208393780b6429f`. [CI run 35172957778](https://github.com/Protonmatter/sol/actions/runs/35172957778), attempt 1, artifact `10476759922`. Manifest SHA256: `88314b2d0174a26e3df3bbd7fab91e0378b87be7b6a1d0f3bfa8ade8c15e83b3`.

## Evidence and boundaries

All 16 authoritative CI jobs matched the candidate and passed. Retained logs record 191 Rust workspace tests, 1,290 JavaScript tests, 385 Python tooling tests and 20 standalone provider tests. Scoped line coverage was Rust 95.730%, Python 93.452% and web 97.171%. Full artifact hashes and rich release evidence were validated locally.

[Fresh native reference run 35281505640](https://github.com/Protonmatter/sol/actions/runs/35281505640) passed 36 comparisons (four site/instant pairs on 2026-07-01 times nine bodies) plus eight syzygy comparisons. This does not qualify browser WASM, all ranges/event quantities or continuous-epoch accuracy. Hosted browser evidence uses SwiftShader, not physical-device qualification. The npm-only audit reported zero known advisories; EOP margin was about 287 days when checked.

The complete local review packet retains raw metadata/logs/visuals, independent reviews and a 300-file hash index. Those downloaded artifacts are not committed here. GitHub artifact retention is finite; the captured web-artifact expiry was 2026-12-16T02:03:54Z. This source-controlled handoff retains the case verdicts and public run links.

## Review findings

- P1: policy/settings acceptance and accepted qualification records are absent. The included configuration files are unaccepted proposals.
- P1: candidate platforms contain only `chromium-linux-ci`, which cannot honestly represent required NVDA/Edge, VoiceOver/Safari and physical-device qualification. A reviewed metadata/policy correction and new bound candidate are required.
- P1: branch protection requires four checks, not Release gate; branch required approvals are zero; Pages has no required reviewer and permits administrator bypass. Observed allowed deployment branches are master and redesign/web-v0.2. No settings were changed.
- P1: participant/accessibility/device performance, historical migration, feed publication and compatible rollback evidence remain incomplete.
- P1: all 188 unknown-classified source paths were inventoried; 10 received full changed-hunk/implementation review, four targeted review and 174 structural classification. The other 500 changed paths were outside that subreview. This is not a full semantic audit or protected maintainer acceptance.
- P2: reviewed case/kind/quantity/epoch scope is missing; coefficient regeneration inputs remain incomplete; required Pester 5.8 was unavailable locally.

## Case disposition

All 57 items are accounted for: 46 partial and 11 blocked, none accepted. Partial means supporting evidence exists but the complete acceptance predicate is not established. Blocked identifies a concrete missing prerequisite. Historical F severities are not automatically current code defects.

| Case | Verdict | Remaining qualification |
|---|---|---|
| AC-01 | partial | Exactly-once and partition tests pass; independent scientific acceptance remains unrecorded. |
| AC-02 | partial | Cross-language malformed-input suites pass; no protected acceptance record. |
| AC-03 | partial | Replay and atomic replacement regressions pass; no protected acceptance record. |
| AC-04 | partial | Scalar uncertainty contract is tested, not empirical covariance calibration. |
| AC-05 | partial | Coordinate/anchor regressions pass; independent geometry acceptance remains open. |
| AC-06 | partial | Registration admission is tested; no new observational registration qualification. |
| AC-07 | partial | Range contracts pass; the fresh four-site reference compares pointing/DUT1, not every required range quantity. |
| AC-08 | partial | Boundary tests pass; four-site July pointing checks do not independently qualify all event times. |
| AC-09 | partial | Pole/finite geometry unit evidence exists; no independent polar reference acceptance. |
| AC-10 | partial | Historical-calendar provider regressions exist; fresh live 1500/1582 calendar evidence is absent. |
| AC-11 | partial | Disclosure regressions and July reference samples exist; no broad continuous-epoch bound is claimed. |
| AC-12 | partial | Series-gap regressions pass; full user task acceptance is unrecorded. |
| AC-13 | partial | Presentation revision tests pass; participant interpretation study is pending. |
| AC-14 | partial | Confidence encoding is tested; manual legend/meaning acceptance is pending. |
| AC-15 | partial | Hosted browser/reflow evidence exists; physical touch and complete manual navigation qualification are pending. |
| AC-16 | partial | Sun source/model workflows have automated evidence; five-participant task study is pending. |
| AC-17 | partial | Sky horizon/privacy/provider contracts pass; full manual task and independent event interpretation remain open. |
| AC-18 | partial | System render-time and visual checks pass; complete manual task/physical-device acceptance is pending. |
| AC-19 | partial | Focus-stability tests pass; actual assistive-technology announcement audit is pending. |
| AC-20 | blocked | NVDA/Edge, VoiceOver/Safari, touch, zoom and full scoped WCAG task audit are not recorded. |
| AC-21 | partial | Automated privacy/consent contracts pass; complete manual recipient/revoke/share task ledger is pending. |
| AC-22 | partial | Failure and context-recovery browser evidence passes; complete target-device recovery qualification is pending. |
| AC-23 | partial | Worker/cancellation/admission tests pass; controlled physical-device load profile is pending. |
| AC-24 | blocked | CI used SwiftShader with memory_requested=false; it is not the required controlled physical-device performance profile. |
| AC-25 | blocked | Unit/cache evidence exists; actual historical v2-to-v3 population and corrected compatible A-to-B-to-A drill are absent. |
| AC-26 | blocked | All 16 authoritative jobs match; settings and protected qualification prevent promotion. |
| AC-27 | blocked | Daily run validates a candidate only; no complete approved PR-to-served publication rehearsal. |
| AC-28 | partial | Transactional bundle/failure regressions pass; hosted publication lifecycle is separate. |
| AC-29 | partial | Cross-OS engine determinism passes; it does not substitute for all coefficient/asset regeneration provenance. |
| AC-30 | partial | Rust/Python/web line gates and separate Node gates pass with retained denominator evidence; maintainer acceptance is pending. |
| AC-31 | partial | Fresh npm audit has zero advisories; package/crate authority and complete source/dependency review remain separate. |
| AC-32 | blocked | Parser checks pass; required Pester 5.8 is unavailable locally (only 3.4.0 found), so mock-runtime qualification is not rerun. |
| AC-33 | blocked | Asset identity checks pass; coefficient provenance documents missing upstream inputs and non-regenerability. |
| AC-34 | partial | Documentation validation passes; historical status prose and final released-site correspondence require review. |
| AC-35 | blocked | No promotion, current-candidate served proof, accepted predecessor or compatible production rollback drill. |
| F01 | partial | Exactly-once and partition tests pass; independent scientific acceptance remains unrecorded. |
| F02 | blocked | Unit/cache evidence exists; actual historical v2-to-v3 population and corrected compatible A-to-B-to-A drill are absent. |
| F03 | partial | Coordinate/anchor regressions pass; independent geometry acceptance remains open. Registration admission is tested; no new observational registration qualification. |
| F04 | partial | Confidence encoding is tested; manual legend/meaning acceptance is pending. |
| F05 | partial | Presentation revision tests pass; participant interpretation study is pending. Sun source/model workflows have automated evidence; five-participant task study is pending. |
| F06 | blocked | Daily run validates a candidate only; no complete approved PR-to-served publication rehearsal. Transactional bundle/failure regressions pass; hosted publication lifecycle is separate. |
| F07 | blocked | All 16 authoritative jobs match; settings and protected qualification prevent promotion. Fresh npm audit has zero advisories; package/crate authority and complete source/dependency review remain separate. No promotion, current-candidate served proof, accepted predecessor or compatible production rollback drill. |
| F08 | partial | Historical-calendar provider regressions exist; fresh live 1500/1582 calendar evidence is absent. |
| F09 | partial | Scalar uncertainty contract is tested, not empirical covariance calibration. |
| F10 | partial | Replay and atomic replacement regressions pass; no protected acceptance record. |
| F11 | partial | Cross-language malformed-input suites pass; no protected acceptance record. |
| F12 | partial | Coordinate/anchor regressions pass; independent geometry acceptance remains open. |
| F13 | partial | Series-gap regressions pass; full user task acceptance is unrecorded. |
| F14 | partial | Cross-language malformed-input suites pass; no protected acceptance record. Failure and context-recovery browser evidence passes; complete target-device recovery qualification is pending. |
| F15 | partial | Boundary tests pass; four-site July pointing checks do not independently qualify all event times. |
| F16 | partial | Pole/finite geometry unit evidence exists; no independent polar reference acceptance. |
| F17 | partial | Range contracts pass; the fresh four-site reference compares pointing/DUT1, not every required range quantity. |
| F18 | partial | Cross-OS engine determinism passes; it does not substitute for all coefficient/asset regeneration provenance. |
| F19 | partial | Focus-stability tests pass; actual assistive-technology announcement audit is pending. |
| F20 | partial | System render-time and visual checks pass; complete manual task/physical-device acceptance is pending. |
| F21 | partial | Disclosure regressions and July reference samples exist; no broad continuous-epoch bound is claimed. |
| F22 | partial | Fresh npm audit has zero advisories; package/crate authority and complete source/dependency review remain separate. |

## Next actions

Follow the [release setup handoff](RELEASE_SETUP.md), retain actual measurements and failures, obtain authentic review, and configure the reviewed verifier only after qualification is complete. If master advances, the old candidate selection does not authorize the new commit. Do not relabel other-platform evidence or historical receipts to satisfy the gate.

The setup/workflow changes accompanying this document are separate from the candidate reviewed above. Their local tests do not retroactively qualify them as part of the retained candidate, and their hosted behavior requires CI on the PR.
