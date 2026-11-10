# Combined coverage admission correction — 2026-11-06

The combined Node/Chromium line gate previously accepted named runtime files with
empty counters: the actual CLI exited zero and reported 100% with zero measured
lines. The corrected gate checks source-derived line denominators, canonical
runtime membership and counter integrity before accepting the report. Its default
90% floor, supported CLI options and Istanbul output formats remain.

The actual nonempty producer replay remains byte-identical to the preceding
accepted report. Application code, rendering, coefficients, both WASM binaries,
the 1900–2200 target and Illustrative Earth are unchanged.

## Reproduction and cause

The retained reproduction supplies entries for all 117 current hand-written
runtime modules, each with empty statement/function/branch maps and counters.
The old merger checks file presence, then uses Istanbul's summary percentage.
Istanbul intentionally represents a zero denominator as 100%; that convention
does not establish execution or complete source coverage. The CLI therefore
accepts invalid evidence despite every file being named.

Further CLI controls demonstrate that deleting executable line entries, admitting
an excluded generated catalogue or unrelated file, and malformed hit values can
also produce passing results. A raised fractional floor can incorrectly fail a
valid report because the previous comparison uses the downward-truncated display
percentage instead of the actual covered/total counts.

## Corrected behavior

The same current V8 converter used by the browser's unexecuted-source seed derives
the line set for every hand-written runtime module. The merged report must contain
exactly those executable line keys. Naming a file with empty or reduced maps does
not replace its source denominator. The existing missing-module rejection remains.

Both inputs must use canonical runtime paths with matching record paths. Generated
catalogues and unrelated files are rejected rather than added to the percentage.
The existing generated-module exclusion list and canonical-equality tests remain;
no application module is removed from the denominator.

Statement, function and branch map keys must match their counter keys. Hit values
must be nonnegative safe integers. Branch hit arrays must match nonempty declared
location arrays. The same checks run after merging, so two individually safe input
counts cannot silently produce an unsafe sum. Rejected unapproved file keys are
not echoed in diagnostics.

Floor decisions use integer covered/total line counts and the decimal representation
of the parsed requested percentage. The default remains 90; callers can raise it
within the existing 90–100 range. The exact requested floor remains visible even
when the displayed coverage percentage is truncated to two decimal places.

These are structural and numerical evidence checks. They do not authenticate
execution or make invented positive counts trustworthy. Actual collectors,
source/artifact identity and authoritative CI results remain necessary.

## Regression and integration evidence

Eleven CLI groups exercise the real executable with isolated temporary reports:

- Empty named files, erased lines and missing modules.
- Generated and unrelated files outside the runtime population.
- Negative, fractional, string and null hit values.
- Empty, short, long and zero-location branch records.
- Statement/function/branch overflow during merge, with exact maximum-safe positive
  boundary controls.
- Valid complementary Node/browser hits, complete uncovered lines, raised fractional
  floors and unchanged rejection of lowered/nonfinite thresholds.

Current tests pass on Windows and native Linux ARM64. Running the current cases
against the captured original gate fails seven groups; the initial correction
fails three later refinement groups. Those commands adjust only module-resolution
URLs for their captured location, preserving the original gate logic.

Independent review found the branch-arity and post-merge overflow cases in the
initial correction. Both actual old inputs now reject. Early test fixtures were
also corrected to derive percentage/branch shape from their actual generated
coverage rather than assume a rounded boundary or two locations. Intermediate
failed runs remain separate from the final eleven passing groups.

| Completed check | Result and scope |
| --- | --- |
| Current Windows Node gate | 1,545 tests pass, zero failures/cancellations/skips; existing line/branch/function floors pass |
| Current Linux Node gate | 1,545 tests pass, zero failures/cancellations/skips; existing line/branch/function floors pass |
| Linux runtime coverage collection | All 1,545 tests pass and all 117 runtime modules remain represented |
| Saved Node/Chromium producer replay | Corrected checker reproduces the original complete `coverage-final.json` byte-for-byte |
| Fresh Node plus saved Chromium merge | 17,907/18,354 runtime lines, 97.56%, above the unchanged 90% floor |
| Qualified-run invariants | All 1,690 source inputs remain unchanged in both Windows and Linux; staged files and locked dependencies remain unchanged in Linux |
| Owned runtime closure | Both Linux invocations exit zero; exact-ID inspection confirms absence after normal cleanup |

The Linux checks use the existing pinned QA image, disabled network and read-only
source/stage/dependency mounts. Reports retain their original canonical paths;
replay runs in the matching source location instead of rewriting recorded identity.
The saved browser input belongs to the preceding
[Linux browser campaign](LINUX_BROWSER_VALIDATION_20261106.md), against the same
unchanged application sources and artifact. This pass launches no new browser.

## Retention and qualification limits

The ignored evidence root is `build/merged-coverage-20261106-01/`. It retains the
original false pass, before-source bytes, intermediate fixtures, red/green logs,
old-code negative controls, initial/final qualified runs, producer inputs and
outputs, source inventories and independent controls. The closure binds 115 selected
artifact hashes; raw V8 files are retained separately from that selected inventory.

This report and the status/policy descriptions follow the closed source cohort.
Their preceding bytes remain under the audit's `before/docs/` directory. The
current application/script line denominator is not redefined to make the tests pass.
No dependency, manifest, generated-module exclusion or workflow is changed.

No fresh Python/Rust/WASM, GPU, astronomical, physical-device, hosted CI, cloud-result
or served-release qualification follows from this coverage correction. Earlier
renderer and scientific cohorts retain their own identities. No commit, push,
publication or deployment occurred; overall production readiness remains open.
