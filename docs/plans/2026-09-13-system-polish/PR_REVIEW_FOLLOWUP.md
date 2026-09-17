# PR 107 review follow-up

Date: 2026-09-13. Baseline: `964ff76698ede3fe48dc8087c40ed2d94dff3393`.

## Review scope

All twelve GitHub review threads were fetched, including pagination checks.
Three were already resolved. Nine remaining threads were checked against the
actual branch, including older comments whose lines had moved. The user
authorized addressing comments and committing/pushing to the existing PR;
merging and deployment are separate operations.

| Comment | Finding and disposition |
| --- | --- |
| [3999028397](https://github.com/Protonmatter/sol/pull/107#discussion_r3999028397) | Archive preview retry was already corrected in `92041772`; current UI regression tests verify deliberate retry, stale callback rejection and successful cache retention. |
| [3999223518](https://github.com/Protonmatter/sol/pull/107#discussion_r3999223518) | Stale Milky Way details were already corrected in `54b6d09e`; both action visibility and the actual click handler guard non-body views. |
| [3999223522](https://github.com/Protonmatter/sol/pull/107#discussion_r3999223522) | Explicit mapped-image retry from `54b6d09e` is preserved by the demand loader and exercised with upload success/failure and context recovery. |
| [3999301425](https://github.com/Protonmatter/sol/pull/107#discussion_r3999301425) | The mobile breakpoint hid Offline. Its native disclosure, status and update action remain visible and wrapped, with a 44-pixel summary/action target. |
| [3999301427](https://github.com/Protonmatter/sol/pull/107#discussion_r3999301427) | All registered maps loaded eagerly. Requests now follow useful visible surfaces, prioritize focus and include only enabled Earth layers and the selected cloud source. Concurrency and GPU residency are bounded. |
| [3999301430](https://github.com/Protonmatter/sol/pull/107#discussion_r3999301430) | Object details now describes the active mapped reference and layer dates/readiness. The legacy browse preview remains explicitly separate. Updates preserve the open disclosure and focused controls. |
| [3999413834](https://github.com/Protonmatter/sol/pull/107#discussion_r3999413834) | A focused camera now reconciles changes in displayed extent and unavailable-moon parent fallback before constructing its eye position. |
| [3999488599](https://github.com/Protonmatter/sol/pull/107#discussion_r3999488599) | The same focused-camera fit follows viewport aspect changes while preserving relative manual zoom. |
| [3999544756](https://github.com/Protonmatter/sol/pull/107#discussion_r3999544756) | The manifest preload now matches the exact unversioned importer URL inside the immutable release namespace. A real request-count assertion rejects duplicate loading. |

These fixes refine `SOL-UX-004`, `SOL-VIS-003`, `SOL-VIS-004` and
`SOL-REL-001`, within RFC 0003 and RFC 0004. They change resource scheduling,
presentation and camera framing. No physical centers, radii, ephemerides,
state-estimation logic, source pixels, source epochs or registration metadata
are changed. Camera and source contracts are detailed in
[FOCUS_CAMERA.md](FOCUS_CAMERA.md) and
[DETAIL_SOURCE_FOLLOWUP.md](DETAIL_SOURCE_FOLLOWUP.md). Resource scheduling,
cancellation and memory accounting are specified in
[REFERENCE_DEMAND.md](REFERENCE_DEMAND.md).

## Regression evidence

The prior build reproduced both mobile/preload failures in an actual browser:
the Offline summary was invisible at 390 pixels and two manifest URLs were
requested. The fixed browser regression uses the real native disclosure and
production update-client code, with an isolated waiting-worker fixture. It
verifies keyboard opening/closing, visible status and action, no horizontal
overflow, verified identity before activation, and fragment-preserving
navigation after controller change. It cannot activate a production worker.

Camera regressions first reproduced an eye inside enlarged Earth and inside
Jupiter after Io became unavailable. Resizing focused Saturn to portrait
occupied 171% of the limiting dimension. The corrected tests also exercise
manual zoom, shrink/recovery, DPR-only resizing and unchanged physical records.

Inspector regressions first reproduced the false legacy-source claim, stale
readiness and missing Earth layer selection. A production-renderer integration
test retains the same open disclosure through failure, deliberate retry, upload
completion and context loss.

Browser imagery checks now wait for requested references to settle; deliberately
deferred references are valid. An Earth capture additionally requires its active
layers. Readiness uses bounded 50 ms timer polling so asynchronous image uploads
do not depend on animation-frame delivery. Existing scene geometry and rendered
pixel assertions retain their full thresholds.

## Validation and publication

Local validation used staged candidate `pr107-review-final`, manifest SHA-256
`5ae71e299fe15b4c6d12ea5a4074bf52fac877a28f638264cd7a9747fed1f631`.
The source SHA field records the baseline; this is explicitly a pre-commit
candidate. Publication builds directly from the final Git tree and verifies executable
parity after release-token and text-line-ending normalization. Seven unchanged
working files have CRLF differences from their committed blobs; source image
and WASM bytes remain exact. Raw provenance hashes are not treated as equal
when line endings differ.

| Command or gate | Result |
| --- | --- |
| `node tools/check_node_coverage.mjs --output-dir=coverage/pr107-publish-node` | 803/803 tests; 97.88% lines, 91.96% branches, 95.12% functions. |
| `node tools/collect_node_coverage.mjs --web-root=build/pr107-review-final --output-dir=coverage/pr107-publish-node-all` | 803/803 tests; full runtime denominator retained. |
| `node tools/browser_validation.mjs --web-root=build/pr107-review-final --output-dir=coverage/pr107-publish-browser` | Full browser, mobile update, one manifest request, 48 caption layouts and scientific pixel gates pass. |
| `node tools/merge_web_coverage.mjs` with the above staged/Node/browser inputs | 96.58% lines, 94.39% branches, 96.70% functions. |
| `python -m unittest discover -s tests/python -p test_*.py` with `PYTHONPATH=tools` | 304/304 pass. |
| `node tools/planet_appearance_validation.mjs --web-root=build/pr107-review-final --out=coverage/pr107-publish-gpu` | 77/77 actual GPU probes pass. |
| `node tools/ring_appearance_validation.mjs --web-root=build/pr107-review-final --out=coverage/pr107-publish-rings` | 10/10 actual GPU probes pass. |
| `python tools/typecheck_web.py` | 81 source files pass. |
| Static web, UX, SDLC, visual inventory, Markdown and `git diff --check` | Pass. |

Forty-two actual application captures cover all 31 supported bodies, ten
additional opposite views and mobile Mimas. Requested maps settle before their
body capture; deferred maps do not need to load. Every interaction retains the
same engine body records and model epoch, with no page/engine errors or
horizontal overflow. Independent spot review checked Saturn, mobile Mimas, Io
and opposite Iapetus. Dark-side Iapetus cannot qualify fine albedo over the
whole disc, and the mobile image does not show its below-fold inspector.

Independent code review additionally reproduced and corrected nonconservative
visible-limb culling and pending-image accumulation over context restoration.
An initial integrated test run had 802/803 passes because a legacy regression
still required all references to load eagerly. Its source-request assertion
now verifies the bounded registered subset; the existing albedo/eclipse GPU
checks were retained. The subsequent two full runs pass 803/803. A final review also reproduced
retained decoded-image ownership after grid/GPU failure; releasing the failed
cache entry, handlers and image source preserves unavailable/retry semantics.
The two cleanup regressions and both final full 803-case runs pass.

Failed attempts remain in local ignored coverage logs. Test artifacts and
screenshots are not committed application source files. Current-head hosted
checks and review-thread dispositions are recorded on PR 107; local results
alone do not establish hosted or deployed behavior.

The image and camera changes remain display approximations with the previously
documented source and physical-scale precision limits. Browser validation uses
Chromium software WebGL and does not certify every physical mobile GPU. The
update-control fixture proves interaction and the supported activation protocol;
it does not constitute a production release activation. Rollback reverts this
review follow-up without a data or scientific-state migration.
