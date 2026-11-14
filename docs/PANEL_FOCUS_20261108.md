# Panel keyboard-focus correction - 2026-11-08

Refreshing Research previously replaced the focused glossary control in the
layer legend, space-weather signals and Aurora outlook. Even when the semantic
facts and snapshot stayed unchanged, Chromium disconnected the original control
and moved keyboard focus to BODY. The tooltip's aria-describedby association was
discarded with that control. Native Tab followed by an actual renderAll refresh
reproduces this P2 defect.

The panel renderer now reuses controls by logical identity within each container.
It updates current labels, classes and glossary metadata in place, removes obsolete
items and does not resurrect controls detached from an old container. Ordering
moves other siblings around a retained focused control. Duplicate identities fail
before changing that item container. Aurora retains its original strong/span/button
structure, native button type and accessible label.

All selectors, observer assessment, feed freshness, presentation preparation,
headers, image publication and drawing still execute. No scientific value is
cached. Callback scheduling, startup imports, appearance assets, shader inputs,
orbital data and both numerical binaries are unchanged. The approved Sites v7
Illustrative Earth remains in place. The failed early-frame scheduling proposal
is not adopted.

## Validation and scope

The completed candidate has 32 passing panel cases, including 13 new regression
cases, and 1,951 full Node passes. The configured 138-file type check and unchanged
19-identity startup graph pass. The first baseline assertion tried to print the
complete DOM graph and exhausted test memory; its failed log is retained. Concise
identity assertions then reproduced eight failures for the first two panel areas;
three later cases reproduce the adjacent Aurora defect before its correction.
An initial v2 coverage merge was pointed at the earlier Node report and correctly
rejected. Reusing the already-collected v2 report resolves that input error; the
failed merge remains retained and no coverage validation rule is weakened.

One Chromium driver compares the original and corrected releases. It verifies
three focus cases, identical recorded facts and geometry, retained markup/ARIA,
real Tab entry to F10.7, Enter/Escape glossary behavior, changing Kp without losing
focus and reordering signals around the focused control. Derived observer and
stale-feed wording are separately checked by the full-module tests. Broader
assistive-technology or device acceptance is not established by these cases.

The final candidate is local-panel-controls-20261108-02, manifest SHA-256
`695554a38a39234eacfd0eabc4c04d1aa934fe88e3ca4335b74b4ec3633d23b6`.
All existing browser and trusted-touch gates pass in native, normal software
fallback and whole-driver software modes. Matched runtime line coverage is
97.71% native, 97.7% normal fallback
and 97.7% whole-driver software, above the unchanged 90% floor.
Those browser/coverage results qualify that named candidate cohort only.

The first, narrower candidate passed its two-area checks but failed the expanded
Aurora case. Its files and results remain separate. The final implementation
addresses all three reproduced areas. Genuinely removed controls retain the
browser's existing focus-removal behavior; this change adds no fallback-focus rule.

This correction does not qualify rendering response times. The separate rejected
scheduling experiment retains its full software failure: Inspector p95 219.8/204.6
ms and Focus 206.9/202.5 ms cold/warm. That experiment is not main or this fix.
The 200 ms hardware/software requirement and broader readiness holds remain open.

## Reproduction, rollback and authority

Evidence, exact source snapshots, failed attempts, review and application backups
are retained under build/panel-controls-20261108-01. Run npm test,
python tools/typecheck_web.py and the existing browser validation on a fresh
immutable build. The saved verify_focus_all.mjs driver names its stage, output
label and expected lost/retained behavior explicitly.

To roll back this application, restore only the backed-up panels.js,
panelCoverage.test.mjs and CURRENT_READINESS_20261107.md, then remove this newly
added evidence note. Preserve unrelated dirty work and all historical artifacts.
No new dependency, runtime network call, license/source adoption, commit, push or
deployment is authorized by this correction. The production-readiness goal is active.
