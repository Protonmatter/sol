# RFC alignment matrix

Updated: 2026-09-13

The original web and solar-system design documents remain useful implementation history.
Where they conflict with the current system, `SPEC.md`, accepted ADRs and repository RFCs,
and the traced requirements are authoritative.

| Earlier RFC statement | Current decision | Authority |
|---|---|---|
| Vite + TypeScript frontend | Native ES modules, JSDoc, no runtime bundler | ADR 0001 |
| No browser-side physics | Audited deterministic Rust engines execute through raw WASM; snapshots remain the UI boundary | ADR 0001 |
| `solar-state-snapshot.v1` | `solar-state-snapshot.v3`: explicit coordinates, scalar illustrative activity variance, unavailable magnetic uncertainty and current model anchors | `docs/SPEC.md`, JSON Schema |
| `ephemeris-snapshot.v1` provider-neutral contract | Provider-neutral `ephemeris-snapshot.v3`; distinct ranges and event calculation/occurrence states; unsupported live versions rejected | ADR 0006, `docs/EPHEMERIS_V3.md` |
| Observer location never leaves device | Default local; configured exact-recipient session consent before health/location requests, redirects denied; share/export preview | ADR 0003, `docs/EPHEMERIS_V3.md` |
| Observer civil timezone inferred from coordinates | Not implemented; UI must identify browser/device timezone until an audited resolver exists | ADR 0003 |
| Deployment triggered directly by a master push | Exact candidate artifact, same-run CI and protected scientific/manual/settings acceptance; post-approval recheck, no rebuild | RFC 0002, `docs/RELEASE_DELIVERY.md` |
| Mutable remote textures fetched on every deployment | Committed asset/procedural baseline; mutable acquisition is separately authorized, not part of promotion | RFC 0002, `docs/RELEASE_DELIVERY.md` |
| Caller partition invariance implied by bounded substeps | Fixed-clock checkpoint/replay makes target state invariant to caller partitioning and is adversarially tested | `docs/SPEC.md` |
| EOP data bundled without lifecycle enforcement | Coverage boundary is explicit; CI and weekly workflow require a 90-day refresh margin | `docs/SPEC.md` |
| Progressive disclosure described only as historical design intent | Current initial/secondary UX rules are normative, statically validated, and exercised in Chromium | RFC 0001, `docs/UX_GUIDELINES.md` |
| Validation documented as language-specific commands | One traced governance → unit → contract → integration → browser/visual → determinism → release plan | RFC 0001, `docs/VALIDATION_PLAN.md` |

## Acceptance-status interpretation

RFC 0004 is accepted for the requested planetary appearance and Earth layers. Its
registered display-reference collection admits documented source maps and explicit
partial coverage without weakening the legacy complete-global-observation gate.
It does not establish current weather, calibrated radiance or production qualification.

RFC 0003 is accepted for the user-authorized local workspace implementation. It adds
closed-on-entry contextual controls, persistent navigation, display clearance and visual
asset provenance without weakening RFC 0002 qualification. No new production or complete
NASA/JPL appearance qualification follows from inventory validity or source-byte matches.

RFC 0002 is **Accepted**, not Implemented. Local v3/worker/UI/data-transaction changes
are not a claim of merged/released behavior or complete AC/F-matrix qualification.
ADR 0006 governs current scientific semantics. [ADR 0007](adr/0007-resolved-presentation-and-worker-boundaries.md)
records presentation and worker boundaries; [ADR 0008](adr/0008-tested-artifact-promotion.md)
supersedes deployment-time regeneration with exact tested-artifact promotion. Historical v2 remains separate; old
covariance or registered-overlay language cannot override the live fail-closed contract.

Immutable source/derived bundles replace independent fixed-alias reads. Worker replies
are request/identity-bound before publication. Artifact retention and protected acceptance
are separate from candidate verification. Coefficient hashes identify local bytes but do
not prove upstream regeneration, license correspondence or independent accuracy; see
[provenance gaps](COEFFICIENT_PROVENANCE.md) and [status](STATUS.md).


A phase marked complete in an older RFC records a historical capability claim, not new verification of the current artifact. It does not supersede current contract, accuracy, privacy, accessibility, or release gates. Those gates are defined by:

1. `docs/SPEC.md`
2. accepted files under `docs/adr/` and `docs/rfcs/`
3. `docs/requirements.json`
4. checked-in JSON Schemas
5. CI workflows and executable validators

Any future design change that contradicts these sources requires a new ADR and corresponding tests in the same pull request.
