# Export interaction and readiness readback — 2026-11-06

The current local candidate passes 24 export-Cancel input/reflow cases. These add
keyboard and short-landscape evidence to the earlier phone-to-desktop diagnostic.
They do not reproduce or explain the older intermittent Cancel timeout. No
application, numerical, texture, licensing or release-policy change follows.

## Candidate and interaction evidence

The tested stage is `build/touch-20261106-01/site`, mounted at `/sol/`, release
`local-touch-20261106-01`. Its manifest SHA-256 remains:

`b999bb0b4289d5f6c752990c3ff2314a6d2a7a2c8cec8e108ecbbb82aa61d076`

The diagnostic opens Research in the actual staged application and exercises this
complete product of cases:

| Dimension | Cases |
|---|---|
| Motion preference | Reduced motion; no preference |
| Destination viewport, CSS pixels | 1440 × 900; 844 × 390; 320 × 256; 390 × 844 |
| Input/resize sequence | Existing pointer-Cancel sequence after phone resize; keyboard preview/Cancel; keyboard preview followed by resizing while open and keyboard Cancel |

The final `run-02` records all 24 cases with actual trusted Cancel clicks. Its 16
keyboard cases also require trusted Enter on Cancel. Keyboard traversal passes
from the JSON preview to Download and then Cancel. The requested motion preference
is observed through `matchMedia`; the frozen JSON stays unchanged across resize.
Cancel must be visible, fit vertically and receive its center hit; the page must
have no horizontal overflow. After cancellation, the panel must be hidden and
focus must return to a visible, hit-testable Preview action. The final observation
follows a 180ms delay, exceeding the nominal 120ms resize debounce; completion of
every resize callback is not independently instrumented.

All checks pass. The final receipt has no recorded page/console errors or
unexpected off-origin requests through browser closure, and records successful
owned-browser and loopback-server closure. It uses Chrome 156.0.8078.80 with the
existing software-renderer launch flags; this UI diagnostic does not independently
attest a graphics backend. It is not a physical-device, actual browser zoom,
screen-reader, whole-application accessibility or performance qualification.

An earlier `run-01` also passes 24 cases. Its weaker protocol lacks the final
per-case trusted-input trace, observed motion preference and delayed-focus check;
it does not inherit those claims. Both sources and receipts remain separate under
`build/export-cancel-20261106-01/`. The original timeout remains in the older
[readiness audit](READINESS_AUDIT_20261106.md#remaining-evidence-and-release-holds).
Passing repetitions do not establish a unique cause or close that historical
intermittent-reliability question.

## Read-only external and qualification state

GitHub's current default-branch readback is still
`3a55a795767f3043112673ea561cdaf6dc7e2d0f`. Its latest returned master-push
[CI run 39911966685](https://github.com/Protonmatter/sol/actions/runs/39911966685)
reports success and completed on 2026-10-23. This is run-level metadata for the
base revision; no current job inventory, artifact correspondence or served content
was qualified in this readback. The current uncommitted candidate is a separate
source/artifact state.

The latest five returned runs include successful daily-data workflows and three
`action_required` checks for the head of draft
[Earth-refresh PR 134](https://github.com/Protonmatter/sol/pull/134). None is CI
evidence for the local dirty candidate. No workflow, PR, approval, branch, setting
or deployment was changed. Selected API fields and queries are retained in the
audit folder; they are not represented as complete original API payloads.

The [requirement registry](requirements.json) contains 27 records: 24 declared
implemented and three planned. The latter are `SOL-VIS-008`, `SOL-VIS-010` and
`SOL-VIS-011`, whose appearance RFCs remain Draft. Their local implementation and
visual evidence do not automatically change registry or RFC acceptance. The
owner's Illustrative Earth preference remains honored. The retained path/hash
inventory checks declared source/verification correspondence, not requirement-wide
behavior or acceptance of every mapped case.

Normal Pages publication follows [the documented master path](RELEASE_DELIVERY.md):
it verifies the successful master candidate, mandatory jobs, rich evidence and
exact artifact identity. That path does not consult protected manual/scientific
profile files. The protected promotion/rollback evaluator retains its separate
policy. Missing manual or scientific qualification therefore remains a limitation
on the production-readiness claim; it is not an invented extra normal-publication
gate. No publication policy or acceptance predicate changed in this pass.

The retained cloud job is still `/tmp/sol-gac-bkhj5nlo`; its current process/result
state was not retrieved. No connected Google Cloud tool or Windows `gcloud`
command is available in this session. SSH's presence does not establish a
configured or authenticated destination. No job was restarted, no old PID was
signaled and no browser-policy workaround was attempted. The supported retrieval
procedure remains `build/guarded-app-20261105/LINUX_RETRIEVAL.md`.

## Validation and next boundaries

`build/export-cancel-20261106-01/admit.py` verifies the exact staged inventory,
current source correspondence, all 24 final input cases, closure/error observations,
selected remote readbacks and frozen diagnostic inputs. The final admission and
independent review remain local evidence, with overall goal completion false.
The private diagnostic sources are retained experiment commands with fixed fresh
output directories, not commands to overwrite an existing receipt.

Only documentation changes in this pass. The existing 1,534-test Node result,
native/SwiftShader rendering results, 97.57% combined runtime coverage and numerical
studies remain evidence for their recorded cohorts; no new broad suite or
astronomical comparison is claimed. The 1900–2200 target and approximate exploration
outside it are unchanged, as are both WASM binaries and Illustrative Earth.

Production-readiness completion remains unproven. Ephemeris notice-policy clearance,
current-source hosted qualification, cross-platform/manual acceptance, executed
served-release/rollback verification and the retained Linux result require their
own authoritative evidence. This report does not infer that every remaining
implementation is bug-free. No commit, push, merge, licensing change or deployment
occurred. Rollback removes only this report and its related status/plan paragraphs;
preserve prior work and all raw evidence.
