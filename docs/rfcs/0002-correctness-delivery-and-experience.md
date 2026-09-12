# RFC 0002: Correct scientific contracts, verified delivery and a clearer Sol experience

- Status: Accepted
- Authors: Codex, planning and implementation author; Min Kang, local implementation authorization
- Created: 2026-09-11
- Target: Correctness and experience milestone; package release versions selected separately
- Requirements: `SOL-ARCH-001`, `SOL-CONTRACT-001`, `SOL-SCI-001`, `SOL-DATA-001`, `SOL-DET-001`, `SOL-UX-001`, `SOL-UX-002`, `SOL-UX-003`, `SOL-PRIV-001`, `SOL-TEST-001`, `SOL-COV-001`, `SOL-VIS-001`, `SOL-CI-001`, `SOL-DOC-001`, `SOL-SUPPLY-001`, `SOL-REL-001`

## Summary

Adopt explicit solar and ephemeris v3 semantics, a shared evidence-driven presentation model, a substantial three-destination interface redesign, and a complete same-candidate CI gate that promotes the exact tested static artifact. Restore existing-contract defects first so correctness improvements can ship independently of the redesign.

This is an internal repository RFC, not an IETF publication or certification. Min Kang authorized local implementation on 2026-09-11. That accepts D01–D16 for local engineering, not production promotion, publication, manual qualification or scientific approval. The [implementation package](../plans/2026-09-11-correctness-and-experience/README.md) contains the full specification, alternatives, delivery slices and tests; approval of this document is not evidence that those changes exist.

## Context

The September 11 review of SHA `917ad5b1c06a5070c371ffb4dc033ae2ffbc83a7` identified eight P1 and fourteen P2 findings across source scheduling, presentation truth, cache identity, remote dates, release enforcement, uncertainty, replay/parser semantics, temporal pairing, ephemeris events/poles/ranges, generation, focus, accuracy and development dependencies. Existing passing tests did not cover the decisive counterexamples.

The architecture is worth preserving: deterministic Rust, raw WASM, native ES modules, immutable snapshots and local-first privacy. The proposed changes repair important boundaries and redesign the task experience without a framework rewrite. New physics, calibration, operational forecasting, new remote services, production telemetry and unattended merge identities are out of scope.

## Requirements

