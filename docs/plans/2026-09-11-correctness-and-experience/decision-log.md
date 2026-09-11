# Decision log

D01–D16 are **Accepted for local engineering** by the user's September 11 implementation instruction, as recorded in RFC 0002. Scientific, UX and release qualification and external publication remain separately held. The table preserves the original alternatives and qualification-owner roles; it does not invent assignments or approvals. A different selected alternative requires an amendment to the affected spec and tests, not an informal code choice.

| ID | Recommended decision | Alternatives and reason | Acceptance owner / dependency |
|---|---|---|---|
| D01 | Substantial single-app native-ESM shell/workflow redesign; retain Rust and renderers | Cosmetic fixes alone leave navigation/mobile/task problems; separate apps duplicate state/privacy/lifecycle | Maintainer + UX reviewer; P10 |
| D02 | Separate atomic solar v3 and ephemeris v3 migrations, activated only after P09 coherent client transition | Adding fields to closed v2 schemas is incompatible; source-PR atomicity alone does not protect old clients | Scientific reviewer + maintainer; P07/P08 with P09 activation prerequisite |
| D03 | Preserve frozen v2 validators for historical replay; no live mixed-version provider fallback | Universal conversion cannot recover missing magnetic uncertainty, registration or range semantics | Scientific reviewer; explicit historical-import path only |
| D04 | Activity uncertainty is an illustrative scalar proxy; magnetic uncertainty unavailable; confidence is a heuristic model score | Copying scalar covariance into Br manufactures spatial evidence | Scientific reviewer; ADR 0006 supersedes ADR 0005 temporary serialization |
| D05 | Process noise has elapsed-time units; default `q_model_per_day=0`, explicitly disabled, positive values supported and tested | No observed dataset justifies a calibrated nonzero default; invocation-count inflation violates determinism | Scientific reviewer; P07 |
| D06 | Birth at target time is included exactly once; source identity ledger/checkpoint governs replay; zero-duration calls are no-ops | Strict endpoint exclusion caused lost events; epsilon-only cutoffs cannot reliably track identity | Scientific reviewer; P02; preserve externally supplied event ownership |
| D07 | Keep longitude-defined local mean-solar day `[start,end)`; emit real in-window culmination or null | Device midnight is not observer local day; clipping an out-of-day estimate invents an event | Scientific reviewer; P05/P08 |
| D08 | Explicit geocentric and observer ranges; no ambiguous `distance_km` in v3 | A universal alias would conceal incompatible provider semantics | Scientific reviewer; P08 |
| D09 | Observed imagery and model are separate by default; blend only with verified capture-epoch registration | Fetch/load time and approximate alignment are not registration evidence | Scientific + UX reviewers; P04/P07/P11 |
| D10 | One immutable presentation revision drives text, canvas metadata and evidence export; view clocks remain distinct | Independent prose paths drift; one global clock would confuse cycle time and astronomical instants | UX + architecture reviewers; ADR 0007/P10 |
| D11 | Same-run aggregate CI, profile-scoped accepted qualification and immutable Pages artifact promotion | Automated green alone omits manual/scientific qualification; branch-name lookup and rebuild weaken byte correspondence | Delivery reviewer; ADR 0008/P09 |
| D12 | One rolling data PR, explicit approval of automation runs, human merge initially | Unattended GitHub App automation is a later separately authorized identity decision; no PAT assumed | Maintainer; P15 |
| D13 | Canonical moon generation uses a pinned, recorded Linux x86_64 runtime image; all platforms validate canonical artifacts and numerical reference error | Bitwise host-libm equivalence is not assumed. A portable byte-identical generator is a later alternative, not a silent tolerance waiver | Scientific + delivery reviewers; P06 records exact chosen image digest and Python version before baseline regeneration |
| D14 | Worker execution with one active request per engine, latest-intent cancellation, bounded work, no automatic remote fallback | Raising timeouts leaves the main thread blocked; remote fallback would change privacy | UX + scientific reviewers; P14 |
| D15 | WCAG 2.2 AA target plus scoped manual audit; proposed performance budgets qualified on named profiles | Automated screenshots and coverage alone do not establish conformance or real-device performance | UX reviewer; P16 |
| D16 | No release-policy shortcut for manual deployment or crates.io publishing | Manual dispatch is an entry point, not authority to bypass tests | Maintainer + delivery reviewer; P01/P09/P17 |

## Approval gates without planning placeholders

The recommended choice and fallback are defined for every decision. Local engineering acceptance permits implementation and tests; independent automated reviews have been used for bounded source changes. Actual scientific/manual/release approvers remain unassigned. No unassigned role is a license for the implementer to invent qualification or authorize publication.

The canonical generator digest and supported browser/device versions are selected from available infrastructure in P06/P16, recorded before running qualification, and treated as immutable evidence inputs. The acceptance rule is fixed now; claiming a specific image hash or device measurement before obtaining it would fabricate evidence.

## ADR amendments after acceptance

- `docs/adr/0006-scientific-contract-semantics.md`: solar/ephemeris v3, scalar uncertainty, current modeled anchors, ranges, event source/window, legacy read policy. Supersedes conflicting serialization clauses in ADRs 0002/0005.
- `docs/adr/0007-resolved-presentation-and-worker-boundaries.md`: one resolved revision, native-ESM shell, worker admission/cancellation, view-specific clocks. Preserves ADRs 0001/0003.
- `docs/adr/0008-tested-artifact-promotion.md`: same-run release gate, tested bytes, feed transaction and manual recovery policy. Supersedes ADR 0004's deploy-time rebuild requirements.

These ADRs record current local source decisions, not qualification or release acceptance. Historical ADRs remain intact; `docs/RFC_ALIGNMENT.md` identifies the amendments.
