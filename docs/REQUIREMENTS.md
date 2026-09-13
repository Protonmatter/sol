# Requirements and traceability

Status: current  
Updated: 2026-09-11

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
| `SOL-UX-004` | Layered workspace with persistent essential state and contextual disclosure |
| `SOL-PRIV-001` | On-device location by default and consent before remote transmission |
| `SOL-TEST-001` | Lowest-useful-layer tests plus boundary-level regression coverage |
| `SOL-COV-001` | At least 90% Rust, Python, and whole-web line coverage |
| `SOL-VIS-001` | Semantic WebGL image and camera-continuity assertions |
| `SOL-VIS-002` | Physical-scale integrity and deterministic display clearance |
| `SOL-VIS-003` | Visual source identity, per-use qualification, and missing-detail fallback |
| `SOL-VIS-004` | Registered planetary maps, dated Earth layers and explicit coverage |
| `SOL-VIS-005` | Numeric terrain datum, finite geometry, physical extents and source identity |
| `SOL-VIS-006` | Dimensioned optical transfer with distinct reflection, scattering and emission |
| `SOL-VIS-007` | Source band, frame, coverage and finite dynamic appearance playback |
| `SOL-CI-001` | SHA-pinned actions, least privilege, and deployment of the tested SHA |
| `SOL-DOC-001` | Documentation, plans, instructions, and traceability updated with code |
| `SOL-SUPPLY-001` | Locked dependencies and automated ecosystem update review |
| `SOL-REL-001` | Commit-addressable test, coverage, determinism, and visual evidence |

## Change rules

- New normative behavior receives a new stable ID; IDs are never recycled.
- Changed meaning receives a new requirement or an explicit supersession record.
- `implemented` means mapped local implementation and automated test surfaces exist;
  it does not mean every requirement instance has passed independent review, every mapped
  test is wired into the same CI job, a full fresh coverage/manual/scientific matrix passed,
  or the source was merged/deployed. Existing statuses do not erase open review findings.
- `planned` means the requirement may guide design but cannot support a product claim.
- `deprecated` preserves history and names its replacement.
- A pull request lists all affected IDs and explains why unaffected adjacent requirements
  remain safe.

## Traceability review

The September mapping now points to live v3 schemas, strict solar/ephemeris intake,
worker/request identity, presentation/object controls, recipient privacy, atomic source/
derived bundle readers and artifact/served-evidence tools. Historical v2 remains separate.
The coefficient provenance inventory is documentation of missing regeneration/notice
correspondence, not evidence that those gaps are resolved. Canonical moon generation,
independent v3 astronomy, physical-device/manual accessibility and protected release
qualification retain their own holds. RFC 0002 remains Accepted.

CI gate names identify the governing workflow/job; a path's presence in this registry
does not prove a hosted run or imply that every standalone local harness is run there.
Review the actual command inventory and retained source/artifact-bound results.

Review starts at the requirement, follows its source to the intended behavior, follows its
implementation paths to the code, and then follows verification and CI gates to executable
evidence. A path existing is necessary but not sufficient: reviewers still inspect whether
the test proves the statement and whether exceptions are visible.