The 16 existing requirements in the metadata govern this change. The [acceptance catalogue](../plans/2026-09-11-correctness-and-experience/problem-and-scope.md#acceptance-catalogue) refines them into AC-01–AC-35. After acceptance, every applicable MUST is release-blocking under the reviewed qualification profile: corrective releases satisfy existing gates and the changed requirements/affected-task evidence; final experience-milestone promotion requires the entire catalogue. Every SHOULD requires either evidence or a recorded scoped exception. The candidate cannot select a weaker profile itself. Requirement language follows the repository's BCP 14 policy. [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)

Before implementing each slice, update canonical traceability with real implementation/test paths and actual gate names when they exist. Do not mark future tests implemented or add dangling evidence merely to satisfy a planning checklist. The source registry's prior implemented statuses do not negate the review's open defects.

## Design

Accept the following independently reviewable clauses as one coordinated program:

1. **Scientific semantics.** Inclusive target event ownership with explicit checkpoint/consumed identity; solar v3 scalar illustrative activity uncertainty, unavailable magnetic covariance, immutable birth and current modeled anchors; ephemeris v3 explicit geocentric/observer ranges, local mean-solar event windows/status/source, and evidence-scoped accuracy. Default process noise is zero and explicitly disabled; positive noise is an illustrative configurable rate, not empirical calibration.
2. **Compatibility.** Closed v2 schemas cannot accept these fields compatibly. Migrate solar and ephemeris separately, each with all schemas, producers, validators, consumers, fixtures and docs in the same PR. Production activation also requires P09's verified old-client/cache/data transition; atomic source changes alone are insufficient. Preserve frozen v2 historical-copy validation, not silent live conversion or provider mixing.
3. **Presentation.** One immutable resolved revision derives source/time/freshness/provider/availability/accuracy explanations from validated inputs. Default observed/model separation; observed compositing requires capture-epoch registration. Rust owns physical evolution; browser code projects and explains supplied data.
4. **Experience.** Persistent destination navigation, hero-first responsive layout, shallow evidence disclosures, stable search/selection, truthful uncertainty/accuracy and view-specific clocks. Keep raw scientific exports separate from optional view-evidence exports.
5. **Execution and delivery.** Bounded worker/provider work, immutable source bundles with resolve-once pinned readers, rolling data PR with human approval/merge initially, same-run aggregate CI and exact tested-artifact promotion. Promotion additionally requires versioned accepted manual/scientific qualification applicable to the selected profile and component fingerprints. Manual deployment and registry publication do not bypass eligibility or authorization.

The exact fields, event rules, limits and lifecycle are in [the scope specification](../plans/2026-09-11-correctness-and-experience/problem-and-scope.md). The [delivery design](../plans/2026-09-11-correctness-and-experience/devex-review.md) defines artifact/data transactions, concurrency, permissions and failure states. Accepted decisions produce ADR 0006 scientific semantics, ADR 0007 presentation/worker boundaries and ADR 0008 tested-artifact promotion. They explicitly supersede only conflicting ADR 0002/0005 serialization and ADR 0004 deploy-rebuild clauses; ADRs 0001/0003 remain in force.

## UX and accessibility

Retain The Sun, My Sky and Solar System as one product. Move navigation outside hidden controls, show the visualization before extended controls on narrow screens, make onboarding optional, stabilize object rows and reduce label collisions. Essential source/time/limits stay at the point of interpretation; research detail remains deliberately accessible.

Use the [design review's layouts, tasks and state table](../plans/2026-09-11-correctness-and-experience/design-review.md). Target WCAG 2.2 AA with scoped manual complete-flow qualification, keyboard/zoom/reflow/touch/reduced-motion and textual alternatives. Responsive emulation and screenshot tests do not establish physical-device or screen-reader conformance. Controlled performance budgets are proposed qualification criteria, not current measurements.

## Security and privacy

Untrusted inputs include public JSON, optional-provider responses, configured URLs, generated artifacts and cache metadata. Validate before publication, bound size/work/deadlines, preserve typed errors and reject incompatible versions. JSON follows RFC 8259; Sol adds duplicate-key rejection and explicit finite/bounded-number semantics. [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)

Observer computation remains local by default. Geolocation needs explicit action; remote transmission needs configured-recipient consent; share/export previews location/time. No new analytics, geocoder, timezone endpoint or automatic remote fallback. Tests use synthetic/mocked boundary cases and do not stress public providers.

CI uses least privilege and immutable pins. A privileged deploy job never executes untrusted artifact scripts and verifies repository/run/SHA/artifact eligibility. Secrets and private input are excluded from evidence. Repository settings, new identities, PR mutation, merge, deployment and registry publishing require explicit execution authority.

## Alternatives

Cosmetic-only UI repair is insufficient for the mobile/navigation/task problem, though focused corrections should ship first. A new framework or separate destination applications would increase migration/lifecycle cost without demonstrated benefit. Silent additive v2 fields break closed validators. Broad compatibility adapters would invent missing scientific evidence. Branch-name cross-workflow aggregation and deploy-time rebuild weaken tested-byte correspondence. Unattended bot merge needs an identity/authority decision not included here.

Canonical pinned generation is preferred to silently relaxing moon byte checks. Cross-OS reference simulation equality remains unchanged. See the [decision log](../plans/2026-09-11-correctness-and-experience/decision-log.md) for all D01–D16 choices and reviewers.

## Risks

Public v3 migrations are high-risk and must remain atomic per family. Shared state/shell changes can regress focus, privacy or lifecycle; stage them over corrected logic with a feature-parity inventory. Scientific claims can exceed sparse evidence; narrow them first and qualify changed quantities independently. Existing caches and retained artifacts can be incompatible; rollback requires matched schemas/ABIs/data, not arbitrary old code. Owner settings and external evidence are not provable from source files. Canonical generator/image/device versions must be recorded before qualification rather than invented in this draft.

## Acceptance criteria

All F01–F22 have their named regressions and consumer behavior tests passing. AC-01–AC-35 have linked evidence. Solar and ephemeris v3 agree across every producer/consumer; no live mixed versions exist. The three redesigned tasks pass functional, responsive, keyboard, privacy and scoped manual qualification. All mandatory same-run CI results succeed at actual master, the tested artifact is served and verified, and compatible rollback is demonstrated. Operational forecasting status remains false.

No code merge, coverage number, successful ingest or visually improved screenshot alone closes these criteria. Unavailable external/manual evidence remains an explicit qualification gap.

## Validation

Use [the test matrix](../plans/2026-09-11-correctness-and-experience/test-matrix.md): Rust unit/integration, shared contract corpus, Python/provider tests, Node logic tests, browser functional/failure/upgrade tests, semantic visuals, deterministic comparisons, independent accuracy, coverage, PowerShell mocked helpers, physical-device and assistive-technology/manual task evidence. Preserve current numerical and 90% coverage gates; do not weaken them to make a change pass.

## Rollout and rollback

Execute [P00–P17](../plans/2026-09-11-correctness-and-experience/engineering-plan.md). Deliver focused corrections independently, then coherent contract migrations and a preview shell, then destination improvements and bounded workers/feed delivery, finally complete qualification and authorized promotion. Keep one previous complete compatible artifact/data bundle and safe client transition. Rollback must preserve corrected scientific/privacy behavior; when no corrected compatible artifact exists, use an honest unavailable state and forward correction.

## Documentation

Update README, SPEC, MATH, accuracy/data contracts, UX guidelines, SDLC/validation/operations instructions, requirements/catalogue, RFC alignment, accepted ADRs, STATUS/ROADMAP, contribution/PR evidence and GitHub-facing screenshots/status in their owning slices. Preserve proposed versus current versus measured distinctions. Mark this RFC Accepted only after owner decision, and Implemented only after merged code, tests, traceability and documentation satisfy all criteria.
