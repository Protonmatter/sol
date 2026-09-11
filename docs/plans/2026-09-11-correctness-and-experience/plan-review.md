# Plan review and validation record

Date: 2026-09-11. Source baseline: `917ad5b1c06a5070c371ffb4dc033ae2ffbc83a7`.

## Independent review method

Two fresh-context reviewers received the same frozen nine-artifact plan/RFC packet, source baseline, prior repository-review evidence, applicable specs and neutral review checklist. Neither received the other's conclusions. They reviewed plan completeness, scientific/privacy semantics, migration, CI/CD/rollback, UX and testability without editing files, running tests or performing remote operations. Their review is independent planning analysis, not runtime validation.

The original frozen RFC SHA256 was `770ECCACC344879490CCC321E834294D4D1A71562AAF1FF0339982BEE7B5781D`; the original engineering-plan SHA256 was `6A5A0E6D8E663DA4C4500C814E33814D162C62EC8DA0976F0131D98AE611C7DA`. Subsequent amendments below intentionally changed those files. The primary author verified relevant source behavior before reconciling findings.

## Reconciliation

| Review item | Independence / severity | Evidence and resolution | Added acceptance |
|---|---|---|---|
| Qualification not executable in promotion policy | Overlap; one reviewer P1, one P2. Resolved as P1 because it could bypass final release requirements | Added candidate-versus-promotion verdicts, corrective/final profiles, versioned manual/scientific records, trusted acceptance provenance, fingerprint applicability and freshness/reuse rules | QUAL01 and release-policy negative/positive cases |
| New geometric-horizon wording uses refracted flag | Overlap; P2 | Verified producers/browser guard define above_horizon from refracted altitude. New grouping explicitly uses alt_deg > 0, zero is at-or-below; apparent altitude and event threshold remain distinct | GEO01 provider/resolver/browser boundary fixtures |
| V3 activation can precede safe old-client transition | Unique to reviewer B; independently validated as P1 | Added P09 activation prerequisite for P07/P08, preview-only rule before it, explicit v2-to-v3 open/warm/offline/fresh client tests | MIG01, no mixed JS/WASM/schema/data |
| Atomic writer pointer lacks pinned reader contract | Unique to reviewer A; independently validated as P2 | Verified fixed-path independent browser reads. Defined pointer/derived manifest, resolve-once readers, component hash checks, loader/build/CLI migration and immutable alias policy | READ01 paused-reader/pointer-switch/rollback cases |
| Coverage criterion lacks explicit matrix row | Primary-author traceability check; P3 | Coverage policy existed in prose but AC-30 had no direct case. Added denominator inclusion/failure test row | COV01 |

No finding was rejected merely because another reviewer did not report it. The qualification severity disagreement was resolved by impact and missing enforcement evidence, not averaged. No additional actionable contradiction was established by these passes. Normative choices remain Draft for the maintainer; reviewer suggestions are not owner approval.

Both reviewers then performed focused static rechecks of their reported issues against the amended specification, RFC, engineering tasks and test cases. Each confirmed the reported gaps were resolved at the planning level and found no remaining issue within that recheck scope. This is not acceptance by the maintainer or verification of future runtime behavior.

## Validation performed for this planning change

- `python tools/validate_docs.py`: all 53 repository Markdown files passed local links/style checks after amendments.
- `python tools/validate_sdlc.py`: all 16 existing requirements, RFC metadata/sections, evidence paths and workflow contracts passed after amendments.
- `python tools/validate_ux_contract.py`: unchanged application's static disclosure/accessibility structure checked, not the unimplemented redesign.
- With task-local `PYTHONPATH=tools`, `python -m unittest discover -s tests/python -p 'test_*.py' -v`: all 30 existing tests passed again after amendments.
- Read-only traceability audit: catalogue has 35 unique AC IDs, 22 finding rows and 18 delivery slices; references use the existing 16 requirement IDs. Slash-shortened matrix references are expanded by the audit; AC-30's explicit row was added after the first check. Final audit found all criteria referenced and no unresolved placeholder markers.
- `git diff --check`: checked tracked diff formatting; documentation validation also scans new untracked Markdown.

The final handoff reports fresh post-amendment results. These checks validate the documentation package's structure and existing governance behavior; they do not execute future test files or prove the proposed architecture works.

## Not validated or changed

No source code, runtime schema, data fixture, dependency lockfile, workflow YAML or repository setting was modified by this task. No commit, push, PR operation, merge, deployment, scheduled task or publication occurred. The separate dirty working copy was untouched.

No new Rust/WASM/browser/coverage/scientific-reference implementation test was run for this docs-only task. No responsive redesign, screen-reader qualification, physical-device performance, five-person formative study, v3 migration, hosted release path or rollback was executed. They remain explicit future acceptance work, not passed checks.
