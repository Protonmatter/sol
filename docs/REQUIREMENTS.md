# Requirements and traceability

Status: current  
Updated: 2026-07-28

`requirements.json` is the machine-readable source of truth. Each record connects a
normative statement to its governing specification, implementation, verification, and CI
gate. `tools/validate_sdlc.py` rejects duplicate IDs, missing evidence, unknown files,
unrecognized status, and incomplete workflow enforcement.

## Requirement catalogue

| ID | Objective |
|---|---|
| `SOL-ARCH-001` | Immutable, versioned snapshot boundary; no browser-invented physics |
| `SOL-CONTRACT-001` | Atomic versioning of schema, producers, consumers, fixtures, and tests |
| `SOL-SCI-001` | Accurate provenance, calibration, uncertainty, and operational claims |
| `SOL-DATA-001` | Source, time, freshness, quality, finite values, and visible degradation |
| `SOL-DET-001` | Reproducible generated data and cross-platform deterministic snapshots |
| `SOL-UX-001` | Primary task first; advanced and research depth disclosed on request |
| `SOL-UX-002` | Accessible names, keyboard parity, focus, and non-canvas alternatives |
| `SOL-UX-003` | Visible status, error recovery, fallback, and user control |
| `SOL-PRIV-001` | On-device location by default and consent before remote transmission |
| `SOL-TEST-001` | Lowest-useful-layer tests plus boundary-level regression coverage |
| `SOL-COV-001` | At least 90% Rust, Python, and whole-web line coverage |
| `SOL-VIS-001` | Semantic WebGL image and camera-continuity assertions |
| `SOL-CI-001` | SHA-pinned actions, least privilege, and deployment of the tested SHA |
| `SOL-DOC-001` | Documentation, plans, instructions, and traceability updated with code |
| `SOL-SUPPLY-001` | Locked dependencies and automated ecosystem update review |
| `SOL-REL-001` | Commit-addressable test, coverage, determinism, and visual evidence |

## Change rules

- New normative behavior receives a new stable ID; IDs are never recycled.
- Changed meaning receives a new requirement or an explicit supersession record.
- `implemented` means both implementation and automated evidence exist.
- `planned` means the requirement may guide design but cannot support a product claim.
- `deprecated` preserves history and names its replacement.
- A pull request lists all affected IDs and explains why unaffected adjacent requirements
  remain safe.

## Traceability review

Review starts at the requirement, follows its source to the intended behavior, follows its
implementation paths to the code, and then follows verification and CI gates to executable
evidence. A path existing is necessary but not sufficient: reviewers still inspect whether
the test proves the statement and whether exceptions are visible.

