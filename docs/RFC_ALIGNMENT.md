# RFC alignment matrix

Updated: 2026-07-10

The original web and solar-system design documents remain useful implementation history. Where they conflict with the current system, this matrix and accepted ADRs are authoritative.

| Earlier RFC statement | Current decision | Authority |
|---|---|---|
| Vite + TypeScript frontend | Native ES modules, JSDoc, no runtime bundler | ADR 0001 |
| No browser-side physics | Audited deterministic Rust engines execute through raw WASM; snapshots remain the UI boundary | ADR 0001 |
| `solar-state-snapshot.v1` | `solar-state-snapshot.v2` with explicit Carrington coordinate/storage semantics | `docs/SPEC.md`, JSON Schema |
| `ephemeris-snapshot.v1` provider-neutral contract | Provider-neutral `ephemeris-snapshot.v2`; mixed versions rejected | ADR 0002 |
| Observer location never leaves device | True for default local engine; optional remote provider requires configuration and explicit consent | ADR 0003 |
| Observer civil timezone inferred from coordinates | Not implemented; UI must identify browser/device timezone until an audited resolver exists | ADR 0003 |
| Deployment triggered directly by a master push | Pages deploys the exact master SHA only after full CI success | ADR 0004 |
| Mutable remote textures fetched on every deployment | Deterministic procedural path is default; remote textures are reviewed opt-in assets | ADR 0004 |
| Caller partition invariance implied by bounded substeps | Fixed-clock checkpoint/replay makes target state invariant to caller partitioning and is adversarially tested | `docs/SPEC.md` |
| EOP data bundled without lifecycle enforcement | Coverage boundary is explicit; CI and weekly workflow require a 90-day refresh margin | `docs/SPEC.md` |

## Acceptance-status interpretation

A phase marked complete in an older RFC means its user-visible capability was delivered. It does not supersede current contract, accuracy, privacy, accessibility, or release gates. Those gates are defined by:

1. `docs/SPEC.md`
2. accepted files under `docs/adr/`
3. checked-in JSON Schemas
4. CI workflows and executable validators

Any future design change that contradicts these sources requires a new ADR and corresponding tests in the same pull request.
